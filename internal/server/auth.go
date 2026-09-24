package server

import (
	"crypto/hmac"
	"net/http"
)

const cookieName = "muster_auth"

// cookieMaxAge is 30 days: the UI token is reusable at /auth, not single-shot
// (kb:adr/connection-ui-token-reusable-not-one-time — "one-time" describes the launcher
// flow, not token burning).
const cookieMaxAge = 30 * 24 * 60 * 60

// tokensEqual is a constant-time token comparison. hmac.Equal checks lengths
// first (a length mismatch is not a secret worth hiding here) then compares in constant
// time, exactly like the stdlib's own recommended pattern.
func tokensEqual(a, b string) bool {
	return hmac.Equal([]byte(a), []byte(b))
}

const relaunchHTML = `<!doctype html>
<html>
<head><title>Muster</title></head>
<body>
<h1>Muster is not running here</h1>
<p>This dashboard needs a fresh session. Please relaunch Muster to continue.</p>
</body>
</html>
`

func writeHTMLUnauthorized(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(relaunchHTML))
}

func writeJSONUnauthorized(w http.ResponseWriter, _ *http.Request) {
	writeJSONError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid auth cookie; relaunch Muster")
}

// requireCookie wraps next so that a request without a valid muster_auth cookie never
// reaches it; onUnauthorized decides the shape of the 401 (JSON for API/WS, HTML for
// static).
func requireCookie(token string, onUnauthorized http.HandlerFunc, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(cookieName)
		if err != nil || !tokensEqual(c.Value, token) {
			onUnauthorized(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// handleHealthz is intentionally unauthenticated (kb:spec/connection).
func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": s.daemonVersion,
	})
}

// handleAuth exchanges the UI token for the session cookie (kb:spec/connection).
func (s *Server) handleAuth(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if !tokensEqual(token, s.uiToken) {
		writeHTMLUnauthorized(w, r)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    s.uiToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   cookieMaxAge,
	})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}
