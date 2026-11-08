package job

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"time"

	"enterprise/control-plane/src/compute"
	p "enterprise/control-plane/src/platform"
	"enterprise/control-plane/src/policy"
	"enterprise/control-plane/src/session"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Manager struct{ DB *pgxpool.Pool }
type Start struct {
	session.Proof
	OperationID string   `json:"operation_id"`
	WorkerID    string   `json:"worker_id"`
	Tool        string   `json:"tool"`
	Input       p.Object `json:"input"`
}
type Snapshot struct {
	ID        string   `json:"job_id"`
	State     string   `json:"state"`
	Result    p.Object `json:"result"`
	UserID    string   `json:"user_id"`
	BotID     string   `json:"bot_id"`
	ThreadID  string   `json:"thread_id"`
	TicketID  string   `json:"ticket_id"`
	WorkerID  string   `json:"worker_id"`
	DesktopID string   `json:"desktop_id"`
	Epoch     int64    `json:"vm_epoch"`
	Tool      string   `json:"tool"`
	Input     p.Object `json:"input"`
	Desired   string   `json:"desired"`
}

func Terminal(state string) bool {
	return state == "completed" || state == "failed" || state == "stopped"
}
func (m *Manager) Start(ctx context.Context, in Start) (Snapshot, error) {
	out := Snapshot{}
	if p.Env("EXECUTION_ENABLED", "true") != "true" {
		return out, p.Error(422, "当前未配置可用的 KVM 计算节点，未启动任务")
	}
	if in.OperationID == "" || len(in.OperationID) > 200 || !policy.Tool(in.Tool) {
		return out, p.Error(400, "invalid operation or disallowed tool")
	}
	if in.SessionID != "worker:"+in.WorkerID {
		return out, p.Error(403, "only owning Worker may start a Job")
	}
	e := p.Transaction(ctx, m.DB, func(tx pgx.Tx) error {
		user, e := session.Fence(ctx, tx, in.Proof)
		if e != nil {
			return e
		}
		var ticket, bot, thread string
		e = tx.QueryRow(ctx, `SELECT t.id,t.bot_id,t.thread_id FROM runtime.workers w JOIN runtime.tickets t ON t.id=w.ticket_id JOIN gateway.bots b ON b.id=t.bot_id WHERE w.id=$1 AND w.user_id=$2 AND t.user_id=$2 AND NOT b.deleted`, in.WorkerID, user).Scan(&ticket, &bot, &thread)
		if e != nil {
			return p.Error(403, "worker access denied")
		}
		// User-row advisory lock bounds quota checking, not model calls or Job lifetime.
		_, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", user)
		if e != nil {
			return e
		}
		id := p.Stable("job", user, in.OperationID)
		var exists bool
		_ = tx.QueryRow(ctx, "SELECT true FROM control.jobs WHERE id=$1", id).Scan(&exists)
		if !exists {
			var n int
			if e = tx.QueryRow(ctx, "SELECT count(*) FROM control.jobs WHERE user_id=$1 AND state NOT IN ('completed','failed','stopped')", user).Scan(&n); e != nil {
				return e
			}
			if n >= p.Int("MAX_JOBS_PER_USER", 4) {
				return p.Error(429, "user job quota exceeded")
			}
		}
		desktop, e := compute.Ensure(ctx, tx, user)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `INSERT INTO control.jobs(id,operation_id,user_id,bot_id,thread_id,ticket_id,worker_id,desktop_id,vm_epoch,tool,input) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(operation_id) DO NOTHING`, id, user+":"+in.OperationID, user, bot, thread, ticket, in.WorkerID, desktop.ID, desktop.Epoch, in.Tool, p.JSON(in.Input))
		if e != nil {
			return e
		}
		e = tx.QueryRow(ctx, "SELECT id,state,result FROM control.jobs WHERE id=$1 AND worker_id=$2 AND tool=$3 AND input=$4", id, in.WorkerID, in.Tool, p.JSON(in.Input)).Scan(&out.ID, &out.State, &out.Result)
		if e == pgx.ErrNoRows {
			return p.Error(409, "operation_id reused with different input")
		}
		return e
	})
	return out, e
}
func (m *Manager) Stop(ctx context.Context, proof session.Proof, id string) (Snapshot, error) {
	out := Snapshot{}
	e := p.Transaction(ctx, m.DB, func(tx pgx.Tx) error {
		user, e := session.Fence(ctx, tx, proof)
		if e != nil {
			return e
		}
		e = tx.QueryRow(ctx, `UPDATE control.jobs SET desired='stopped',updated_at=now() WHERE id=$1 AND user_id=$2 AND 'worker:'||worker_id=$3 RETURNING id,state,result`, id, user, proof.SessionID).Scan(&out.ID, &out.State, &out.Result)
		return e
	})
	return out, e
}
func (m *Manager) Status(ctx context.Context, user, id string) (Snapshot, error) {
	var s Snapshot
	e := m.DB.QueryRow(ctx, "SELECT id,state,result FROM control.jobs WHERE id=$1 AND user_id=$2", id, user).Scan(&s.ID, &s.State, &s.Result)
	return s, e
}
func (m *Manager) Apply(ctx context.Context, id string, epoch int64, state string, result p.Object) error {
	if state != "running" && !Terminal(state) {
		return p.Error(400, "invalid execution state")
	}
	return p.Transaction(ctx, m.DB, func(tx pgx.Tx) error {
		var s Snapshot
		var previous string
		e := tx.QueryRow(ctx, "SELECT user_id,bot_id,thread_id,ticket_id,worker_id,state,vm_epoch FROM control.jobs WHERE id=$1 FOR UPDATE", id).Scan(&s.UserID, &s.BotID, &s.ThreadID, &s.TicketID, &s.WorkerID, &previous, &s.Epoch)
		if e != nil {
			return e
		}
		if s.Epoch != epoch {
			return p.Error(409, "stale VM epoch")
		}
		if Terminal(previous) || previous == state {
			return nil
		}
		clean := p.Object{}
		for _, key := range []string{"text", "error", "exit_code"} {
			if v, ok := result[key]; ok {
				clean[key] = v
			}
		}
		if state == "completed" {
			artifacts := []p.Object{}
			items, _ := result["artifacts"].([]any)
			for i, item := range items {
				a, ok := item.(map[string]any)
				if !ok {
					return p.Error(400, "invalid artifact")
				}
				data, e := base64.StdEncoding.DecodeString(p.Text(a, "data"))
				if e != nil || len(data) > p.Int("ARTIFACT_MAX_MIB", 10)<<20 {
					return p.Error(400, "invalid artifact size")
				}
				aid := p.Stable(id, fmt.Sprint(i))
				name, mime := p.Text(a, "name"), p.Text(a, "mime")
				if name == "" || mime == "" {
					return p.Error(400, "invalid artifact metadata")
				}
				_, e = tx.Exec(ctx, "INSERT INTO control.artifacts(id,user_id,bot_id,ticket_id,worker_id,job_id,name,mime,bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING", aid, s.UserID, s.BotID, s.TicketID, s.WorkerID, id, name, mime, data)
				if e != nil {
					return e
				}
				artifacts = append(artifacts, p.Object{"id": aid, "name": name, "mime": mime, "url": "/api/artifacts/" + aid, "size": fmt.Sprintf("%d B", len(data))})
			}
			clean["artifacts"] = artifacts
		}
		_, e = tx.Exec(ctx, "UPDATE control.jobs SET state=$2,result=$3,updated_at=now() WHERE id=$1", id, state, p.JSON(clean))
		if e != nil {
			return e
		}
		event := p.NewEvent("job."+state, s.UserID, s.BotID, clean)
		event.ID = p.Stable(id, state)
		event.CorrelationID = id
		event.ThreadID = s.ThreadID
		event.TicketID = s.TicketID
		event.WorkerID = s.WorkerID
		event.JobID = id
		return p.Outbox(ctx, tx, "control", "eob.events.execution", event)
	})
}

