package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Zalaras/muster/internal/session"
)

// This file is server's transport home (kb:anchor/transport, b-M8): the error envelope,
// the success-JSON writer, and the session-or-404 / directory-missing lookups shared
// across features, plus the package's one fixed 5xx phrase (b-m1) and its one wire-time
// rule (b-m13).

// errorResponse is the error envelope every non-2xx JSON response shares
// (kb:anchor/transport): {"error": {"code", "message"}}. Paths is the `ambiguous` route's
// one extra field (kb:anchor/sessions.locate); every other caller leaves it nil, which
// omitempty drops, keeping their wire shape unchanged.
type errorResponse struct {
	Error struct {
		Code    string   `json:"code"`
		Message string   `json:"message"`
		Paths   []string `json:"paths,omitempty"`
	} `json:"error"`
}

// msgInternalError is the fixed phrase for a 500 with nothing more specific to say
// (kb:anchor/transport, b-m1) — the raw error goes only to the adjacent log line, never
// onto the wire.
const msgInternalError = "something went wrong on the daemon — see the daemon log"

// writeJSON writes v as status's JSON body: the header/WriteHeader/Encode shape every
// success response and error envelope shares.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	var resp errorResponse
	resp.Error.Code = code
	resp.Error.Message = message
	writeJSON(w, status, resp)
}

// writeJSONErrorPaths is writeJSONError plus the `ambiguous` route's extra `paths` field
// (kb:anchor/sessions.locate) — the only caller that needs the envelope's optional field.
func writeJSONErrorPaths(w http.ResponseWriter, status int, code, message string, paths []string) {
	var resp errorResponse
	resp.Error.Code = code
	resp.Error.Message = message
	resp.Error.Paths = paths
	writeJSON(w, status, resp)
}

// sessionGetter is the one method sessionOr404 needs, narrow enough that both
// *session.Manager (locate, shells) and readerFeature's narrower readerManager view
// satisfy it.
type sessionGetter interface {
	Get(id int64) (*session.Session, bool)
}

// sessionOr404 looks up id and writes 404 unknown_session itself on a miss — the
// parse-id/Get/404 pattern locate, reader and shells each repeated.
func sessionOr404(w http.ResponseWriter, manager sessionGetter, id int64) (*session.Session, bool) {
	sess, ok := manager.Get(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return nil, false
	}
	return sess, true
}

// writeDirectoryMissing writes 409 directory_missing for dir — the stat-then-409 pattern
// reader and shells share, byte-identical text. sessions.go's Resume path answers the
// same code with its own, different message (its own launchError vocabulary) and is
// deliberately left unmerged: two sites using different text for the same code keep their
// own text.
func writeDirectoryMissing(w http.ResponseWriter, dir string) {
	writeJSONError(w, http.StatusConflict, "directory_missing", fmt.Sprintf("%s no longer exists", dir))
}

// wireTime formats t per the protocol's fixed timestamp rule (kb:anchor/transport):
// RFC3339, always UTC.
func wireTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

// wireTimePtr is wireTime for the optional-pointer wire shape: nil in, nil out;
// otherwise a formatted copy, never an alias of t.
func wireTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	v := wireTime(*t)
	return &v
}
