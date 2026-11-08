package guest

import (
	"encoding/base64"
	p "enterprise/desktop-gateway/src/platform"
	"github.com/google/uuid"
	"os"
	"path/filepath"
	"testing"
)

func TestDurableExecutionAndPaths(t *testing.T) {
	root := t.TempDir()
	t.Setenv("WORKSPACE_ROOT", root)
	dir := filepath.Join(root, "jobs", uuid.NewString())
	if e := os.MkdirAll(dir, 0700); e != nil {
		t.Fatal(e)
	}
	j := Job{ID: uuid.NewString(), BotID: uuid.NewString(), TicketID: uuid.NewString(), WorkerID: uuid.NewString(), Tool: "write_file", Input: p.Object{"name": "result.txt", "content": "actual result"}, State: "queued"}
	if e := WriteJSON(filepath.Join(dir, "state.json"), j); e != nil {
		t.Fatal(e)
	}
	if e := RunJob(dir); e != nil {
		t.Fatal(e)
	}
	out, e := ReadJob(dir)
	if e != nil || out.State != "completed" {
		t.Fatalf("%+v %v", out, e)
	}
	list := out.Result["artifacts"].([]any)
	data, e := base64.StdEncoding.DecodeString(list[0].(map[string]any)["data"].(string))
	if e != nil || string(data) != "actual result" {
		t.Fatalf("artifact %s %v", data, e)
	}
	j.Input = p.Object{"name": "../escape", "content": "denied"}
	if e = WriteJSON(filepath.Join(dir, "state.json"), j); e != nil {
		t.Fatal(e)
	}
	if e = RunJob(dir); e != nil {
		t.Fatal(e)
	}
	out, e = ReadJob(dir)
	if e != nil || out.State != "failed" {
		t.Fatal("path escape was not rejected")
	}
	a := &Agent{Root: root}
	if _, e = a.jobdir("../../escape"); e == nil {
		t.Fatal("untrusted job path")
	}
}
