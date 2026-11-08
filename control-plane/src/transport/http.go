package transport

import (
	"net/http"

	"enterprise/control-plane/src/compute"
	"enterprise/control-plane/src/dispatch"
	"enterprise/control-plane/src/job"
	p "enterprise/control-plane/src/platform"
	"enterprise/control-plane/src/policy"
	"enterprise/control-plane/src/session"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Routes(db *pgxpool.Pool, d *dispatch.Dispatcher, j *job.Manager) *http.ServeMux {
	mux := http.NewServeMux()
	route := func(pattern string, roles []string, fn func(http.ResponseWriter, *http.Request) error) {
		mux.HandleFunc(pattern, p.Handler(func(w http.ResponseWriter, r *http.Request) error {
			if e := p.Internal(r, roles...); e != nil {
				return e
			}
			return fn(w, r)
		}))
	}
	runtime := []string{"agent-runtime"}
	gateway := []string{"api-gateway"}
	route("POST /internal/sessions/claim", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Owner string `json:"owner"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		v, e := session.Claim(r.Context(), db, in.Owner)
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	})
	route("POST /internal/sessions/heartbeat", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Owner string `json:"owner"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		e := session.Heartbeat(r.Context(), db, in.Owner)
		if e == nil {
			p.Reply(w, 200, p.Object{"ok": true})
		}
		return e
	})
	route("POST /internal/deliveries/{id}/complete", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			session.Proof
			Retry bool `json:"retry"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		e := session.Complete(r.Context(), db, r.PathValue("id"), in.Proof, in.Retry)
		if e == nil {
			p.Reply(w, 200, p.Object{"ok": true})
		}
		return e
	})
	route("POST /internal/subscriptions", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			session.Proof
			Thread string `json:"thread_id"`
			Ticket string `json:"ticket_id"`
			Active bool   `json:"active"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		e := d.Subscribe(r.Context(), in.Proof, in.Thread, in.Ticket, in.Active)
		if e == nil {
			p.Reply(w, 200, p.Object{"ok": true})
		}
		return e
	})
	route("POST /internal/jobs", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in job.Start
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		v, e := j.Start(r.Context(), in)
		if e == nil {
			p.Reply(w, 202, v)
		}
		return e
	})
	route("POST /internal/jobs/{id}/stop", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in session.Proof
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		v, e := j.Stop(r.Context(), in, r.PathValue("id"))
		if e == nil {
			p.Reply(w, 202, v)
		}
		return e
	})
	route("POST /internal/jobs/{id}/status", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in session.Proof
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		var out job.Snapshot
		e := p.Transaction(r.Context(), db, func(tx pgx.Tx) error {
			u, e := session.Fence(r.Context(), tx, in)
			if e != nil {
				return e
			}
			out, e = j.Status(r.Context(), u, r.PathValue("id"))
			return e
		})
		if e == nil {
			p.Reply(w, 200, out)
		}
		return e
	})
	route("POST /internal/job-events", []string{"desktop-gateway"}, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			JobID  string   `json:"job_id"`
			Epoch  int64    `json:"vm_epoch"`
			State  string   `json:"state"`
			Result p.Object `json:"result"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		e := j.Apply(r.Context(), in.JobID, in.Epoch, in.State, in.Result)
		if e == nil {
			p.Reply(w, 200, p.Object{"ok": true})
		}
		return e
	})
	route("POST /internal/output", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			session.Proof
			Event p.Event `json:"event"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		e := p.Transaction(r.Context(), db, func(tx pgx.Tx) error {
			u, e := session.Fence(r.Context(), tx, in.Proof)
			if e != nil {
				return e
			}
			if u != in.Event.UserID || in.SessionID != "main:"+u || in.Event.Type != "model.message" {
				return p.Error(403, "only user Router can deliver output")
			}
			if e = policy.Event(r.Context(), tx, in.Event); e != nil {
				return e
			}
			return p.Outbox(r.Context(), tx, "control", "eob.events.output", in.Event)
		})
		if e == nil {
			p.Reply(w, 200, p.Object{"ok": true})
		}
		return e
	})
	route("POST /internal/security-forms", runtime, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			session.Proof
			BotID    string `json:"bot_id"`
			TicketID string `json:"ticket_id"`
			Scope    string `json:"scope"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		var out any
		e := p.Transaction(r.Context(), db, func(tx pgx.Tx) error {
			u, e := session.Fence(r.Context(), tx, in.Proof)
			if e != nil {
				return e
			}
			if in.SessionID != "work:"+in.TicketID {
				return p.Error(403, "only Ticket may request authorization")
			}
			if e = policy.Ticket(r.Context(), tx, u, in.BotID, in.TicketID); e != nil {
				return e
			}
			return p.Request(r.Context(), "POST", p.Env("GATEWAY_URL", "")+"/internal/security-forms", p.Object{"user_id": u, "bot_id": in.BotID, "ticket_id": in.TicketID, "scope": in.Scope}, &out)
		})
		if e == nil {
			p.Reply(w, 200, out)
		}
		return e
	})
	route("POST /internal/desktops/ensure", []string{"desktop-gateway"}, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			UserID string `json:"user_id"`
			BotID  string `json:"bot_id"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		var out compute.Desktop
		e := p.Transaction(r.Context(), db, func(tx pgx.Tx) error {
			ev := p.NewEvent("desktop.ensure", in.UserID, in.BotID, nil)
			if e := policy.Event(r.Context(), tx, ev); e != nil {
				return e
			}
			var e error
			out, e = compute.Ensure(r.Context(), tx, in.UserID)
			return e
		})
		if e == nil {
			p.Reply(w, 200, out)
		}
		return e
	})
	route("GET /internal/view/{resource}", gateway, func(w http.ResponseWriter, r *http.Request) error {
		u, b := r.URL.Query().Get("user_id"), r.URL.Query().Get("bot_id")
		queries := map[string]string{
			"activity":      `SELECT jsonb_build_object('botId',bot_id,'phase',CASE WHEN bool_or(working) THEN 'working' ELSE 'thinking' END) FROM (SELECT bot_id,true AS working FROM runtime.tickets WHERE user_id=$1 AND state='working' UNION ALL SELECT event->>'bot_id',false FROM control.deliveries WHERE user_id=$1 AND state IN ('pending','processing')) a WHERE ($2='' OR bot_id=$2) GROUP BY bot_id ORDER BY bot_id`,
			"tickets":       "SELECT to_jsonb(t) FROM runtime.tickets t WHERE user_id=$1 AND ($2='' OR bot_id=$2) ORDER BY created_at",
			"jobs":          "SELECT to_jsonb(j)-'claim_until' FROM control.jobs j WHERE user_id=$1 AND ($2='' OR bot_id=$2) ORDER BY created_at",
			"artifacts":     "SELECT to_jsonb(a)-'bytes' FROM control.artifacts a WHERE user_id=$1 AND ($2='' OR bot_id=$2) ORDER BY created_at",
			"sessions":      "SELECT to_jsonb(s) FROM runtime.sessions s WHERE user_id=$1 AND ($2='' OR bot_id=$2 OR kind='main') ORDER BY id",
			"threads":       "SELECT to_jsonb(t) FROM gateway.threads t WHERE user_id=$1 AND ($2='' OR bot_id=$2) ORDER BY id",
			"subscriptions": "SELECT to_jsonb(s) FROM control.subscriptions s JOIN runtime.tickets t ON t.id=s.ticket_id WHERE s.user_id=$1 AND ($2='' OR t.bot_id=$2)",
		}
		q, ok := queries[r.PathValue("resource")]
		if !ok {
			return p.Error(404, "resource not found")
		}
		rows, e := db.Query(r.Context(), q, u, b)
		if e != nil {
			return e
		}
		defer rows.Close()
		out := []p.Object{}
		for rows.Next() {
			var item p.Object
			if e = rows.Scan(&item); e != nil {
				return e
			}
			out = append(out, item)
		}
		if e = rows.Err(); e == nil {
			p.Reply(w, 200, out)
		}
		return e
	})
	route("GET /internal/artifacts/{id}", gateway, func(w http.ResponseWriter, r *http.Request) error {
		var name, mime string
		var data []byte
		e := db.QueryRow(r.Context(), "SELECT name,mime,bytes FROM control.artifacts WHERE id=$1 AND user_id=$2", r.PathValue("id"), r.URL.Query().Get("user_id")).Scan(&name, &mime, &data)
		if e == nil {
			p.Reply(w, 200, p.Object{"name": name, "mime": mime, "data": data})
		}
		return e
	})
	route("POST /internal/desktops/{id}/observed", []string{"desktop-gateway"}, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Epoch int    `json:"vm_epoch"`
			State string `json:"state"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		if in.State != "running" && in.State != "starting" && in.State != "stopped" && in.State != "stopping" {
			return p.Error(400, "invalid desktop state")
		}
		tag, e := db.Exec(r.Context(), "UPDATE control.desktops SET state=$3 WHERE id=$1 AND epoch=$2", r.PathValue("id"), in.Epoch, in.State)
		if e == nil && tag.RowsAffected() == 0 {
			return p.Error(409, "stale VM epoch")
		}
		if e == nil {
			p.Reply(w, 200, p.Object{"ok": true})
		}
		return e
	})
	return mux
}
