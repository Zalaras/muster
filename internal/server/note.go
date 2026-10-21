package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

type noteFeature struct {
	manager *session.Manager
	log     zerolog.Logger
}

func newNoteFeature(manager *session.Manager, log zerolog.Logger) *noteFeature {
	return &noteFeature{manager: manager, log: log}
}

func (f *noteFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("PUT /api/sessions/{id}/note", guard(http.HandlerFunc(f.handleSetNote)))
}

type setNoteRequest struct {
	Note json.RawMessage `json:"note"`
}

const invalidNoteMessage = "note must be a string or null"

func (f *noteFeature) handleSetNote(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxIngestBodyBytes)
	var req setNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "request_too_large", "note is too large to save")
			return
		}
		writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidNoteMessage)
		return
	}

	note, ok := decodeNullable[string](req.Note)
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidNoteMessage)
		return
	}

	if _, err := f.manager.SetNote(context.WithoutCancel(r.Context()), id, note); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeUnknownSession(w)
		default:
			f.log.Error().Err(err).Int64("session_id", id).Msg("setting session note failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
