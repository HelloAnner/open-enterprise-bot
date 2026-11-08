package application

import (
	"context"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"strings"

	p "enterprise/api-gateway/src/platform"
	"github.com/jackc/pgx/v5"
)

type UserProfile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
}

func checkPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "pbkdf2-sha256" || len(password) > 256 {
		return false
	}
	salt, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil || len(salt) != 16 {
		return false
	}
	expected, e := base64.RawURLEncoding.DecodeString(parts[2])
	if e != nil || len(expected) != 32 {
		return false
	}
	actual, e := pbkdf2.Key(sha256.New, password, salt, 600000, 32)
	return e == nil && hmac.Equal(actual, expected)
}
func (s *Service) BootstrapAuth(ctx context.Context) error {
	hash := p.Env("ADMIN_PASSWORD_HASH", "")
	if hash == "" {
		return nil
	}
	name := p.Env("ADMIN_USERNAME", "admin")
	_, e := s.DB.Exec(ctx, "INSERT INTO gateway.users(id,username,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(username) DO NOTHING", p.Stable("user", name), name, p.Env("ADMIN_DISPLAY_NAME", name), hash)
	return e
}
func (s *Service) Login(ctx context.Context, username, password string) (UserProfile, error) {
	var u UserProfile
	var count int
	// ponytail: bounded global login budget for a bootstrap workspace; use per-account/IP limits with multi-user signup.
	e := s.DB.QueryRow(ctx, `INSERT INTO gateway.auth_attempts(id,count,until_at) VALUES('login',1,now()+interval '1 minute') ON CONFLICT(id) DO UPDATE SET count=CASE WHEN gateway.auth_attempts.until_at<now() THEN 1 ELSE gateway.auth_attempts.count+1 END,until_at=CASE WHEN gateway.auth_attempts.until_at<now() THEN now()+interval '1 minute' ELSE gateway.auth_attempts.until_at END RETURNING count`).Scan(&count)
	if e != nil {
		return u, e
	}
	if count > 20 {
		return u, p.Error(429, "登录尝试过多，请一分钟后重试")
	}
	var hash string
	e = s.DB.QueryRow(ctx, "SELECT id,username,name,password_hash FROM gateway.users WHERE username=$1", username).Scan(&u.ID, &u.Username, &u.Name, &hash)
	if e != nil && e != pgx.ErrNoRows {
		return u, e
	}
	if hash == "" {
		hash = p.Env("ADMIN_PASSWORD_HASH", "")
	}
	valid := checkPassword(password, hash)
	if e == pgx.ErrNoRows || !valid {
		return UserProfile{}, p.Error(401, "用户名或密码不正确")
	}
	return u, nil
}
func (s *Service) Profile(ctx context.Context, id string) (UserProfile, error) {
	u := UserProfile{ID: id, Username: id, Name: id}
	e := s.DB.QueryRow(ctx, "SELECT username,name FROM gateway.users WHERE id=$1", id).Scan(&u.Username, &u.Name)
	// Signed identity providers may supply their own stable subject without a local password account.
	if e == pgx.ErrNoRows {
		e = nil
	}
	return u, e
}
