package main

import (
	"enterprise/desktop-gateway/src/gateway"
	p "enterprise/desktop-gateway/src/platform"
	"github.com/redis/go-redis/v9"
	"os"
)

func main() {
	os.Setenv("SERVICE_NAME", "desktop-gateway")
	ctx := p.Context()
	db := p.Connect(ctx)
	defer db.Close()
	opt, e := redis.ParseURL(p.Env("REDIS_URL", "redis://localhost:6379"))
	p.Must(e)
	r := redis.NewClient(opt)
	defer r.Close()
	s := &gateway.Service{DB: db, Redis: r}
	p.Serve(ctx, s.Routes(), func() error {
		if e := db.Ping(ctx); e != nil {
			return e
		}
		return r.Ping(ctx).Err()
	})
}
