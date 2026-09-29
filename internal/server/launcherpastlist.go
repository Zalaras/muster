package server

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
)

// maxPastSessions bounds GET /api/past-sessions' response (kb:anchor/pastsessions.list):
// the newest 200, with `truncated: true` naming the cut.
const maxPastSessions = 200

// maxPastSessionPromptLen is the wire lastPrompt's own truncation, independent of
// internal/session's unrelated 200-char LastPrompt cut on the live rail activity line —
// the two happen to share a length, not a helper.
const maxPastSessionPromptLen = 200

// pastSessionWire is one GET /api/past-sessions element (kb:anchor/pastsessions.list).
type pastSessionWire struct {
	ClaudeSessionID string  `json:"claudeSessionId"`
	Title           *string `json:"title"`
	LastPrompt      *string `json:"lastPrompt"`
	LastActiveAt    string  `json:"lastActiveAt"`
	PermissionMode  *string `json:"permissionMode"`
	OpenSessionID   *int64  `json:"openSessionId"`
}

// pastSessionsResponse is GET /api/past-sessions' 200 body (kb:anchor/pastsessions.list).
type pastSessionsResponse struct {
	Sessions  []pastSessionWire `json:"sessions"`
	Truncated bool              `json:"truncated"`
}

// aliveClaudeSessionLookup is pastSessionsFeature's narrow view of *session.Manager —
// the one method it needs to mark a row's openSessionId.
type aliveClaudeSessionLookup interface {
	AliveByClaudeSessionID(claudeSessionID string) (int64, bool)
}

// pastSessionsFeature owns GET /api/past-sessions — the Resume tab's list
// (kb:adr/launch-resume-listed-from-transcripts-by-cwd).
type pastSessionsFeature struct {
	projectsDir string
	manager     aliveClaudeSessionLookup
	log         zerolog.Logger
}

func newPastSessionsFeature(projectsDir string, manager aliveClaudeSessionLookup, log zerolog.Logger) *pastSessionsFeature {
	return &pastSessionsFeature{projectsDir: projectsDir, manager: manager, log: log}
}

func (f *pastSessionsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/past-sessions", guard(http.HandlerFunc(f.handleListPastSessions)))
}

// handleListPastSessions is GET /api/past-sessions (kb:anchor/pastsessions.list):
// validates the directory query param, delegates the read/order/cap/mark work to
// listPastSessions, and encodes the result (docs/conventions.md § Go "handlers decode,
// delegate, encode" — the same shape browse.go's handleBrowse/browseDirectory pair
// documents).
func (f *pastSessionsFeature) handleListPastSessions(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("directory")
	if err := validateLaunchDirectory(dir); err != nil {
		switch {
		case errors.Is(err, errLaunchDirNotAbsolute):
			writeJSONError(w, http.StatusBadRequest, "invalid_request", err.Error())
		case errors.Is(err, errLaunchDirNotFound):
			writeJSONError(w, http.StatusNotFound, "not_found", err.Error())
		default:
			f.log.Error().Err(err).Str("directory", dir).Msg("validating launch directory failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	resp, err := listPastSessions(f.projectsDir, dir, f.manager)
	if err != nil {
		// Fail open, like the launch model check does: a projects directory this daemon
		// cannot read is a reason to show an empty list, never to refuse the request
		// (edge case 21) — listPastSessions already returned one, built from a nil
		// sessions slice.
		f.log.Warn().Err(err).Str("directory", dir).Msg("reading past sessions failed; showing an empty list")
	}
	writeJSON(w, http.StatusOK, resp)
}

// listPastSessions is handleListPastSessions' domain call — the list derivation itself,
// callable and testable without an http.Request, matching browseDirectory's shape: reads
// dir's Claude Code sessions from its transcripts, sorts newest first, caps at
// maxPastSessions (setting Truncated), marks each row's openSessionId from the alive
// Muster session (if any) holding it, and applies the wire lastPrompt cut. readErr is
// claudecode.PastSessions' own error, if any; the response returned alongside it is
// still a valid (empty) list — the caller decides whether and how to log it.
func listPastSessions(projectsDir, dir string, manager aliveClaudeSessionLookup) (resp pastSessionsResponse, readErr error) {
	sessions, err := claudecode.PastSessions(projectsDir, dir)
	if err != nil {
		readErr = err
		sessions = nil
	}
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].LastActiveAt.After(sessions[j].LastActiveAt) })

	truncated := len(sessions) > maxPastSessions
	if truncated {
		sessions = sessions[:maxPastSessions]
	}

	out := make([]pastSessionWire, 0, len(sessions))
	for _, s := range sessions {
		var openID *int64
		if id, ok := manager.AliveByClaudeSessionID(s.ClaudeSessionID); ok {
			openID = &id
		}
		out = append(out, pastSessionWire{
			ClaudeSessionID: s.ClaudeSessionID,
			Title:           s.Title,
			LastPrompt:      truncatePastPrompt(s.LastPrompt),
			LastActiveAt:    wireTime(s.LastActiveAt),
			PermissionMode:  s.PermissionMode,
			OpenSessionID:   openID,
		})
	}

	return pastSessionsResponse{Sessions: out, Truncated: truncated}, readErr
}

// truncatePastPrompt applies the wire lastPrompt's own rule (kb:anchor/pastsessions.list):
// first line only, then cut to maxPastSessionPromptLen runes.
func truncatePastPrompt(raw *string) *string {
	if raw == nil {
		return nil
	}
	line := *raw
	if i := strings.IndexByte(line, '\n'); i >= 0 {
		line = line[:i]
	}
	runes := []rune(line)
	if len(runes) > maxPastSessionPromptLen {
		line = string(runes[:maxPastSessionPromptLen])
	}
	return &line
}
