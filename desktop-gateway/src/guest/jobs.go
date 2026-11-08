package guest

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	p "enterprise/desktop-gateway/src/platform"
	"github.com/google/uuid"
)

type Job struct {
	ID        string   `json:"job_id"`
	UserID    string   `json:"user_id"`
	BotID     string   `json:"bot_id"`
	ThreadID  string   `json:"thread_id"`
	TicketID  string   `json:"ticket_id"`
	WorkerID  string   `json:"worker_id"`
	DesktopID string   `json:"desktop_id"`
	Epoch     int64    `json:"vm_epoch"`
	Tool      string   `json:"tool"`
	Input     p.Object `json:"input"`
	State     string   `json:"state"`
	Desired   string   `json:"desired"`
	Result    p.Object `json:"result"`
	PID       int      `json:"pid,omitempty"`
}
type Agent struct {
	Root string
	mu   sync.Mutex
}

func ValidID(id string) bool { _, e := uuid.Parse(id); return e == nil }
func WriteJSON(path string, value any) error {
	data := p.JSON(value)
	tmp := path + ".tmp-" + uuid.NewString()
	f, e := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		return e
	}
	defer os.Remove(tmp)
	if _, e = f.Write(data); e != nil {
		f.Close()
		return e
	}
	if e = f.Sync(); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	if e = os.Rename(tmp, path); e != nil {
		return e
	}
	dir, e := os.Open(filepath.Dir(path))
	if e != nil {
		return e
	}
	defer dir.Close()
	return dir.Sync()
}
func ReadJob(dir string) (Job, error) {
	var j Job
	b, e := os.ReadFile(filepath.Join(dir, "state.json"))
	if e == nil {
		e = json.Unmarshal(b, &j)
	}
	return j, e
}
func (a *Agent) jobdir(id string) (string, error) {
	if !ValidID(id) {
		return "", p.Error(400, "invalid job id")
	}
	return filepath.Join(a.Root, "jobs", id), nil
}
func (a *Agent) Status(id string) (Job, error) {
	dir, e := a.jobdir(id)
	if e != nil {
		return Job{}, e
	}
	j, e := ReadJob(dir)
	if errors.Is(e, os.ErrNotExist) {
		return j, p.Error(404, "job not found")
	}
	if e == nil && j.State == "running" && j.PID > 0 && syscall.Kill(j.PID, 0) != nil {
		j.State = "failed"
		j.Result = p.Object{"error": "execution process disappeared; not replayed"}
		e = WriteJSON(filepath.Join(dir, "state.json"), j)
	}
	return j, e
}
func (a *Agent) Start(in Job) (Job, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	dir, e := a.jobdir(in.ID)
	if e != nil {
		return Job{}, e
	}
	for _, id := range []string{in.BotID, in.TicketID, in.WorkerID, in.DesktopID} {
		if !ValidID(id) {
			return Job{}, p.Error(400, "invalid execution path")
		}
	}
	if in.UserID != p.Env("GUEST_USER_ID", "") || in.DesktopID != p.Env("GUEST_DESKTOP_ID", "") || in.Epoch != int64(p.Int("GUEST_EPOCH", 1)) {
		return Job{}, p.Error(403, "guest identity or epoch mismatch")
	}
	if !strings.Contains(","+p.Env("ALLOWED_TOOLS", "write_file,python")+",", ","+in.Tool+",") {
		return Job{}, p.Error(403, "tool denied")
	}
	if old, e := ReadJob(dir); e == nil {
		if old.UserID != in.UserID || old.WorkerID != in.WorkerID || old.Tool != in.Tool || string(p.JSON(old.Input)) != string(p.JSON(in.Input)) {
			return Job{}, p.Error(409, "job identity reused")
		}
		return old, nil
	}
	if e = os.MkdirAll(filepath.Dir(dir), 0700); e != nil {
		return Job{}, e
	}
	if e = os.Mkdir(dir, 0700); e != nil {
		return Job{}, e
	}
	in.State = "queued"
	in.Result = p.Object{}
	in.PID = 0
	if e = WriteJSON(filepath.Join(dir, "state.json"), in); e != nil {
		return Job{}, e
	}
	exe, e := os.Executable()
	if e != nil {
		return Job{}, e
	}
	cmd := exec.Command(exe, "run-job", dir)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if e = cmd.Start(); e != nil {
		in.State = "failed"
		in.Result = p.Object{"error": "could not start executor"}
		_ = WriteJSON(filepath.Join(dir, "state.json"), in)
		return in, nil
	}
	go cmd.Wait()
	return in, nil
}
func (a *Agent) Stop(id string) (Job, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	dir, e := a.jobdir(id)
	if e != nil {
		return Job{}, e
	}
	j, e := ReadJob(dir)
	if e != nil {
		return j, e
	}
	if j.State == "completed" || j.State == "failed" || j.State == "stopped" {
		return j, nil
	}
	if e = os.WriteFile(filepath.Join(dir, "stop"), nil, 0600); e != nil {
		return j, e
	}
	if j.PID > 0 {
		_ = syscall.Kill(-j.PID, syscall.SIGTERM)
	}
	return j, nil
}

