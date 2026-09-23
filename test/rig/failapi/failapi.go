// Package failapi is the injected-failure half of a fault-injection stand-in for the
// Anthropic API: every request it serves gets one status, an Anthropic-shaped error body and
// any extra response headers. The rig's failproxy binary and the canary's zero-token failure
// runs both serve it, so the error body is written in exactly one place.
//
// It never reads request headers: pointed at by ANTHROPIC_BASE_URL under subscription OAuth,
// the Authorization header on every request carries a live token.
package failapi

import (
	"fmt"
	"io"
	"net/http"
)

// Failure is one injected response.
type Failure struct {
	Status  int
	Type    string      // the error body's error.type, e.g. "api_error"
	Message string      // error.message; some StopFailure mappings key on it
	Headers [][2]string // extra response headers as name, value pairs
}

// body is the Anthropic error envelope for f.
func (f Failure) body() string {
	return fmt.Sprintf(`{"type":"error","error":{"type":%q,"message":%q}}`, f.Type, f.Message)
}

// Serve drains r's body, so the client never sees a reset connection, then sends f as the
// whole response.
func (f Failure) Serve(w http.ResponseWriter, r *http.Request) {
	_, _ = io.Copy(io.Discard, r.Body)
	_ = r.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	for _, h := range f.Headers {
		w.Header().Set(h[0], h[1])
	}
	w.WriteHeader(f.Status)
	_, _ = io.WriteString(w, f.body())
}

// Handler serves f to every request.
func Handler(f Failure) http.Handler { return http.HandlerFunc(f.Serve) }
