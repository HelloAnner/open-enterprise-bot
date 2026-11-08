package application

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"time"

	p "enterprise/api-gateway/src/platform"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func vaultCipher() (cipher.AEAD, error) {
	key, e := base64.StdEncoding.DecodeString(p.Env("VAULT_KEY", ""))
	if e != nil || len(key) != 32 {
		return nil, p.Error(503, "vault key not configured")
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return nil, e
	}
	return cipher.NewGCM(block)
}
func (s *Service) CreateForm(ctx context.Context, user, bot, ticket, scope string) (p.Object, error) {
	var allowed bool
	if e := s.DB.QueryRow(ctx, "SELECT true FROM runtime.tickets WHERE id=$1 AND user_id=$2 AND bot_id=$3", ticket, user, bot).Scan(&allowed); e != nil {
		return nil, e
	}
	id := p.Stable("form", ticket, scope)
	_, e := s.DB.Exec(ctx, "INSERT INTO gateway.security_forms(id,user_id,bot_id,ticket_id,scope,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", id, user, bot, ticket, scope, time.Now().Add(15*time.Minute))
	return p.Object{"form_id": id, "status": "pending"}, e
}
func (s *Service) SubmitForm(ctx context.Context, user, id, secret string) (p.Object, error) {
	if secret == "" || len(secret) > 16384 {
		return nil, p.Error(400, "invalid sensitive input")
	}
	aead, e := vaultCipher()
	if e != nil {
		return nil, e
	}
	ref := uuid.NewString()
	e = p.Transaction(ctx, s.DB, func(tx pgx.Tx) error {
		var bot, ticket, scope string
		e := tx.QueryRow(ctx, "SELECT bot_id,ticket_id,scope FROM gateway.security_forms WHERE id=$1 AND user_id=$2 AND status='pending' AND expires_at>now() FOR UPDATE", id, user).Scan(&bot, &ticket, &scope)
		if e != nil {
			return e
		}
		nonce := make([]byte, aead.NonceSize())
		if _, e = rand.Read(nonce); e != nil {
			return e
		}
		sealed := aead.Seal(nonce, nonce, []byte(secret), []byte(ref+user+ticket))
		_, e = tx.Exec(ctx, "INSERT INTO gateway.vault(id,user_id,bot_id,ticket_id,scope,ciphertext) VALUES($1,$2,$3,$4,$5,$6)", ref, user, bot, ticket, scope, sealed)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "UPDATE gateway.security_forms SET status='submitted' WHERE id=$1", id)
		if e != nil {
			return e
		}
		event := p.NewEvent("security.submitted", user, bot, p.Object{"vault_ref": ref, "scope": scope, "status": "submitted"})
		event.TicketID = ticket
		return p.Outbox(ctx, tx, "gateway", "eob.events.ingress", event)
	})
	return p.Object{"status": "submitted", "vault_ref": ref}, e
}

// Only the execution proxy can resolve a reference, and only for a live job explicitly bound to it.
func (s *Service) Resolve(ctx context.Context, ref, job string) (p.Object, error) {
	var sealed []byte
	var user, ticket string
	e := s.DB.QueryRow(ctx, `SELECT v.ciphertext,v.user_id,v.ticket_id FROM gateway.vault v JOIN control.jobs j ON j.user_id=v.user_id AND j.bot_id=v.bot_id AND j.ticket_id=v.ticket_id WHERE v.id=$1 AND j.id=$2 AND j.state IN ('queued','running') AND j.input->>'vault_ref'=v.id AND j.input->>'scope'=v.scope`, ref, job).Scan(&sealed, &user, &ticket)
	if e != nil {
		return nil, e
	}
	aead, e := vaultCipher()
	if e != nil {
		return nil, e
	}
	if len(sealed) < aead.NonceSize() {
		return nil, p.Error(500, "invalid vault record")
	}
	plain, e := aead.Open(nil, sealed[:aead.NonceSize()], sealed[aead.NonceSize():], []byte(ref+user+ticket))
	return p.Object{"value": string(plain)}, e
}