func RunJob(dir string) error {
	j, e := ReadJob(dir)
	if e != nil {
		return e
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	ctx, timeout := context.WithTimeout(ctx, time.Duration(p.Int("JOB_TIMEOUT_SECONDS", 300))*time.Second)
	defer timeout()
	j.PID = os.Getpid()
	j.State = "running"
	if e = WriteJSON(filepath.Join(dir, "state.json"), j); e != nil {
		return e
	}
	root := p.Env("WORKSPACE_ROOT", "/data")
	workdir := filepath.Join(root, "bots", j.BotID, "tickets", j.TicketID, "workers", j.WorkerID, j.ID)
	e = os.MkdirAll(workdir, 0700)
	name := p.Text(j.Input, "name")
	if name == "" {
		name = "result.txt"
	}
	if filepath.Base(name) != name || name == "." || name == ".." || strings.ContainsAny(name, "\x00/\\") {
		e = fmt.Errorf("invalid output name")
	}
	path := filepath.Join(workdir, name)
	limit := int64(p.Int("ARTIFACT_MAX_MIB", 10)) << 20
	if _, stop := os.Stat(filepath.Join(dir, "stop")); stop == nil {
		cancel()
	}
	if e == nil && ctx.Err() == nil {
		switch j.Tool {
		case "write_file":
			if int64(len(p.Text(j.Input, "content"))) > limit {
				e = fmt.Errorf("artifact exceeds limit")
			} else {
				e = os.WriteFile(path, []byte(p.Text(j.Input, "content")), 0600)
			}
		case "python", "shell":
			var out *os.File
			out, e = os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if e == nil {
				exe, err := os.Executable()
				if err != nil {
					out.Close()
					return err
				}
				cmd := exec.CommandContext(ctx, exe, "exec-tool", j.Tool, p.Text(j.Input, "code"))
				cmd.Dir = workdir
				cmd.Env = []string{"PATH=/usr/local/bin:/usr/bin:/bin", "HOME=" + root, "LANG=C.UTF-8", "ARTIFACT_MAX_MIB=" + fmt.Sprint(p.Int("ARTIFACT_MAX_MIB", 10))}
				cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
				cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
				cmd.WaitDelay = time.Second
				cmd.Stdout = out
				cmd.Stderr = io.Discard
				e = cmd.Run()
				_ = out.Sync()
				_ = out.Close()
			}
		default:
			e = fmt.Errorf("unknown tool")
		}
	}
	j.State = "completed"
	j.Result = p.Object{"text": "后台任务已完成。"}
	if ctx.Err() != nil {
		j.State = "stopped"
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			j.State = "failed"
		}
		j.Result = p.Object{"error": "execution cancelled or timed out"}
	} else if e != nil {
		j.State = "failed"
		j.Result = p.Object{"error": "execution failed", "exit_code": 1}
	} else {
		var data []byte
		file, err := os.Open(path)
		if err == nil {
			data, err = io.ReadAll(io.LimitReader(file, limit+1))
			file.Close()
		}
		if err != nil || int64(len(data)) > limit {
			j.State = "failed"
			j.Result = p.Object{"error": "artifact unavailable or oversized"}
		} else {
			j.Result["artifacts"] = []p.Object{{"name": name, "mime": "text/plain; charset=utf-8", "data": base64.StdEncoding.EncodeToString(data)}}
		}
	}
	return WriteJSON(filepath.Join(dir, "state.json"), j)
}

// Limit only the untrusted execution process, not the supervisor that must persist a larger base64 result.
func ExecTool(tool, code string) error {
	limit := uint64(p.Int("ARTIFACT_MAX_MIB", 10)) << 20
	if e := syscall.Setrlimit(syscall.RLIMIT_FSIZE, &syscall.Rlimit{Cur: limit, Max: limit}); e != nil {
		return e
	}
	program, args := "python3", []string{"python3", "-I", "-c", code}
	if tool == "shell" {
		program = "/bin/bash"
		args = []string{"bash", "-c", code}
	} else if tool != "python" {
		return fmt.Errorf("invalid tool")
	}
	path, e := exec.LookPath(program)
	if e != nil {
		return e
	}
	return syscall.Exec(path, args, os.Environ())
}

// Durable local state drives callback retry after Agent restarts; no Job is replayed on reconnect.
func (a *Agent) Notify(ctx context.Context) {
	for ctx.Err() == nil {
		dirs, _ := os.ReadDir(filepath.Join(a.Root, "jobs"))
		for _, entry := range dirs {
			if !entry.IsDir() {
				continue
			}
			dir := filepath.Join(a.Root, "jobs", entry.Name())
			j, e := a.Status(entry.Name())
			if e != nil || j.State == "queued" {
				continue
			}
			marker := filepath.Join(dir, "reported-"+j.State)
			if _, e = os.Stat(marker); e == nil {
				continue
			}
			req, e := http.NewRequestWithContext(ctx, "POST", p.Env("GUEST_CALLBACK_URL", ""), strings.NewReader(string(p.JSON(j))))
			if e != nil {
				continue
			}
			req.Header.Set("Authorization", "Bearer "+p.Env("GUEST_TOKEN", ""))
			req.Header.Set("Content-Type", "application/json")
			res, e := (&http.Client{Timeout: 5 * time.Second}).Do(req)
			if e == nil {
				res.Body.Close()
				if res.StatusCode < 300 {
					_ = os.WriteFile(marker, nil, 0600)
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
	}
}
