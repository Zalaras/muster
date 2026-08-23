package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

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

// sessionLauncher composes store+tmux+claudecode+session.Manager to perform one launch
// (plan Implementation Notes: "Launch sequence"). Handlers only decode/delegate/encode.
type sessionLauncher struct {
	store   *store.Store
	manager *session.Manager
	tmux    *tmux.Client
	log     zerolog.Logger

	claudeBin string

	hookURL            string
	statusURL          string
	sessionStartScript string
	statusLineScript   string
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
	case "default", "plan", "acceptEdits":
	default:
		return nil, invalidRequest("permissionMode must be one of default, plan, acceptEdits")
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
		HookURL:             l.hookURL,
		StatusURL:           l.statusURL,
		SessionStartCommand: l.sessionStartScript,
		StatusLineCommand:   l.statusLineScript,
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
