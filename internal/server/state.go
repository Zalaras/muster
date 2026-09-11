package server

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/selfupdate"
)

// Snapshot is the daemon's full state, shared verbatim (aside from the WS "type"
// wrapper) between GET /api/state and the WS `snapshot` message (kb:anchor/ws.snapshot)
// — one function builds it so the two can never drift apart.
type Snapshot struct {
	Sessions    []sessionWire   `json:"sessions"`
	Usage       UsageInfo       `json:"usage"`
	Prefs       PrefsInfo       `json:"prefs"`
	ClaudeTheme ClaudeThemeInfo `json:"claudeTheme"`
	// Update is new in the auto-update plan (2026-09-10, kb:anchor/ws.update): always
	// present, even on a daemon with updates disabled entirely.
	Update UpdateInfo `json:"update"`
}

// ClaudeThemeInfo is the `claudeTheme` object inside a snapshot
// (kb:anchor/ws.snapshot / kb:anchor/ws.claude-theme, plan new-ui-design-colors REQ-15) — the daemon's latest read of Claude
// Code's own theme family. Family is always present: "unknown" while polling is
// disabled (-claude-theme-poll 0) or no read has yet succeeded.
type ClaudeThemeInfo struct {
	Family string `json:"family"`
}

// UsageBucket is one of the five-hour/seven-day usage readouts (kb:anchor/ws.usage).
// M0 never populates it; it exists so the null shape below type-checks.
type UsageBucket struct {
	UsedPct  float64 `json:"usedPct"`
	ResetsAt string  `json:"resetsAt"`
}

// UsageModelWindow is one entry of the `usage.modelScoped` list (kb:anchor/ws.usage,
// plan usage-model-bar) — one per-model weekly usage window.
type UsageModelWindow struct {
	DisplayName string  `json:"displayName"`
	UsedPct     float64 `json:"usedPct"`
	ResetsAt    string  `json:"resetsAt"`
}

// UsageInfo is the `usage` object inside a snapshot. M0 has no usage samples yet, so
// every field renders null/"unknown" (REQ-16). Model is new in M3 (kb:anchor/ws.usage): the freshest
// sample's model, for the masthead readout — present as an explicit `null` key (no
// `omitempty`), matching FiveHour/SevenDay/SampledAt: "null iff buckets null" per the
// plan's Protocol Contract, not an absent key. ModelScoped/ModelScopedAt/ModelScopedError
// are the second, independent usage source (plan usage-model-bar, 2026-08-30): nil
// slice/pointer renders `null` on the wire (no `omitempty`) until the first successful
// fetch; an empty-but-non-nil ModelScoped is a valid, distinct successful result.
// ModelScopedSource is a wire constant in v1, never empty.
type UsageInfo struct {
	FiveHour          *UsageBucket       `json:"fiveHour"`
	SevenDay          *UsageBucket       `json:"sevenDay"`
	Model             *sessionWireModel  `json:"model"`
	SampledAt         *string            `json:"sampledAt"`
	Source            string             `json:"source"`
	ModelScoped       []UsageModelWindow `json:"modelScoped"`
	ModelScopedAt     *string            `json:"modelScopedAt"`
	ModelScopedError  *string            `json:"modelScopedError"`
	ModelScopedSource string             `json:"modelScopedSource"`
}

// PrefsInfo is the `prefs` object inside a snapshot (kb:anchor/prefs.put / kb:anchor/ws.snapshot). M2
// makes this persist (kv) and broadcast; Density is new in M2 (the Tiles grid density).
// UsageModel is new in the usage-model-bar plan (2026-08-30): which modelScoped entry
// the masthead's third readout shows, default "Fable". RailSort is new in the
// order-sidebar plan (2026-08-30): the rail's sort mode, "manual" | "attention",
// default "manual". Theme is new in new-ui-design-colors (2026-09-02): opaque to the
// daemon beyond its pattern (kb:anchor/prefs.put), default "follow". UpdateCheck is
// new in the auto-update plan (2026-09-10): whether the daemon checks GitHub Releases
// for a newer musterd, default true.
type PrefsInfo struct {
	View        string `json:"view"`
	Density     string `json:"density"`
	UsageModel  string `json:"usageModel"`
	RailSort    string `json:"railSort"`
	Theme       string `json:"theme"`
	UpdateCheck bool   `json:"updateCheck"`
}

// buildSnapshot returns the fixed parts of a snapshot: no sessions, unknown usage,
// default prefs, unknown claudeTheme family (before any PUT /api/prefs or poll tick).
// Retained as the M0 baseline (still exercised directly by TestBuildSnapshot_M0Shape);
// production handlers call (*Server).currentSnapshot, which fills Sessions, the real
// persisted Prefs, and the poller's current family.
func buildSnapshot() Snapshot {
	return Snapshot{
		Sessions: []sessionWire{},
		Usage: UsageInfo{
			FiveHour:          nil,
			SevenDay:          nil,
			SampledAt:         nil,
			Source:            "subscription",
			ModelScopedSource: "subscription-api",
		},
		Prefs:       defaultPrefs(),
		ClaudeTheme: ClaudeThemeInfo{Family: string(claudecode.ThemeUnknown)},
		Update:      UpdateInfo{Apply: UpdateApplyInfo{Phase: string(selfupdate.PhaseIdle)}},
	}
}

// currentSnapshot is buildSnapshot's M1+ successor: the same fixed usage shape, with
// Sessions filled from the live session registry (REQ-12, core — the session manager is
// not itself a registered feature) and every other section filled by looping the
// registered features' snapshotContributor (REQ-6): usage, prefs, claudeTheme and
// update. Field independence means contribution order doesn't matter — each feature
// writes only its own Snapshot field.
func (s *Server) currentSnapshot(ctx context.Context) Snapshot {
	snap := buildSnapshot()
	sessions := s.manager.List()
	wire := make([]sessionWire, 0, len(sessions))
	for _, sess := range sessions {
		wire = append(wire, toWireSession(sess))
	}
	snap.Sessions = wire
	for _, f := range s.features {
		if c, ok := f.(snapshotContributor); ok {
			c.contribute(ctx, &snap)
		}
	}
	return snap
}

// handleState serves GET /api/state — the same snapshot object the WS handshake sends,
// minus the "type" envelope (REQ-6).
func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(s.currentSnapshot(r.Context()))
}
