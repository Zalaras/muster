package server

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/Zalaras/muster/internal/store"
)

// prefsKVKey is the single kv key prefs are persisted under, as one JSON blob
// (kb:anchor/prefs.put — no schema change).
const prefsKVKey = "prefs"

// defaultUsageModel is prefs.usageModel's default — the masthead's per-model readout
// before any PUT ever names one.
const defaultUsageModel = "Fable"

// defaultRailSort is prefs.railSort's default — the Focus rail's sort mode before any
// PUT ever names one.
const defaultRailSort = "manual"

// defaultTheme is prefs.theme's default — "follow" means the dashboard resolves its
// theme from claudeTheme.family; the daemon treats the value as opaque beyond
// validThemePattern.
const defaultTheme = "follow"

// validThemePattern is prefs.theme's wire pattern (kb:anchor/prefs.put): 1-32 chars,
// a-z/0-9/-, starting with a letter. The daemon never interprets the value beyond this
// — the client owns the theme registry.
var validThemePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

// prefsRequest is PUT /api/prefs' request body (kb:anchor/prefs.put): at least one
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

// validUsageModel reports whether v (after trimming) is 1–32 chars (kb:anchor/prefs.put).
func validUsageModel(v string) bool {
	n := len(strings.TrimSpace(v))
	return n >= 1 && n <= 32
}

// defaultPrefs is the shape before any PUT /api/prefs has ever landed (kb:anchor/prefs.put).
// UpdateCheck defaults true.
func defaultPrefs() PrefsInfo {
	return PrefsInfo{View: "focus", Density: "2x2", UsageModel: defaultUsageModel, RailSort: defaultRailSort, Theme: defaultTheme, UpdateCheck: true}
}

// storedPrefs is loadPrefs' unmarshal target: UpdateCheck is a pointer here (unlike
// PrefsInfo's plain bool) so a persisted blob predating auto-update — which has no
// "updateCheck" key at all — is distinguishable from one that explicitly persisted
// false. A missing key defaults to true; an explicit false stays false; a non-boolean
// value fails the whole Unmarshal, which loadPrefs already treats as "return
// defaultPrefs()" (so it too loads as true).
type storedPrefs struct {
	View        string `json:"view"`
	Density     string `json:"density"`
	UsageModel  string `json:"usageModel"`
	RailSort    string `json:"railSort"`
	Theme       string `json:"theme"`
	UpdateCheck *bool  `json:"updateCheck"`
}

// prefsMessage is the WS `prefs` broadcast (kb:anchor/ws.prefs): a full-object echo
// of the persisted prefs, sent to every connected UI socket on every accepted PUT
// (INV-4).
type prefsMessage struct {
	Type  string    `json:"type"`
	Prefs PrefsInfo `json:"prefs"`
}

