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
)

// paneSpawner is the tmux operations internal/server's own code (sessionLauncher,
// shellRegistry) makes directly — session creation and teardown. *tmux.Client satisfies
// it without knowing.
type paneSpawner interface {
	NewSession(ctx context.Context, id int64, dir string, env map[string]string, command []string) (target, pane string, err error)
	NewNamedSession(ctx context.Context, name, dir string, env map[string]string, command []string) (target, pane string, err error)
	PaneExists(ctx context.Context, target string) (bool, error)
	KillWindow(ctx context.Context, target string) error
	KillSession(ctx context.Context, name string) error
}

// LaunchConfig groups the launch path's config (plan code-breakup REQ-7): the claude
// binary, the generated wrapper script paths, and the folder browser's root — every
// field sessionLauncher/browseFeature need, declared here since sessions.go is the
// launch feature's home file.
type LaunchConfig struct {
	// ClaudeBin is the `claude` binary to spawn (default "claude").
	ClaudeBin string
	// HookScript/StatusLineScript are the absolute paths to the generated command-hook
	// wrapper scripts (internal/claudecode.WriteWrapperScripts) — every event, including
	// SessionStart, is registered against HookScript.
	HookScript       string
	StatusLineScript string
	// LegacyScripts lists prior wrapper paths MergeSettings must still recognise and
	// drop from an already-instrumented directory.
	LegacyScripts []string
	// BrowseRoot is the folder browser's root (kb:anchor/browse.get): GET /api/browse's
	// no-param default and the "Up" ceiling. Empty means the daemon user's home
	// directory.
	BrowseRoot string
}

// createSessionRequest is POST /api/sessions' request body (kb:anchor/sessions.create).
type createSessionRequest struct {
	Directory      string `json:"directory"`
	Title          string `json:"title"`
	Model          string `json:"model"`
	PermissionMode string `json:"permissionMode"`
}

// launchError carries the HTTP status/error-envelope code a launch failure maps to
// (kb:anchor/transport's error envelope).
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
// (m4-reconcile REQ-7, kb:anchor/sessions.resume) — reusing launchError's shape rather than
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

// sessionLauncher composes store+tmux+claudecode+session.Manager to perform one launch.
// Handlers only decode/delegate/encode.
type sessionLauncher struct {
	store   *store.Store
	manager *session.Manager
	tmux    paneSpawner
	log     zerolog.Logger

	claudeBin string

	// hookScript/statusLineScript are the generated command-hook wrapper script paths
	// (internal/claudecode.WriteWrapperScripts) — since m4-hook-lifetime the launcher
	// holds no ingest URL at all; the URL lives only inside the scripts themselves.
	hookScript       string
	statusLineScript string
	// legacyScripts lists prior wrapper paths MergeSettings must still recognise and
	// drop from an already-instrumented directory.
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
		// A Go-daemon child inherits no LANG/LC_ALL of its own — cheap to set now; the
		// failure otherwise presents as a broken terminal bridge in M2.
		"LANG":   "en_US.UTF-8",
		"LC_ALL": "en_US.UTF-8",
	}
	for k, v := range claudecode.LaunchEnv() {
		env[k] = v
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
		// user can't see or reach.
		if killErr := l.tmux.KillWindow(ctx, target); killErr != nil {
			l.log.Error().Err(killErr).Str("tmux_target", target).Msg("failed to kill tmux window after RecordLaunch failure")
		}
		return nil, launchFailed(fmt.Sprintf("recording launch: %v", err))
	}
	return final, nil
}

// rollback deletes a session row inserted earlier in Launch once a later step failed.
// ctx is always context.WithoutCancel of the request's context: a client that navigates
// away mid-launch must not also cancel the cleanup write.
func (l *sessionLauncher) rollback(ctx context.Context, id int64) {
	if err := l.manager.DeleteSession(ctx, id); err != nil {
		l.log.Error().Err(err).Int64("session_id", id).Msg("failed to roll back session after launch failure")
	}
}

