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

// paneSpawner is the tmux operations internal/server's own code (sessionLauncher,
// shellRegistry) makes directly — session creation and teardown. *tmux.Client satisfies
// it without knowing.
type paneSpawner interface {
	NewSession(ctx context.Context, id int64, dir string, env map[string]string, command []string) (target, pane string, err error)
	NewNamedSession(ctx context.Context, name, dir string, env map[string]string, command []string) (target, pane string, err error)
	PaneExists(ctx context.Context, target string) (bool, error)
	KillWindow(ctx context.Context, target string) error
	KillSession(ctx context.Context, name string) error
	// MaxSessionID is REQ-7's floor probe: the launcher calls it before CreateSession so
	// a new row never lands on an id an orphaned "muster-<N>" tmux session already owns.
	MaxSessionID(ctx context.Context) (int64, error)
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

// Fixed 5xx `message` text (REQ-10, kb:anchor/transport): display text for the user, never
// a wrapped tmux/OS error string — the raw error goes only to the adjacent log.Error()
// line. 4xx messages are unaffected; they were already fixed phrases.
const (
	msgEndFailed        = "couldn't end the session — tmux reported an error; see the daemon log"
	msgRemoveFailed     = "couldn't remove the session — tmux reported an error; see the daemon log"
	msgLaunchFailed     = "couldn't launch — see the daemon log"
	msgShellSpawnFailed = "couldn't open a shell — tmux reported an error; see the daemon log"
	msgInternalError    = "something went wrong on the daemon — see the daemon log"
)

func invalidRequest(message string) *launchError {
	return &launchError{status: http.StatusBadRequest, code: "invalid_request", message: message}
}

// launchFailed is every launch/resume failure's 500 body (REQ-10): the fixed phrase only
// — the caller logs the raw error itself at the site.
func launchFailed() *launchError {
	return &launchError{status: http.StatusInternalServerError, code: "launch_failed", message: msgLaunchFailed}
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
// validateLaunchRequest is Launch's pure prefix: it reads req alone, touches no launcher
// state and runs before anything has been written, so a rejection here needs no rollback.
// Check order is load-bearing — it decides which single error a request invalid in
// several fields at once reports — so keep it as directory, model, permissionMode.
func validateLaunchRequest(req createSessionRequest) *launchError {
	if req.Directory == "" || !filepath.IsAbs(req.Directory) {
		return invalidRequest("directory must be an absolute path")
	}
	if info, err := os.Stat(req.Directory); err != nil || !info.IsDir() {
		return invalidRequest("directory does not exist or is not a directory")
	}
	if req.Model == "" {
		return invalidRequest("model must not be empty")
	}
	switch req.PermissionMode {
	case "default", "plan", "acceptEdits", "auto":
	default:
		return invalidRequest("permissionMode must be one of default, plan, acceptEdits, auto")
	}
	return nil
}

// buildLaunchEnv is the pane environment shared by a launch and a resume: the session id
// the wrapper scripts envelope every event with, a locale a Go-daemon child does not
// inherit on its own, and whatever Claude Code's own launch environment adds.
func buildLaunchEnv(sessionID int64) map[string]string {
	env := map[string]string{
		"MUSTER_SESSION": strconv.FormatInt(sessionID, 10),
		// A Go-daemon child inherits no LANG/LC_ALL of its own — cheap to set now; the
		// failure otherwise presents as a broken terminal bridge in M2.
		"LANG":   "en_US.UTF-8",
		"LC_ALL": "en_US.UTF-8",
	}
	for k, v := range claudecode.LaunchEnv() {
		env[k] = v
	}
	return env
}

// maxLaunchAttempts is REQ-7's bounded retry: a launch that keeps colliding with an
// orphaned tmux session gives up rather than retrying forever or leaking a row per
// attempt (D5).
const maxLaunchAttempts = 3

// launchTmuxTimeout bounds every tmux invocation spawnAndRecordLaunch/Resume make
// directly (REQ-12, review cycle 2 Minor): both run under id's per-session lock
// (REQ-11), so a wedged tmux there no longer just hangs one request — it wedges every
// later Launch/Resume/End/Remove for that same id, permanently. Mirrors
// shellTmuxTimeout/endRemoveTmuxTimeout's value.
const launchTmuxTimeout = 5 * time.Second

func (l *sessionLauncher) Launch(ctx context.Context, req createSessionRequest) (*session.Session, *launchError) {
	if lerr := validateLaunchRequest(req); lerr != nil {
		return nil, lerr
	}
	dir := req.Directory

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
		l.log.Error().Err(err).Str("directory", dir).Msg("recording repo failed")
		return nil, launchFailed()
	}

	var title *string
	if req.Title != "" {
		title = &req.Title
	}

	// writeSettings runs before any row is created or tmux touched (Edge Case 9's other
	// half: a corrupt settings.local.json is caught with nothing yet to roll back).
	if settingsErr := l.writeSettings(dir); settingsErr != nil {
		l.log.Error().Err(settingsErr).Str("directory", dir).Msg("writing launch settings failed")
		return nil, launchFailed()
	}

	argv := claudecode.BuildArgv(l.claudeBin, claudecode.LaunchParams{
		Model:          req.Model,
		Title:          req.Title,
		PermissionMode: req.PermissionMode,
	})

	// REQ-7: probe the tmux socket's own highest id before allocating one, so a fresh
	// store never lands on an id an orphaned "muster-<N>" already owns (the #26
	// reproducer, D3). A probe failure degrades to floor 0 rather than failing the
	// launch — the watermark alone (REQ-1/REQ-2) still prevents reuse.
	floor, err := l.tmux.MaxSessionID(ctx)
	if err != nil {
		l.log.Warn().Err(err).Msg("probing max tmux session id failed; launching with floor 0")
		floor = 0
	}

	for attempt := 1; attempt <= maxLaunchAttempts; attempt++ {
		sess, err := l.manager.CreateSession(ctx, session.CreateParams{
			RepoID:          repo.ID,
			Directory:       dir,
			Branch:          branch,
			IsWorktree:      isWorktree,
			Title:           title,
			PermissionMode:  session.PermissionMode(req.PermissionMode),
			Model:           req.Model,
			FirstLaunchHere: created,
			MinID:           floor,
		})
		if err != nil {
			l.log.Error().Err(err).Msg("creating session failed")
			return nil, launchFailed()
		}

		final, retry, lerr := l.spawnAndRecordLaunch(ctx, sess.ID, dir, argv, attempt)
		if lerr != nil {
			return nil, lerr
		}
		if !retry {
			return final, nil
		}
		// A colliding orphan: raise the floor above it and retry (D4) — spawnAndRecordLaunch
		// already rolled the row back.
		floor = sess.ID
	}
	// Unreachable: the loop above always returns on both its last-attempt paths.
	return nil, launchFailed()
}

// spawnAndRecordLaunch is Launch's per-attempt spawn+record step, held under sess id's
// per-session lock (REQ-11) for the same reason End/Remove/Resume hold theirs — a
// fresh id from CreateSession can't yet be contended by anything else, but the discipline
// is uniform across every action that acts on one session id. retry reports an
// ErrSessionExists collision the caller should retry with a raised floor (D4); lerr is
// then nil unless attempts are exhausted (D5).
func (l *sessionLauncher) spawnAndRecordLaunch(ctx context.Context, id int64, dir string, argv []string, attempt int) (final *session.Session, retry bool, lerr *launchError) {
	unlock := l.manager.LockSession(id)
	defer unlock()

	spawnCtx, cancel := context.WithTimeout(ctx, launchTmuxTimeout)
	target, pane, spawnErr := l.tmux.NewSession(spawnCtx, id, dir, buildLaunchEnv(id), argv)
	cancel()
	if spawnErr != nil {
		l.rollback(ctx, id)
		if !errors.Is(spawnErr, tmux.ErrSessionExists) {
			l.log.Error().Err(spawnErr).Int64("session_id", id).Msg("spawning tmux session failed")
			return nil, false, launchFailed()
		}
		name := tmux.SessionName(id)
		if attempt == maxLaunchAttempts {
			// Never surfacing raw tmux stderr to the caller (D5); the daemon log names the
			// remedy (tmux -L muster kill-session -t <name>) for a human reading it.
			l.log.Error().Int64("session_id", id).Str("tmux_session", name).Int("attempts", maxLaunchAttempts).
				Msg("spawning tmux session still colliding after max attempts; a stale tmux session likely needs manual cleanup (tmux -L muster kill-session -t <name>)")
			return nil, false, launchFailed()
		}
		return nil, true, nil
	}

	final, err := l.manager.RecordLaunch(ctx, id, target, pane)
	if err != nil {
		l.log.Error().Err(err).Int64("session_id", id).Msg("recording launch failed")
		l.rollback(ctx, id)
		// The tmux window was already spawned; without this the pane keeps running
		// with no session row and no broadcast behind it — an invisible session the
		// user can't see or reach.
		killCtx, killCancel := context.WithTimeout(ctx, launchTmuxTimeout)
		killErr := l.tmux.KillWindow(killCtx, target)
		killCancel()
		if killErr != nil {
			l.log.Error().Err(killErr).Str("tmux_target", target).Msg("failed to kill tmux window after RecordLaunch failure")
		}
		return nil, false, launchFailed()
	}
	return final, false, nil
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
	// REQ-11/D19: id's per-session lock serialises the whole check-then-act. Resume reads
	// sess.Alive == false and only RecordResume (much later) flips it — without this lock
	// two concurrent Resumes for the same dead session both pass that gate and both spawn
	// a tmux session; the loser must instead observe the now-alive row and be refused.
	unlock := l.manager.LockSession(id)
	defer unlock()

	sess, ok := l.manager.Get(id)
	if !ok {
		return nil, notFound("unknown session id")
	}
	// REQ-17/D21: the two causes are named separately in the message — only one of them
	// is ever recoverable (an alive session becomes resumable once it ends; a session
	// that never bound a claudeSessionId never will) — so the UI can tell them apart from
	// the 409 body alone. The code stays "not_resumable" either way.
	if sess.Alive {
		return nil, notResumable("session is still alive; resume is only for a dead session")
	}
	if sess.ClaudeSessionID == "" {
		return nil, notResumable("session never started a claude conversation and has no resumable claude session id")
	}
	if info, err := os.Stat(sess.Directory); err != nil || !info.IsDir() {
		return nil, directoryMissing("session directory no longer exists")
	}

	if err := l.writeSettings(sess.Directory); err != nil {
		l.log.Error().Err(err).Int64("session_id", id).Msg("writing resume settings failed")
		return nil, launchFailed()
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
	spawnCtx, cancel := context.WithTimeout(ctx, launchTmuxTimeout)
	target, pane, err := l.tmux.NewSession(spawnCtx, id, sess.Directory, buildLaunchEnv(id), argv)
	cancel()
	if err != nil {
		if errors.Is(err, tmux.ErrSessionExists) {
			// REQ-8: Resume cannot renumber (the id is the row's) — a live muster-<id>
			// under this not-alive row is that row's own pane (Edge Case 6), so repair
			// and adopt it rather than failing.
			repaired, repairErr := l.manager.RepairOwnedSession(ctx, id)
			if repairErr != nil {
				name := tmux.SessionName(id)
				// Minor 1 (review cycle 1): log the repair failure itself — without
				// this it was invisible, the caller only ever saw the generic
				// launch_failed message below.
				l.log.Warn().Err(repairErr).Int64("session_id", id).Str("tmux_session", name).Msg("resume: repairing owned session failed")
				return nil, launchFailed()
			}
			return repaired, nil
		}
		l.log.Error().Err(err).Int64("session_id", id).Msg("spawning tmux session for resume failed")
		return nil, launchFailed()
	}

	final, err := l.manager.RecordResume(ctx, id, target, pane)
	if err != nil {
		l.log.Error().Err(err).Int64("session_id", id).Msg("recording resume failed")
		killCtx, killCancel := context.WithTimeout(ctx, launchTmuxTimeout)
		killErr := l.tmux.KillWindow(killCtx, target)
		killCancel()
		if killErr != nil {
			l.log.Error().Err(killErr).Str("tmux_target", target).Msg("failed to kill tmux window after RecordResume failure")
		}
		return nil, launchFailed()
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

	settingsDir := filepath.Dir(path)
	if err = os.MkdirAll(settingsDir, 0o700); err != nil {
		return fmt.Errorf("creating %s: %w", settingsDir, err)
	}
	// review cycle 1 Major 4: write-then-rename, not a direct WriteFile. The per-id lock
	// only serialises the same session id — two different sessions launching into the
	// same directory (Edge Case: shared repo, two launches) still race on this same
	// settings.local.json, and a torn write there refuses every future launch in the
	// directory (kb:adr/actions-serialized-per-session's Consequences). The temp file is
	// created in the same directory so the rename is atomic (same filesystem).
	tmp, err := os.CreateTemp(settingsDir, ".settings.local.json.tmp-*")
	if err != nil {
		return fmt.Errorf("creating temp file in %s: %w", settingsDir, err)
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }() // no-op once the rename below succeeds
	if _, err := tmp.Write(merged); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("writing %s: %w", tmpPath, err)
	}
	// review cycle 2 Note: fsync before the rename, or a crash between them can still
	// lose the write despite the rename itself being atomic (durable, not just atomic).
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("syncing %s: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing %s: %w", tmpPath, err)
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		return fmt.Errorf("setting permissions on %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("renaming %s to %s: %w", tmpPath, path, err)
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

	// reader drops a removed session's write log (plan markdown-viewing edge case 28).
	// Set post-construction (server.go, mirroring ingest's queue.manager wiring) since
	// readerFeature needs the manager sessionsFeature is itself built from; nil is a
	// valid no-op for tests that don't exercise the reader.
	reader writeLogForgetter
}

// writeLogForgetter is sessionsFeature's view of *readerFeature — narrowed to the one
// method Remove calls.
type writeLogForgetter interface {
	forgetSession(id int64)
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

// handleEndSession is POST /api/sessions/{id}/end (REQ-5, kb:anchor/sessions.end).
// session-lifecycle REQ-13: the terminal socket is closed only once End has actually
// succeeded — a 404/409, and a genuine end_failed kill failure alike, must never tear
// down a socket for a session whose pane is still running (review cycle 1 Major 2: a
// failed kill leaves the row alive and the pane up, so closing the socket here left the
// user staring at a dead-surface overlay over a live session).
func (f *sessionsFeature) handleEndSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	sess, endErr := f.manager.End(context.WithoutCancel(r.Context()), id)
	if endErr != nil {
		switch {
		case errors.Is(endErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
			return
		case errors.Is(endErr, session.ErrSessionNotAlive):
			writeJSONError(w, http.StatusConflict, "not_alive", "session is already ended")
			return
		default:
			f.log.Error().Err(endErr).Int64("session_id", id).Msg("ending session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", msgEndFailed)
			return
		}
	}

	f.terminals.closeSession(id)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toWireSession(sess))
}

// handleRemoveSession is DELETE /api/sessions/{id} (REQ-6, kb:anchor/sessions.remove).
// Since plain-terminal-session (kb:anchor/sessions.shell/REQ-9) this also kills the
// session's shell tmux session, unlike End which deliberately leaves a shell running.
// session-lifecycle REQ-13: the shell/terminal teardown runs only after manager.Remove has
// actually succeeded — a failed Remove must leave both exactly as they were, retryable
// without collateral loss (D15).
func (f *sessionsFeature) handleRemoveSession(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	if remErr := f.manager.Remove(context.WithoutCancel(r.Context()), id); remErr != nil {
		switch {
		case errors.Is(remErr, session.ErrUnknownSession):
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		default:
			f.log.Error().Err(remErr).Int64("session_id", id).Msg("removing session failed")
			writeJSONError(w, http.StatusInternalServerError, "end_failed", msgRemoveFailed)
		}
		return
	}

	f.terminals.closeSessionAndShell(id)
	f.shells.Kill(context.WithoutCancel(r.Context()), id)

	if f.reader != nil {
		f.reader.forgetSession(id)
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
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