// loadPrefs reads the persisted prefs object from kv, falling back to defaults for a
// fresh daemon or an unreadable/corrupt value — a bad kv row must never fail a snapshot.
// A free function, not a prefsFeature method, since issueFeature's snapshot also needs
// it (dashboard scope's view/density/railSort row) without taking a dependency on the
// whole prefs feature.
func loadPrefs(ctx context.Context, st *store.Store) PrefsInfo {
	raw, ok, err := st.KVGet(ctx, prefsKVKey)
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

// checkEnabledSetter is prefsFeature's narrow view of the update feature (Edge Case 13's
// construction-cycle break): prefs needs to notify update of a checkEnabled transition,
// update needs prefs' persisted value at construction. Resolved by construction order in
// New — prefs is built first with updateChecker left nil-safe until New wires it to the
// update feature right after constructing it (documented in daemon-implementation.md).
type checkEnabledSetter interface {
	SetCheckEnabled(enabled bool)
}

// prefsFeature owns PUT /api/prefs and the snapshot's prefs object (plan code-breakup
// REQ-6).
type prefsFeature struct {
	store         *store.Store
	hub           *wsHub
	updateChecker checkEnabledSetter
}

func newPrefsFeature(st *store.Store, hub *wsHub) *prefsFeature {
	return &prefsFeature{store: st, hub: hub}
}

func (f *prefsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("PUT /api/prefs", guard(http.HandlerFunc(f.handlePutPrefs)))
}

func (f *prefsFeature) contribute(ctx context.Context, snap *Snapshot) {
	snap.Prefs = loadPrefs(ctx, f.store)
}

// loadPrefs is a thin test-facing delegator: prefs_test.go calls srv.loadPrefs(ctx)
// directly rather than going through the prefs feature or an HTTP round-trip.
func (s *Server) loadPrefs(ctx context.Context) PrefsInfo {
	return loadPrefs(ctx, s.store)
}

// prefsField is one validated string-ish pref in handlePutPrefs's table. present says the
// request carried the field at all; valid and apply are only ever called when it did, so
// both may dereference the request pointer unguarded.
type prefsField struct {
	present bool
	valid   func() bool
	msg     string
	apply   func(*PrefsInfo)
}

// prefsFields is handlePutPrefs's validate-then-apply table. Slice order is load-bearing:
// it decides which single error a request that is invalid in several fields at once
// reports, so entries must stay in the order view, density, usageModel, railSort, theme.
// UpdateCheck is deliberately absent — it is a bool with a changed-tracking side effect,
// handled on its own in handlePutPrefs.
func prefsFields(req *prefsRequest) []prefsField {
	return []prefsField{
		{
			present: req.View != nil,
			valid:   func() bool { return validView(*req.View) },
			msg:     "view must be one of focus, tiles",
			apply:   func(p *PrefsInfo) { p.View = *req.View },
		},
		{
			present: req.Density != nil,
			valid:   func() bool { return validDensity(*req.Density) },
			msg:     "density must be one of 2x2, 3x2",
			apply:   func(p *PrefsInfo) { p.Density = *req.Density },
		},
		{
			present: req.UsageModel != nil,
			valid:   func() bool { return validUsageModel(*req.UsageModel) },
			msg:     "usageModel must be 1-32 characters after trim",
			apply:   func(p *PrefsInfo) { p.UsageModel = strings.TrimSpace(*req.UsageModel) },
		},
		{
			present: req.RailSort != nil,
			valid:   func() bool { return validRailSort(*req.RailSort) },
			msg:     "railSort must be one of manual, attention",
			apply:   func(p *PrefsInfo) { p.RailSort = *req.RailSort },
		},
		{
			present: req.Theme != nil,
			valid:   func() bool { return validTheme(*req.Theme) },
			msg:     "theme must be 1-32 chars of a-z, 0-9 or -, starting with a letter",
			apply:   func(p *PrefsInfo) { p.Theme = *req.Theme },
		},
	}
}

// handlePutPrefs is PUT /api/prefs: validates, persists the merged prefs object to kv,
// and broadcasts the full object to every UI socket (INV-4).
func (f *prefsFeature) handlePutPrefs(w http.ResponseWriter, r *http.Request) {
	var req prefsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}

	// One pass, because a field that is absent can never be invalid: the nothing-supplied
	// error below is therefore still unreachable whenever any field-level error fires,
	// exactly as it was when the two checks were written out separately.
	fields := prefsFields(&req)
	supplied := req.UpdateCheck != nil
	for _, field := range fields {
		if !field.present {
			continue
		}
		supplied = true
		if !field.valid() {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", field.msg)
			return
		}
	}
	if !supplied {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "at least one of view, density, usageModel, railSort, theme or updateCheck is required")
		return
	}

	ctx := r.Context()
	prefs := loadPrefs(ctx, f.store)
	updateCheckChanged := false
	for _, field := range fields {
		if field.present {
			field.apply(&prefs)
		}
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
	if err := f.store.KVSet(ctx, prefsKVKey, string(encoded)); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "persisting prefs")
		return
	}

	f.hub.broadcast(prefsMessage{Type: "prefs", Prefs: prefs})

	// REQ-3: the check-enabled side effect fires only on an actual transition — a PUT
	// that merely re-states the current value must not clear an in-flight check's result
	// or force an extra immediate poll.
	if updateCheckChanged && f.updateChecker != nil {
		f.updateChecker.SetCheckEnabled(prefs.UpdateCheck)
	}

	w.WriteHeader(http.StatusNoContent)
}
