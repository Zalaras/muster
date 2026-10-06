package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

// actionsFeature owns the session action endpoints: end, resume, remove, their batch forms
// and the pane snapshot. shells/terminals are the shared collaborators shellFeature/
// terminalFeature also hold — actions needs them only for End/Remove's socket-close and
// Remove's shell-kill side effects. The resume work itself is launcher.go's
// sessionLauncher; this file only decodes, delegates and encodes.
type actionsFeature struct {
	manager   *session.Manager
	launcher  *sessionLauncher
	shells    *shellRegistry
	terminals *terminalRegistry
	log       zerolog.Logger

	// reader drops a removed session's write log. nil is a valid no-op for tests that
	// don't exercise the reader.
	reader writeLogForgetter
}

// writeLogForgetter is actionsFeature's view of *readerFeature — narrowed to the one
// method Remove calls.
type writeLogForgetter interface {
	forgetSession(id int64)
}

func newActionsFeature(manager *session.Manager, launcher *sessionLauncher, shells *shellRegistry, terminals *terminalRegistry, reader writeLogForgetter, log zerolog.Logger) *actionsFeature {
	return &actionsFeature{manager: manager, launcher: launcher, shells: shells, terminals: terminals, reader: reader, log: log}
}

func (f *actionsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/sessions/{id}/pane", guard(http.HandlerFunc(f.handlePaneSnapshot)))
	mux.Handle("POST /api/sessions/{id}/end", guard(http.HandlerFunc(f.handleEndSession)))
	mux.Handle("POST /api/sessions/{id}/resume", guard(http.HandlerFunc(f.handleResumeSession)))
	mux.Handle("DELETE /api/sessions/{id}", guard(http.HandlerFunc(f.handleRemoveSession)))
	// The literal end and remove segments beat {id}: Go's mux prefers a literal segment over
	// a wildcard regardless of registration order, so these never parse as {id}/... even
	// though rail.go and rename.go mount their {id} routes from other features.
	mux.Handle("POST /api/sessions/end", guard(http.HandlerFunc(f.handleEndSessions)))
	mux.Handle("POST /api/sessions/remove", guard(http.HandlerFunc(f.handleRemoveSessions)))
}

// handleEndSession is POST /api/sessions/{id}/end (kb:anchor/sessions.end). The terminal
// socket is closed only once End has actually succeeded — a 404/409, and a genuine
// end_failed kill failure alike (kb:adr/actions-kill-is-idempotent), must never tear down
// a socket for a session whose pane is still running: a failed kill leaves the row alive
// and the pane up, so closing the socket here would leave the user staring at a
// dead-surface overlay over a live session.
func (f *actionsFeature) handleEndSession(w http.ResponseWriter, r *http.Request) {
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
func (f *actionsFeature) handleRemoveSession(w http.ResponseWriter, r *http.Request) {
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
func (f *actionsFeature) teardownRemoved(ctx context.Context, id int64) {
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

const msgBatchIDs = "ids must be a non-empty list of session ids without duplicates"

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
func (f *actionsFeature) writeBatchError(w http.ResponseWriter, err error) {
	if errors.Is(err, session.ErrInvalidOrder) {
		writeInvalidRequest(w, msgBatchIDs)
		return
	}
	f.log.Error().Err(err).Msg("running a session batch failed")
	writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
}

// handleEndSessions is POST /api/sessions/end (kb:anchor/sessions.end-many): the batch form
// of handleEndSession, answering 200 with what happened to each id whatever the mix.
func (f *actionsFeature) handleEndSessions(w http.ResponseWriter, r *http.Request) {
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
func (f *actionsFeature) handleRemoveSessions(w http.ResponseWriter, r *http.Request) {
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

// handleResumeSession is POST /api/sessions/{id}/resume (kb:anchor/sessions.resume).
func (f *actionsFeature) handleResumeSession(w http.ResponseWriter, r *http.Request) {
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
func (f *actionsFeature) handlePaneSnapshot(w http.ResponseWriter, r *http.Request) {
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
