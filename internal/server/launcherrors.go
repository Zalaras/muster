package server

import (
	"fmt"
	"net/http"
)

// launchError carries the HTTP status/error-envelope code a launch failure maps to
// (kb:anchor/transport's error envelope).
type launchError struct {
	status  int
	code    string
	message string
}

func (e *launchError) Error() string { return e.message }

// Fixed 5xx `message` text (kb:anchor/transport): display text for the user, never
// a wrapped tmux/OS error string — the raw error goes only to the adjacent log.Error()
// line. 4xx messages are unaffected; they were already fixed phrases. This vocabulary's
// generic member, msgInternalError, lives in respond.go — every feature shares it, not
// just launch/resume.
const (
	msgEndFailed        = "couldn't end the session — tmux reported an error; see the daemon log"
	msgRemoveFailed     = "couldn't remove the session — tmux reported an error; see the daemon log"
	msgLaunchFailed     = "couldn't launch — see the daemon log"
	msgShellSpawnFailed = "couldn't open a shell — tmux reported an error; see the daemon log"
)

func invalidRequest(message string) *launchError {
	return &launchError{status: http.StatusBadRequest, code: "invalid_request", message: message}
}

// launchFailed is every launch/resume failure's 500 body: the fixed phrase only
// — the caller logs the raw error itself at the site.
func launchFailed() *launchError {
	return &launchError{status: http.StatusInternalServerError, code: "launch_failed", message: msgLaunchFailed}
}

// notFound, notResumable and directoryMissing are Resume's own error codes
// (kb:anchor/sessions.resume) — reusing launchError's shape rather than
// a parallel type, since the server-side handling (writeJSONError(status, code,
// message)) is identical. notFound's code+message pair is respond.go's owned
// unknown_session pair (its only call site never needs a different message, unlike
// notResumable/directoryMissing below).
func notFound() *launchError {
	return &launchError{status: http.StatusNotFound, code: codeUnknownSession, message: msgUnknownSession}
}

func notResumable(message string) *launchError {
	return &launchError{status: http.StatusConflict, code: "not_resumable", message: message}
}

func directoryMissing(message string) *launchError {
	return &launchError{status: http.StatusConflict, code: "directory_missing", message: message}
}

// modelUnrecognizedMessage is the fixed, %q-quoted refusal text both POST /api/sessions'
// 400 model_unrecognized and GET /api/models' "unrecognized" verdict use verbatim
// (Protocol Contract: GET /api/models' `message` is "exactly the model_unrecognized
// message POST /api/sessions returns for that model") — declared once so the two can
// never drift apart.
func modelUnrecognizedMessage(model string) string {
	return fmt.Sprintf("Claude Code doesn't recognise the model %q — update Claude Code, or pick another model", model)
}

// modelUnrecognized is the 400 for a model the installed Claude Code's catalog does not
// describe (kb:anchor/sessions.create, kb:adr/launch-model-check-cached-per-binary-identity).
func modelUnrecognized(model string) *launchError {
	return &launchError{
		status:  http.StatusBadRequest,
		code:    "model_unrecognized",
		message: modelUnrecognizedMessage(model),
	}
}
