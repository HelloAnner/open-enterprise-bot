package main

import (
	"enterprise/desktop-gateway/src/node"
	p "enterprise/desktop-gateway/src/platform"
	"os"
)

func main() {
	os.Setenv("SERVICE_NAME", "node-runtime")
	ctx := p.Context()
	n := &node.Runtime{Root: p.Env("NODE_STATE_ROOT", "/var/lib/eob")}
	p.Must(os.MkdirAll(n.Root, 0700))
	p.Serve(ctx, n.Routes(), func() error { _, e := os.Stat("/dev/kvm"); return e })
}
