package compute

import (
	"context"
	p "enterprise/control-plane/src/platform"
	"github.com/jackc/pgx/v5"
)

type Desktop struct {
	ID       string `json:"desktop_id"`
	UserID   string `json:"user_id"`
	VolumeID string `json:"volume_id"`
	NodeURL  string `json:"node_url"`
	Epoch    int64  `json:"vm_epoch"`
	State    string `json:"state"`
}

func Ensure(ctx context.Context, tx pgx.Tx, user string) (Desktop, error) {
	d := Desktop{}
	node := p.Env("COMPUTE_NODE_URL", "")
	if node == "" {
		return d, p.Error(503, "compute node not configured")
	}
	// Pin the durable volume to its node. Never perform unsafe automatic cross-node failover.
	e := tx.QueryRow(ctx, `INSERT INTO control.desktops(id,user_id,volume_id,node_url) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id,user_id,volume_id,node_url,epoch,state`, p.Stable("desktop", user), user, p.Stable("volume", user), node).Scan(&d.ID, &d.UserID, &d.VolumeID, &d.NodeURL, &d.Epoch, &d.State)
	return d, e
}
