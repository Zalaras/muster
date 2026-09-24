package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

// sessionsFeature owns the session lifecycle endpoints: create, end, resume, remove,
// pin, order, title and pane-snapshot (plan code-breakup REQ-6). shells/terminals are
// the shared collaborators shellFeature/terminalFeature also hold — sessions needs them
// only for End/Remove's socket-close and Remove's shell-kill side effects. The launch and
// resume work itself is launcher.go's sessionLauncher; this file only decodes, delegates
// and encodes.
type sessionsFeature struct {
	manager   *session.Manager
	launcher  *sessionLauncher
	shells    *shellRegistry
	terminals *terminalRegistry
	log       zerolog.Logger

	// reader drops a removed session's write log (plan markdown-viewing edge case 28).
	// nil is a valid no-op for tests that don't exercise the reader.
	reader writeLogForgetter
}

// writeLogForgetter is sessionsFeature's view of *readerFeature — narrowed to the one
// method Remove calls.
type writeLogForgetter interface {
	forgetSession(id int64)
}

func newSessionsFeature(manager *session.Manager, launcher *sessionLauncher, shells *shellRegistry, terminals *terminalRegistry, reader writeLogForgetter, log zerolog.Logger) *sessionsFeature {
	return &sessionsFeature{manager: manager, launcher: launcher, shells: shells, terminals: terminals, reader: reader, log: log}
}

func (f *sessionsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions", guard(http.HandlerFunc(f.handleCreateSession)))
	mux.Handle("GET /api/sessions/{id}/pane", guard(http.HandlerFunc(f.handlePaneSnapshot)))
	mux.Handle("POST /api/sessions/{id}/end", guard(http.HandlerFunc(f.handleEndSession)))
	mux.Handle("POST /api/sessions/{id}/resume", guard(http.HandlerFunc(f.handleResumeSession)))
	mux.Handle("DELETE /api/sessions/{id}", guard(http.HandlerFunc(f.handleRemoveSession)))
	// Registered ahead of PUT /api/sessions/{id}/pin: Go's Go 1.22 mux prefers a literal
	// segment over a wildcard, so "order" is never parsed as {id} regardless of
	// registration order, but the literal route is listed first here to read that way too.
	mux.Handle("PUT /api/sessions/order", guard(http.HandlerFunc(f.handleSetOrder)))
	mux.Handle("PUT /api/sessions/{id}/pin", guard(http.HandlerFunc(f.handlePinSession)))
	mux.Handle("PUT /api/sessions/{id}/title", guard(http.HandlerFunc(f.handleSetTitle)))
}

// handleCreateSession is POST /api/sessions (REQ-1 through REQ-6, REQ-14, REQ-19..21).
func (f *sessionsFeature) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}

	// context.WithoutCancel: a client that navigates away mid-launch must not cancel
	// the tmux spawn or the rollback's own DB write — the launch has already committed
	// side effects (a repo/session row, possibly a spawned pane) that must run to a
	// consistent conclusion regardless of the HTTP request's lifetime.
	sess, lerr := f.launcher.Launch(context.WithoutCancel(r.Context()), req)
	if lerr != nil {
		writeJSONError(w, lerr.status, lerr.code, lerr.message)
		return
	}

	writeJSON(w, http.StatusCreated, toWireSession(sess))
}

// parseSessionID reads the {id} path value, writing a 404 unknown_session itself on a
// malformed value (an unparseable id is indistinguishable from an unknown one to the
// caller — same response either way).
func parseSessionID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return 0, false
	}
	return id, true
}

// handleEndSession is POST /api/sessions/{id}/end (REQ-5, kb:anchor/sessions.end).
// session-lifecycle REQ-13: the terminal socket is closed only once End has actually
// succeeded — a 404/409, and a genuine end_failed kill failure alike, must never tear
// down a socket for a session whose pane is still running (review cycle 1 Major 2: a
// failed kill leaves the row alive and the pane up, so closing the socket here left the
// user staring at a dead-surface overlay over a live session).
func (f *sessionsFeature) handleEndSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	sess, endErr := f.manager.End(context.WithoutCancel(r.Context()), id)
	if endErr != nil {
		switch {
		case errors.Is(endErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
			return
		case errors.Is(endErr, session.ErrSessionNotAlive):
			writeJSONError(w, http.StatusConflict, "not_alive", "session is already ended")
			return
		default:
			f.log.Error().Err(endErr).Int64("session_id", id).Msg("ending session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", msgEndFailed)
			return
		}
	}

	f.terminals.closeSession(id)
	writeJSON(w, http.StatusOK, toWireSession(sess))
}

