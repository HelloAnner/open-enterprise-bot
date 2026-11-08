package main

import (
	"enterprise/desktop-gateway/src/guest"
	p "enterprise/desktop-gateway/src/platform"
	"os"
)

func main() {
	if len(os.Args) == 4 && os.Args[1] == "exec-tool" {
		p.Must(guest.ExecTool(os.Args[2], os.Args[3]))
		return
	}
	if len(os.Args) == 3 && os.Args[1] == "run-job" {
		p.Must(guest.RunJob(os.Args[2]))
		return
	}
	ctx := p.Context()
	a := &guest.Agent{Root: p.Env("WORKSPACE_ROOT", "/data")}
	p.Must(os.MkdirAll(a.Root, 0700))
	go a.Notify(ctx)
	p.Serve(ctx, a.Routes(), func() error { _, e := os.Stat(a.Root); return e })
}
