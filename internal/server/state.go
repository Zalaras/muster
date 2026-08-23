package server

import (
	"context"
	"encoding/json"
	"net/http"
)

// Snapshot is the daemon's full state, shared verbatim (aside from the WS "type"
// wrapper) between GET /api/state and the WS `snapshot` message (docs/protocol.md §5.2)
// — one function builds it so the two can never drift apart.
type Snapshot struct {
	Sessions []sessionWire `json:"sessions"`
	Usage    UsageInfo     `json:"usage"`
	Prefs    PrefsInfo     `json:"prefs"`
}

// UsageBucket is one of the five-hour/seven-day usage readouts (docs/protocol.md §5.4).
// M0 never populates it; it exists so the null shape below type-checks.
type UsageBucket struct {
	UsedPct  float64 `json:"usedPct"`
	ResetsAt string  `json:"resetsAt"`
}

// UsageInfo is the `usage` object inside a snapshot. M0 has no usage samples yet, so
// every field renders null/"unknown" (REQ-16).
type UsageInfo struct {
	FiveHour  *UsageBucket `json:"fiveHour"`
	SevenDay  *UsageBucket `json:"sevenDay"`
	SampledAt *string      `json:"sampledAt"`
	Source    string       `json:"source"`
}

// PrefsInfo is the `prefs` object inside a snapshot (docs/protocol.md §3.3/§5.2). M2
// makes this persist (kv) and broadcast; Density is new in M2 (the Tiles grid density).
type PrefsInfo struct {
	View    string `json:"view"`
	Density string `json:"density"`
}

// buildSnapshot returns the fixed parts of a snapshot: no sessions, unknown usage,
// default prefs (before any PUT /api/prefs). Retained as the M0 baseline (still
// exercised directly by TestBuildSnapshot_M0Shape); production handlers call
// (*Server).currentSnapshot, which fills Sessions and the real persisted Prefs.
func buildSnapshot() Snapshot {
	return Snapshot{
		Sessions: []sessionWire{},
		Usage: UsageInfo{
			FiveHour:  nil,
			SevenDay:  nil,
			SampledAt: nil,
			Source:    "subscription",
		},
		Prefs: defaultPrefs(),
	}
}

// currentSnapshot is buildSnapshot's M1+ successor: the same fixed usage shape, with
// Sessions filled from the live session registry (REQ-12) and Prefs loaded from kv
// (M2 REQ-10 — survives daemon restarts).
func (s *Server) currentSnapshot(ctx context.Context) Snapshot {
	snap := buildSnapshot()
	sessions := s.manager.List()
	wire := make([]sessionWire, 0, len(sessions))
	for _, sess := range sessions {
		wire = append(wire, toWireSession(sess))
	}
	snap.Sessions = wire
	snap.Prefs = s.loadPrefs(ctx)
	return snap
}

// handleState serves GET /api/state — the same snapshot object the WS handshake sends,
// minus the "type" envelope (REQ-6).
func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(s.currentSnapshot(r.Context()))
}
