package server

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

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
	// KillWindow kills one window by target. No production caller — every rollback/kill
	// path here and in internal/session goes through KillSession instead, for its
	// already-gone-is-fine idempotence; kept on the interface only so this package's own
	// tests can tear down a spawned pane directly through srv.tmuxClient.KillWindow.
	KillWindow(ctx context.Context, target string) error
	KillSession(ctx context.Context, name string) error
	// MaxSessionID probes the tmux socket's own highest session id: the launcher calls it
	// before CreateSession so a new row never lands on an id an orphaned "muster-<N>" tmux
	// session already owns (kb:adr/lifecycle-session-ids-monotonic-never-reused).
	MaxSessionID(ctx context.Context) (int64, error)
}

// LaunchConfig groups the launch path's config: the claude binary, the generated
// wrapper script paths, and the folder browser's root — every field
// sessionLauncher/browseFeature need, declared here since launcher.go is the launch
// service's home file.
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

// sessionLauncher composes store+tmux+claudecode+session.Manager to perform one launch.
// Handlers only decode/delegate/encode.
type sessionLauncher struct {
	store   *store.Store
	manager *session.Manager
	tmux    paneSpawner
	log     zerolog.Logger

	claudeBin string

	// hookScript/statusLineScript are the generated command-hook wrapper script paths
	// (internal/claudecode.WriteWrapperScripts) — the launcher holds no ingest URL at
	// all; the URL lives only inside the scripts themselves, replaced at daemon start
	// whenever their content changed (kb:adr/ingest-all-hooks-command-wrappers).
	hookScript       string
	statusLineScript string
	// legacyScripts lists prior wrapper paths MergeSettings must still recognise and
	// drop from an already-instrumented directory.
	legacyScripts []string

	// checkModel is the model-catalog pre-check
	// (kb:adr/launch-model-check-cached-per-binary-identity), run between
	// validateLaunchRequest and UpsertRepo. nil means no check — every *sessionLauncher
	// literal a test constructs directly leaves it unset and skips it entirely. dir is
	// unused by production's own closure (the check runs in the cache's daemon-chosen
	// directory, never a launch directory) but stays part of the signature so every
	// existing test literal setting this field directly keeps compiling.
	checkModel func(ctx context.Context, dir, model string) (claudecode.ModelVerdict, error)
}

// defaultClaudeBin resolves LaunchConfig.ClaudeBin's default (main's flag default is
// never empty, but a zero-value Config must still name something spawnable/checkable) —
// shared by newSessionLauncher and server.go's newModelsFeature construction, so the two
// features spawning `claude` can never resolve a different default from each other.
func defaultClaudeBin(bin string) string {
	if bin == "" {
		return "claude"
	}
	return bin
}

// newSessionLauncher builds the launch/resume service. Test call sites construct
// *sessionLauncher literals directly instead, so they can leave checkModel nil (see its
// own doc comment) — this constructor is production's one path, and models is always a
// real *modelsFeature there (kb:adr/launch-model-check-cached-per-binary-identity: exactly
// one cache owner, shared with GET /api/models).
func newSessionLauncher(store *store.Store, manager *session.Manager, tmux paneSpawner, cfg LaunchConfig, models *modelsFeature, log zerolog.Logger) *sessionLauncher {
	claudeBin := defaultClaudeBin(cfg.ClaudeBin)
	return &sessionLauncher{
		store:            store,
		manager:          manager,
		tmux:             tmux,
		log:              log,
		claudeBin:        claudeBin,
		hookScript:       cfg.HookScript,
		statusLineScript: cfg.StatusLineScript,
		legacyScripts:    cfg.LegacyScripts,
		checkModel: func(ctx context.Context, _, model string) (claudecode.ModelVerdict, error) {
			if models.verdict(ctx, model) == catalogUnrecognized {
				return claudecode.ModelUnrecognised, nil
			}
			return claudecode.ModelRecognised, nil
		},
	}
}

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
	if !session.ValidPermissionMode(req.PermissionMode) {
		// Built from claudecode.PermissionModes — the one owner of the set — rather than
		// spelling its members again here.
		return invalidRequest("permissionMode must be one of " + strings.Join(claudecode.PermissionModes, ", "))
	}
	return nil
}

// buildLaunchEnv is the pane environment shared by a launch and a resume: the session id
// the wrapper scripts envelope every event with, a locale a Go-daemon child does not
// inherit on its own, and whatever Claude Code's own launch environment adds.
func buildLaunchEnv(sessionID int64) map[string]string {
	env := map[string]string{
		claudecode.MusterSessionEnvVar: strconv.FormatInt(sessionID, 10),
		// A Go-daemon child inherits no LANG/LC_ALL of its own; without them the failure
		// presents as a broken terminal bridge.
		"LANG":   "en_US.UTF-8",
		"LC_ALL": "en_US.UTF-8",
	}
	for k, v := range claudecode.LaunchEnv() {
		env[k] = v
	}
	return env
}

