package server

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/rs/zerolog"

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

// defaultRailDensity is prefs.railDensity's default — the rail and Tiles-strip card
// density before any PUT ever names one (plan rail-card-improvements REQ-3).
const defaultRailDensity = "comfortable"

// defaultRailActivity is prefs.railActivity's default — which text a card's activity
// line shows before any PUT ever names one (plan rail-card-improvements REQ-13).
const defaultRailActivity = "turn"

// validThemePattern is prefs.theme's wire pattern (kb:anchor/prefs.put): 1-32 chars,
// a-z/0-9/-, starting with a letter. The daemon never interprets the value beyond this
// — the client owns the theme registry.
var validThemePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

// prefsRequest is PUT /api/prefs' request body (kb:anchor/prefs.put): at least one
// field required, unknown fields ignored. Pointers distinguish "absent" from "present".
type prefsRequest struct {
	View         *string `json:"view"`
	Density      *string `json:"density"`
	UsageModel   *string `json:"usageModel"`
	RailSort     *string `json:"railSort"`
	Theme        *string `json:"theme"`
	UpdateCheck  *bool   `json:"updateCheck"`
	RailDensity  *string `json:"railDensity"`
	RailActivity *string `json:"railActivity"`
}

func validView(v string) bool     { return v == "focus" || v == "tiles" }
func validDensity(v string) bool  { return v == "2x2" || v == "3x2" }
func validRailSort(v string) bool { return v == "manual" || v == "attention" }
func validTheme(v string) bool    { return validThemePattern.MatchString(v) }

// validRailDensity/validRailActivity are prefs.railDensity/prefs.railActivity's enums
// (plan rail-card-improvements REQ-3/REQ-13).
func validRailDensity(v string) bool {
	return v == "compact" || v == "comfortable" || v == "expanded"
}
func validRailActivity(v string) bool {
	return v == "turn" || v == "prompt" || v == "reply" || v == "both"
}

// validUsageModel reports whether v (after trimming) is 1–32 chars (kb:anchor/prefs.put).
func validUsageModel(v string) bool {
	n := len(strings.TrimSpace(v))
	return n >= 1 && n <= 32
}

// PrefsInfo is the `prefs` object inside a snapshot (kb:anchor/prefs.put /
// kb:anchor/ws.snapshot), persisted in kv and broadcast on change. Density is the Tiles
// grid density. UsageModel is which modelScoped entry the masthead's third readout shows,
// default "Fable". RailSort is the rail's sort mode, "manual" | "attention", default
// "manual". Theme is opaque to the daemon beyond its pattern (kb:anchor/prefs.put),
// default "follow". UpdateCheck is whether the daemon checks GitHub Releases for a newer
// musterd, default true. RailDensity and RailActivity are the rail/Tiles-strip card
// density ("compact" | "comfortable" | "expanded", default "comfortable") and which text
// a card's activity line shows ("turn" | "prompt" | "reply" | "both", default "turn").
type PrefsInfo struct {
	View         string `json:"view"`
	Density      string `json:"density"`
	UsageModel   string `json:"usageModel"`
	RailSort     string `json:"railSort"`
	Theme        string `json:"theme"`
	UpdateCheck  bool   `json:"updateCheck"`
	RailDensity  string `json:"railDensity"`
	RailActivity string `json:"railActivity"`
}

// defaultPrefs is the shape before any PUT /api/prefs has ever landed (kb:anchor/prefs.put).
// UpdateCheck defaults true.
func defaultPrefs() PrefsInfo {
	return PrefsInfo{
		View: "focus", Density: "2x2", UsageModel: defaultUsageModel, RailSort: defaultRailSort,
		Theme: defaultTheme, UpdateCheck: true, RailDensity: defaultRailDensity, RailActivity: defaultRailActivity,
	}
}

// storedPrefs is loadPrefs' unmarshal target: UpdateCheck is a pointer here (unlike
// PrefsInfo's plain bool) so a persisted blob predating auto-update — which has no
// "updateCheck" key at all — is distinguishable from one that explicitly persisted
// false. A missing key defaults to true; an explicit false stays false; a non-boolean
// value fails the whole Unmarshal, which loadPrefs already treats as "return
// defaultPrefs()" (so it too loads as true).
type storedPrefs struct {
	View         string `json:"view"`
	Density      string `json:"density"`
	UsageModel   string `json:"usageModel"`
	RailSort     string `json:"railSort"`
	Theme        string `json:"theme"`
	UpdateCheck  *bool  `json:"updateCheck"`
	RailDensity  string `json:"railDensity"`
	RailActivity string `json:"railActivity"`
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
		View:         stored.View,
		Density:      stored.Density,
		UsageModel:   stored.UsageModel,
		RailSort:     stored.RailSort,
		Theme:        stored.Theme,
		UpdateCheck:  true,
		RailDensity:  stored.RailDensity,
		RailActivity: stored.RailActivity,
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
	if !validRailDensity(p.RailDensity) {
		p.RailDensity = defaultRailDensity
	}
	if !validRailActivity(p.RailActivity) {
		p.RailActivity = defaultRailActivity
	}
	return p
}

// checkEnabledSetter is prefsFeature's narrow view of the update feature: prefs notifies
// it of a checkEnabled transition. update's own initial value comes from its own
// loadPrefs read inside newUpdateFeature, not from a *prefsFeature — so update is built
// first and handed straight into newPrefsFeature; there is no construction-order cycle to
// break.
type checkEnabledSetter interface {
	SetCheckEnabled(enabled bool)
}

// prefsFeature owns PUT /api/prefs and the snapshot's prefs object (plan code-breakup
// REQ-6).
type prefsFeature struct {
	store         *store.Store
	hub           *wsHub
	updateChecker checkEnabledSetter
	log           zerolog.Logger
}

func newPrefsFeature(st *store.Store, hub *wsHub, updateChecker checkEnabledSetter, log zerolog.Logger) *prefsFeature {
	return &prefsFeature{store: st, hub: hub, updateChecker: updateChecker, log: log}
}

func (f *prefsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("PUT /api/prefs", guard(http.HandlerFunc(f.handlePutPrefs)))
}

func (f *prefsFeature) contribute(ctx context.Context, snap *Snapshot) {
	snap.Prefs = loadPrefs(ctx, f.store)
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
// reports, so entries must stay in the order view, density, usageModel, railSort, theme,
// railDensity, railActivity. UpdateCheck is deliberately absent — it is a bool with a
// changed-tracking side effect, handled on its own in handlePutPrefs.
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
		{
			present: req.RailDensity != nil,
			valid:   func() bool { return validRailDensity(*req.RailDensity) },
			msg:     "railDensity must be one of compact, comfortable, expanded",
			apply:   func(p *PrefsInfo) { p.RailDensity = *req.RailDensity },
		},
		{
			present: req.RailActivity != nil,
			valid:   func() bool { return validRailActivity(*req.RailActivity) },
			msg:     "railActivity must be one of turn, prompt, reply, both",
			apply:   func(p *PrefsInfo) { p.RailActivity = *req.RailActivity },
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
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "at least one of view, density, usageModel, railSort, theme, railDensity, railActivity or updateCheck is required")
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
		f.log.Error().Err(err).Msg("encoding prefs failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}
	if err := f.store.KVSet(ctx, prefsKVKey, string(encoded)); err != nil {
		f.log.Error().Err(err).Msg("persisting prefs failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
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
