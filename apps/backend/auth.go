package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type ctxKey string

const userIDKey ctxKey = "user_id"

type requestEmailOTPRequest struct {
	Email string `json:"email"`
}

type createAPIKeyRequest struct {
	Name string `json:"name"`
}

type verifyEmailOTPRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

type jwtClaims struct {
	Sub string `json:"sub"`
	Iss string `json:"iss"`
	Aud any    `json:"aud"`
	Exp int64  `json:"exp"`
	Nbf int64  `json:"nbf"`
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

func (s *authService) ensureUserByEmail(ctx context.Context, email string) (string, error) {
	userID := shortID()
	var createdID string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO users (id, email, role, org_id, email_verified_at)
		VALUES ($1, $2, 'user', NULL, NULL)
		ON CONFLICT (email) DO NOTHING
		RETURNING id
	`, userID, email).Scan(&createdID)
	if err == nil && createdID != "" {
		return createdID, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	var existingUserID string
	err = s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existingUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", newServiceError(404, "user not found")
		}
		return "", err
	}
	return existingUserID, nil
}

func generateEmailOTP() (string, error) {
	var b [3]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	n := int(b[0])<<16 | int(b[1])<<8 | int(b[2])
	return fmt.Sprintf("%06d", n%1000000), nil
}

func otpRedisKey(email string) string {
	return "email_otp:" + strings.ToLower(strings.TrimSpace(email))
}

func (s *authService) saveEmailOTP(ctx context.Context, email, otp string, ttl time.Duration) error {
	if s.redis == nil {
		return newServiceError(500, "otp storage unavailable")
	}
	if err := s.redis.Set(ctx, otpRedisKey(email), sha256Hex(strings.TrimSpace(otp)), ttl).Err(); err != nil {
		return wrapServiceError(500, "failed to store otp", err)
	}
	return nil
}

func (s *authService) verifyAndConsumeEmailOTP(ctx context.Context, email, otp string) (string, error) {
	if s.redis == nil {
		return "", newServiceError(500, "otp storage unavailable")
	}

	key := otpRedisKey(email)
	expectedHash, err := s.redis.Get(ctx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", newServiceError(401, "invalid or expired verification code")
		}
		return "", wrapServiceError(500, "failed to load otp", err)
	}

	submittedHash := sha256Hex(strings.TrimSpace(otp))
	if !hmac.Equal([]byte(submittedHash), []byte(expectedHash)) {
		return "", newServiceError(401, "invalid or expired verification code")
	}

	var userID string
	err = s.db.QueryRowContext(ctx, `
		UPDATE users
		SET email_verified_at = COALESCE(email_verified_at, NOW())
		WHERE email = $1
		RETURNING id
	`, email).Scan(&userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", newServiceError(404, "user not found")
		}
		return "", wrapServiceError(500, "failed to verify email", err)
	}

	_ = s.redis.Del(ctx, key).Err()
	return userID, nil
}

func (a *app) requestEmailOTP(w http.ResponseWriter, r *http.Request) {
	var req requestEmailOTPRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		writeErr(w, 400, "email is required")
		return
	}

	_, err := a.authSvc.ensureUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeServiceErr(w, err)
		return
	}

	otp, err := generateEmailOTP()
	if err != nil {
		writeServiceErr(w, wrapServiceError(500, "failed to generate otp", err))
		return
	}
	otpTTL := envDurationOr("EMAIL_OTP_TTL", 10*time.Minute)
	if err := a.authSvc.saveEmailOTP(r.Context(), req.Email, otp, otpTTL); err != nil {
		writeServiceErr(w, err)
		return
	}

	emailSent, warning := a.sendEmailOTP(r.Context(), req.Email, otp, otpTTL)
	writeJSON(w, 200, requestEmailOTPResponse{
		EmailSent: emailSent,
		Warning:   warning,
	})
}

func (a *app) verifyEmailOTP(w http.ResponseWriter, r *http.Request) {
	var req verifyEmailOTPRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.OTP = strings.TrimSpace(req.OTP)
	if req.Email == "" {
		writeErr(w, 400, "email is required")
		return
	}
	if len(req.OTP) != 6 {
		writeErr(w, 400, "otp must be 6 digits")
		return
	}

	userID, err := a.authSvc.verifyAndConsumeEmailOTP(r.Context(), req.Email, req.OTP)
	if err != nil {
		writeServiceErr(w, err)
		return
	}

	writeJSON(w, 200, map[string]string{"user_id": userID})
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

	authz := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authz), "bearer ") {
		token := strings.TrimSpace(authz[len("Bearer "):])
		if token != "" {
			if userID, ok := a.validateJWT(token); ok {
				return userID, "jwt", true
			}

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

func (a *app) validateJWT(token string) (string, bool) {
	if len(a.jwtSecret) == 0 {
		return "", false
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", false
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", false
	}

	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return "", false
	}
	if !strings.EqualFold(header.Alg, "HS256") {
		return "", false
	}

	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, a.jwtSecret)
	_, _ = mac.Write([]byte(signingInput))
	expectedSig := mac.Sum(nil)

	actualSig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", false
	}
	if !hmac.Equal(actualSig, expectedSig) {
		return "", false
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", false
	}

	var claims jwtClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return "", false
	}

	if strings.TrimSpace(claims.Sub) == "" {
		return "", false
	}

	now := time.Now().Unix()
	if claims.Exp <= now {
		return "", false
	}
	if claims.Nbf > 0 && now < claims.Nbf {
		return "", false
	}

	if a.jwtIssuer != "" && claims.Iss != a.jwtIssuer {
		return "", false
	}
	if a.jwtAudience != "" && !hasAudience(claims.Aud, a.jwtAudience) {
		return "", false
	}

	return claims.Sub, true
}

func hasAudience(aud any, expected string) bool {
	switch v := aud.(type) {
	case string:
		return v == expected
	case []any:
		for _, item := range v {
			s, ok := item.(string)
			if ok && s == expected {
				return true
			}
		}
	}
	return false
}

func authUserID(r *http.Request) string {
	v, _ := r.Context().Value(userIDKey).(string)
	return v
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func (a *app) sendEmailOTP(ctx context.Context, toEmail, otp string, ttl time.Duration) (bool, string) {
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
		"subject": "Your Tahuna verification code",
		"html":    fmt.Sprintf("<p>Your verification code is <strong>%s</strong>. It expires in %d minutes.</p>", otp, int(ttl.Minutes())),
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
