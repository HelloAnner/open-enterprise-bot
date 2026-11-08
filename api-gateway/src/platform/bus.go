package platform

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
)

type Bus struct {
	Conn *nats.Conn
	JS   nats.JetStreamContext
}

func OpenBus() *Bus {
	nc, e := nats.Connect(Env("NATS_URL", "nats://localhost:4222"), nats.UserInfo(Env("NATS_USER", "eob"), Env("NATS_PASSWORD", "")), nats.MaxReconnects(-1))
	Must(e)
	js, e := nc.JetStream()
	Must(e)
	_, e = js.StreamInfo("EOB")
	if e != nil {
		_, e = js.AddStream(&nats.StreamConfig{Name: "EOB", Subjects: []string{"eob.events.*"}, Storage: nats.FileStorage, Retention: nats.LimitsPolicy, MaxAge: 7 * 24 * time.Hour, MaxBytes: int64(Int("QUEUE_MAX_MIB", 256)) << 20, Replicas: Int("QUEUE_REPLICAS", 1)})
		if e != nil {
			_, e = js.StreamInfo("EOB")
		}
		Must(e)
	}
	return &Bus{nc, js}
}
func Outbox(ctx context.Context, tx pgx.Tx, schema, subject string, event Event) error {
	_, e := tx.Exec(ctx, "INSERT INTO "+schema+".outbox(id,subject,event) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", event.ID, subject, JSON(event))
	return e
}

// Each service owns its outbox. A crash after publish is safe: downstream event IDs are durable dedup keys.
func (b *Bus) PublishOutbox(ctx context.Context, db *pgxpool.Pool, schema string) {
	for ctx.Err() == nil {
		e := Transaction(ctx, db, func(tx pgx.Tx) error {
			var id, subject string
			var data []byte
			e := tx.QueryRow(ctx, "SELECT id,subject,event FROM "+schema+".outbox WHERE sent_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1").Scan(&id, &subject, &data)
			if e == pgx.ErrNoRows {
				return nil
			}
			if e != nil {
				return e
			}
			_, e = b.JS.Publish(subject, data, nats.MsgId(id))
			if e != nil {
				return e
			}
			_, e = tx.Exec(ctx, "UPDATE "+schema+".outbox SET sent_at=now() WHERE id=$1", id)
			return e
		})
		if e != nil {
			slog.Error("outbox publish", "error", e)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(100 * time.Millisecond):
		}
	}
}
func (b *Bus) Consume(ctx context.Context, subject, durable string, fn func(context.Context, Event) error) {
	sub, e := b.JS.PullSubscribe(subject, durable, nats.ManualAck(), nats.AckExplicit(), nats.AckWait(30*time.Second), nats.MaxAckPending(128))
	Must(e)
	for ctx.Err() == nil {
		msgs, e := sub.Fetch(16, nats.MaxWait(time.Second))
		if e != nil {
			if e != nats.ErrTimeout && ctx.Err() == nil {
				slog.Error("queue fetch", "error", e)
			}
			continue
		}
		for _, msg := range msgs {
			var event Event
			if e = json.Unmarshal(msg.Data, &event); e != nil || event.Version != 1 {
				_ = msg.Term()
				continue
			}
			if e = fn(ctx, event); e != nil {
				slog.Error("event retry", "id", event.ID, "error", e)
				_ = msg.NakWithDelay(time.Second)
			} else {
				_ = msg.AckSync()
			}
		}
	}
}