// Resume relaunches a dead, resumable session (REQ-7, kb:anchor/sessions.resume): rewrites
// settings, spawns `claude --resume <claudeSessionId>` in a fresh muster-<id> tmux
// session (the dead one's name is free again after End/reconcile), and records the new
// pane. state is left untouched — it becomes idle only once the enveloped
// SessionStart(source:"resume") arrives.
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
		"LANG":           "en_US.UTF-8",
		"LC_ALL":         "en_US.UTF-8",
	}
	for k, v := range claudecode.LaunchEnv() {
		env[k] = v
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
// status-line and allowed-URL config. A corrupt existing file refuses the launch by name
// (kb:anchor/sessions.create) rather than guessing.
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

// sessionsFeature owns the session lifecycle endpoints: create, end, resume, remove,
// pin, order, title and pane-snapshot (plan code-breakup REQ-6). shells/terminals are
// the shared collaborators shellFeature/terminalFeature also hold — sessions needs them
// only for End/Remove's socket-close and Remove's shell-kill side effects.
type sessionsFeature struct {
	manager   *session.Manager
	launcher  *sessionLauncher
	shells    *shellRegistry
	terminals *terminalRegistry
	log       zerolog.Logger
}

func newSessionsFeature(manager *session.Manager, launcher *sessionLauncher, shells *shellRegistry, terminals *terminalRegistry, log zerolog.Logger) *sessionsFeature {
	return &sessionsFeature{manager: manager, launcher: launcher, shells: shells, terminals: terminals, log: log}
}

func (f *sessionsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions", guard(http.HandlerFunc(f.handleCreateSession)))
	mux.Handle("GET /api/sessions/{id}/pane", guard(http.HandlerFunc(f.handlePaneSnapshot)))
	mux.Handle("POST /api/sessions/{id}/end", guard(http.HandlerFunc(f.handleEndSession)))
	mux.Handle("POST /api/sessions/{id}/resume", guard(http.HandlerFunc(f.handleResumeSession)))
	mux.Handle("DELETE /api/sessions/{id}", guard(http.HandlerFunc(f.handleRemoveSession)))
	// Registered ahead of PUT /api/sessions/{id}/pin: Go's Go 1.22 mux prefers a literal
	// segment over a wildcard, so "order" is never parsed as {id} regardless of
	// registration order, but the literal route is listed first here to read that way too.
	mux.Handle("PUT /api/sessions/order", guard(http.HandlerFunc(f.handleSetOrder)))
	mux.Handle("PUT /api/sessions/{id}/pin", guard(http.HandlerFunc(f.handlePinSession)))
	mux.Handle("PUT /api/sessions/{id}/title", guard(http.HandlerFunc(f.handleSetTitle)))
}

// handleCreateSession is POST /api/sessions (REQ-1 through REQ-6, REQ-14, REQ-19..21).
func (f *sessionsFeature) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}

	// context.WithoutCancel: a client that navigates away mid-launch must not cancel
	// the tmux spawn or the rollback's own DB write — the launch has already committed
	// side effects (a repo/session row, possibly a spawned pane) that must run to a
	// consistent conclusion regardless of the HTTP request's lifetime.
	sess, lerr := f.launcher.Launch(context.WithoutCancel(r.Context()), req)
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

