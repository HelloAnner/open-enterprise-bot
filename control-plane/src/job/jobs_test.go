package job

import (
	p "enterprise/control-plane/src/platform"
	"enterprise/control-plane/src/policy"
	"testing"
)

func TestExecutionContract(t *testing.T) {
	for _, state := range []string{"queued", "running", "stopping", "accepted"} {
		if Terminal(state) {
			t.Fatalf("acceptance is not terminal: %s", state)
		}
	}
	for _, state := range []string{"completed", "failed", "stopped"} {
		if !Terminal(state) {
			t.Fatal(state)
		}
	}
	t.Setenv("ALLOWED_TOOLS", "write_file,python")
	if policy.Tool("shell") || policy.Tool("python,evil") || !policy.Tool("python") {
		t.Fatal("tool policy bypass")
	}
	if p.Stable("job", "user", "operation") != p.Stable("job", "user", "operation") || p.Stable("job", "user", "operation") == p.Stable("job", "other", "operation") {
		t.Fatal("operation identity scope")
	}
}
