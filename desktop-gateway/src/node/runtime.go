package node

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"enterprise/desktop-gateway/src/guest"
	p "enterprise/desktop-gateway/src/platform"
)

type Binding struct {
	ID       string `json:"desktop_id"`
	UserID   string `json:"user_id"`
	VolumeID string `json:"volume_id"`
	Epoch    int    `json:"vm_epoch"`
	Slot     int    `json:"slot"`
	GuestURL string `json:"guest_url"`
	Token    string `json:"-"`
}
type Runtime struct {
	Root string
	mu   sync.Mutex
}

func (n *Runtime) binding(id string) (Binding, error) {
	var b Binding
	if !guest.ValidID(id) {
		return b, p.Error(400, "invalid desktop")
	}
	data, e := os.ReadFile(filepath.Join(n.Root, "registry", id+".json"))
	if e != nil {
		return b, e
	}
	e = json.Unmarshal(data, &b)
	if e != nil {
		return b, e
	}
	token, e := os.ReadFile(filepath.Join(n.Root, "registry", id+".key"))
	b.Token = string(token)
	return b, e
}
func active(id string) bool {
	return exec.Command("systemctl", "is-active", "--quiet", "eob-vm@"+id+".service").Run() == nil
}
func (n *Runtime) Ensure(ctx context.Context, in Binding) (Binding, error) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if !guest.ValidID(in.ID) || !guest.ValidID(in.VolumeID) || in.UserID == "" || len(in.UserID) > 200 || strings.ContainsAny(in.UserID, "\n\r\x00") || in.Epoch < 1 {
		return Binding{}, p.Error(400, "invalid desktop binding")
	}
	b, e := n.binding(in.ID)
	if e == nil {
		if b.UserID != in.UserID || b.VolumeID != in.VolumeID || b.Epoch != in.Epoch {
			return b, p.Error(409, "volume/epoch mismatch; explicit fencing required")
		}
	} else if os.IsNotExist(e) {
		if e = os.MkdirAll(filepath.Join(n.Root, "registry"), 0700); e != nil {
			return b, e
		}
		files, e := filepath.Glob(filepath.Join(n.Root, "registry", "*.json"))
		if e != nil {
			return b, e
		}
		b = in
		b.Slot = len(files) + 1
		if b.Slot > p.Int("NODE_VM_LIMIT", 32) {
			return b, p.Error(429, "compute node capacity reached")
		}
		b.GuestURL = fmt.Sprintf("http://172.30.%d.%d:8088", b.Slot/64, (b.Slot%64)*4+2)
		key := make([]byte, 32)
		if _, e = rand.Read(key); e != nil {
			return b, e
		}
		b.Token = base64.RawURLEncoding.EncodeToString(key)
		if e = os.WriteFile(filepath.Join(n.Root, "registry", in.ID+".key"), []byte(b.Token), 0600); e != nil {
			return b, e
		}
		if e = guest.WriteJSON(filepath.Join(n.Root, "registry", in.ID+".json"), b); e != nil {
			return b, e
		}
	} else {
		return b, e
	}
	if active(b.ID) {
		return b, nil
	}
	// The provisioner configures a durable volume and a systemd-owned jailer, never a child of this API.
	cmd := exec.CommandContext(ctx, p.Env("PROVISION_COMMAND", "/opt/eob/provision.sh"), b.ID, b.VolumeID, fmt.Sprint(b.Slot))
	cmd.Env = append(os.Environ(), "GUEST_USER_ID="+b.UserID, "GUEST_TOKEN="+b.Token, "GUEST_EPOCH="+fmt.Sprint(b.Epoch))
	if output, e := cmd.CombinedOutput(); e != nil {
		return b, fmt.Errorf("VM provisioning failed (%v): %s", e, output)
	}
	return b, nil
}
func guestRequest(ctx context.Context, b Binding, method, path string, body any, out any) error {
	req, e := http.NewRequestWithContext(ctx, method, b.GuestURL+path, strings.NewReader(string(p.JSON(body))))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+b.Token)
	res, e := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return fmt.Errorf("guest HTTP %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}
func (n *Runtime) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	wrap := func(fn func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
		return p.Handler(func(w http.ResponseWriter, r *http.Request) error {
			if e := p.Internal(r, "desktop-gateway"); e != nil {
				return e
			}
			return fn(w, r)
		})
	}
	mux.HandleFunc("POST /v1/desktops/{id}/ensure", wrap(func(w http.ResponseWriter, r *http.Request) error {
		var in Binding
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		if in.ID != r.PathValue("id") {
			return p.Error(400, "desktop mismatch")
		}
		b, e := n.Ensure(r.Context(), in)
		if e != nil {
			return e
		}
		state := "starting"
		var actual p.Object
		if e = guestRequest(r.Context(), b, "GET", "/v1/status", nil, &actual); e == nil {
			state = p.Text(actual, "state")
		}
		p.Reply(w, 200, p.Object{"state": state, "desktop_id": b.ID, "vm_epoch": b.Epoch})
		return nil
	}))
	mux.HandleFunc("POST /v1/desktops/{id}/stop", wrap(func(w http.ResponseWriter, r *http.Request) error {
		b, e := n.binding(r.PathValue("id"))
		if e != nil {
			return e
		}
		if active(b.ID) {
			socket := filepath.Join(p.Env("JAILER_ROOT", "/srv/eob/jailer"), "firecracker", b.ID, "root", "run", "firecracker.socket")
			cmd := exec.CommandContext(r.Context(), "curl", "--fail", "--silent", "--unix-socket", socket, "-X", "PUT", "http://localhost/actions", "-H", "Content-Type: application/json", "-d", `{"action_type":"SendCtrlAltDel"}`)
			if e = cmd.Run(); e != nil {
				return e
			}
			p.Reply(w, 202, p.Object{"state": "stopping"})
		} else {
			p.Reply(w, 200, p.Object{"state": "stopped"})
		}
		return nil
	}))
	mux.HandleFunc("POST /v1/jobs/{id}/{action}", wrap(func(w http.ResponseWriter, r *http.Request) error {
		var in guest.Job
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		if in.ID != r.PathValue("id") {
			return p.Error(400, "job mismatch")
		}
		b, e := n.binding(in.DesktopID)
		if e != nil {
			return e
		}
		if b.UserID != in.UserID || int64(b.Epoch) != in.Epoch {
			return p.Error(403, "execution binding denied")
		}
		action := r.PathValue("action")
		if action != "start" && action != "stop" && action != "status" {
			return p.Error(400, "invalid job action")
		}
		var out guest.Job
		e = guestRequest(r.Context(), b, "POST", "/v1/jobs/"+in.ID+"/"+action, in, &out)
		if e == nil {
			p.Reply(w, 200, out)
		}
		return e
	}))
	mux.HandleFunc("GET /v1/desktops/{id}/screens/{screen}", wrap(func(w http.ResponseWriter, r *http.Request) error {
		b, e := n.binding(r.PathValue("id"))
		if e != nil {
			return e
		}
		mode := r.URL.Query().Get("mode")
		if mode != "view" && mode != "control" {
			return p.Error(403, "invalid screen mode")
		}
		grant := guest.ScreenGrant{Desktop: b.ID, Screen: r.PathValue("screen"), Epoch: b.Epoch, Mode: mode, Expires: time.Now().Add(5 * time.Minute).Unix()}
		target, _ := url.Parse(b.GuestURL)
		proxy := httputil.NewSingleHostReverseProxy(target)
		original := proxy.Director
		proxy.Director = func(req *http.Request) {
			original(req)
			req.URL.Path = "/v1/screens/" + grant.Screen
			req.URL.RawQuery = ""
			req.Header.Del("Origin")
			req.Header.Set("Authorization", "Bearer "+b.Token)
			req.Header.Set("X-Screen-Grant", p.Sign(b.Token, grant))
		}
		proxy.ServeHTTP(w, r)
		return nil
	}))
	mux.HandleFunc("POST /v1/guest-events", p.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in guest.Job
		if e := p.Decode(r, &in); e != nil {
			return e
		}
		b, e := n.binding(in.DesktopID)
		if e != nil {
			return e
		}
		if r.Header.Get("Authorization") != "Bearer "+b.Token || in.UserID != b.UserID || in.Epoch != int64(b.Epoch) {
			return p.Error(403, "guest event denied")
		}
		var out p.Object
		e = p.Request(r.Context(), "POST", p.Env("DESKTOP_URL", "")+"/internal/job-events", in, &out)
		if e == nil {
			p.Reply(w, 200, out)
		}
		return e
	}))
	return mux
}
