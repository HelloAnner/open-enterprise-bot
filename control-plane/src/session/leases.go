package session

import (
	"context"
	p "enterprise/control-plane/src/platform"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Proof struct {
	SessionID string `json:"session_id"`
	Owner     string `json:"owner"`
	Epoch     int64  `json:"epoch"`
}
type Delivery struct {
	ID string `json:"id"`
	Proof
	Event p.Event `json:"event"`
}

func Fence(ctx context.Context, tx pgx.Tx, proof Proof) (string, error) {
	var user string
	e := tx.QueryRow(ctx, "SELECT user_id FROM control.leases WHERE session_id=$1 AND owner=$2 AND epoch=$3 AND expires_at>now() FOR SHARE", proof.SessionID, proof.Owner, proof.Epoch).Scan(&user)
	if e != nil {
		return "", p.Error(409, "session lease lost")
	}
	return user, nil
}
func Claim(ctx context.Context, db *pgxpool.Pool, owner string) (*Delivery, error) {
	if owner == "" || len(owner) > 200 {
		return nil, p.Error(400, "owner required")
	}
	var result *Delivery
	e := p.Transaction(ctx, db, func(tx pgx.Tx) error {
		d := &Delivery{}
		var user string
		e := tx.QueryRow(ctx, `SELECT d.id,d.session_id,d.user_id,d.event FROM control.deliveries d LEFT JOIN control.leases l ON l.session_id=d.session_id WHERE (d.state='pending' OR (d.state='processing' AND l.expires_at<=now())) AND (l.session_id IS NULL OR l.expires_at<=now() OR l.owner=$1) ORDER BY CASE WHEN d.event->>'type' LIKE 'control.%' THEN 0 ELSE 1 END,d.created_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1`, owner).Scan(&d.ID, &d.SessionID, &user, &d.Event)
		if e == pgx.ErrNoRows {
			return nil
		}
		if e != nil {
			return e
		}
		d.Owner = owner
		e = tx.QueryRow(ctx, `INSERT INTO control.leases(session_id,user_id,owner,expires_at) VALUES($1,$2,$3,now()+make_interval(secs=>$4)) ON CONFLICT(session_id) DO UPDATE SET owner=EXCLUDED.owner,epoch=CASE WHEN control.leases.expires_at<=now() THEN control.leases.epoch+1 ELSE control.leases.epoch END,expires_at=EXCLUDED.expires_at WHERE control.leases.expires_at<=now() OR control.leases.owner=EXCLUDED.owner RETURNING epoch`, d.SessionID, user, owner, p.Int("LEASE_SECONDS", 30)).Scan(&d.Epoch)
		if e == pgx.ErrNoRows {
			return nil
		}
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "UPDATE control.deliveries SET state='processing',owner=$2,claimed_at=now() WHERE id=$1", d.ID, owner)
		result = d
		return e
	})
	return result, e
}
func Heartbeat(ctx context.Context, db *pgxpool.Pool, owner string) error {
	_, e := db.Exec(ctx, "UPDATE control.leases SET expires_at=now()+make_interval(secs=>$2) WHERE owner=$1 AND expires_at>now()", owner, p.Int("LEASE_SECONDS", 30))
	return e
}
func Complete(ctx context.Context, db *pgxpool.Pool, id string, proof Proof, retry bool) error {
	return p.Transaction(ctx, db, func(tx pgx.Tx) error {
		if _, e := Fence(ctx, tx, proof); e != nil {
			return e
		}
		state := "done"
		if retry {
			state = "pending"
		}
		tag, e := tx.Exec(ctx, "UPDATE control.deliveries SET state=$4 WHERE id=$1 AND session_id=$2 AND owner=$3", id, proof.SessionID, proof.Owner, state)
		if e == nil && tag.RowsAffected() == 0 {
			return p.Error(409, "delivery no longer owned")
		}
		return e
	})
}
func Enqueue(ctx context.Context, tx pgx.Tx, sessionID string, event p.Event) error {
	_, e := tx.Exec(ctx, "INSERT INTO control.deliveries(id,session_id,user_id,event) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", p.Stable(event.ID, sessionID), sessionID, event.UserID, p.JSON(event))
	return e
}
