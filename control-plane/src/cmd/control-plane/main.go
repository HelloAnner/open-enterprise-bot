package main

import (
	"enterprise/control-plane/src/dispatch"
	"enterprise/control-plane/src/job"
	p "enterprise/control-plane/src/platform"
	"enterprise/control-plane/src/transport"
	"os"
)

func main() {
	os.Setenv("SERVICE_NAME", "control-plane")
	ctx := p.Context()
	db := p.Connect(ctx)
	defer db.Close()
	bus := p.OpenBus()
	defer bus.Conn.Close()
	d := &dispatch.Dispatcher{DB: db}
	j := &job.Manager{DB: db}
	go bus.PublishOutbox(ctx, db, "control")
	for _, subject := range []string{"ingress", "agent", "execution"} {
		go bus.Consume(ctx, "eob.events."+subject, "dispatch-"+subject, d.Handle)
	}
	for i := 0; i < 4; i++ {
		go j.Reconcile(ctx)
	}
	p.Serve(ctx, transport.Routes(db, d, j), func() error { return db.Ping(ctx) })
}
