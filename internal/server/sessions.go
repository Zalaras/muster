package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/gitutil"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

// createSessionRequest is POST /api/sessions' request body (docs/protocol.md §3.1).
type createSessionRequest struct {
	Directory      string `json:"directory"`
	Title          string `json:"title"`
	Model          string `json:"model"`
	PermissionMode string `json:"permissionMode"`
}

// launchError carries the HTTP status/error-envelope code a launch failure maps to
// (docs/protocol.md §2's error envelope).
type launchError struct {
	status  int
	code    string
	message string
}

func (e *launchError) Error() string { return e.message }

func invalidRequest(message string) *launchError {
	return &launchError{status: http.StatusBadRequest, code: "invalid_request", message: message}
}

func launchFailed(message string) *launchError {
	return &launchError{status: http.StatusInternalServerError, code: "launch_failed", message: message}
}

// notFound, notResumable and directoryMissing are Resume's own error codes
// (m4-reconcile REQ-7, docs/protocol.md §3.5) — reusing launchError's shape rather than
// a parallel type, since the server-side handling (writeJSONError(status, code,
// message)) is identical.
func notFound(message string) *launchError {
	return &launchError{status: http.StatusNotFound, code: "unknown_session", message: message}
}

func notResumable(message string) *launchError {
	return &launchError{status: http.StatusConflict, code: "not_resumable", message: message}
}

func directoryMissing(message string) *launchError {
	return &launchError{status: http.StatusConflict, code: "directory_missing", message: message}
}

// sessionLauncher composes store+tmux+claudecode+session.Manager to perform one launch
// (plan Implementation Notes: "Launch sequence"). Handlers only decode/delegate/encode.
type sessionLauncher struct {
	store   *store.Store
	manager *session.Manager
	tmux    *tmux.Client
	log     zerolog.Logger

	claudeBin string

	// hookScript/statusLineScript are the generated command-hook wrapper script paths
	// (internal/claudecode.WriteWrapperScripts) — since m4-hook-lifetime the launcher
	// holds no ingest URL at all; the URL lives only inside the scripts themselves.
	hookScript       string
	statusLineScript string
	// legacyScripts lists prior wrapper paths MergeSettings must still recognise and
	// drop from an already-instrumented directory (REQ-3/REQ-4).
	legacyScripts []string
}

// Launch validates req, upserts the repo row, inserts the session row, writes
// settings.local.json, spawns the tmux window, and records/broadcasts the finished
// session — in that order (order matters: the session needs an id before the tmux
// spawn that puts it in the pane environment).
func (l *sessionLauncher) Launch(ctx context.Context, req createSessionRequest) (*session.Session, *launchError) {
	dir := req.Directory
	if dir == "" || !filepath.IsAbs(dir) {
		return nil, invalidRequest("directory must be an absolute path")
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return nil, invalidRequest("directory does not exist or is not a directory")
	}
	if req.Model == "" {
		return nil, invalidRequest("model must not be empty")
	}
	switch req.PermissionMode {
	case "default", "plan", "acceptEdits", "auto":
	default:
		return nil, invalidRequest("permissionMode must be one of default, plan, acceptEdits, auto")
	}

	isGit := gitutil.IsRepo(ctx, dir)
	var branch *string
	isWorktree := false
	if isGit {
		branch = gitutil.Branch(ctx, dir)
		isWorktree = gitutil.IsWorktree(ctx, dir)
	}

	repo, created, err := l.store.UpsertRepo(ctx, store.UpsertRepoParams{
		Path:           dir,
		Name:           filepath.Base(dir),
		IsGit:          isGit,
		Model:          req.Model,
		PermissionMode: req.PermissionMode,
	})
	if err != nil {
		return nil, launchFailed(fmt.Sprintf("recording repo: %v", err))
	}

	var title *string
	if req.Title != "" {
		title = &req.Title
	}

	sess, err := l.manager.CreateSession(ctx, session.CreateParams{
		RepoID:          repo.ID,
		Directory:       dir,
		Branch:          branch,
		IsWorktree:      isWorktree,
		Title:           title,
		PermissionMode:  session.PermissionMode(req.PermissionMode),
		Model:           req.Model,
		FirstLaunchHere: created,
	})
	if err != nil {
		return nil, launchFailed(fmt.Sprintf("creating session: %v", err))
	}

	if err = l.writeSettings(dir); err != nil {
		l.rollback(ctx, sess.ID)
		return nil, launchFailed(err.Error())
	}

	argv := claudecode.BuildArgv(l.claudeBin, claudecode.LaunchParams{
		Model:          req.Model,
		Title:          req.Title,
		PermissionMode: req.PermissionMode,
	})
	env := map[string]string{
		"MUSTER_SESSION": strconv.FormatInt(sess.ID, 10),
		// A Go-daemon child inherits no LANG/LC_ALL of its own (REQ-20) — cheap to set
		// now; the failure otherwise presents as a broken terminal bridge in M2.
		"LANG":   "en_US.UTF-8",
		"LC_ALL": "en_US.UTF-8",
	}
	target, pane, err := l.tmux.NewSession(ctx, sess.ID, dir, env, argv)
	if err != nil {
		l.rollback(ctx, sess.ID)
		return nil, launchFailed(fmt.Sprintf("spawning tmux session: %v", err))
	}

	final, err := l.manager.RecordLaunch(ctx, sess.ID, target, pane)
	if err != nil {
		l.rollback(ctx, sess.ID)
		// The tmux window was already spawned; without this the pane keeps running
		// with no session row and no broadcast behind it — an invisible session the
		// user can't see or reach (review Major 10).
		if killErr := l.tmux.KillWindow(ctx, target); killErr != nil {
			l.log.Error().Err(killErr).Str("tmux_target", target).Msg("failed to kill tmux window after RecordLaunch failure")
		}
		return nil, launchFailed(fmt.Sprintf("recording launch: %v", err))
	}
	return final, nil
}

