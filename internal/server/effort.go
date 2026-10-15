package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

type effortFeature struct {
	manager *session.Manager
	log     zerolog.Logger
}

func newEffortFeature(manager *session.Manager, log zerolog.Logger) *effortFeature {
	return &effortFeature{manager: manager, log: log}
}

func (f *effortFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("DELETE /api/sessions/{id}/effort-warning", guard(http.HandlerFunc(f.handleDismissWarning)))
}

func (f *effortFeature) handleDismissWarning(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	if err := f.manager.ClearEffortWarning(context.WithoutCancel(r.Context()), id); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeUnknownSession(w)
		default:
			f.log.Error().Err(err).Int64("session_id", id).Msg("clearing effort warning failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
