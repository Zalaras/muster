package server

import (
	"context"
	"encoding/json"
	"net/http"
)

// launchFeature owns POST /api/sessions. The launch work itself is launcher.go's
// sessionLauncher; this handler only decodes, delegates and encodes.
type launchFeature struct {
	launcher *sessionLauncher
}

func newLaunchFeature(launcher *sessionLauncher) *launchFeature {
	return &launchFeature{launcher: launcher}
}

func (f *launchFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions", guard(http.HandlerFunc(f.handleCreateSession)))
}

// handleCreateSession is POST /api/sessions (kb:anchor/sessions.create).
func (f *launchFeature) handleCreateSession(w http.ResponseWriter, r *http.Request) {
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
