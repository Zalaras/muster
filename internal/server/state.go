package server

import (
	"encoding/json"
	"net/http"
)

// Snapshot is the daemon's full state, shared verbatim (aside from the WS "type"
// wrapper) between GET /api/state and the WS `snapshot` message (docs/protocol.md §5.2)
// — one function builds it so the two can never drift apart.
type Snapshot struct {
	Sessions []any     `json:"sessions"`
	Usage    UsageInfo `json:"usage"`
	Prefs    PrefsInfo `json:"prefs"`
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

// PrefsInfo is the `prefs` object inside a snapshot. M2 makes this persist/broadcast;
// M0 hardcodes the default.
type PrefsInfo struct {
	View string `json:"view"`
}

// buildSnapshot returns M0's snapshot: no sessions, unknown usage, default prefs. No
// state machine exists yet (plan m0-skeleton: "there is no state machine, no session
// launch... ingested events land in the event table and nothing else happens to them").
func buildSnapshot() Snapshot {
	return Snapshot{
		Sessions: []any{},
		Usage: UsageInfo{
			FiveHour:  nil,
			SevenDay:  nil,
			SampledAt: nil,
			Source:    "subscription",
		},
		Prefs: PrefsInfo{View: "focus"},
	}
}

// handleState serves GET /api/state — the same snapshot object the WS handshake sends,
// minus the "type" envelope (REQ-6).
func (s *Server) handleState(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(buildSnapshot())
}
