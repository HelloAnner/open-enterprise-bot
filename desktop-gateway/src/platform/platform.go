// Package platform contains transport/storage primitives, not cross-service business calls.
package platform

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Object = map[string]any

type Event struct {
	Version       int    `json:"version"`
	ID            string `json:"event_id"`
	Type          string `json:"type"`
	UserID        string `json:"user_id"`
	BotID         string `json:"bot_id"`
	ThreadID      string `json:"thread_id,omitempty"`
	SessionID     string `json:"session_id,omitempty"`
	TicketID      string `json:"ticket_id,omitempty"`
	WorkerID      string `json:"worker_id,omitempty"`
	JobID         string `json:"job_id,omitempty"`
	CorrelationID string `json:"correlation_id"`
	Source        string `json:"source"`
	Payload       Object `json:"payload"`
}

func NewEvent(kind, user, bot string, payload Object) Event {
	id := uuid.NewString()
	return Event{Version: 1, ID: id, Type: kind, UserID: user, BotID: bot, CorrelationID: id, Source: Env("SERVICE_NAME", ""), Payload: payload}
}
func Stable(parts ...string) string {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte(strings.Join(parts, "/"))).String()
}
func Env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func Int(key string, fallback int) int {
	n, e := strconv.Atoi(Env(key, strconv.Itoa(fallback)))
	if e != nil || n < 1 {
		panic("invalid " + key)
	}
	return n
}
func Must(err error) {
	if err != nil {
		panic(err)
	}
}
func JSON(v any) []byte              { b, e := json.Marshal(v); Must(e); return b }
func Text(m Object, k string) string { v, _ := m[k].(string); return v }
func Connect(ctx context.Context) *pgxpool.Pool {
	db, e := pgxpool.New(ctx, Env("DATABASE_URL", ""))
	Must(e)
	Must(db.Ping(ctx))
	return db
}
func Transaction(ctx context.Context, db *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, e := db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = fn(tx); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

type APIError struct {
	Code    int
	Message string
}

func (e APIError) Error() string           { return e.Message }
func Error(code int, message string) error { return APIError{code, message} }
func Check(err error) {
	if err != nil {
		panic(err)
	}
}
func Reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if status != 204 {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func Decode(r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(nil, r.Body, int64(Int("REQUEST_MAX_MIB", 16))<<20))
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return Error(400, "invalid request body")
	}
	return nil
}
func Handler(fn func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if e := fn(w, r); e != nil {
			code := 500
			message := "internal service error"
			var a APIError
			if errors.As(e, &a) {
				code = a.Code
				message = a.Message
			} else if errors.Is(e, pgx.ErrNoRows) {
				code = 404
				message = "resource not found"
			} else {
				slog.Error("request failed", "path", r.URL.Path, "error", e)
			}
			Reply(w, code, Object{"message": message})
		}
	}
}

// Identity is signed by the configured authentication edge; payload user_id is never an identity.
type Identity struct {
	UserID  string `json:"sub"`
	Expires int64  `json:"exp"`
}

func Sign(key string, value any) string {
	body := base64.RawURLEncoding.EncodeToString(JSON(value))
	m := hmac.New(sha256.New, []byte(key))
	m.Write([]byte(body))
	return body + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func Verify(key, token string, value any) error {
	parts := strings.Split(token, ".")
	if key == "" || len(parts) != 2 {
		return Error(401, "authentication required")
	}
	m := hmac.New(sha256.New, []byte(key))
	m.Write([]byte(parts[0]))
	sig, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil || !hmac.Equal(sig, m.Sum(nil)) {
		return Error(401, "invalid credential")
	}
	body, e := base64.RawURLEncoding.DecodeString(parts[0])
	if e != nil {
		return Error(401, "invalid credential")
	}
	if json.Unmarshal(body, value) != nil {
		return Error(401, "invalid credential")
	}
	return nil
}
func User(r *http.Request) (string, error) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		if c, e := r.Cookie("eob_session"); e == nil {
			token = c.Value
		}
	}
	if token == "" && Env("AUTH_MODE", "signed") == "development" {
		return Env("DEV_USER_ID", "local-user"), nil
	}
	var id Identity
	if e := Verify(Env("AUTH_SIGNING_KEY", ""), token, &id); e != nil {
		return "", e
	}
	if id.UserID == "" || id.Expires <= time.Now().Unix() {
		return "", Error(401, "expired credential")
	}
	return id.UserID, nil
}
func ServiceToken(name string) string {
	var tokens map[string]string
	Must(json.Unmarshal([]byte(Env("SERVICE_TOKENS", "{}")), &tokens))
	return tokens[name]
}
func Internal(r *http.Request, allowed ...string) error {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	for _, name := range allowed {
		want := ServiceToken(name)
		if want != "" && hmac.Equal([]byte(token), []byte(want)) {
			return nil
		}
	}
	return Error(401, "service authentication required")
}
func Request(ctx context.Context, method, url string, body any, out any) error {
	var payload string
	if body != nil {
		payload = string(JSON(body))
	}
	req, e := http.NewRequestWithContext(ctx, method, url, strings.NewReader(payload))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ServiceToken(Env("SERVICE_NAME", "")))
	res, e := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return Error(res.StatusCode, fmt.Sprintf("upstream request rejected: HTTP %d", res.StatusCode))
	}
	if out != nil {
		return json.NewDecoder(res.Body).Decode(out)
	}
	return nil
}
func Context() context.Context {
	ctx, _ := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	return ctx
}
func Serve(ctx context.Context, mux *http.ServeMux, ready func() error) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { Reply(w, 200, Object{"ok": true}) })
	mux.HandleFunc("GET /readyz", Handler(func(w http.ResponseWriter, r *http.Request) error {
		if e := ready(); e != nil {
			return Error(503, "dependencies unavailable")
		}
		Reply(w, 200, Object{"ok": true})
		return nil
	}))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if origin := r.Header.Get("Origin"); origin != "" && origin != Env("PUBLIC_ORIGIN", "http://localhost:5173") {
			Reply(w, 403, Object{"message": "origin denied"})
			return
		}
		mux.ServeHTTP(w, r)
	})
	server := &http.Server{Addr: Env("LISTEN_ADDR", ":8080"), Handler: handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 90 * time.Second}
	go func() {
		<-ctx.Done()
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(c)
	}()
	slog.Info("listening", "address", server.Addr)
	if e := server.ListenAndServe(); e != nil && !errors.Is(e, http.ErrServerClosed) {
		panic(e)
	}
}
