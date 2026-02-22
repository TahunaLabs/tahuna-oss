package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type ctxKey string

const userIDKey ctxKey = "user_id"

type bootstrapRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	OrgID string `json:"org_id"`
	Name  string `json:"name"`
}

type authService struct {
	db    *sql.DB
	redis *redis.Client
}

func newAuthService(db *sql.DB, redis *redis.Client) *authService {
	return &authService{db: db, redis: redis}
}

func (s *authService) bootstrap(ctx context.Context, req bootstrapRequest) (bootstrapResponse, error) {
	userID, err := s.ensureUser(ctx, req.Email, req.Role, req.OrgID)
	if err != nil {
		return bootstrapResponse{}, wrapServiceError(500, "failed to ensure user", err)
	}

	plainKey := "tk_" + longID()
	keyHash := sha256Hex(plainKey)
	apiKeyID := shortID()
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO api_keys (id, user_id, name, key_hash)
		VALUES ($1, $2, $3, $4)
	`, apiKeyID, userID, req.Name, keyHash)
	if err != nil {
		return bootstrapResponse{}, wrapServiceError(500, "failed to create api key", err)
	}

	return bootstrapResponse{UserID: userID, APIKey: plainKey, APIKeyID: apiKeyID}, nil
}

func (s *authService) createSession(ctx context.Context, userID, sessionCookie string, sessionTTL time.Duration) (createSessionResponse, *http.Cookie, error) {
	sid := "sess_" + longID()
	key := "session:" + sid
	if err := s.redis.Set(ctx, key, userID, sessionTTL).Err(); err != nil {
		return createSessionResponse{}, nil, wrapServiceError(500, "failed to create session", err)
	}

	cookie := &http.Cookie{
		Name:     sessionCookie,
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		Secure:   envBoolOr("COOKIE_SECURE", false),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(sessionTTL.Seconds()),
	}
	return createSessionResponse{SessionID: sid, UserID: userID}, cookie, nil
}

func (s *authService) deleteSession(ctx context.Context, sessionCookie, cookieValue string) (deleteResponse, *http.Cookie, error) {
	if cookieValue != "" {
		if err := s.redis.Del(ctx, "session:"+cookieValue).Err(); err != nil {
			return deleteResponse{}, nil, wrapServiceError(500, "failed to delete session", err)
		}
	}
	expired := &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true}
	return deleteResponse{Deleted: true}, expired, nil
}

func (s *authService) me(ctx context.Context, userID string) (meResponse, error) {
	var email, role string
	var orgID sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT email, role, org_id FROM users WHERE id = $1`, userID).Scan(&email, &role, &orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return meResponse{}, newServiceError(404, "user not found")
		}
		return meResponse{}, wrapServiceError(500, "failed to load user", err)
	}
	return meResponse{UserID: userID, Email: email, Role: role, OrgID: orgID.String}, nil
}

func (s *authService) ensureUser(ctx context.Context, email, role, orgID string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err == nil {
		return userID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	userID = shortID()
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO users (id, email, role, org_id)
		VALUES ($1,$2,$3,$4)
	`, userID, email, role, nullIfEmpty(orgID))
	if err != nil {
		return "", err
	}
	return userID, nil
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

	resp, err := a.authSvc.bootstrap(r.Context(), req)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) createSession(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := a.authenticate(r)
	if !ok {
		writeErr(w, 401, "authentication required")
		return
	}

	resp, cookie, err := a.authSvc.createSession(r.Context(), userID, a.sessionCookie, a.sessionTTL)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	http.SetCookie(w, cookie)
	writeJSON(w, 200, resp)
}

func (a *app) deleteSession(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie(a.sessionCookie)
	cookieValue := ""
	if cookie != nil {
		cookieValue = cookie.Value
	}
	resp, expired, err := a.authSvc.deleteSession(r.Context(), a.sessionCookie, cookieValue)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	http.SetCookie(w, expired)
	writeJSON(w, 200, resp)
}

func (a *app) me(w http.ResponseWriter, r *http.Request) {
	resp, err := a.authSvc.me(r.Context(), authUserID(r))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
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

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
