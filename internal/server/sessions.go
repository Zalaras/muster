package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

// sessionsFeature owns the session lifecycle endpoints: create, end, resume, remove, their
// batch forms, pin, order, group, title and pane-snapshot. shells/terminals are the shared
// collaborators shellFeature/terminalFeature also hold — sessions needs them only for
// End/Remove's socket-close and Remove's shell-kill side effects. The launch and
// resume work itself is launcher.go's sessionLauncher; this file only decodes, delegates
// and encodes.
type sessionsFeature struct {
	manager   *session.Manager
	launcher  *sessionLauncher
	shells    *shellRegistry
	terminals *terminalRegistry
	log       zerolog.Logger

	// reader drops a removed session's write log. nil is a valid no-op for tests that
	// don't exercise the reader.
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
	// The literal group, end and remove segments beat {id} the same way.
	mux.Handle("PUT /api/sessions/group", guard(http.HandlerFunc(f.handleSetSessionsGroup)))
	mux.Handle("POST /api/sessions/end", guard(http.HandlerFunc(f.handleEndSessions)))
	mux.Handle("POST /api/sessions/remove", guard(http.HandlerFunc(f.handleRemoveSessions)))
	mux.Handle("PUT /api/sessions/{id}/pin", guard(http.HandlerFunc(f.handlePinSession)))
	mux.Handle("PUT /api/sessions/{id}/title", guard(http.HandlerFunc(f.handleSetTitle)))
}

// handleCreateSession is POST /api/sessions (kb:anchor/sessions.create).
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
		writeLaunchError(w, lerr)
		return
	}

	writeJSON(w, http.StatusCreated, toWireSession(sess))
}

// handleEndSession is POST /api/sessions/{id}/end (kb:anchor/sessions.end). The terminal
// socket is closed only once End has actually succeeded — a 404/409, and a genuine
// end_failed kill failure alike (kb:adr/actions-kill-is-idempotent), must never tear down
// a socket for a session whose pane is still running: a failed kill leaves the row alive
// and the pane up, so closing the socket here would leave the user staring at a
// dead-surface overlay over a live session.
func (f *sessionsFeature) handleEndSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	sess, endErr := f.manager.End(context.WithoutCancel(r.Context()), id)
	if endErr != nil {
		switch {
		case errors.Is(endErr, session.ErrUnknownSession):
			writeUnknownSession(w)
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

// handleRemoveSession is DELETE /api/sessions/{id} (kb:anchor/sessions.remove,
// kb:adr/actions-remove-allowed-on-live-session). This also kills the session's shell
// tmux session (kb:anchor/sessions.shell), unlike End which deliberately leaves a shell
// running. The shell/terminal teardown runs only after manager.Remove has actually
// succeeded — a failed Remove must leave both exactly as they were, retryable without
// collateral loss.
func (f *sessionsFeature) handleRemoveSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	if remErr := f.manager.Remove(context.WithoutCancel(r.Context()), id); remErr != nil {
		switch {
		case errors.Is(remErr, session.ErrUnknownSession):
			writeUnknownSession(w)
		default:
			f.log.Error().Err(remErr).Int64("session_id", id).Msg("removing session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", msgRemoveFailed)
		}
		return
	}

	f.teardownRemoved(context.WithoutCancel(r.Context()), id)
	w.WriteHeader(http.StatusNoContent)
}

// teardownRemoved closes everything the server holds for a session the manager has just
// removed: its terminal sockets, its shell and its write log. Run only after manager.Remove
// succeeded; DELETE /api/sessions/{id}, the batch remove and delete-group's remove all end here.
func (f *sessionsFeature) teardownRemoved(ctx context.Context, id int64) {
	f.terminals.closeSessionAndShell(id)
	f.shells.Kill(ctx, id)

	if f.reader != nil {
		f.reader.forgetSession(id)
	}
}

// batchRequest is POST /api/sessions/end's and /remove's request body.
type batchRequest struct {
	IDs []int64 `json:"ids"`
}

const (
	msgBatchIDs        = "ids must be a non-empty list of session ids without duplicates"
	msgSessionGroupIDs = "ids must be known session ids without duplicates"
)

// decodeBatchRequest reads a batch body, writing 400 itself unless ids is a non-empty list.
// A repeated id is the manager's to refuse (writeBatchError), as for the rail-order endpoints.
func decodeBatchRequest(w http.ResponseWriter, r *http.Request) ([]int64, bool) {
	var req batchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		writeInvalidRequest(w, msgBatchIDs)
		return nil, false
	}
	return req.IDs, true
}

// writeBatchError maps the manager's refusal of a batch list to its response.
func (f *sessionsFeature) writeBatchError(w http.ResponseWriter, err error) {
	if errors.Is(err, session.ErrInvalidOrder) {
		writeInvalidRequest(w, msgBatchIDs)
		return
	}
	f.log.Error().Err(err).Msg("running a session batch failed")
	writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
}

