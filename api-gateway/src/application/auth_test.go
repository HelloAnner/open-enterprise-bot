package application

import (
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"testing"
)

func TestPasswordBoundary(t *testing.T) {
	salt := []byte("0123456789abcdef")
	key, e := pbkdf2.Key(sha256.New, "correct-password", salt, 600000, 32)
	if e != nil {
		t.Fatal(e)
	}
	hash := "pbkdf2-sha256$" + base64.RawURLEncoding.EncodeToString(salt) + "$" + base64.RawURLEncoding.EncodeToString(key)
	if !checkPassword("correct-password", hash) || checkPassword("wrong", hash) || checkPassword("anything", "bad hash") {
		t.Fatal("password verification failed")
	}
}
