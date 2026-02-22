package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type ctxKey string

const userIDKey ctxKey = "user_id"

type signupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
	OrgID    string `json:"org_id"`
}

type signinRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type createAPIKeyRequest struct {
	Name string `json:"name"`
}

type authService struct {
	db    *sql.DB
	redis *redis.Client
}

func newAuthService(db *sql.DB, redis *redis.Client) *authService {
	return &authService{db: db, redis: redis}
}

func (s *authService) createAPIKey(ctx context.Context, userID, name string) (apiKeyResponse, error) {
	if strings.TrimSpace(name) == "" {
		name = "cli"
	}
	plainKey := "tk_" + longID()
	keyHash := sha256Hex(plainKey)
	apiKeyID := shortID()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO api_keys (id, user_id, name, key_hash)
		VALUES ($1, $2, $3, $4)
	`, apiKeyID, userID, name, keyHash)
	if err != nil {
		return apiKeyResponse{}, wrapServiceError(500, "failed to create api key", err)
	}
	return apiKeyResponse{UserID: userID, APIKey: plainKey, APIKeyID: apiKeyID}, nil
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

func (s *authService) createUserWithPassword(ctx context.Context, email, passwordHash, role, orgID string) (string, error) {
	userID := shortID()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (id, email, role, org_id, password_hash)
		VALUES ($1,$2,$3,$4,$5)
	`, userID, email, role, nullIfEmpty(orgID), passwordHash)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			var existingID string
			var existingHash sql.NullString
			readErr := s.db.QueryRowContext(ctx, `SELECT id, password_hash FROM users WHERE email = $1`, email).Scan(&existingID, &existingHash)
			if readErr != nil {
				return "", readErr
			}
			if existingHash.Valid && strings.TrimSpace(existingHash.String) != "" {
				return "", newServiceError(409, "email already exists")
			}
			_, updateErr := s.db.ExecContext(ctx, `
				UPDATE users
				SET password_hash = $2, role = COALESCE(NULLIF($3, ''), role), org_id = COALESCE(NULLIF($4, ''), org_id)
				WHERE id = $1
			`, existingID, passwordHash, role, orgID)
			if updateErr != nil {
				return "", updateErr
			}
			return existingID, nil
		}
		return "", err
	}
	return userID, nil
}

func (s *authService) verifyUserPassword(ctx context.Context, email, password string) (string, error) {
	var userID string
	var passwordHash sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT id, password_hash FROM users WHERE email = $1`, email).Scan(&userID, &passwordHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", newServiceError(401, "invalid email or password")
		}
		return "", err
	}
	if !passwordHash.Valid || strings.TrimSpace(passwordHash.String) == "" {
		return "", newServiceError(401, "invalid email or password")
	}
	if bcrypt.CompareHashAndPassword([]byte(passwordHash.String), []byte(password)) != nil {
		return "", newServiceError(401, "invalid email or password")
	}
	return userID, nil
}

func (a *app) signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
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
	if len(req.Password) < 8 {
		writeErr(w, 400, "password must be at least 8 characters")
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeServiceErr(w, wrapServiceError(500, "failed to hash password", err))
		return
	}

	userID, err := a.authSvc.createUserWithPassword(r.Context(), req.Email, string(passwordHash), req.Role, req.OrgID)
	if err != nil {
		writeServiceErr(w, err)
		return
	}

	sessionResp, cookie, err := a.authSvc.createSession(r.Context(), userID, a.sessionCookie, a.sessionTTL)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	http.SetCookie(w, cookie)

	emailSent, warning := a.sendWelcomeEmail(r.Context(), req.Email)
	writeJSON(w, 200, signupResponse{
		UserID:    userID,
		SessionID: sessionResp.SessionID,
		EmailSent: emailSent,
		Warning:   warning,
	})
}

func (a *app) signin(w http.ResponseWriter, r *http.Request) {
	var req signinRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		writeErr(w, 400, "email is required")
		return
	}
	if strings.TrimSpace(req.Password) == "" {
		writeErr(w, 400, "password is required")
		return
	}

	userID, err := a.authSvc.verifyUserPassword(r.Context(), req.Email, req.Password)
	if err != nil {
		writeServiceErr(w, err)
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

func (a *app) createAPIKey(w http.ResponseWriter, r *http.Request) {
	var req createAPIKeyRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	resp, err := a.authSvc.createAPIKey(r.Context(), authUserID(r), req.Name)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
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

func (a *app) sendWelcomeEmail(ctx context.Context, toEmail string) (bool, string) {
	key := strings.TrimSpace(os.Getenv("RESEND_API_KEY"))
	if key == "" {
		return false, "Email delivery is not configured."
	}
	from := strings.TrimSpace(os.Getenv("RESEND_FROM_EMAIL"))
	if from == "" {
		from = "onboarding@resend.dev"
	}

	payload := map[string]any{
		"from":    from,
		"to":      []string{toEmail},
		"subject": "Welcome to Tahuna",
		"html":    "<p>Welcome to Tahuna. Your account is ready.</p>",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("resend marshal failed: %v", err)
		return false, "Failed to compose welcome email."
	}

	emailCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(emailCtx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		log.Printf("resend request build failed: %v", err)
		return false, "Failed to send welcome email."
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("resend request failed: %v", err)
		return false, "Failed to send welcome email."
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("resend returned status %d", resp.StatusCode)
		return false, "Email provider rejected the send request."
	}
	return true, ""
}