// rollback deletes a session row inserted earlier in Launch once a later step failed
// (plan Implementation Notes: "on spawn failure: delete the row"). ctx is always
// context.WithoutCancel of the request's context (review Minor 2): a client that
// navigates away mid-launch must not also cancel the cleanup write.
func (l *sessionLauncher) rollback(ctx context.Context, id int64) {
	if err := l.manager.DeleteSession(ctx, id); err != nil {
		l.log.Error().Err(err).Int64("session_id", id).Msg("failed to roll back session after launch failure")
	}
}

// Resume relaunches a dead, resumable session (REQ-7, docs/protocol.md §3.5): rewrites
// settings, spawns `claude --resume <claudeSessionId>` in a fresh muster-<id> tmux
// session (the dead one's name is free again after End/reconcile), and records the new
// pane. state is left untouched — it becomes idle only once the enveloped
// SessionStart(source:"resume") arrives (REQ-8).
func (l *sessionLauncher) Resume(ctx context.Context, id int64) (*session.Session, *launchError) {
	sess, ok := l.manager.Get(id)
	if !ok {
		return nil, notFound("unknown session id")
	}
	if sess.Alive || sess.ClaudeSessionID == "" {
		return nil, notResumable("session is alive or has no resumable claude session id")
	}
	if info, err := os.Stat(sess.Directory); err != nil || !info.IsDir() {
		return nil, directoryMissing("session directory no longer exists")
	}

	if err := l.writeSettings(sess.Directory); err != nil {
		return nil, launchFailed(err.Error())
	}

	model := ""
	if sess.Model != nil {
		model = sess.Model.ID
	}
	argv := claudecode.BuildArgv(l.claudeBin, claudecode.LaunchParams{
		Model:           model,
		PermissionMode:  string(sess.PermissionMode),
		ResumeSessionID: sess.ClaudeSessionID,
	})
	env := map[string]string{
		"MUSTER_SESSION": strconv.FormatInt(id, 10),
		// Same rationale as Launch's own env (REQ-20): a Go-daemon child inherits no
		// LANG/LC_ALL of its own.
		"LANG":   "en_US.UTF-8",
		"LC_ALL": "en_US.UTF-8",
	}
	target, pane, err := l.tmux.NewSession(ctx, id, sess.Directory, env, argv)
	if err != nil {
		return nil, launchFailed(fmt.Sprintf("spawning tmux session: %v", err))
	}

	final, err := l.manager.RecordResume(ctx, id, target, pane)
	if err != nil {
		if killErr := l.tmux.KillWindow(ctx, target); killErr != nil {
			l.log.Error().Err(killErr).Str("tmux_target", target).Msg("failed to kill tmux window after RecordResume failure")
		}
		return nil, launchFailed(fmt.Sprintf("recording resume: %v", err))
	}
	return final, nil
}

