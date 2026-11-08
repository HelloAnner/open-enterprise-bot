package application

import (
	"context"

	"enterprise/api-gateway/src/domain"
	p "enterprise/api-gateway/src/platform"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ DB *pgxpool.Pool }

func (s *Service) Own(ctx context.Context, user, bot string) error {
	var yes bool
	return s.DB.QueryRow(ctx, "SELECT true FROM gateway.bots WHERE id=$1 AND user_id=$2 AND NOT deleted", bot, user).Scan(&yes)
}
func (s *Service) Bots(ctx context.Context, user string) ([]p.Object, error) {
	// A real, user-owned starter Bot. The stable ID makes concurrent initialization safe;
	// DO NOTHING preserves renames, unpinning, hiding and soft deletion on later visits.
	id := p.Stable("open-bot", user)
	initial := p.Object{"id": id, "name": "Open Bot", "shape": "circle", "color": "#050505", "accent": "#202020", "preview": "", "group": "未分组", "pinned": true}
	if _, e := s.DB.Exec(ctx, "INSERT INTO gateway.bots(id,user_id,data) VALUES($1,$2,$3) ON CONFLICT (id) DO NOTHING", id, user, p.JSON(initial)); e != nil {
		return nil, e
	}
	rows, e := s.DB.Query(ctx, "SELECT data FROM gateway.bots WHERE user_id=$1 AND NOT deleted ORDER BY (id=$2) DESC,created_at,id", user, id)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []p.Object{}
	for rows.Next() {
		var b p.Object
		if e = rows.Scan(&b); e != nil {
			return nil, e
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
func (s *Service) SaveBot(ctx context.Context, user, id string, patch p.Object) (p.Object, error) {
	if e := domain.BotPatch(patch); e != nil {
		return nil, p.Error(400, e.Error())
	}
	if c, ok := patch["color"]; ok {
		patch["accent"] = c
	}
	var out p.Object
	if id == "" {
		id = uuid.NewString()
		for _, k := range []string{"name", "shape", "color"} {
			if p.Text(patch, k) == "" {
				return nil, p.Error(400, "missing "+k)
			}
		}
		patch["id"] = id
		patch["group"] = "未分组"
		patch["preview"] = ""
		e := s.DB.QueryRow(ctx, "INSERT INTO gateway.bots(id,user_id,data) VALUES($1,$2,$3) RETURNING data", id, user, p.JSON(patch)).Scan(&out)
		return out, e
	}
	e := s.DB.QueryRow(ctx, "UPDATE gateway.bots SET data=data || $3 WHERE id=$1 AND user_id=$2 AND NOT deleted RETURNING data", id, user, p.JSON(patch)).Scan(&out)
	return out, e
}
func (s *Service) DeleteBot(ctx context.Context, user, id string) error {
	tag, e := s.DB.Exec(ctx, "UPDATE gateway.bots SET deleted=true WHERE id=$1 AND user_id=$2 AND NOT deleted", id, user)
	if e == nil && tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return e
}
func (s *Service) Board(ctx context.Context, user string) ([]p.Object, error) {
	var out []p.Object
	e := s.DB.QueryRow(ctx, "SELECT data FROM gateway.boards WHERE user_id=$1", user).Scan(&out)
	if e == pgx.ErrNoRows {
		out = []p.Object{}
		for _, c := range []string{"待联系", "已联系", "面试中", "已完成"} {
			out = append(out, p.Object{"id": p.Stable("column", user, c), "title": c, "jobs": []any{}})
		}
		_, e = s.DB.Exec(ctx, "INSERT INTO gateway.boards VALUES($1,$2) ON CONFLICT DO NOTHING", user, p.JSON(out))
	}
	return out, e
}
func (s *Service) MoveCard(ctx context.Context, user, job, column string) ([]p.Object, error) {
	var out []p.Object
	e := p.Transaction(ctx, s.DB, func(tx pgx.Tx) error {
		if e := tx.QueryRow(ctx, "SELECT data FROM gateway.boards WHERE user_id=$1 FOR UPDATE", user).Scan(&out); e != nil {
			return e
		}
		target := -1
		var card any
		for i, c := range out {
			if p.Text(c, "id") == column {
				target = i
			}
			jobs, _ := c["jobs"].([]any)
			for j, x := range jobs {
				m, _ := x.(map[string]any)
				if p.Text(m, "id") == job {
					card = x
					c["jobs"] = append(jobs[:j], jobs[j+1:]...)
					break
				}
			}
		}
		if card == nil || target < 0 {
			return pgx.ErrNoRows
		}
		out[target]["jobs"] = append(out[target]["jobs"].([]any), card)
		_, e := tx.Exec(ctx, "UPDATE gateway.boards SET data=$2 WHERE user_id=$1", user, p.JSON(out))
		return e
	})
	return out, e
}
