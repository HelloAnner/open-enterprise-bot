package main

import (
	"context"
	"enterprise/api-gateway/src/application"
	p "enterprise/api-gateway/src/platform"
	"enterprise/api-gateway/src/transport"
	"os"
)

func main() {
	os.Setenv("SERVICE_NAME", "api-gateway")
	ctx := p.Context()
	db := p.Connect(ctx)
	defer db.Close()
	bus := p.OpenBus()
	defer bus.Conn.Close()
	s := &application.Service{DB: db}
	p.Must(s.BootstrapAuth(ctx))
	go bus.PublishOutbox(ctx, db, "gateway")
	go bus.Consume(ctx, "eob.events.output", "gateway-output", func(ctx context.Context, e p.Event) error {
		if err := s.Output(ctx, e); err != nil {
			return err
		}
		return bus.Conn.Publish("eob.live."+p.Stable(e.UserID), p.JSON(p.Object{"botId": e.BotID, "type": e.Type}))
	})
	p.Serve(ctx, transport.Routes(s, bus), func() error { return db.Ping(ctx) })
}
