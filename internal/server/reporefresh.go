package server

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/gitutil"
	"github.com/Zalaras/muster/internal/session"
)

// repoReadTimeout bounds one session's git reads in a repo-poll tick, so a wedged checkout
// cannot stall the loop for every other session.
const repoReadTimeout = 5 * time.Second

// RepoRefreshConfig groups the repo poll's config.
type RepoRefreshConfig struct {
	// Poll is the poll interval (-repo-poll). <= 0 runs no timer: the poll then runs once at
	// start and on a nudge only (kb:adr/lifecycle-branch-refreshed-by-repo-poll).
	Poll time.Duration
}

// repoRefreshFeature re-reads each alive session's launch-directory branch and worktree flag,
// and derives where Claude is working when that is another checkout (claudeLocation), on a
// timer and whenever the session manager reports Claude's directory changed. Hooks never
// report a checkout made by the shell pane or outside Muster, so a poll is the only source
// (kb:adr/lifecycle-branch-refreshed-by-repo-poll). It mounts no routes. All git runs
// happen here, outside the manager's lock; the manager's SetRepoState applies the result.
type repoRefreshFeature struct {
	manager  *session.Manager
	interval time.Duration
	log      zerolog.Logger

	// refresh coalesces nudges to at most one extra tick, like usagePoller.refresh.
	refresh chan struct{}
	bg      bgLoop
}

func newRepoRefreshFeature(cfg RepoRefreshConfig, manager *session.Manager, log zerolog.Logger) *repoRefreshFeature {
	return &repoRefreshFeature{
		manager:  manager,
		interval: cfg.Poll,
		log:      log,
		refresh:  make(chan struct{}, 1),
	}
}

func (f *repoRefreshFeature) mount(_ *http.ServeMux, _ func(http.Handler) http.Handler) {}

// Start begins the poll loop with an immediate first tick, so a restarted daemon derives
// claudeLocation for rows that carry a recorded directory. Call once.
func (f *repoRefreshFeature) Start() {
	f.bg.start(func(ctx context.Context) { runTicked(ctx, f.interval, f.refresh, f.tick) })
}

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done.
func (f *repoRefreshFeature) Stop(ctx context.Context) {
	f.bg.stop(ctx, f.log, "repo poller did not stop before shutdown deadline")
}

// nudge wakes the loop for an immediate tick. Coalesced and never blocking: it runs on the
// ingest worker.
func (f *repoRefreshFeature) nudge() {
	select {
	case f.refresh <- struct{}{}:
	default:
	}
}

// tick reads every alive session whose launch directory still exists. A dead session, or a
// directory that is gone or no longer a directory, keeps its last-known repo; so does a
// reading that cannot be trusted (readRepoState's ok).
func (f *repoRefreshFeature) tick(ctx context.Context) {
	for _, t := range f.manager.RepoTargets() {
		if ctx.Err() != nil {
			return
		}
		if !t.Alive || !isDir(t.Directory) {
			continue
		}
		state, ok := readRepoState(ctx, t)
		if !ok {
			continue
		}
		if err := f.manager.SetRepoState(ctx, t.ID, state); err != nil && !errors.Is(err, session.ErrUnknownSession) {
			f.log.Warn().Err(err).Int64("session_id", t.ID).Msg("repo poll: applying repo state failed")
		}
	}
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// readRepoState runs the git reads for one session. ok is false when the reading cannot be
// told apart from a git failure: the read deadline (or the poll's own cancellation) expired
// mid-read, or the launch directory vanished after tick's stat. A failing git then looks
// like "not a checkout", so applying the reading would null a card's last-known repo for a
// directory that is still a checkout (or is merely gone); the caller keeps the old repo.
func readRepoState(ctx context.Context, t session.RepoTarget) (state session.RepoState, ok bool) {
	ctx, cancel := context.WithTimeout(ctx, repoReadTimeout)
	defer cancel()
	_, branch, isWorktree := repoContext(ctx, t.Directory)
	state = session.RepoState{Branch: branch, IsWorktree: isWorktree, ClaudeDir: t.ClaudeDir, Epoch: t.Epoch}
	if t.ClaudeDir != "" {
		state.Location = deriveLocation(ctx, t.Directory, t.ClaudeDir)
	}
	return state, ctx.Err() == nil && isDir(t.Directory)
}

// deriveLocation is claudeLocation: nil unless claudeDir is a different checkout from
// launchDir (session.Elsewhere). Paths are compared symlink-resolved, because the same
// directory arrives as /tmp/x from one source and /private/tmp/x from another
// (kb:fact/cwd-follows-claude-mid-session).
func deriveLocation(ctx context.Context, launchDir, claudeDir string) *session.Location {
	launch, claude := resolvePath(launchDir), resolvePath(claudeDir)
	launchTop, claudeTop := topLevel(ctx, launch), topLevel(ctx, claude)
	if !session.Elsewhere(launchTop, claudeTop, launch, claude) {
		return nil
	}
	loc := &session.Location{Directory: claude}
	if claudeTop == nil {
		return loc
	}
	if branch, isWorktree := checkoutState(ctx, claude); branch != nil {
		loc.Repo = &session.LocationRepo{Name: filepath.Base(*claudeTop), Branch: *branch, IsWorktree: isWorktree}
	}
	return loc
}

// resolvePath is path cleaned and symlink-resolved, or merely cleaned when it does not exist.
func resolvePath(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return filepath.Clean(path)
}

// topLevel is gitutil.TopLevel with the answer resolved the same way as the directories it
// is compared against.
func topLevel(ctx context.Context, dir string) *string {
	top := gitutil.TopLevel(ctx, dir)
	if top == nil {
		return nil
	}
	resolved := resolvePath(*top)
	return &resolved
}
