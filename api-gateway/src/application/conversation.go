package application

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	p "enterprise/api-gateway/src/platform"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) Messages(ctx context.Context, user, bot string) ([]p.Object, error) {
	if e := s.Own(ctx, user, bot); e != nil {
		return nil, e
	}
	rows, e := s.DB.Query(ctx, "SELECT data FROM gateway.messages WHERE user_id=$1 AND bot_id=$2 ORDER BY created_at,id", user, bot)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []p.Object{}
	for rows.Next() {
		var m p.Object
		if e = rows.Scan(&m); e != nil {
			return nil, e
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// TextAttachments exposes only bounded UTF-8 text belonging to this Bot's visible context.
func (s *Service) TextAttachments(ctx context.Context, user, bot string, messages []p.Object) ([]p.Object, error) {
	out := []p.Object{}
	remaining := 32768
	for i := len(messages) - 1; i >= 0 && len(out) < 4 && remaining > 0; i-- {
		m := messages[i]
		url := p.Text(m, "url")
		if p.Text(m, "kind") != "file" || !strings.HasPrefix(url, "/api/files/") {
			continue
		}
		var name string
		var data []byte
		e := s.DB.QueryRow(ctx, "SELECT name,bytes FROM gateway.files WHERE id=$1 AND user_id=$2 AND bot_id=$3 AND (mime LIKE 'text/%' OR mime='application/json') AND octet_length(bytes)<=$4", strings.TrimPrefix(url, "/api/files/"), user, bot, remaining).Scan(&name, &data)
		if e == pgx.ErrNoRows {
			continue
		}
		if e != nil {
			return nil, e
		}
		if !utf8.Valid(data) {
			continue
		}
		remaining -= len(data)
		out = append(out, p.Object{"name": name, "text": string(data)})
	}
	return out, nil
}

func (s *Service) MarkRead(ctx context.Context, user, bot, message string) error {
	if _, e := uuid.Parse(message); e != nil {
		return p.Error(400, "invalid message id")
	}
	_, e := s.DB.Exec(ctx, "UPDATE gateway.bots SET data=data || '{\"unread\":false}'::jsonb WHERE id=$1 AND user_id=$2 AND NOT deleted AND (data->>'lastMessageId'=$3 OR NOT (data ? 'lastMessageId'))", bot, user, message)
	return e
}

// Trigger normalizes trusted identity and channel provenance before the transactional event boundary.
func (s *Service) Trigger(ctx context.Context, user, bot, channel, conversation, requestID string, message p.Object, kind string, target p.Object) (p.Object, error) {
	if e := s.Own(ctx, user, bot); e != nil {
		return nil, e
	}
	if requestID == "" {
		requestID = uuid.NewString()
	}
	if len(requestID) > 200 {
		return nil, p.Error(400, "invalid idempotency key")
	}
	thread := p.Stable(user, bot, channel, conversation)
	id := p.Stable(user, bot, requestID)
	message["id"] = id
	message["from"] = "user"
	event := p.NewEvent(kind, user, bot, p.Object{"message": message, "target": target})
	event.ID = id
	event.CorrelationID = id
	event.ThreadID = thread
	event.Source = channel
	e := p.Transaction(ctx, s.DB, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx, "INSERT INTO gateway.threads VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", thread, user, bot, channel, conversation)
		if e != nil {
			return e
		}
		if reply := p.Text(message, "replyTo"); reply != "" {
			var exists bool
			if e = tx.QueryRow(ctx, "SELECT true FROM gateway.messages WHERE id=$1 AND user_id=$2 AND bot_id=$3", reply, user, bot).Scan(&exists); e != nil {
				return e
			}
		}
		if kind == "user.message" {
			_, e = tx.Exec(ctx, "INSERT INTO gateway.messages(id,user_id,bot_id,thread_id,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", id, user, bot, thread, p.JSON(message))
			if e != nil {
				return e
			}
			if e = tx.QueryRow(ctx, "SELECT data FROM gateway.messages WHERE id=$1", id).Scan(&message); e != nil {
				return e
			}
		}
		return p.Outbox(ctx, tx, "gateway", "eob.events.ingress", event)
	})
	return p.Object{"userMessage": message, "replies": []any{}, "eventId": id, "threadId": thread, "pending": true}, e
}
func (s *Service) Send(ctx context.Context, user, bot, key, text, reply string) (p.Object, error) {
	text = strings.TrimSpace(text)
	if text == "" || len(text) > 32000 {
		return nil, p.Error(400, "message must contain 1–32000 bytes")
	}
	return s.Trigger(ctx, user, bot, "web", bot, key, p.Object{"kind": "text", "text": text, "replyTo": reply}, "user.message", nil)
}
func (s *Service) React(ctx context.Context, user, bot, id, reaction string) (p.Object, error) {
	if len(reaction) > 64 {
		return nil, p.Error(400, "reaction too long")
	}
	var out p.Object
	e := s.DB.QueryRow(ctx, "UPDATE gateway.messages SET data=data || $4 WHERE id=$1 AND user_id=$2 AND bot_id=$3 RETURNING data", id, user, bot, p.JSON(p.Object{"reaction": reaction})).Scan(&out)
	return out, e
}
func (s *Service) DeleteMessage(ctx context.Context, user, bot, id string) error {
	return p.Transaction(ctx, s.DB, func(tx pgx.Tx) error {
		tag, e := tx.Exec(ctx, "DELETE FROM gateway.messages WHERE id=$1 AND user_id=$2 AND bot_id=$3", id, user, bot)
		if e != nil {
			return e
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		_, e = tx.Exec(ctx, `UPDATE gateway.bots SET data=data || jsonb_build_object('preview',COALESCE((SELECT data->>'text' FROM gateway.messages WHERE user_id=$2 AND bot_id=$3 AND data->>'from'='bot' ORDER BY created_at DESC,id DESC LIMIT 1),''),'lastMessageId',COALESCE((SELECT id FROM gateway.messages WHERE user_id=$2 AND bot_id=$3 AND data->>'from'='bot' ORDER BY created_at DESC,id DESC LIMIT 1),''),'unread',false) WHERE id=$3 AND user_id=$2 AND data->>'lastMessageId'=$1`, id, user, bot)
		return e
	})
}
func (s *Service) Choose(ctx context.Context, user, bot, key, id string, index int) (p.Object, error) {
	var choice p.Object
	e := s.DB.QueryRow(ctx, "SELECT data FROM gateway.messages WHERE id=$1 AND user_id=$2 AND bot_id=$3 AND data->>'kind'='choice'", id, user, bot).Scan(&choice)
	if e != nil {
		return nil, e
	}
	options, _ := choice["options"].([]any)
	if index < 0 || index >= len(options) {
		return nil, p.Error(400, "invalid option")
	}
	choice["selected"] = string(rune('A' + index))
	out, e := s.Send(ctx, user, bot, key, fmt.Sprint(options[index]), id)
	if e != nil {
		return nil, e
	}
	_, e = s.DB.Exec(ctx, "UPDATE gateway.messages SET data=$4 WHERE id=$1 AND user_id=$2 AND bot_id=$3", id, user, bot, p.JSON(choice))
	out["choice"] = choice
	return out, e
}
func (s *Service) StoreFile(ctx context.Context, user, bot, key, name, mime string, data []byte) (p.Object, error) {
	if e := s.Own(ctx, user, bot); e != nil {
		return nil, e
	}
	id := uuid.NewString()
	_, e := s.DB.Exec(ctx, "INSERT INTO gateway.files VALUES($1,$2,$3,$4,$5,$6)", id, user, bot, name, mime, data)
	if e != nil {
		return nil, e
	}
	url := "/api/files/" + id
	m := p.Object{"kind": "file", "name": name, "size": fmt.Sprintf("%d B", len(data)), "url": url, "text": "已上传文件：" + name}
	if mime == "image/png" || mime == "image/jpeg" || mime == "image/webp" {
		m["kind"] = "image"
		m["images"] = []string{url}
	}
	return s.Trigger(ctx, user, bot, "web", bot, key, m, "user.message", nil)
}
func (s *Service) Output(ctx context.Context, event p.Event) error {
	if event.Type != "model.message" {
		return nil
	}
	if e := s.Own(ctx, event.UserID, event.BotID); e != nil {
		if e == pgx.ErrNoRows {
			return nil
		}
		return e
	}
	message, ok := event.Payload["message"].(map[string]any)
	if !ok {
		return p.Error(400, "missing output")
	}
	message["id"] = event.ID
	message["from"] = "bot"
	return p.Transaction(ctx, s.DB, func(tx pgx.Tx) error {
		tag, e := tx.Exec(ctx, "INSERT INTO gateway.receipts(event_id) VALUES($1) ON CONFLICT DO NOTHING", event.ID)
		if e != nil || tag.RowsAffected() == 0 {
			return e
		}
		_, e = tx.Exec(ctx, "INSERT INTO gateway.messages(id,user_id,bot_id,thread_id,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", event.ID, event.UserID, event.BotID, event.ThreadID, p.JSON(message))
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "UPDATE gateway.bots SET data=data || $3 WHERE id=$1 AND user_id=$2", event.BotID, event.UserID, p.JSON(p.Object{"preview": p.Text(message, "text"), "unread": true, "lastMessageId": event.ID}))
		return e
	})
}
