package server

import (
	"crypto/hmac"
	"net"
	"net/http"
)

// cookieBaseName is the auth cookie's name before the port is added, and the whole name on
// a host without a port. Daemons before kb:adr/connection-auth-cookie-named-by-port set it
// on every host, so requireCookie still accepts it there.
const cookieBaseName = "muster_auth"

// authCookieName is the cookie this daemon sets and reads for r
// (kb:adr/connection-auth-cookie-named-by-port).
func authCookieName(r *http.Request) string {
	return authCookieNameForHost(r.Host)
}

// authCookieNameForHost is muster_auth_<port> for a host:port, and cookieBaseName for a
// host without one.
func authCookieNameForHost(host string) string {
	if _, port, err := net.SplitHostPort(host); err == nil && port != "" {
		return cookieBaseName + "_" + port
	}
	return cookieBaseName
}

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

// requireCookie wraps next so that a request without a valid auth cookie never reaches
// it; onUnauthorized decides the shape of the 401 (JSON for API/WS, HTML for static).
// A valid cookie under cookieBaseName is still accepted and re-set under the port-named
// name, so an upgrade does not sign an open dashboard out.
func requireCookie(token string, onUnauthorized http.HandlerFunc, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := authCookieName(r)
		if c, err := r.Cookie(name); err == nil && tokensEqual(c.Value, token) {
			next.ServeHTTP(w, r)
			return
		}
		if c, err := r.Cookie(cookieBaseName); err == nil && name != cookieBaseName && tokensEqual(c.Value, token) {
			setAuthCookie(w, name, token)
			next.ServeHTTP(w, r)
			return
		}
		onUnauthorized(w, r)
	})
}

func setAuthCookie(w http.ResponseWriter, name, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   cookieMaxAge,
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

	setAuthCookie(w, authCookieName(r), s.uiToken)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}