// maxLaunchAttempts bounds the floor-raise retry loop
// (kb:adr/lifecycle-session-ids-monotonic-never-reused): a launch that keeps colliding
// with an orphaned tmux session gives up rather than retrying forever or leaking a row
// per attempt.
const maxLaunchAttempts = 3

// launchTmuxTimeout bounds every tmux invocation spawnAndRecordLaunch/Resume make
// directly: both run under id's per-session lock (kb:adr/actions-serialized-per-session),
// so a wedged tmux there no longer just hangs one request — it wedges every later
// Launch/Resume/End/Remove for that same id, permanently. Mirrors
// shellTmuxTimeout/endRemoveTmuxTimeout's value.
const launchTmuxTimeout = 5 * time.Second

// spawnSession runs tmux.NewSession bounded by launchTmuxTimeout — Launch and Resume are
// its only two callers, sharing it so the timeout and the context plumbing can't drift
// between the two call sites.
func (l *sessionLauncher) spawnSession(ctx context.Context, id int64, dir string, env map[string]string, argv []string) (target, pane string, err error) {
	spawnCtx, cancel := context.WithTimeout(ctx, launchTmuxTimeout)
	defer cancel()
	return l.tmux.NewSession(spawnCtx, id, dir, env, argv)
}

// killSessionAfterRecordFailure kills the tmux session a spawn already created once
// RecordLaunch/RecordResume failed to persist it (action names which, for the log line
// only) — the pane would otherwise keep running with no session row and no broadcast
// behind it, invisible to the user. Goes through KillSession, not KillWindow, so this
// rollback shares the same already-gone semantics (idempotent against a target that's
// already gone) as every other production caller in internal/session and
// shellRegistry. Logs its own failure; the caller still returns launchFailed()
// regardless.
func (l *sessionLauncher) killSessionAfterRecordFailure(ctx context.Context, id int64, action string) {
	killCtx, cancel := context.WithTimeout(ctx, launchTmuxTimeout)
	defer cancel()
	name := tmux.SessionName(id)
	if err := l.tmux.KillSession(killCtx, name); err != nil {
		l.log.Error().Err(err).Int64("session_id", id).Str("tmux_session", name).Msgf("failed to kill tmux session after %s failure", action)
	}
}

// Launch validates req, runs the model check, upserts the repo row, inserts the
// session row, writes settings.local.json, spawns the tmux window, and
// records/broadcasts the finished session — in that order (order matters: the session
// needs an id before the tmux spawn that puts it in the pane environment).
func (l *sessionLauncher) Launch(ctx context.Context, req createSessionRequest) (*session.Session, *launchError) {
	if lerr := validateLaunchRequest(req); lerr != nil {
		return nil, lerr
	}
	dir := req.Directory

	// checkModel runs after validation and before any write (UpsertRepo is next), so a
	// refusal leaves nothing to roll back. Production's own closure (newSessionLauncher)
	// takes its verdict from the model-catalog cache rather than running a fresh
	// subprocess, so this is normally a cache hit; a check that errors fails open — the
	// launch proceeds regardless (kb:adr/launch-model-check-cached-per-binary-identity) —
	// and is logged at warn without the stderr body: that sentence is Claude-Code
	// wire-format detail, kept inside internal/claudecode.
	if l.checkModel != nil {
		verdict, err := l.checkModel(ctx, dir, req.Model)
		if err != nil {
			l.log.Warn().Err(err).Str("directory", dir).Str("model", req.Model).Msg("model-catalog check failed; launch proceeding")
		} else if verdict == claudecode.ModelUnrecognised {
			return nil, modelUnrecognized(req.Model)
		}
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
		l.log.Error().Err(err).Str("directory", dir).Msg("recording repo failed")
		return nil, launchFailed()
	}

	var title *string
	if req.Title != "" {
		title = &req.Title
	}

	// writeSettings runs before any row is created or tmux touched: a corrupt
	// settings.local.json is caught with nothing yet to roll back.
	if settingsErr := l.writeSettings(dir); settingsErr != nil {
		l.log.Error().Err(settingsErr).Str("directory", dir).Msg("writing launch settings failed")
		return nil, launchFailed()
	}

	argv := claudecode.BuildArgv(l.claudeBin, claudecode.LaunchParams{
		Model:          req.Model,
		Title:          req.Title,
		PermissionMode: req.PermissionMode,
	})

	// probe the tmux socket's own highest id before allocating one, so a fresh store
	// never lands on an id an orphaned "muster-<N>" already owns (issue #26;
	// kb:adr/lifecycle-session-ids-monotonic-never-reused). A probe failure degrades to
	// floor 0 rather than failing the launch — the watermark alone still prevents reuse.
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
		// A colliding orphan: raise the floor above it and retry
		// (kb:adr/lifecycle-session-ids-monotonic-never-reused) — spawnAndRecordLaunch
		// already rolled the row back.
		floor = sess.ID
	}
	// Unreachable: the loop above always returns on both its last-attempt paths.
	return nil, launchFailed()
}

