package dispatch

import (
	"context"
	p "enterprise/control-plane/src/platform"
	"enterprise/control-plane/src/policy"
	"enterprise/control-plane/src/session"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
)

type Dispatcher struct{ DB *pgxpool.Pool }

func (d *Dispatcher) Handle(ctx context.Context, event p.Event) error {
	return p.Transaction(ctx, d.DB, func(tx pgx.Tx) error {
		tag, e := tx.Exec(ctx, "INSERT INTO control.events(id,user_id,event) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", event.ID, event.UserID, p.JSON(event))
		if e != nil || tag.RowsAffected() == 0 {
			return e
		}
		if e = policy.Event(ctx, tx, event); e != nil {
			var denial p.APIError
			if !errors.As(e, &denial) {
				return e
			}
			_, e = tx.Exec(ctx, "INSERT INTO control.audit(user_id,event_id,decision) VALUES($1,$2,$3)", event.UserID, event.ID, denial.Message)
			return e
		}
		_, e = tx.Exec(ctx, "INSERT INTO control.audit(user_id,event_id,decision) VALUES($1,$2,'allow')", event.UserID, event.ID)
		if e != nil {
			return e
		}
		switch {
		case strings.HasPrefix(event.Type, "control."):
			target, _ := event.Payload["target"].(map[string]any)
			ticket, worker, job := p.Text(target, "ticket_id"), p.Text(target, "worker_id"), p.Text(target, "job_id")
			rows, e := tx.Query(ctx, `SELECT w.id,t.id FROM runtime.workers w JOIN runtime.tickets t ON t.id=w.ticket_id WHERE t.user_id=$1 AND t.bot_id=$2 AND ($3='' OR t.id=$3) AND ($4='' OR w.id=$4) AND ($5='' OR EXISTS(SELECT 1 FROM control.jobs j WHERE j.id=$5 AND j.worker_id=w.id)) AND ($3<>'' OR $4<>'' OR $5<>'')`, event.UserID, event.BotID, ticket, worker, job)
			if e != nil {
				return e
			}
			var targets [][2]string
			for rows.Next() {
				var v [2]string
				if e = rows.Scan(&v[0], &v[1]); e != nil {
					rows.Close()
					return e
				}
				targets = append(targets, v)
			}
			e = rows.Err()
			rows.Close()
			if e != nil {
				return e
			}
			for _, v := range targets {
				copy := event
				copy.WorkerID = v[0]
				copy.TicketID = v[1]
				copy.JobID = job
				if e = session.Enqueue(ctx, tx, "worker:"+v[0], copy); e != nil {
					return e
				}
			}
			return nil
		case strings.HasPrefix(event.Type, "job."):
			var worker, ticket string
			e = tx.QueryRow(ctx, "SELECT worker_id,ticket_id FROM control.jobs WHERE id=$1 AND user_id=$2 AND bot_id=$3", event.JobID, event.UserID, event.BotID).Scan(&worker, &ticket)
			if e != nil {
				return e
			}
			event.WorkerID = worker
			event.TicketID = ticket
			return session.Enqueue(ctx, tx, "worker:"+worker, event)
		case event.Type == "agent.ticket.created":
			if e = policy.Ticket(ctx, tx, event.UserID, event.BotID, event.TicketID); e != nil {
				return e
			}
			_, e = tx.Exec(ctx, "INSERT INTO control.subscriptions(thread_id,ticket_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", event.ThreadID, event.TicketID, event.UserID)
			if e != nil {
				return e
			}
			return session.Enqueue(ctx, tx, "work:"+event.TicketID, event)
		case event.Type == "agent.worker.created" || event.Type == "ticket.input":
			var yes bool
			if e = tx.QueryRow(ctx, "SELECT true FROM runtime.workers WHERE id=$1 AND user_id=$2 AND ticket_id=$3", event.WorkerID, event.UserID, event.TicketID).Scan(&yes); e != nil {
				return e
			}
			return session.Enqueue(ctx, tx, "worker:"+event.WorkerID, event)
		case event.Type == "worker.report" || event.Type == "security.submitted":
			if e = policy.Ticket(ctx, tx, event.UserID, event.BotID, event.TicketID); e != nil {
				return e
			}
			return session.Enqueue(ctx, tx, "work:"+event.TicketID, event)
		case event.Type == "ticket.report":
			return session.Enqueue(ctx, tx, "main:"+event.UserID, event)
		case strings.HasPrefix(event.Type, "model."):
			return nil
		}
		// A human message always reaches the user's Router, even when tickets also subscribe.
		rows, e := tx.Query(ctx, `SELECT s.ticket_id FROM control.subscriptions s JOIN runtime.tickets t ON t.id=s.ticket_id JOIN gateway.threads th ON th.id=s.thread_id WHERE s.thread_id=$1 AND s.user_id=$2 AND t.user_id=$2 AND th.user_id=$2 AND t.bot_id=$3 AND s.active AND t.state='working'`, event.ThreadID, event.UserID, event.BotID)
		if e != nil {
			return e
		}
		tickets := []string{}
		for rows.Next() {
			var id string
			if e = rows.Scan(&id); e != nil {
				rows.Close()
				return e
			}
			tickets = append(tickets, id)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		for _, id := range tickets {
			copy := event
			copy.TicketID = id
			if e = session.Enqueue(ctx, tx, "work:"+id, copy); e != nil {
				return e
			}
		}
		if event.Type == "user.message" || len(tickets) == 0 {
			return session.Enqueue(ctx, tx, "main:"+event.UserID, event)
		}
		return nil
	})
}
func (d *Dispatcher) Subscribe(ctx context.Context, proof session.Proof, thread, ticket string, active bool) error {
	return p.Transaction(ctx, d.DB, func(tx pgx.Tx) error {
		user, e := session.Fence(ctx, tx, proof)
		if e != nil {
			return e
		}
		var yes bool
		e = tx.QueryRow(ctx, `SELECT true FROM gateway.threads th JOIN runtime.tickets t ON t.user_id=th.user_id AND t.bot_id=th.bot_id WHERE th.id=$1 AND t.id=$2 AND th.user_id=$3 AND (t.router_id=$4 OR 'work:'||t.id=$4)`, thread, ticket, user, proof.SessionID).Scan(&yes)
		if e != nil {
			return p.Error(403, "subscription denied")
		}
		_, e = tx.Exec(ctx, "INSERT INTO control.subscriptions VALUES($1,$2,$3,$4) ON CONFLICT(thread_id,ticket_id) DO UPDATE SET active=EXCLUDED.active", thread, ticket, user, active)
		return e
	})
}
