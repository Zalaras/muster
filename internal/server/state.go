package server

import (
	"context"
	"net/http"
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
	// ShellsBusy is new in terminal-fixes-cleanup (kb:anchor/ws.shell-activity): session ids
	// whose shell is busy right now, always present as [] when none — never null — so a
	// reconnecting client re-syncs without waiting for a shellActivity transition.
	ShellsBusy []int64 `json:"shellsBusy"`
}

// buildSnapshot returns the fixed parts of a snapshot: no sessions, unknown usage,
// default prefs, unknown claudeTheme family (before any PUT /api/prefs or poll tick).
// TestBuildSnapshot_M0Shape pins its exact shape; production handlers call
// (*Server).currentSnapshot, which starts from it and fills Sessions, the real persisted
// Prefs, and the poller's current family. Each field's empty/default value is owned by
// the feature that builds it (usagewire.go, prefs.go, themepoll.go, update.go) — this
// function owns only the shape, not any feature's defaults.
func buildSnapshot() Snapshot {
	return Snapshot{
		Sessions:    []sessionWire{},
		Usage:       emptyUsageInfo(),
		Prefs:       defaultPrefs(),
		ClaudeTheme: defaultClaudeThemeInfo(),
		Update:      defaultUpdateInfo(),
		ShellsBusy:  []int64{},
	}
}

// currentSnapshot is buildSnapshot with Sessions filled from the live session registry
// (core — the session manager is not itself a registered feature) and every other section
// filled by looping the registered features' snapshotContributor: usage, prefs,
// claudeTheme and update. Field independence means contribution order doesn't matter —
// each feature writes only its own Snapshot field.
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
	writeJSON(w, http.StatusOK, s.currentSnapshot(r.Context()))
}