// writeSettings ensures dir/.claude/settings.local.json registers Muster's hooks,
// status-line and allowed-URL config (REQ-4). A corrupt existing file refuses the
// launch by name (docs/protocol.md §3.1 / Edge Case 9) rather than guessing.
func (l *sessionLauncher) writeSettings(dir string) error {
	path := filepath.Join(dir, ".claude", "settings.local.json")

	var existing []byte
	if b, err := os.ReadFile(path); err == nil {
		existing = b
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("reading %s: %w", path, err)
	}

	merged, err := claudecode.MergeSettings(existing, claudecode.SettingsConfig{
		HookCommand:       l.hookScript,
		StatusLineCommand: l.statusLineScript,
		LegacyCommands:    l.legacyScripts,
	})
	if err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("creating %s: %w", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, merged, 0o600); err != nil {
		return fmt.Errorf("writing %s: %w", path, err)
	}
	return nil
}

// handleCreateSession is POST /api/sessions (REQ-1 through REQ-6, REQ-14, REQ-19..21).
func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}

	// context.WithoutCancel: a client that navigates away mid-launch must not cancel
	// the tmux spawn or the rollback's own DB write — the launch has already committed
	// side effects (a repo/session row, possibly a spawned pane) that must run to a
	// consistent conclusion regardless of the HTTP request's lifetime (review Minor 2).
	sess, lerr := s.launcher.Launch(context.WithoutCancel(r.Context()), req)
	if lerr != nil {
		writeJSONError(w, lerr.status, lerr.code, lerr.message)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(toWireSession(sess))
}

// parseSessionID reads the {id} path value, writing a 404 unknown_session itself on a
// malformed value (an unparseable id is indistinguishable from an unknown one to the
// caller — same response either way).
func parseSessionID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return 0, false
	}
	return id, true
}