// Reconciliation is a safety net for lost callbacks. Commands return acceptance, never assumed success.
func (m *Manager) Reconcile(ctx context.Context) {
	for ctx.Err() == nil {
		var s Snapshot
		e := p.Transaction(ctx, m.DB, func(tx pgx.Tx) error {
			e := tx.QueryRow(ctx, `SELECT id,user_id,bot_id,thread_id,ticket_id,worker_id,desktop_id,vm_epoch,tool,input,state,desired FROM control.jobs WHERE state NOT IN ('completed','failed','stopped') AND (claim_until IS NULL OR claim_until<now()) ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&s.ID, &s.UserID, &s.BotID, &s.ThreadID, &s.TicketID, &s.WorkerID, &s.DesktopID, &s.Epoch, &s.Tool, &s.Input, &s.State, &s.Desired)
			if e != nil {
				return e
			}
			_, e = tx.Exec(ctx, "UPDATE control.jobs SET claim_until=now()+interval '10 seconds' WHERE id=$1", s.ID)
			return e
		})
		if e == nil {
			action := "status"
			if s.State == "queued" {
				action = "start"
			}
			if s.Desired == "stopped" {
				action = "stop"
			}
			var actual struct {
				State  string   `json:"state"`
				Result p.Object `json:"result"`
			}
			e = p.Request(ctx, "POST", p.Env("DESKTOP_URL", "")+"/internal/jobs/"+s.ID+"/"+action, s, &actual)
			if e == nil && (actual.State == "running" || Terminal(actual.State)) {
				e = m.Apply(ctx, s.ID, s.Epoch, actual.State, actual.Result)
			}
		}
		if e != nil && e != pgx.ErrNoRows && ctx.Err() == nil {
			slog.Warn("execution reconciliation", "job", s.ID, "error", e)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(250 * time.Millisecond):
		}
	}
}