// handleEndSession is POST /api/sessions/{id}/end (REQ-5, kb:anchor/sessions.end). Any
// open terminal socket for id is closed (4001) before the kill, so the UI's dead-surface
// overlay arrives ahead of the alive:false broadcast.
func (f *sessionsFeature) handleEndSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	f.terminals.closeSession(id)

	sess, endErr := f.manager.End(context.WithoutCancel(r.Context()), id)
	if endErr != nil {
		switch {
		case errors.Is(endErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		case errors.Is(endErr, session.ErrSessionNotAlive):
			writeJSONError(w, http.StatusConflict, "not_alive", "session is already ended")
		default:
			f.log.Error().Err(endErr).Int64("session_id", id).Msg("ending session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", endErr.Error())
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toWireSession(sess))
}

// handleRemoveSession is DELETE /api/sessions/{id} (REQ-6, kb:anchor/sessions.remove). Since
// plain-terminal-session (kb:anchor/sessions.shell/REQ-9) this also kills the session's shell tmux session,
// unlike End which deliberately leaves a shell running.
func (f *sessionsFeature) handleRemoveSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	// If id is alive, Remove runs the End path first — close any terminal socket ahead
	// of that too (same rationale as handleEndSession). Close and kill the shell surface
	// too (REQ-9): Remove is the only path that touches a session's shell tmux session.
	f.terminals.closeSessionAndShell(id)
	f.shells.Kill(context.WithoutCancel(r.Context()), id)

	if remErr := f.manager.Remove(context.WithoutCancel(r.Context()), id); remErr != nil {
		switch {
		case errors.Is(remErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			f.log.Error().Err(remErr).Int64("session_id", id).Msg("removing session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", remErr.Error())
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleResumeSession is POST /api/sessions/{id}/resume (REQ-7, kb:anchor/sessions.resume).
func (f *sessionsFeature) handleResumeSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	sess, lerr := f.launcher.Resume(context.WithoutCancel(r.Context()), id)
	if lerr != nil {
		writeJSONError(w, lerr.status, lerr.code, lerr.message)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toWireSession(sess))
}

// handlePaneSnapshot is GET /api/sessions/{id}/pane (REQ-4, kb:anchor/sessions.pane).
// Served for live sessions too; the UI only asks for dead ones.
func (f *sessionsFeature) handlePaneSnapshot(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	if !f.manager.Exists(id) {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return
	}
	text, at, ok := f.manager.Snapshot(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "no_snapshot", "no pane capture yet for this session")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(paneSnapshotWire{Text: text, CapturedAt: at.UTC().Format(time.RFC3339)})
}

// pinSessionRequest is PUT /api/sessions/{id}/pin's request body (kb:anchor/sessions.pin).
type pinSessionRequest struct {
	Pinned *bool `json:"pinned"`
}

// handlePinSession is PUT /api/sessions/{id}/pin (plan order-sidebar REQ-3).
func (f *sessionsFeature) handlePinSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	var req pinSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Pinned == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "pinned is required and must be a boolean")
		return
	}

	if err := f.manager.SetPinned(context.WithoutCancel(r.Context()), id, *req.Pinned); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			f.log.Error().Err(err).Int64("session_id", id).Msg("pinning session failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", "pinning session")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// setOrderRequest is PUT /api/sessions/order's request body (kb:anchor/sessions.order).
type setOrderRequest struct {
	IDs         []int64 `json:"ids"`
	PinnedCount *int    `json:"pinnedCount"`
}

// handleSetOrder is PUT /api/sessions/order (plan order-sidebar REQ-4).
func (f *sessionsFeature) handleSetOrder(w http.ResponseWriter, r *http.Request) {
	var req setOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDs == nil || req.PinnedCount == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "ids and pinnedCount are required")
		return
	}

	if err := f.manager.SetOrder(context.WithoutCancel(r.Context()), req.IDs, *req.PinnedCount); err != nil {
		switch {
		case errors.Is(err, session.ErrInvalidOrder):
			writeJSONError(w, http.StatusBadRequest, "invalid_request", "ids must be a duplicate-free list of known session ids, and pinnedCount must be in [0, len(ids)]")
		default:
			f.log.Error().Err(err).Msg("setting rail order failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", "setting rail order")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

const maxSessionTitleLen = 100

// setTitleRequest is PUT /api/sessions/{id}/title's request body (plan ui-text-and-focus
// REQ-10, kb:anchor/sessions.title). Title is decoded as json.RawMessage rather than
// *string so an absent "title" key (400) is distinguishable from an explicit
// `"title": null` (204, clears the override) — json.RawMessage.UnmarshalJSON copies the
// literal bytes verbatim, including a bare `null`, while a missing key leaves the field
// at its nil zero value.
type setTitleRequest struct {
	Title json.RawMessage `json:"title"`
}

// invalidTitleMessage is kb:anchor/sessions.title's single 400 message for every validation failure (body
// not JSON, title key missing, title neither string nor null, or trimmed-empty/too-long).
const invalidTitleMessage = "title must be null or 1-100 characters after trimming"

// handleSetTitle is PUT /api/sessions/{id}/title (plan ui-text-and-focus REQ-10,
// kb:anchor/sessions.title).
func (f *sessionsFeature) handleSetTitle(w http.ResponseWriter, r *http.Request) {
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
		// The key was absent — distinct from an explicit null (kb:anchor/sessions.title: "the title key is
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
		// Trimmed before validation and storage (kb:anchor/sessions.title); counted in runes, not bytes,
		// same rule handleCreateIssue's title uses (a multi-byte-rune title the client's
		// maxlength already allowed must not be rejected by a byte-length check).
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || utf8.RuneCountInString(trimmed) > maxSessionTitleLen {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", invalidTitleMessage)
			return
		}
		title = &trimmed
	}

	if _, err := f.manager.SetTitle(context.WithoutCancel(r.Context()), id, title); err != nil {
		switch {
		case errors.Is(err, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			f.log.Error().Err(err).Int64("session_id", id).Msg("setting session title failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", err.Error())
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
