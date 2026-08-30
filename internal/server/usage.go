package server

import "net/http"

// handleUsageRefresh is POST /api/usage/refresh (docs/protocol.md §3.9): wakes the
// per-model usage poller for an immediate fetch, coalesced server-side by usagePoller
// itself (REQ-7). 404 not_found when polling is disabled (-usage-poll 0 — the poller was
// never constructed, Edge Case 14).
func (s *Server) handleUsageRefresh(w http.ResponseWriter, _ *http.Request) {
	if s.usagePoller == nil {
		writeJSONError(w, http.StatusNotFound, "not_found", "usage polling is disabled")
		return
	}
	s.usagePoller.Refresh()
	w.WriteHeader(http.StatusAccepted)
}
