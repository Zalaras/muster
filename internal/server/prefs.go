package server

import (
	"context"
	"encoding/json"
	"net/http"
)

// prefsKVKey is the single kv key prefs are persisted under, as one JSON blob
// (docs/protocol.md §3.3 — no schema change, plan's Schema Changes note).
const prefsKVKey = "prefs"

// prefsRequest is PUT /api/prefs' request body (docs/protocol.md §3.3): at least one
// field required, unknown fields ignored. Pointers distinguish "absent" from "present".
type prefsRequest struct {
	View    *string `json:"view"`
	Density *string `json:"density"`
}

func validView(v string) bool    { return v == "focus" || v == "tiles" }
func validDensity(v string) bool { return v == "2x2" || v == "3x2" }

// defaultPrefs is the shape before any PUT /api/prefs has ever landed (protocol §3.3).
func defaultPrefs() PrefsInfo {
	return PrefsInfo{View: "focus", Density: "2x2"}
}

// prefsMessage is the WS `prefs` broadcast (docs/protocol.md §5.5): a full-object echo
// of the persisted prefs, sent to every connected UI socket on every accepted PUT
// (INV-4).
type prefsMessage struct {
	Type  string    `json:"type"`
	Prefs PrefsInfo `json:"prefs"`
}

// loadPrefs reads the persisted prefs object from kv, falling back to defaults for a
// fresh daemon or an unreadable/corrupt value — a bad kv row must never fail a snapshot.
func (s *Server) loadPrefs(ctx context.Context) PrefsInfo {
	raw, ok, err := s.store.KVGet(ctx, prefsKVKey)
	if err != nil || !ok {
		return defaultPrefs()
	}
	var p PrefsInfo
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return defaultPrefs()
	}
	if !validView(p.View) {
		p.View = "focus"
	}
	if !validDensity(p.Density) {
		p.Density = "2x2"
	}
	return p
}

// handlePutPrefs is PUT /api/prefs (REQ-10): validates, persists the merged prefs object
// to kv, and broadcasts the full object to every UI socket (INV-4).
func (s *Server) handlePutPrefs(w http.ResponseWriter, r *http.Request) {
	var req prefsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	if req.View == nil && req.Density == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "at least one of view or density is required")
		return
	}
	if req.View != nil && !validView(*req.View) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "view must be one of focus, tiles")
		return
	}
	if req.Density != nil && !validDensity(*req.Density) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "density must be one of 2x2, 3x2")
		return
	}

	ctx := r.Context()
	prefs := s.loadPrefs(ctx)
	if req.View != nil {
		prefs.View = *req.View
	}
	if req.Density != nil {
		prefs.Density = *req.Density
	}

	encoded, err := json.Marshal(prefs)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "encoding prefs")
		return
	}
	if err := s.store.KVSet(ctx, prefsKVKey, string(encoded)); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "persisting prefs")
		return
	}

	s.hub.broadcast(prefsMessage{Type: "prefs", Prefs: prefs})

	w.WriteHeader(http.StatusNoContent)
}
