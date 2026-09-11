package server

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
)

// prefsKVKey is the single kv key prefs are persisted under, as one JSON blob
// (docs/protocol.md §3.3 — no schema change, plan's Schema Changes note).
const prefsKVKey = "prefs"

// defaultUsageModel is prefs.usageModel's default (docs/protocol.md §3.3, plan
// usage-model-bar) — the masthead's per-model readout before any PUT ever names one.
const defaultUsageModel = "Fable"

// defaultRailSort is prefs.railSort's default (docs/protocol.md §3.3, plan
// order-sidebar) — the Focus rail's sort mode before any PUT ever names one.
const defaultRailSort = "manual"

// defaultTheme is prefs.theme's default (docs/protocol.md §3.3, plan
// new-ui-design-colors) — "follow" means the dashboard resolves its theme from
// claudeTheme.family; the daemon treats the value as opaque beyond validThemePattern.
const defaultTheme = "follow"

// validThemePattern is prefs.theme's wire pattern (docs/protocol.md §3.3): 1-32 chars,
// a-z/0-9/-, starting with a letter. The daemon never interprets the value beyond this
// — the client owns the theme registry (plan new-ui-design-colors, REQ-7).
var validThemePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

// prefsRequest is PUT /api/prefs' request body (docs/protocol.md §3.3): at least one
// field required, unknown fields ignored. Pointers distinguish "absent" from "present".
type prefsRequest struct {
	View        *string `json:"view"`
	Density     *string `json:"density"`
	UsageModel  *string `json:"usageModel"`
	RailSort    *string `json:"railSort"`
	Theme       *string `json:"theme"`
	UpdateCheck *bool   `json:"updateCheck"`
}

func validView(v string) bool     { return v == "focus" || v == "tiles" }
func validDensity(v string) bool  { return v == "2x2" || v == "3x2" }
func validRailSort(v string) bool { return v == "manual" || v == "attention" }
func validTheme(v string) bool    { return validThemePattern.MatchString(v) }

// validUsageModel reports whether v (after trimming) is 1–32 chars (protocol §3.3).
func validUsageModel(v string) bool {
	n := len(strings.TrimSpace(v))
	return n >= 1 && n <= 32
}

// defaultPrefs is the shape before any PUT /api/prefs has ever landed (protocol §3.3).
// UpdateCheck defaults true (auto-update plan, 2026-09-10).
func defaultPrefs() PrefsInfo {
	return PrefsInfo{View: "focus", Density: "2x2", UsageModel: defaultUsageModel, RailSort: defaultRailSort, Theme: defaultTheme, UpdateCheck: true}
}

// storedPrefs is loadPrefs' unmarshal target: UpdateCheck is a pointer here (unlike
// PrefsInfo's plain bool) so a persisted blob predating this plan — which has no
// "updateCheck" key at all — is distinguishable from one that explicitly persisted
// false. A missing key defaults to true (edge case 32); an explicit false stays false; a
// non-boolean value fails the whole Unmarshal, which loadPrefs already treats as
// "return defaultPrefs()" (so it too loads as true, protocol §3.3's "a persisted
// non-boolean loads as true").
type storedPrefs struct {
	View        string `json:"view"`
	Density     string `json:"density"`
	UsageModel  string `json:"usageModel"`
	RailSort    string `json:"railSort"`
	Theme       string `json:"theme"`
	UpdateCheck *bool  `json:"updateCheck"`
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
	var stored storedPrefs
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return defaultPrefs()
	}
	p := PrefsInfo{
		View:        stored.View,
		Density:     stored.Density,
		UsageModel:  stored.UsageModel,
		RailSort:    stored.RailSort,
		Theme:       stored.Theme,
		UpdateCheck: true,
	}
	if stored.UpdateCheck != nil {
		p.UpdateCheck = *stored.UpdateCheck
	}
	if !validView(p.View) {
		p.View = "focus"
	}
	if !validDensity(p.Density) {
		p.Density = "2x2"
	}
	if !validUsageModel(p.UsageModel) {
		p.UsageModel = defaultUsageModel
	}
	if !validRailSort(p.RailSort) {
		p.RailSort = defaultRailSort
	}
	if !validTheme(p.Theme) {
		p.Theme = defaultTheme
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
	if req.View == nil && req.Density == nil && req.UsageModel == nil && req.RailSort == nil && req.Theme == nil && req.UpdateCheck == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "at least one of view, density, usageModel, railSort, theme or updateCheck is required")
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
	if req.UsageModel != nil && !validUsageModel(*req.UsageModel) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "usageModel must be 1-32 characters after trim")
		return
	}
	if req.RailSort != nil && !validRailSort(*req.RailSort) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "railSort must be one of manual, attention")
		return
	}
	if req.Theme != nil && !validTheme(*req.Theme) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "theme must be 1-32 chars of a-z, 0-9 or -, starting with a letter")
		return
	}

	ctx := r.Context()
	prefs := s.loadPrefs(ctx)
	updateCheckChanged := false
	if req.View != nil {
		prefs.View = *req.View
	}
	if req.Density != nil {
		prefs.Density = *req.Density
	}
	if req.UsageModel != nil {
		prefs.UsageModel = strings.TrimSpace(*req.UsageModel)
	}
	if req.RailSort != nil {
		prefs.RailSort = *req.RailSort
	}
	if req.Theme != nil {
		prefs.Theme = *req.Theme
	}
	if req.UpdateCheck != nil && *req.UpdateCheck != prefs.UpdateCheck {
		prefs.UpdateCheck = *req.UpdateCheck
		updateCheckChanged = true
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

	// REQ-3: the check-enabled side effect fires only on an actual transition — a PUT
	// that merely re-states the current value must not clear an in-flight check's result
	// or force an extra immediate poll.
	if updateCheckChanged && s.updates != nil {
		s.updates.SetCheckEnabled(prefs.UpdateCheck)
	}

	w.WriteHeader(http.StatusNoContent)
}
