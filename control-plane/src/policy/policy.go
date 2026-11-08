package policy

import (
	"context"
	p "enterprise/control-plane/src/platform"
	"github.com/jackc/pgx/v5"
	"strings"
)

// Every route re-checks live ownership; an event, subscription or opaque ID is not authority.
// ponytail: this release shares read-only domain tables; introduce versioned query APIs before splitting databases.
func Event(ctx context.Context, tx pgx.Tx, event p.Event) error {
	if event.Version != 1 || event.ID == "" || event.UserID == "" || event.BotID == "" {
		return p.Error(403, "invalid event identity")
	}
	var yes bool
	if e := tx.QueryRow(ctx, "SELECT true FROM gateway.bots WHERE id=$1 AND user_id=$2 AND NOT deleted", event.BotID, event.UserID).Scan(&yes); e != nil {
		if e == pgx.ErrNoRows {
			return p.Error(403, "bot access denied")
		}
		return e
	}
	if event.ThreadID != "" {
		if e := tx.QueryRow(ctx, "SELECT true FROM gateway.threads WHERE id=$1 AND user_id=$2 AND bot_id=$3", event.ThreadID, event.UserID, event.BotID).Scan(&yes); e != nil {
			if e == pgx.ErrNoRows {
				return p.Error(403, "thread access denied")
			}
			return e
		}
	}
	return nil
}
func Tool(tool string) bool {
	for _, v := range strings.Split(p.Env("ALLOWED_TOOLS", "write_file,python"), ",") {
		if v == tool {
			return true
		}
	}
	return false
}
func Ticket(ctx context.Context, tx pgx.Tx, user, bot, ticket string) error {
	var yes bool
	e := tx.QueryRow(ctx, "SELECT true FROM runtime.tickets WHERE id=$1 AND user_id=$2 AND bot_id=$3", ticket, user, bot).Scan(&yes)
	if e == pgx.ErrNoRows {
		return p.Error(403, "ticket access denied")
	}
	return e
}
