package transport

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"enterprise/api-gateway/src/application"
	p "enterprise/api-gateway/src/platform"
)

func Routes(s *application.Service, bus *p.Bus) *http.ServeMux {
	mux := http.NewServeMux()
	route := func(pattern string, fn func(http.ResponseWriter, *http.Request, string) error) {
		mux.HandleFunc(pattern, p.Handler(func(w http.ResponseWriter, r *http.Request) error {
			user, e := p.User(r)
			if e != nil {
				return e
			}
			return fn(w, r, user)
		}))
	}
	mux.HandleFunc("POST /api/login", p.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var input struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		if len(input.Username) > 64 || len(input.Password) > 256 {
			return p.Error(400, "invalid login input")
		}
		user, e := s.Login(r.Context(), strings.TrimSpace(input.Username), input.Password)
		if e != nil {
			return e
		}
		ttl := 12 * time.Hour
		http.SetCookie(w, &http.Cookie{Name: "eob_session", Value: p.Sign(p.Env("AUTH_SIGNING_KEY", ""), p.Identity{UserID: user.ID, Expires: time.Now().Add(ttl).Unix()}), Path: "/", HttpOnly: true, Secure: strings.HasPrefix(p.Env("PUBLIC_ORIGIN", ""), "https://"), SameSite: http.SameSiteStrictMode, MaxAge: int(ttl.Seconds())})
		w.Header().Set("Cache-Control", "no-store")
		p.Reply(w, 200, user)
		return nil
	}))
	route("GET /api/me", func(w http.ResponseWriter, r *http.Request, u string) error {
		profile, e := s.Profile(r.Context(), u)
		if e == nil {
			w.Header().Set("Cache-Control", "no-store")
			p.Reply(w, 200, profile)
		}
		return e
	})
	route("POST /api/logout", func(w http.ResponseWriter, r *http.Request, u string) error {
		http.SetCookie(w, &http.Cookie{Name: "eob_session", Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
		p.Reply(w, 204, nil)
		return nil
	})
	route("GET /api/capabilities", func(w http.ResponseWriter, r *http.Request, u string) error {
		p.Reply(w, 200, p.Object{"execution": p.Env("EXECUTION_ENABLED", "true") == "true", "model": p.Env("MODEL_NAME", ""), "desktop": p.Env("COMPUTE_NODE_URL", "") != ""})
		return nil
	})
	route("GET /api/bots", func(w http.ResponseWriter, r *http.Request, u string) error {
		v, e := s.Bots(r.Context(), u)
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	})
	for _, pattern := range []string{"POST /api/bots", "PATCH /api/bots/{id}"} {
		route(pattern, func(w http.ResponseWriter, r *http.Request, u string) error {
			var input p.Object
			if e := p.Decode(r, &input); e != nil {
				return e
			}
			v, e := s.SaveBot(r.Context(), u, r.PathValue("id"), input)
			if e == nil {
				p.Reply(w, 200, v)
			}
			return e
		})
	}
	route("DELETE /api/bots/{id}", func(w http.ResponseWriter, r *http.Request, u string) error {
		e := s.DeleteBot(r.Context(), u, r.PathValue("id"))
		if e == nil {
			p.Reply(w, 204, nil)
		}
		return e
	})
	route("GET /api/conversations/{bot}/messages", func(w http.ResponseWriter, r *http.Request, u string) error {
		v, e := s.Messages(r.Context(), u, r.PathValue("bot"))
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	})
	route("PATCH /api/conversations/{bot}/read", func(w http.ResponseWriter, r *http.Request, u string) error {
		var in struct {
			MessageID string `json:"messageId"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		if e := s.MarkRead(r.Context(), u, r.PathValue("bot"), in.MessageID); e != nil {
			return e
		}
		p.Reply(w, 204, nil)
		return nil
	})
	route("POST /api/conversations/{bot}/messages", func(w http.ResponseWriter, r *http.Request, u string) error {
		var input struct {
			Text    string `json:"text"`
			ReplyTo string `json:"replyTo"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		v, e := s.Send(r.Context(), u, r.PathValue("bot"), r.Header.Get("Idempotency-Key"), input.Text, input.ReplyTo)
		if e == nil {
			p.Reply(w, 202, v)
		}
		return e
	})
	route("POST /api/conversations/{bot}/choices", func(w http.ResponseWriter, r *http.Request, u string) error {
		var input struct {
			MessageID   string `json:"messageId"`
			OptionIndex int    `json:"optionIndex"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		v, e := s.Choose(r.Context(), u, r.PathValue("bot"), r.Header.Get("Idempotency-Key"), input.MessageID, input.OptionIndex)
		if e == nil {
			p.Reply(w, 202, v)
		}
		return e
	})
	route("PATCH /api/conversations/{bot}/messages/{id}/reaction", func(w http.ResponseWriter, r *http.Request, u string) error {
		var input struct {
			Reaction string `json:"reaction"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		v, e := s.React(r.Context(), u, r.PathValue("bot"), r.PathValue("id"), input.Reaction)
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	})
	route("DELETE /api/conversations/{bot}/messages/{id}", func(w http.ResponseWriter, r *http.Request, u string) error {
		e := s.DeleteMessage(r.Context(), u, r.PathValue("bot"), r.PathValue("id"))
		if e == nil {
			p.Reply(w, 204, nil)
		}
		return e
	})
	route("POST /api/conversations/{bot}/files", func(w http.ResponseWriter, r *http.Request, u string) error {
		limit := int64(p.Int("UPLOAD_MAX_MIB", 10)) << 20
		r.Body = http.MaxBytesReader(w, r.Body, limit+(1<<20))
		if e := r.ParseMultipartForm(limit); e != nil {
			return p.Error(413, "upload too large")
		}
		defer r.MultipartForm.RemoveAll()
		f, h, e := r.FormFile("file")
		if e != nil {
			return p.Error(400, "file required")
		}
		defer f.Close()
		data, e := io.ReadAll(io.LimitReader(f, limit+1))
		if e != nil {
			return e
		}
		if int64(len(data)) > limit {
			return p.Error(413, "upload too large")
		}
		v, e := s.StoreFile(r.Context(), u, r.PathValue("bot"), r.Header.Get("Idempotency-Key"), filepath.Base(h.Filename), http.DetectContentType(data), data)
		if e == nil {
			p.Reply(w, 202, v)
		}
		return e
	})
	route("GET /api/files/{id}", func(w http.ResponseWriter, r *http.Request, u string) error {
		var name, mime string
		var data []byte
		e := s.DB.QueryRow(r.Context(), "SELECT name,mime,bytes FROM gateway.files WHERE id=$1 AND user_id=$2", r.PathValue("id"), u).Scan(&name, &mime, &data)
		if e != nil {
			return e
		}
		serveFile(w, r, name, mime, data)
		return nil
	})
	route("GET /api/boards/interview", func(w http.ResponseWriter, r *http.Request, u string) error {
		v, e := s.Board(r.Context(), u)
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	})
	route("PATCH /api/boards/interview/jobs/{id}", func(w http.ResponseWriter, r *http.Request, u string) error {
		var input struct {
			ColumnID string `json:"columnId"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		v, e := s.MoveCard(r.Context(), u, r.PathValue("id"), input.ColumnID)
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	})
	for _, resource := range []string{"tickets", "jobs", "artifacts", "sessions", "threads", "subscriptions", "activity"} {
		resource := resource
		route("GET /api/"+resource, func(w http.ResponseWriter, r *http.Request, u string) error {
			var out any
			e := p.Request(r.Context(), "GET", p.Env("CONTROL_URL", "")+"/internal/view/"+resource+"?user_id="+url.QueryEscape(u)+"&bot_id="+url.QueryEscape(r.URL.Query().Get("botId")), nil, &out)
			if e == nil {
				p.Reply(w, 200, out)
			}
			return e
		})
	}
	route("GET /api/artifacts/{id}", func(w http.ResponseWriter, r *http.Request, u string) error {
		var out struct {
			Name string `json:"name"`
			Mime string `json:"mime"`
			Data []byte `json:"data"`
		}
		e := p.Request(r.Context(), "GET", p.Env("CONTROL_URL", "")+"/internal/artifacts/"+url.PathEscape(r.PathValue("id"))+"?user_id="+url.QueryEscape(u), nil, &out)
		if e != nil {
			return e
		}
		serveFile(w, r, out.Name, out.Mime, out.Data)
		return nil
	})
	route("POST /api/conversations/{bot}/control", func(w http.ResponseWriter, r *http.Request, u string) error {
		var input struct {
			Action   string `json:"action"`
			TicketID string `json:"ticket_id"`
			WorkerID string `json:"worker_id"`
			JobID    string `json:"job_id"`
			Text     string `json:"text"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		if input.Action != "cancel" && input.Action != "update" {
			return p.Error(400, "invalid control action")
		}
		if input.TicketID == "" && input.WorkerID == "" && input.JobID == "" {
			return p.Error(400, "explicit control target required")
		}
		v, e := s.Trigger(r.Context(), u, r.PathValue("bot"), "web", r.PathValue("bot"), r.Header.Get("Idempotency-Key"), p.Object{"kind": "text", "text": input.Text}, "control."+input.Action, p.Object{"ticket_id": input.TicketID, "worker_id": input.WorkerID, "job_id": input.JobID})
		if e == nil {
			p.Reply(w, 202, v)
		}
		return e
	})
	route("POST /api/security-forms/{id}", func(w http.ResponseWriter, r *http.Request, u string) error {
		var input struct {
			Secret string `json:"secret"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		v, e := s.SubmitForm(r.Context(), u, r.PathValue("id"), input.Secret)
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	})
	route("POST /api/desktops/{bot}/sessions", func(w http.ResponseWriter, r *http.Request, u string) error {
		if e := s.Own(r.Context(), u, r.PathValue("bot")); e != nil {
			return e
		}
		var input struct {
			Mode string `json:"mode"`
		}
		if e := p.Decode(r, &input); e != nil {
			return e
		}
		var out any
		e := p.Request(r.Context(), "POST", p.Env("DESKTOP_URL", "")+"/internal/sessions", p.Object{"user_id": u, "bot_id": r.PathValue("bot"), "mode": input.Mode}, &out)
		if e == nil {
			p.Reply(w, 200, out)
		}
		return e
	})
	route("GET /api/events", func(w http.ResponseWriter, r *http.Request, u string) error {
		sub, e := bus.Conn.SubscribeSync("eob.live." + p.Stable(u))
		if e != nil {
			return e
		}
		defer sub.Unsubscribe()
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		flusher, ok := w.(http.Flusher)
		if !ok {
			return p.Error(500, "streaming unavailable")
		}
		fmt.Fprint(w, "event: ready\ndata: {}\n\n")
		flusher.Flush()
		for r.Context().Err() == nil {
			ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
			m, err := sub.NextMsgWithContext(ctx)
			cancel()
			if err == nil {
				fmt.Fprintf(w, "data: %s\n\n", m.Data)
			} else {
				fmt.Fprint(w, ": heartbeat\n\n")
			}
			flusher.Flush()
		}
		return nil
	})
	mux.HandleFunc("GET /internal/context", p.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if e := p.Internal(r, "agent-runtime"); e != nil {
			return e
		}
		u, b := r.URL.Query().Get("user_id"), r.URL.Query().Get("bot_id")
		messages, e := s.Messages(r.Context(), u, b)
		if e != nil {
			return e
		}
		var bot p.Object
		e = s.DB.QueryRow(r.Context(), "SELECT data FROM gateway.bots WHERE id=$1 AND user_id=$2", b, u).Scan(&bot)
		if e == nil {
			if len(messages) > 40 {
				messages = messages[len(messages)-40:]
			}
			attachments, err := s.TextAttachments(r.Context(), u, b, messages)
			if err != nil {
				return err
			}
			p.Reply(w, 200, p.Object{"bot": bot, "messages": messages, "attachments": attachments, "execution_enabled": p.Env("EXECUTION_ENABLED", "true") == "true"})
		}
		return e
	}))
	mux.HandleFunc("POST /internal/security-forms", p.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if e := p.Internal(r, "control-plane"); e != nil {
			return e
		}
		var in struct {
			UserID   string `json:"user_id"`
			BotID    string `json:"bot_id"`
			TicketID string `json:"ticket_id"`
			Scope    string `json:"scope"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		v, e := s.CreateForm(r.Context(), in.UserID, in.BotID, in.TicketID, in.Scope)
		if e == nil {
			p.Reply(w, 200, v)
		}
		return e
	}))
	mux.HandleFunc("POST /internal/vault/resolve", p.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if e := p.Internal(r, "desktop-gateway"); e != nil {
			return e
		}
		var in struct {
			Ref   string `json:"ref"`
			JobID string `json:"job_id"`
		}
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		v, e := s.Resolve(r.Context(), in.Ref, in.JobID)
		if e == nil {
			w.Header().Set("Cache-Control", "no-store")
			p.Reply(w, 200, v)
		}
		return e
	}))
	return mux
}
func serveFile(w http.ResponseWriter, r *http.Request, name, mime string, data []byte) {
	if !strings.HasPrefix(mime, "image/") || mime == "image/svg+xml" {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", url.PathEscape(name)))
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}
