package gateway

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"enterprise/desktop-gateway/src/guest"
	p "enterprise/desktop-gateway/src/platform"
	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Service struct {
	DB    *pgxpool.Pool
	Redis *redis.Client
}
type Desktop struct {
	ID       string `json:"desktop_id"`
	UserID   string `json:"user_id"`
	VolumeID string `json:"volume_id"`
	NodeURL  string `json:"node_url"`
	Epoch    int    `json:"vm_epoch"`
	State    string `json:"state"`
}
type Grant struct {
	ID        string `json:"jti"`
	UserID    string `json:"user_id"`
	BotID     string `json:"bot_id"`
	DesktopID string `json:"desktop_id"`
	ScreenID  string `json:"screen_id"`
	Epoch     int    `json:"vm_epoch"`
	Mode      string `json:"mode"`
	Expires   int64  `json:"exp"`
}

func (s *Service) Ensure(ctx context.Context, user, bot string) (Desktop, error) {
	var d Desktop
	e := p.Request(ctx, "POST", p.Env("CONTROL_URL", "")+"/internal/desktops/ensure", p.Object{"user_id": user, "bot_id": bot}, &d)
	if e != nil {
		return d, e
	}
	var actual p.Object
	e = p.Request(ctx, "POST", d.NodeURL+"/v1/desktops/"+d.ID+"/ensure", p.Object{"desktop_id": d.ID, "user_id": d.UserID, "volume_id": d.VolumeID, "vm_epoch": d.Epoch}, &actual)
	if e != nil {
		return d, e
	}
	d.State = p.Text(actual, "state")
	e = p.Request(ctx, "POST", p.Env("CONTROL_URL", "")+"/internal/desktops/"+d.ID+"/observed", p.Object{"vm_epoch": d.Epoch, "state": d.State}, nil)
	return d, e
}
func (s *Service) Sessions(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		UserID string `json:"user_id"`
		BotID  string `json:"bot_id"`
		Mode   string `json:"mode"`
	}
	if e := p.Decode(r, &in); e != nil {
		return e
	}
	if in.Mode != "view" && in.Mode != "control" {
		return p.Error(400, "mode must be view or control")
	}
	key := p.Env("DESKTOP_SIGNING_KEY", "")
	if key == "" {
		return p.Error(503, "desktop signing key not configured")
	}
	d, e := s.Ensure(r.Context(), in.UserID, in.BotID)
	if e != nil {
		return e
	}
	screen := p.Stable("screen", in.BotID)
	_, e = s.DB.Exec(r.Context(), "INSERT INTO desktop.screens(id,user_id,bot_id,desktop_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", screen, in.UserID, in.BotID, d.ID)
	if e != nil {
		return e
	}
	grant := Grant{ID: uuid.NewString(), UserID: in.UserID, BotID: in.BotID, DesktopID: d.ID, ScreenID: screen, Epoch: d.Epoch, Mode: in.Mode, Expires: time.Now().Add(5 * time.Minute).Unix()}
	p.Reply(w, 200, p.Object{"desktop_id": d.ID, "screen_id": screen, "state": d.State, "expires_at": grant.Expires, "websocket_url": "/desktop/connect?token=" + url.QueryEscape(p.Sign(key, grant))})
	return nil
}
func (s *Service) Job(w http.ResponseWriter, r *http.Request) error {
	var input guest.Job
	if e := p.Decode(r, &input); e != nil {
		return e
	}
	id := r.PathValue("id")
	var j guest.Job
	e := s.DB.QueryRow(r.Context(), `SELECT id,user_id,bot_id,thread_id,ticket_id,worker_id,desktop_id,vm_epoch,tool,input,state,desired,result FROM control.jobs WHERE id=$1`, id).Scan(&j.ID, &j.UserID, &j.BotID, &j.ThreadID, &j.TicketID, &j.WorkerID, &j.DesktopID, &j.Epoch, &j.Tool, &j.Input, &j.State, &j.Desired, &j.Result)
	if e != nil {
		return e
	}
	if j.UserID != input.UserID || j.Epoch != input.Epoch {
		return p.Error(403, "job binding denied")
	}
	action := r.PathValue("action")
	if action != "start" && action != "status" && action != "stop" {
		return p.Error(400, "invalid action")
	}
	d, e := s.Ensure(r.Context(), j.UserID, j.BotID)
	if e != nil {
		return e
	}
	if d.State != "running" {
		p.Reply(w, 202, p.Object{"state": "queued", "result": p.Object{}})
		return nil
	}
	var out guest.Job
	e = p.Request(r.Context(), "POST", d.NodeURL+"/v1/jobs/"+id+"/"+action, j, &out)
	if e == nil {
		p.Reply(w, 200, out)
	}
	return e
}
func (s *Service) Callback(w http.ResponseWriter, r *http.Request) error {
	var j guest.Job
	if e := p.Decode(r, &j); e != nil {
		return e
	}
	var yes bool
	e := s.DB.QueryRow(r.Context(), "SELECT true FROM control.jobs WHERE id=$1 AND user_id=$2 AND desktop_id=$3 AND vm_epoch=$4", j.ID, j.UserID, j.DesktopID, j.Epoch).Scan(&yes)
	if e != nil {
		return p.Error(403, "job callback denied")
	}
	e = p.Request(r.Context(), "POST", p.Env("CONTROL_URL", "")+"/internal/job-events", p.Object{"job_id": j.ID, "vm_epoch": j.Epoch, "state": j.State, "result": j.Result}, nil)
	if e == nil {
		p.Reply(w, 200, p.Object{"ok": true})
	}
	return e
}
func (s *Service) Connect(w http.ResponseWriter, r *http.Request) error {
	var g Grant
	if e := p.Verify(p.Env("DESKTOP_SIGNING_KEY", ""), r.URL.Query().Get("token"), &g); e != nil {
		return e
	}
	if g.Expires <= time.Now().Unix() || (g.Mode != "view" && g.Mode != "control") {
		return p.Error(403, "expired desktop grant")
	}
	var nodeURL string
	e := s.DB.QueryRow(r.Context(), `SELECT d.node_url FROM control.desktops d JOIN desktop.screens s ON s.desktop_id=d.id JOIN gateway.bots b ON b.id=s.bot_id WHERE d.id=$1 AND d.user_id=$2 AND d.epoch=$3 AND s.id=$4 AND s.bot_id=$5 AND NOT b.deleted`, g.DesktopID, g.UserID, g.Epoch, g.ScreenID, g.BotID).Scan(&nodeURL)
	if e != nil {
		return p.Error(403, "desktop access revoked")
	}
	ctx, cancel := context.WithDeadline(r.Context(), time.Unix(g.Expires, 0))
	defer cancel()
	lock := "desktop:input:" + g.DesktopID
	owner := uuid.NewString()
	if g.Mode == "control" {
		ok, e := s.Redis.SetNX(ctx, lock, owner, 30*time.Second).Result()
		if e != nil {
			return p.Error(503, "control lease unavailable")
		}
		if !ok {
			return p.Error(409, "desktop is controlled by another session")
		}
		defer func() {
			c, end := context.WithTimeout(context.Background(), 2*time.Second)
			defer end()
			s.Redis.Eval(c, `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0`, []string{lock}, owner)
		}()
		go func() {
			ticker := time.NewTicker(10 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					n, e := s.Redis.Eval(ctx, `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('expire',KEYS[1],30) end return 0`, []string{lock}, owner).Int()
					if e != nil || n != 1 {
						cancel()
						return
					}
				}
			}
		}()
	}
	target := strings.Replace(strings.Replace(nodeURL, "https://", "wss://", 1), "http://", "ws://", 1) + "/v1/desktops/" + g.DesktopID + "/screens/" + g.ScreenID + "?mode=" + g.Mode
	upstream, _, e := websocket.Dial(ctx, target, &websocket.DialOptions{HTTPHeader: http.Header{"Authorization": []string{"Bearer " + p.ServiceToken("desktop-gateway")}}, Subprotocols: []string{"binary"}})
	if e != nil {
		return p.Error(503, "screen not ready")
	}
	defer upstream.CloseNow()
	client, e := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"binary"}})
	if e != nil {
		return nil
	}
	defer client.CloseNow()
	a, b := websocket.NetConn(ctx, client, websocket.MessageBinary), websocket.NetConn(ctx, upstream, websocket.MessageBinary)
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(a, b); done <- struct{}{} }()
	go func() { _, _ = io.Copy(b, a); done <- struct{}{} }()
	select {
	case <-ctx.Done():
	case <-done:
	}
	return nil
}
func (s *Service) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	for _, r := range []struct {
		pattern string
		roles   []string
		fn      func(http.ResponseWriter, *http.Request) error
	}{{"POST /internal/sessions", []string{"api-gateway"}, s.Sessions}, {"POST /internal/jobs/{id}/{action}", []string{"control-plane"}, s.Job}, {"POST /internal/job-events", []string{"node-runtime"}, s.Callback}} {
		entry := r
		mux.HandleFunc(entry.pattern, p.Handler(func(w http.ResponseWriter, r *http.Request) error {
			if e := p.Internal(r, entry.roles...); e != nil {
				return e
			}
			return entry.fn(w, r)
		}))
	}
	mux.HandleFunc("GET /desktop/connect", p.Handler(s.Connect))
	return mux
}
