package guest

import (
	"crypto/hmac"
	p "enterprise/desktop-gateway/src/platform"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func (a *Agent) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	wrap := func(fn func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
		return p.Handler(func(w http.ResponseWriter, r *http.Request) error {
			key := p.Env("GUEST_TOKEN", "")
			if key == "" || !hmac.Equal([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")), []byte(key)) {
				return p.Error(401, "guest authentication required")
			}
			return fn(w, r)
		})
	}
	mux.HandleFunc("POST /v1/jobs/{id}/{action}", wrap(func(w http.ResponseWriter, r *http.Request) error {
		var in Job
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		if in.ID != r.PathValue("id") || in.UserID != p.Env("GUEST_USER_ID", "") || in.DesktopID != p.Env("GUEST_DESKTOP_ID", "") || in.Epoch != int64(p.Int("GUEST_EPOCH", 1)) {
			return p.Error(403, "guest scope denied")
		}
		var out Job
		var e error
		switch r.PathValue("action") {
		case "start":
			out, e = a.Start(in)
		case "status":
			out, e = a.Status(in.ID)
		case "stop":
			dir, err := a.jobdir(in.ID)
			if err != nil {
				return err
			}
			a.mu.Lock()
			if _, err = os.Stat(dir); os.IsNotExist(err) {
				e = os.MkdirAll(dir, 0700)
				if e == nil {
					in.State = "stopped"
					in.Result = p.Object{}
					e = WriteJSON(filepath.Join(dir, "state.json"), in)
				}
			}
			a.mu.Unlock()
			if e == nil {
				out, e = a.Stop(in.ID)
			}
		default:
			return p.Error(400, "unknown job action")
		}
		if e == nil {
			p.Reply(w, 200, out)
		}
		return e
	}))
	mux.HandleFunc("GET /v1/screens/{screen}", wrap(a.ConnectScreen))
	mux.HandleFunc("GET /v1/status", wrap(func(w http.ResponseWriter, r *http.Request) error {
		_, e := chrome(r.Context(), "Browser.getVersion", nil)
		if e != nil {
			return p.Error(503, "browser not ready")
		}
		if _, e = os.Stat(a.Root); e != nil {
			return p.Error(503, "user volume not ready")
		}
		p.Reply(w, 200, p.Object{"state": "running", "desktop_id": p.Env("GUEST_DESKTOP_ID", ""), "vm_epoch": p.Int("GUEST_EPOCH", 1)})
		return nil
	}))
	return mux
}