// handleRemoveSession is DELETE /api/sessions/{id} (REQ-6, kb:anchor/sessions.remove).
// Since plain-terminal-session (kb:anchor/sessions.shell/REQ-9) this also kills the
// session's shell tmux session, unlike End which deliberately leaves a shell running.
// session-lifecycle REQ-13: the shell/terminal teardown runs only after manager.Remove has
// actually succeeded — a failed Remove must leave both exactly as they were, retryable
// without collateral loss (D15).
func (f *sessionsFeature) handleRemoveSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	if remErr := f.manager.Remove(context.WithoutCancel(r.Context()), id); remErr != nil {
		switch {
		case errors.Is(remErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			f.log.Error().Err(remErr).Int64("session_id", id).Msg("removing session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", msgRemoveFailed)
		}
		return
	}

	f.terminals.closeSessionAndShell(id)
	f.shells.Kill(context.WithoutCancel(r.Context()), id)

	if f.reader != nil {
		f.reader.forgetSession(id)
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleResumeSession is POST /api/sessions/{id}/resume (REQ-7, kb:anchor/sessions.resume).
func (f *sessionsFeature) handleResumeSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	sess, lerr := f.launcher.Resume(context.WithoutCancel(r.Context()), id)
	if lerr != nil {
		writeJSONError(w, lerr.status, lerr.code, lerr.message)
		return
	}

	writeJSON(w, http.StatusOK, toWireSession(sess))
}

// handlePaneSnapshot is GET /api/sessions/{id}/pane (REQ-4, kb:anchor/sessions.pane).
// Served for live sessions too; the UI only asks for dead ones.
func (f *sessionsFeature) handlePaneSnapshot(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	if !f.manager.Exists(id) {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return
	}
	text, at, ok := f.manager.Snapshot(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "no_snapshot", "no pane capture yet for this session")
		return
	}

	writeJSON(w, http.StatusOK, paneSnapshotWire{Text: text, CapturedAt: wireTime(at)})
}

// pinSessionRequest is PUT /api/sessions/{id}/pin's request body (kb:anchor/sessions.pin).
type pinSessionRequest struct {
	Pinned *bool `json:"pinned"`
}

// handlePinSession is PUT /api/sessions/{id}/pin (plan order-sidebar REQ-3).
func (f *sessionsFeature) handlePinSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	var req pinSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Pinned == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "pinned is required and must be a boolean")
		return
	}

	if err := f.manager.SetPinned(context.WithoutCancel(r.Context()), id, *req.Pinned); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			f.log.Error().Err(err).Int64("session_id", id).Msg("pinning session failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// setOrderRequest is PUT /api/sessions/order's request body (kb:anchor/sessions.order).
type setOrderRequest struct {
	IDs         []int64 `json:"ids"`
	PinnedCount *int    `json:"pinnedCount"`
}

// handleSetOrder is PUT /api/sessions/order (plan order-sidebar REQ-4).
func (f *sessionsFeature) handleSetOrder(w http.ResponseWriter, r *http.Request) {
	var req setOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDs == nil || req.PinnedCount == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "ids and pinnedCount are required")
		return
	}

	if err := f.manager.SetOrder(context.WithoutCancel(r.Context()), req.IDs, *req.PinnedCount); err != nil {
		switch {
		case errors.Is(err, session.ErrInvalidOrder):
			writeJSONError(w, http.StatusBadRequest, "invalid_request", "ids must be a duplicate-free list of known session ids, and pinnedCount must be in [0, len(ids)]")
		default:
			f.log.Error().Err(err).Msg("setting rail order failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

const maxSessionTitleLen = 100

// setTitleRequest is PUT /api/sessions/{id}/title's request body (plan ui-text-and-focus
// REQ-10, kb:anchor/sessions.title). Title is decoded as json.RawMessage rather than
// *string so an absent "title" key (400) is distinguishable from an explicit
// `"title": null` (204, clears the override) — json.RawMessage.UnmarshalJSON copies the
// literal bytes verbatim, including a bare `null`, while a missing key leaves the field
// at its nil zero value.
type setTitleRequest struct {
	Title json.RawMessage `json:"title"`
}

// invalidTitleMessage is kb:anchor/sessions.title's single 400 message for every validation failure (body
// not JSON, title key missing, title neither string nor null, or trimmed-empty/too-long).
const invalidTitleMessage = "title must be null or 1-100 characters after trimming"

// handleSetTitle is PUT /api/sessions/{id}/title (plan ui-text-and-focus REQ-10,
// kb:anchor/sessions.title).
func (f *sessionsFeature) handleSetTitle(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	var req setTitleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	if len(req.Title) == 0 {
		// The key was absent — distinct from an explicit null (kb:anchor/sessions.title: "the title key is
		// required (absent key != null)").
		writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidTitleMessage)
		return
	}

	var title *string
	if string(req.Title) != "null" {
		var raw string
		if err := json.Unmarshal(req.Title, &raw); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidTitleMessage)
			return
		}
		// Trimmed before validation and storage (kb:anchor/sessions.title); counted in runes, not bytes,
		// same rule handleCreateIssue's title uses (a multi-byte-rune title the client's
		// maxlength already allowed must not be rejected by a byte-length check).
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || utf8.RuneCountInString(trimmed) > maxSessionTitleLen {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidTitleMessage)
			return
		}
		title = &trimmed
	}

	if _, err := f.manager.SetTitle(context.WithoutCancel(r.Context()), id, title); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			f.log.Error().Err(err).Int64("session_id", id).Msg("setting session title failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