// handleEndSession is POST /api/sessions/{id}/end (REQ-5, docs/protocol.md §3.7). Any
// open terminal socket for id is closed (4001) before the kill, so the UI's dead-surface
// overlay arrives ahead of the alive:false broadcast (Implementation Notes).
func (s *Server) handleEndSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	s.terminals.closeSession(id)

	sess, endErr := s.manager.End(context.WithoutCancel(r.Context()), id)
	if endErr != nil {
		switch {
		case errors.Is(endErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		case errors.Is(endErr, session.ErrSessionNotAlive):
			writeJSONError(w, http.StatusConflict, "not_alive", "session is already ended")
		default:
			s.log.Error().Err(endErr).Int64("session_id", id).Msg("ending session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", endErr.Error())
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toWireSession(sess))
}

// handleRemoveSession is DELETE /api/sessions/{id} (REQ-6, docs/protocol.md §3.8).
func (s *Server) handleRemoveSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	// If id is alive, Remove runs the End path first — close any terminal socket ahead
	// of that too (same rationale as handleEndSession).
	s.terminals.closeSession(id)

	if remErr := s.manager.Remove(context.WithoutCancel(r.Context()), id); remErr != nil {
		switch {
		case errors.Is(remErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			s.log.Error().Err(remErr).Int64("session_id", id).Msg("removing session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", remErr.Error())
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleResumeSession is POST /api/sessions/{id}/resume (REQ-7, docs/protocol.md §3.5).
func (s *Server) handleResumeSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	sess, lerr := s.launcher.Resume(context.WithoutCancel(r.Context()), id)
	if lerr != nil {
		writeJSONError(w, lerr.status, lerr.code, lerr.message)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toWireSession(sess))
}

// handlePaneSnapshot is GET /api/sessions/{id}/pane (REQ-4, docs/protocol.md §3.4 —
// closes the M2 deferral). Served for live sessions too; the UI only asks for dead ones.
func (s *Server) handlePaneSnapshot(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	if !s.manager.Exists(id) {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return
	}
	text, at, ok := s.manager.Snapshot(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "no_snapshot", "no pane capture yet for this session")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(paneSnapshotWire{Text: text, CapturedAt: at.UTC().Format(time.RFC3339)})
}

// pinSessionRequest is PUT /api/sessions/{id}/pin's request body (docs/protocol.md §3.10).
type pinSessionRequest struct {
	Pinned *bool `json:"pinned"`
}

// handlePinSession is PUT /api/sessions/{id}/pin (plan order-sidebar REQ-3).
func (s *Server) handlePinSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	var req pinSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Pinned == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "pinned is required and must be a boolean")
		return
	}

	if err := s.manager.SetPinned(context.WithoutCancel(r.Context()), id, *req.Pinned); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			s.log.Error().Err(err).Int64("session_id", id).Msg("pinning session failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", err.Error())
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// setOrderRequest is PUT /api/sessions/order's request body (docs/protocol.md §3.11).
type setOrderRequest struct {
	IDs         []int64 `json:"ids"`
	PinnedCount *int    `json:"pinnedCount"`
}

// handleSetOrder is PUT /api/sessions/order (plan order-sidebar REQ-4). Registered
// ahead of the /api/sessions/{id}/... wildcard routes so Go's mux (a literal segment
// beats a wildcard) never parses "order" as a session id.
func (s *Server) handleSetOrder(w http.ResponseWriter, r *http.Request) {
	var req setOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDs == nil || req.PinnedCount == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "ids and pinnedCount are required")
		return
	}

	if err := s.manager.SetOrder(context.WithoutCancel(r.Context()), req.IDs, *req.PinnedCount); err != nil {
		switch {
		case errors.Is(err, session.ErrInvalidOrder):
			writeJSONError(w, http.StatusBadRequest, "invalid_request", "ids must be a duplicate-free list of known session ids, and pinnedCount must be in [0, len(ids)]")
		default:
			s.log.Error().Err(err).Msg("setting rail order failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", err.Error())
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

const maxSessionTitleLen = 100

// setTitleRequest is PUT /api/sessions/{id}/title's request body (plan ui-text-and-focus
// REQ-10, docs/protocol.md §3.15). Title is decoded as json.RawMessage rather than
// *string so an absent "title" key (400) is distinguishable from an explicit
// `"title": null` (204, clears the override) — json.RawMessage.UnmarshalJSON copies the
// literal bytes verbatim, including a bare `null`, while a missing key leaves the field
// at its nil zero value.
type setTitleRequest struct {
	Title json.RawMessage `json:"title"`
}

// invalidTitleMessage is §3.15's single 400 message for every validation failure (body
// not JSON, title key missing, title neither string nor null, or trimmed-empty/too-long).
const invalidTitleMessage = "title must be null or 1-100 characters after trimming"

// handleSetTitle is PUT /api/sessions/{id}/title (plan ui-text-and-focus REQ-10,
// docs/protocol.md §3.15).
func (s *Server) handleSetTitle(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	var req setTitleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	if len(req.Title) == 0 {
		// The key was absent — distinct from an explicit null (§3.15: "the title key is
		// required (absent key != null)").
		writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidTitleMessage)
		return
	}

	var title *string
	if string(req.Title) != "null" {
		var raw string
		if err := json.Unmarshal(req.Title, &raw); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidTitleMessage)
			return
		}
		// Trimmed before validation and storage (§3.15); counted in runes, not bytes,
		// same rule handleCreateIssue's title uses (a multi-byte-rune title the client's
		// maxlength already allowed must not be rejected by a byte-length check).
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || utf8.RuneCountInString(trimmed) > maxSessionTitleLen {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidTitleMessage)
			return
		}
		title = &trimmed
	}

	if _, err := s.manager.SetTitle(context.WithoutCancel(r.Context()), id, title); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			s.log.Error().Err(err).Int64("session_id", id).Msg("setting session title failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", err.Error())
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
