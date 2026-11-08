package guest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	p "enterprise/desktop-gateway/src/platform"
	"github.com/coder/websocket"
)

type Screen struct {
	ID     string `json:"screen_id"`
	Slot   int    `json:"slot"`
	Target string `json:"target"`
}
type ScreenGrant struct {
	Desktop string `json:"desktop_id"`
	Screen  string `json:"screen_id"`
	Epoch   int    `json:"vm_epoch"`
	Mode    string `json:"mode"`
	Expires int64  `json:"exp"`
}

var screensMu sync.Mutex
var inputMu sync.Mutex // The Guest enforces single GUI input even during a Redis restart.

func chrome(ctx context.Context, method string, params p.Object) (p.Object, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", "http://127.0.0.1:9222/json/version", nil)
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		return nil, e
	}
	defer res.Body.Close()
	var version p.Object
	if e = json.NewDecoder(res.Body).Decode(&version); e != nil {
		return nil, e
	}
	conn, _, e := websocket.Dial(ctx, p.Text(version, "webSocketDebuggerUrl"), nil)
	if e != nil {
		return nil, e
	}
	defer conn.CloseNow()
	if e = conn.Write(ctx, websocket.MessageText, p.JSON(p.Object{"id": 1, "method": method, "params": params})); e != nil {
		return nil, e
	}
	for {
		_, b, e := conn.Read(ctx)
		if e != nil {
			return nil, e
		}
		var out p.Object
		if e = json.Unmarshal(b, &out); e != nil {
			return nil, e
		}
		if out["id"] == float64(1) {
			if out["error"] != nil {
				return nil, fmt.Errorf("browser command failed")
			}
			result, _ := out["result"].(map[string]any)
			return result, nil
		}
	}
}
func (a *Agent) EnsureScreen(ctx context.Context, id string) (Screen, error) {
	screensMu.Lock()
	defer screensMu.Unlock()
	s := Screen{ID: id}
	if !ValidID(id) {
		return s, p.Error(400, "invalid screen")
	}
	root := filepath.Join(a.Root, "screens")
	if e := os.MkdirAll(root, 0700); e != nil {
		return s, e
	}
	path := filepath.Join(root, id+".json")
	if b, e := os.ReadFile(path); e == nil {
		if e = json.Unmarshal(b, &s); e != nil {
			return s, e
		}
	} else {
		entries, e := os.ReadDir(root)
		if e != nil {
			return s, e
		}
		s.Slot = len(entries)
		if s.Slot >= p.Int("SCREEN_LIMIT", 4) {
			return s, p.Error(429, "screen quota exceeded")
		}
	}
	// Recreate ephemeral Chrome bindings after Guest/browser restart; the logical screen ID stays stable.
	if _, e := chrome(ctx, "Target.getTargetInfo", p.Object{"targetId": s.Target}); s.Target == "" || e != nil {
		t, e := chrome(ctx, "Target.createTarget", p.Object{"url": "about:blank", "newWindow": true})
		if e != nil {
			return s, e
		}
		s.Target = p.Text(t, "targetId")
		win, e := chrome(ctx, "Browser.getWindowForTarget", p.Object{"targetId": s.Target})
		if e != nil {
			return s, e
		}
		w, h := p.Int("SCREEN_WIDTH", 1280), p.Int("SCREEN_HEIGHT", 720)
		_, e = chrome(ctx, "Browser.setWindowBounds", p.Object{"windowId": win["windowId"], "bounds": p.Object{"left": (s.Slot % 2) * w, "top": (s.Slot / 2) * h, "width": w, "height": h, "windowState": "normal"}})
		if e != nil {
			return s, e
		}
		if e = WriteJSON(path, s); e != nil {
			return s, e
		}
	}
	for _, view := range []bool{false, true} {
		port := 5900 + s.Slot*2
		if view {
			port++
		}
		c, e := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 100*time.Millisecond)
		if e == nil {
			c.Close()
			continue
		}
		w, h := p.Int("SCREEN_WIDTH", 1280), p.Int("SCREEN_HEIGHT", 720)
		args := []string{"-display", ":0", "-clip", fmt.Sprintf("%dx%d+%d+%d", w, h, (s.Slot%2)*w, (s.Slot/2)*h), "-rfbport", strconv.Itoa(port), "-localhost", "-forever", "-shared", "-nopw", "-quiet"}
		if view {
			args = append(args, "-viewonly")
		}
		cmd := exec.Command("x11vnc", args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		if e = cmd.Start(); e != nil {
			return s, e
		}
		go cmd.Wait()
	}
	return s, nil
}
func (a *Agent) ConnectScreen(w http.ResponseWriter, r *http.Request) error {
	var grant ScreenGrant
	if e := p.Verify(p.Env("GUEST_TOKEN", ""), r.Header.Get("X-Screen-Grant"), &grant); e != nil {
		return e
	}
	if grant.Desktop != p.Env("GUEST_DESKTOP_ID", "") || grant.Epoch != p.Int("GUEST_EPOCH", 1) || grant.Expires <= time.Now().Unix() || grant.Screen != r.PathValue("screen") || (grant.Mode != "view" && grant.Mode != "control") {
		return p.Error(403, "screen grant denied")
	}
	if grant.Mode == "control" {
		if !inputMu.TryLock() {
			return p.Error(409, "guest GUI already controlled")
		}
		defer inputMu.Unlock()
	}
	ctx, cancel := context.WithDeadline(r.Context(), time.Unix(grant.Expires, 0))
	defer cancel()
	s, e := a.EnsureScreen(ctx, grant.Screen)
	if e != nil {
		return e
	}
	port := 5900 + s.Slot*2
	if grant.Mode == "view" {
		port++
	} else {
		if _, e = chrome(ctx, "Target.activateTarget", p.Object{"targetId": s.Target}); e != nil {
			return e
		}
	}
	var tcp net.Conn
	for i := 0; i < 20; i++ {
		tcp, e = net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second)
		if e == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if e != nil {
		return e
	}
	defer tcp.Close()
	conn, e := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"binary"}})
	if e != nil {
		return nil
	}
	defer conn.CloseNow()
	ws := websocket.NetConn(ctx, conn, websocket.MessageBinary)
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(tcp, ws); done <- struct{}{} }()
	go func() { _, _ = io.Copy(ws, tcp); done <- struct{}{} }()
	select {
	case <-ctx.Done():
	case <-done:
	}
	return nil
}