// handleEndSessions is POST /api/sessions/end (kb:anchor/sessions.end-many): the batch form
// of handleEndSession, answering 200 with what happened to each id whatever the mix.
func (f *sessionsFeature) handleEndSessions(w http.ResponseWriter, r *http.Request) {
	ids, ok := decodeBatchRequest(w, r)
	if !ok {
		return
	}

	result, err := f.manager.EndMany(context.WithoutCancel(r.Context()), ids)
	if err != nil {
		f.writeBatchError(w, err)
		return
	}
	for _, id := range result.Done {
		f.terminals.closeSession(id)
	}
	writeJSON(w, http.StatusOK, toWireBatch(result))
}

// handleRemoveSessions is POST /api/sessions/remove (kb:anchor/sessions.remove-many): the
// batch form of handleRemoveSession.
func (f *sessionsFeature) handleRemoveSessions(w http.ResponseWriter, r *http.Request) {
	ids, ok := decodeBatchRequest(w, r)
	if !ok {
		return
	}

	ctx := context.WithoutCancel(r.Context())
	result, err := f.manager.RemoveMany(ctx, ids)
	if err != nil {
		f.writeBatchError(w, err)
		return
	}
	for _, id := range result.Done {
		f.teardownRemoved(ctx, id)
	}
	writeJSON(w, http.StatusOK, toWireBatch(result))
}

// setSessionsGroupRequest is PUT /api/sessions/group's request body
// (kb:anchor/sessions.group). GroupID is a json.RawMessage so an absent key (400) is
// distinguishable from an explicit null (Ungrouped) — the same shape setTitleRequest uses.
type setSessionsGroupRequest struct {
	IDs     []int64         `json:"ids"`
	GroupID json.RawMessage `json:"groupId"`
}

// handleSetSessionsGroup is PUT /api/sessions/group (kb:anchor/sessions.group).
func (f *sessionsFeature) handleSetSessionsGroup(w http.ResponseWriter, r *http.Request) {
	var req setSessionsGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDs == nil {
		writeInvalidRequest(w, msgSessionGroupIDs)
		return
	}
	groupID, ok := decodeGroupID(req.GroupID)
	if !ok {
		writeInvalidRequest(w, "groupId is required and must be an integer or null")
		return
	}

	switch err := f.manager.SetSessionsGroup(context.WithoutCancel(r.Context()), req.IDs, groupID); {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, session.ErrUnknownSession), errors.Is(err, session.ErrInvalidOrder):
		writeInvalidRequest(w, msgSessionGroupIDs)
	case errors.Is(err, session.ErrUnknownGroup):
		writeUnknownGroup(w, msgUnknownGroup)
	default:
		f.log.Error().Err(err).Msg("moving sessions to a group failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
	}
}

// handleResumeSession is POST /api/sessions/{id}/resume (kb:anchor/sessions.resume).
func (f *sessionsFeature) handleResumeSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	sess, lerr := f.launcher.Resume(context.WithoutCancel(r.Context()), id)
	if lerr != nil {
		writeLaunchError(w, lerr)
		return
	}

	writeJSON(w, http.StatusOK, toWireSession(sess))
}

// handlePaneSnapshot is GET /api/sessions/{id}/pane (kb:anchor/sessions.pane).
// Served for live sessions too; the UI only asks for dead ones.
func (f *sessionsFeature) handlePaneSnapshot(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	if !f.manager.Exists(id) {
		writeUnknownSession(w)
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

// handlePinSession is PUT /api/sessions/{id}/pin (kb:anchor/sessions.pin).
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
			writeUnknownSession(w)
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
	// GroupID is a json.RawMessage for the same reason setSessionsGroupRequest's is: absent
	// leaves membership alone, null names Ungrouped, an integer names a group.
	GroupID json.RawMessage `json:"groupId"`
}

// handleSetOrder is PUT /api/sessions/order (kb:anchor/sessions.order).
func (f *sessionsFeature) handleSetOrder(w http.ResponseWriter, r *http.Request) {
	var req setOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDs == nil || req.PinnedCount == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "ids and pinnedCount are required")
		return
	}

	var group *session.GroupRef
	if len(req.GroupID) > 0 {
		id, ok := decodeGroupID(req.GroupID)
		if !ok {
			writeInvalidRequest(w, msgGroupIDField)
			return
		}
		group = &session.GroupRef{ID: id}
	}

	if err := f.manager.SetOrder(context.WithoutCancel(r.Context()), req.IDs, *req.PinnedCount, group); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownGroup):
			writeUnknownGroup(w, msgUnknownGroup)
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

// setTitleRequest is PUT /api/sessions/{id}/title's request body
// (kb:anchor/sessions.title). Title is decoded as json.RawMessage rather than
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

// handleSetTitle is PUT /api/sessions/{id}/title (kb:anchor/sessions.title).
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
			writeUnknownSession(w)
		default:
			f.log.Error().Err(err).Int64("session_id", id).Msg("setting session title failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
