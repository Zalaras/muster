package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

// railFeature owns the rail-order endpoints: pin and order. The invariants (pinned before
// unpinned per section, unique railPos) are the manager's
// (kb:adr/rail-order-daemon-owned-per-session-fields); this file only decodes, delegates
// and encodes.
type railFeature struct {
	manager *session.Manager
	log     zerolog.Logger
}

func newRailFeature(manager *session.Manager, log zerolog.Logger) *railFeature {
	return &railFeature{manager: manager, log: log}
}

func (f *railFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	// Go's mux prefers a literal segment over a wildcard regardless of registration order,
	// so "order" is never parsed as {id} even though the {id} routes live in other features.
	mux.Handle("PUT /api/sessions/order", guard(http.HandlerFunc(f.handleSetOrder)))
	mux.Handle("PUT /api/sessions/{id}/pin", guard(http.HandlerFunc(f.handlePinSession)))
}

// pinSessionRequest is PUT /api/sessions/{id}/pin's request body (kb:anchor/sessions.pin).
type pinSessionRequest struct {
	Pinned *bool `json:"pinned"`
}

// handlePinSession is PUT /api/sessions/{id}/pin (kb:anchor/sessions.pin).
func (f *railFeature) handlePinSession(w http.ResponseWriter, r *http.Request) {
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
func (f *railFeature) handleSetOrder(w http.ResponseWriter, r *http.Request) {
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
