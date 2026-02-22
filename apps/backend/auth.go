package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
)

type ctxKey string

const userIDKey ctxKey = "user_id"

type bootstrapRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	OrgID string `json:"org_id"`
	Name  string `json:"name"`
}

func (a *app) bootstrap(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(a.bootstrapSecret) == "" {
		writeErr(w, 404, "bootstrap is disabled")
		return
	}
	if r.Header.Get("X-Bootstrap-Secret") != a.bootstrapSecret {
		writeErr(w, 401, "invalid bootstrap secret")
		return
	}

	var req bootstrapRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		writeErr(w, 400, "email is required")
		return
	}
	if req.Role == "" {
		req.Role = "user"
	}
	if req.Name == "" {
		req.Name = "bootstrap"
	}

	ctx := r.Context()
	userID, err := a.ensureUser(ctx, req.Email, req.Role, req.OrgID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	plainKey := "tk_" + longID()
	keyHash := sha256Hex(plainKey)
	apiKeyID := shortID()
	_, err = a.db.ExecContext(ctx, `
		INSERT INTO api_keys (id, user_id, name, key_hash)
		VALUES ($1, $2, $3, $4)
	`, apiKeyID, userID, req.Name, keyHash)
	if err != nil {
		writeErr(w, 500, "failed to create api key")
		return
	}

	writeJSON(w, 200, map[string]any{
		"user_id":    userID,
		"api_key":    plainKey,
		"api_key_id": apiKeyID,
	})
}

func (a *app) createSession(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := a.authenticate(r)
	if !ok {
		writeErr(w, 401, "authentication required")
		return
	}

	sid := "sess_" + longID()
	key := "session:" + sid
	if err := a.redis.Set(r.Context(), key, userID, a.sessionTTL).Err(); err != nil {
		writeErr(w, 500, "failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     a.sessionCookie,
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		Secure:   envBoolOr("COOKIE_SECURE", false),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(a.sessionTTL.Seconds()),
	})

	writeJSON(w, 200, map[string]any{"session_id": sid, "user_id": userID})
}

func (a *app) deleteSession(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(a.sessionCookie)
	if err == nil && cookie.Value != "" {
		_ = a.redis.Del(r.Context(), "session:"+cookie.Value).Err()
	}
	http.SetCookie(w, &http.Cookie{Name: a.sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	writeJSON(w, 200, map[string]any{"deleted": true})
}

func (a *app) me(w http.ResponseWriter, r *http.Request) {
	userID := authUserID(r)
	var email, role string
	var orgID sql.NullString
	err := a.db.QueryRowContext(r.Context(), `SELECT email, role, org_id FROM users WHERE id = $1`, userID).Scan(&email, &role, &orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "user not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"user_id": userID,
		"email":   email,
		"role":    role,
		"org_id":  orgID.String,
	})
}

func (a *app) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, ok := a.authenticate(r)
		if !ok {
			writeErr(w, 401, "authentication required")
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next(w, r.WithContext(ctx))
	}
}

func (a *app) authenticate(r *http.Request) (string, string, bool) {
	ctx := r.Context()

	if cookie, err := r.Cookie(a.sessionCookie); err == nil && cookie.Value != "" {
		if uid, err := a.redis.Get(ctx, "session:"+cookie.Value).Result(); err == nil && uid != "" {
			return uid, "session", true
		}
	}

	authz := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authz), "bearer ") {
		token := strings.TrimSpace(authz[len("Bearer "):])
		if token != "" {
			hash := sha256Hex(token)
			var userID string
			err := a.db.QueryRowContext(ctx, `
				SELECT user_id FROM api_keys
				WHERE key_hash = $1 AND revoked_at IS NULL
			`, hash).Scan(&userID)
			if err == nil && userID != "" {
				_, _ = a.db.ExecContext(ctx, `UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`, hash)
				return userID, "api_key", true
			}
		}
	}

	if !a.authRequired && a.devUserID != "" {
		return a.devUserID, "dev", true
	}

	return "", "", false
}

func authUserID(r *http.Request) string {
	v, _ := r.Context().Value(userIDKey).(string)
	return v
}

func (a *app) ensureUser(ctx context.Context, email, role, orgID string) (string, error) {
	var userID string
	err := a.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err == nil {
		return userID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	userID = shortID()
	_, err = a.db.ExecContext(ctx, `
		INSERT INTO users (id, email, role, org_id)
		VALUES ($1,$2,$3,$4)
	`, userID, email, role, nullIfEmpty(orgID))
	if err != nil {
		return "", err
	}
	return userID, nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