// spawnAndRecordLaunch is Launch's per-attempt spawn+record step, held under sess id's
// per-session lock (kb:adr/actions-serialized-per-session) for the same reason
// End/Remove/Resume hold theirs — a fresh id from CreateSession can't yet be contended
// by anything else, but the discipline is uniform across every action that acts on one
// session id. retry reports an ErrSessionExists collision the caller should retry with
// a raised floor (kb:adr/lifecycle-session-ids-monotonic-never-reused); lerr is then nil
// unless attempts are exhausted.
func (l *sessionLauncher) spawnAndRecordLaunch(ctx context.Context, id int64, dir string, argv []string, attempt int) (final *session.Session, retry bool, lerr *launchError) {
	unlock := l.manager.LockSession(id)
	defer unlock()

	target, pane, spawnErr := l.spawnSession(ctx, id, dir, buildLaunchEnv(id), argv)
	if spawnErr != nil {
		l.rollback(ctx, id)
		if !errors.Is(spawnErr, tmux.ErrSessionExists) {
			l.log.Error().Err(spawnErr).Int64("session_id", id).Msg("spawning tmux session failed")
			return nil, false, launchFailed()
		}
		name := tmux.SessionName(id)
		if attempt == maxLaunchAttempts {
			// Never surfacing raw tmux stderr to the caller; the daemon log names the
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
		l.killSessionAfterRecordFailure(ctx, id, "RecordLaunch")
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

// Resume relaunches a dead, resumable session (kb:anchor/sessions.resume): rewrites
// settings, spawns `claude --resume <claudeSessionId>` in a fresh muster-<id> tmux
// session (the dead one's name is free again after End/reconcile), and records the new
// pane. state is left untouched — it becomes idle only once the enveloped
// SessionStart(source:"resume") arrives.
func (l *sessionLauncher) Resume(ctx context.Context, id int64) (*session.Session, *launchError) {
	// id's per-session lock (kb:adr/actions-serialized-per-session) serialises the whole
	// check-then-act. Resume reads sess.Alive == false and only RecordResume (much later)
	// flips it — without this lock two concurrent Resumes for the same dead session both
	// pass that gate and both spawn a tmux session; the loser must instead observe the
	// now-alive row and be refused.
	unlock := l.manager.LockSession(id)
	defer unlock()

	sess, ok := l.manager.Get(id)
	if !ok {
		return nil, notFound()
	}
	// The two causes are named separately in the message — only one of them is ever
	// recoverable (an alive session becomes resumable once it ends; a session that never
	// bound a claudeSessionId never will) — so the UI can tell them apart from the 409
	// body alone. The code stays "not_resumable" either way.
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
	target, pane, err := l.spawnSession(ctx, id, sess.Directory, buildLaunchEnv(id), argv)
	if err != nil {
		if errors.Is(err, tmux.ErrSessionExists) {
			// Resume cannot renumber a session (the id is the row's) — a live
			// muster-<id> under this not-alive row must be this row's own pane from an
			// earlier crash between spawn and persist, so repair and adopt it rather
			// than failing (kb:adr/lifecycle-reconcile-converges-with-the-socket).
			repaired, repairErr := l.manager.RepairOwnedSession(ctx, id)
			if repairErr != nil {
				name := tmux.SessionName(id)
				// Log the repair failure itself — without this it was invisible, the
				// caller only ever saw the generic launch_failed message below.
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
		l.killSessionAfterRecordFailure(ctx, id, "RecordResume")
		return nil, launchFailed()
	}
	return final, nil
}

// writeSettings ensures dir's project-scoped settings file
// (claudecode.ProjectSettingsPath) registers Muster's hooks, status-line and
// allowed-URL config. A corrupt existing file refuses the launch by name
// (kb:anchor/sessions.create) rather than guessing.
func (l *sessionLauncher) writeSettings(dir string) error {
	path := claudecode.ProjectSettingsPath(dir)

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
	// claudecode.AtomicWriteFile, not a direct WriteFile. The per-id lock only
	// serialises the same session id — two different sessions launching into the same
	// directory (a shared repo, two launches) still race on this same
	// settings.local.json, and a torn write there refuses every future launch in the
	// directory (kb:adr/actions-serialized-per-session's Consequences).
	if err := claudecode.AtomicWriteFile(path, merged, 0o600); err != nil {
		return fmt.Errorf("writing %s: %w", path, err)
	}
	return nil
}
