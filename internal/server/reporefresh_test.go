package server

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/gitutil"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// bobGit runs git in dir with a per-command identity, never `git config user.*`
// (CLAUDE.md hard rule).
func bobGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	runGit(t, dir, append([]string{"-c", "user.name=bob", "-c", "user.email=bob@example.com"}, args...)...)
}

// resolvedTempDir is a fresh temp directory with symlinks resolved, so a path the test builds
// compares equal to the daemon's resolved spelling (macOS /var is /private/var).
func resolvedTempDir(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)
	return dir
}

// newGitCheckout is a repo named name on branch main with one commit, under a fresh temp dir.
func newGitCheckout(t *testing.T, name string) string {
	t.Helper()
	dir := filepath.Join(resolvedTempDir(t), name)
	require.NoError(t, os.MkdirAll(dir, 0o755))
	bobGit(t, dir, "init", "-q", "-b", "main")
	bobGit(t, dir, "commit", "--allow-empty", "-q", "-m", "initial")
	return dir
}

// pollEnv is a session.Manager over a real store with a recording OnUpsert, plus the repo
// poll feature under test, driven one tick at a time. No tmux, no goroutines.
type pollEnv struct {
	st      *store.Store
	mgr     *session.Manager
	feature *repoRefreshFeature

	mu      sync.Mutex
	upserts []*session.Session
	signal  chan struct{} // one send per upsert, for the tests that run the loop
}

func newPollEnv(t *testing.T) *pollEnv {
	t.Helper()
	return newPollEnvOnStore(t, openLauncherTestStore(t), 0)
}

func newPollEnvOnStore(t *testing.T, st *store.Store, poll time.Duration) *pollEnv {
	t.Helper()
	e := &pollEnv{st: st, signal: make(chan struct{}, 64)}
	var feature *repoRefreshFeature
	e.mgr = newSessionTestManager(t, st, withOnUpsert(func(s *session.Session) {
		e.mu.Lock()
		e.upserts = append(e.upserts, s.Clone())
		e.mu.Unlock()
		select {
		case e.signal <- struct{}{}:
		default:
		}
	}), func(c *session.Config) { c.OnClaudeDirChange = func() { feature.nudge() } })
	feature = newRepoRefreshFeature(RepoRefreshConfig{Poll: poll}, e.mgr, zerolog.Nop())
	e.feature = feature
	return e
}

// add creates and launches a session whose launch directory is dir, with the branch it has
// at launch (what the launcher records).
func (e *pollEnv) add(t *testing.T, dir string) int64 {
	t.Helper()
	ctx := context.Background()
	repo, _, err := e.st.UpsertRepo(ctx, store.UpsertRepoParams{Path: dir, Name: filepath.Base(dir), Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	sess, err := e.mgr.CreateSession(ctx, session.CreateParams{
		RepoID: repo.ID, Directory: dir, Branch: gitutil.Branch(ctx, dir), IsWorktree: gitutil.IsWorktree(ctx, dir),
		PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	_, err = e.mgr.RecordLaunch(ctx, sess.ID, "muster-poll-"+filepath.Base(dir)+":@1", "%1")
	require.NoError(t, err)
	return sess.ID
}

// claudeAt reports Claude working in dir, the way a status post does.
func (e *pollEnv) claudeAt(t *testing.T, id int64, dir string) {
	t.Helper()
	_, err := e.mgr.ApplyStatus(context.Background(), id, claudecode.StatusUpdate{Cwd: &dir})
	require.NoError(t, err)
}

func (e *pollEnv) tick() { e.feature.tick(context.Background()) }

func (e *pollEnv) get(t *testing.T, id int64) *session.Session {
	t.Helper()
	s, ok := e.mgr.Get(id)
	require.True(t, ok)
	return s
}

// upsertCount is how many sessionUpserts have been broadcast so far.
func (e *pollEnv) upsertCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.upserts)
}

// upsertIDsSince is the ids of the upserts after the first n.
func (e *pollEnv) upsertIDsSince(n int) []int64 {
	e.mu.Lock()
	defer e.mu.Unlock()
	var ids []int64
	for _, s := range e.upserts[n:] {
		ids = append(ids, s.ID)
	}
	return ids
}

func (e *pollEnv) waitUpsert(t *testing.T) {
	t.Helper()
	select {
	case <-e.signal:
	case <-time.After(15 * time.Second):
		t.Fatal("no sessionUpsert arrived")
	}
}

func branchOf(t *testing.T, s *session.Session) string {
	t.Helper()
	require.NotNil(t, s.Branch)
	return *s.Branch
}

// TestRepoPoll_BranchFollowsCheckouts is REQ-1 / D6: a checkout made outside Muster shows on
// the next tick as one upsert, an unchanged tick broadcasts nothing, and the change is
// persisted (it survives a restart).
func TestRepoPoll_BranchFollowsCheckouts(t *testing.T) {
	ctx := context.Background()
	repo := newGitCheckout(t, "muster")
	e := newPollEnv(t)
	id := e.add(t, repo)
	base := e.upsertCount()

	e.tick()
	assert.Equal(t, base, e.upsertCount(), "an unchanged tick broadcasts nothing")

	bobGit(t, repo, "checkout", "-q", "-b", "fix")
	e.tick()
	assert.Equal(t, "fix", branchOf(t, e.get(t, id)))
	assert.Equal(t, base+1, e.upsertCount(), "one sessionUpsert for the change")
	row, err := e.st.GetSession(ctx, id)
	require.NoError(t, err)
	require.NotNil(t, row.Branch)
	assert.Equal(t, "fix", *row.Branch, "the refreshed branch is persisted")

	e.tick()
	assert.Equal(t, base+1, e.upsertCount(), "the same branch again broadcasts nothing")

	bobGit(t, repo, "checkout", "-q", "--detach")
	e.tick()
	assert.Nil(t, e.get(t, id).Branch, "a detached HEAD is repo null, as at launch")
	assert.Equal(t, base+2, e.upsertCount())
}

// TestRepoPoll_WorktreeFlagIsRefreshed: the flag is read with the branch, so a launch
// directory that is a linked worktree reads true on the first tick even when the row was
// created without it.
func TestRepoPoll_WorktreeFlagIsRefreshed(t *testing.T) {
	main := newGitCheckout(t, "muster")
	linked := filepath.Join(resolvedTempDir(t), "linked")
	bobGit(t, main, "worktree", "add", "-q", "-b", "feature", linked)
	e := newPollEnv(t)
	repo, _, err := e.st.UpsertRepo(context.Background(), store.UpsertRepoParams{Path: linked, Name: "linked", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	sess, err := e.mgr.CreateSession(context.Background(), session.CreateParams{RepoID: repo.ID, Directory: linked, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = e.mgr.RecordLaunch(context.Background(), sess.ID, "muster-linked:@1", "%1")
	require.NoError(t, err)
	require.False(t, e.get(t, sess.ID).IsWorktree, "fixture: created without the flag")

	e.tick()

	got := e.get(t, sess.ID)
	assert.True(t, got.IsWorktree)
	assert.Equal(t, "feature", branchOf(t, got))
}

// TestRepoPoll_KeepsLastKnownWhenTheDirectoryIsGone is REQ-2 / D6 / edge cases 2 and 3: a
// launch directory that was deleted, or replaced by a file, keeps the last-known repo and
// claudeLocation, and broadcasts nothing.
func TestRepoPoll_KeepsLastKnownWhenTheDirectoryIsGone(t *testing.T) {
	cases := []struct {
		name     string
		breakDir func(t *testing.T, dir string)
	}{
		{"directory deleted", func(t *testing.T, dir string) { require.NoError(t, os.RemoveAll(dir)) }},
		{"replaced by a file", func(t *testing.T, dir string) {
			require.NoError(t, os.RemoveAll(dir))
			require.NoError(t, os.WriteFile(dir, []byte("x"), 0o644))
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newGitCheckout(t, "muster")
			sibling := filepath.Join(resolvedTempDir(t), "muster-sib")
			bobGit(t, repo, "worktree", "add", "-q", "-b", "sib", sibling)
			e := newPollEnv(t)
			id := e.add(t, repo)
			e.claudeAt(t, id, sibling)
			e.tick()
			before := e.get(t, id)
			require.NotNil(t, before.ClaudeLocation, "fixture: the session is moved")
			n := e.upsertCount()

			tc.breakDir(t, repo)
			e.tick()

			after := e.get(t, id)
			assert.Equal(t, "main", branchOf(t, after), "the last-known branch stays")
			assert.Equal(t, before.ClaudeLocation, after.ClaudeLocation, "the last-known location stays")
			assert.Equal(t, n, e.upsertCount())
		})
	}
}

// TestRepoPoll_DeadSessionIsNotPolled is D17 / edge case 27: a dead session keeps its
// last-known repo while an alive twin in the same tick updates (so the tick did run), and the
// first tick after a resume reads it.
func TestRepoPoll_DeadSessionIsNotPolled(t *testing.T) {
	ctx := context.Background()
	deadRepo := newGitCheckout(t, "dead")
	aliveRepo := newGitCheckout(t, "alive")
	e := newPollEnv(t)
	deadID := e.add(t, deadRepo)
	aliveID := e.add(t, aliveRepo)
	_, err := e.mgr.End(ctx, deadID)
	require.NoError(t, err)
	require.False(t, e.get(t, deadID).Alive)
	bobGit(t, deadRepo, "checkout", "-q", "-b", "fix")
	bobGit(t, aliveRepo, "checkout", "-q", "-b", "fix")
	n := e.upsertCount()

	e.tick()

	assert.Equal(t, "main", branchOf(t, e.get(t, deadID)), "no git read for a dead session")
	assert.Equal(t, "fix", branchOf(t, e.get(t, aliveID)), "the alive session in the same tick did update")
	assert.Equal(t, []int64{aliveID}, e.upsertIDsSince(n), "only the alive session broadcast")

	_, err = e.mgr.RecordResume(ctx, deadID, "muster-dead-resumed:@2", "%2")
	require.NoError(t, err)
	e.tick()
	assert.Equal(t, "fix", branchOf(t, e.get(t, deadID)), "the first tick after a resume re-reads it")
}

// TestRepoPoll_OnlyTheMovedSessionGetsALocation is D6's bystander rule and edge case 20: two
// sessions share a launch directory, one moves, and only it changes, in memory and on the wire.
func TestRepoPoll_OnlyTheMovedSessionGetsALocation(t *testing.T) {
	repo := newGitCheckout(t, "muster")
	worktree := filepath.Join(repo, ".claude", "worktrees", "probewt")
	bobGit(t, repo, "worktree", "add", "-q", "-b", "worktree-probewt", worktree)
	e := newPollEnv(t)
	moved := e.add(t, repo)
	bystander := e.add(t, repo)
	e.tick()
	n := e.upsertCount()
	bystanderBefore := e.get(t, bystander)

	e.claudeAt(t, moved, worktree)
	e.tick()

	loc := e.get(t, moved).ClaudeLocation
	require.NotNil(t, loc)
	assert.Equal(t, worktree, loc.Directory)
	assert.Equal(t, &session.LocationRepo{Name: "probewt", Branch: "worktree-probewt", IsWorktree: true}, loc.Repo)
	assert.Equal(t, bystanderBefore, e.get(t, bystander), "the other session on the same launch directory is untouched")
	assert.Equal(t, []int64{moved}, e.upsertIDsSince(n), "one sessionUpsert, for the session that moved")
}

// TestRepoPoll_ClaudeLocationMatrix is INV-1 from every source state: each place Claude can
// be crossed with an alive and a dead session, asserting claudeLocation after a tick. The
// rows cover the plan's list (same dir, subdir, .claude/worktrees worktree, sibling
// worktree, other repo, non-git inside, non-git outside) plus a symlinked spelling, a
// detached checkout and no report at all.
func TestRepoPoll_ClaudeLocationMatrix(t *testing.T) {
	type fixture struct {
		launch string
		claude string // "" = Claude has reported nothing
		want   *session.Location
	}
	cases := []struct {
		name  string
		build func(t *testing.T) fixture
	}{
		{"no report", func(t *testing.T) fixture {
			return fixture{launch: newGitCheckout(t, "muster")}
		}},
		{"same directory", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			return fixture{launch: r, claude: r}
		}},
		{"subdirectory of the checkout", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			sub := filepath.Join(r, "sub")
			require.NoError(t, os.Mkdir(sub, 0o755))
			return fixture{launch: r, claude: sub}
		}},
		{"worktree under .claude/worktrees", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			wt := filepath.Join(r, ".claude", "worktrees", "probewt")
			bobGit(t, r, "worktree", "add", "-q", "-b", "worktree-probewt", wt)
			return fixture{launch: r, claude: wt, want: &session.Location{Directory: wt, Repo: &session.LocationRepo{Name: "probewt", Branch: "worktree-probewt", IsWorktree: true}}}
		}},
		{"a subdirectory of that worktree", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			wt := filepath.Join(r, ".claude", "worktrees", "probewt")
			bobGit(t, r, "worktree", "add", "-q", "-b", "worktree-probewt", wt)
			sub := filepath.Join(wt, "pkg")
			require.NoError(t, os.Mkdir(sub, 0o755))
			return fixture{launch: r, claude: sub, want: &session.Location{Directory: sub, Repo: &session.LocationRepo{Name: "probewt", Branch: "worktree-probewt", IsWorktree: true}}}
		}},
		{"sibling worktree", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			sib := filepath.Join(filepath.Dir(r), "muster-foo")
			bobGit(t, r, "worktree", "add", "-q", "-b", "foo", sib)
			return fixture{launch: r, claude: sib, want: &session.Location{Directory: sib, Repo: &session.LocationRepo{Name: "muster-foo", Branch: "foo", IsWorktree: true}}}
		}},
		{"detached worktree has a null repo", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			sib := filepath.Join(filepath.Dir(r), "detached")
			bobGit(t, r, "worktree", "add", "-q", "--detach", sib)
			return fixture{launch: r, claude: sib, want: &session.Location{Directory: sib}}
		}},
		{"another repo added with /add-dir", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			other := newGitCheckout(t, "other")
			bobGit(t, other, "checkout", "-q", "-b", "otherbranch")
			return fixture{launch: r, claude: other, want: &session.Location{Directory: other, Repo: &session.LocationRepo{Name: "other", Branch: "otherbranch"}}}
		}},
		{"non-git launch, Claude in a subfolder", func(t *testing.T) fixture {
			p := resolvedTempDir(t)
			sub := filepath.Join(p, "sub")
			require.NoError(t, os.Mkdir(sub, 0o755))
			return fixture{launch: p, claude: sub}
		}},
		{"non-git launch, Claude outside it", func(t *testing.T) fixture {
			p, q := resolvedTempDir(t), resolvedTempDir(t)
			return fixture{launch: p, claude: q, want: &session.Location{Directory: q}}
		}},
		{"non-git launch, Claude in a checkout", func(t *testing.T) fixture {
			p := resolvedTempDir(t)
			other := newGitCheckout(t, "other")
			return fixture{launch: p, claude: other, want: &session.Location{Directory: other, Repo: &session.LocationRepo{Name: "other", Branch: "main"}}}
		}},
		{"symlinked spelling of the launch directory", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			link := filepath.Join(resolvedTempDir(t), "link")
			require.NoError(t, os.Symlink(r, link))
			return fixture{launch: r, claude: link}
		}},
		{"symlinked spelling of a worktree resolves to the real path", func(t *testing.T) fixture {
			r := newGitCheckout(t, "muster")
			sib := filepath.Join(filepath.Dir(r), "muster-foo")
			bobGit(t, r, "worktree", "add", "-q", "-b", "foo", sib)
			link := filepath.Join(resolvedTempDir(t), "link")
			require.NoError(t, os.Symlink(sib, link))
			return fixture{launch: r, claude: link, want: &session.Location{Directory: sib, Repo: &session.LocationRepo{Name: "muster-foo", Branch: "foo", IsWorktree: true}}}
		}},
	}
	for _, tc := range cases {
		for _, alive := range []bool{true, false} {
			name := tc.name + "/alive"
			if !alive {
				name = tc.name + "/dead"
			}
			t.Run(name, func(t *testing.T) {
				t.Parallel()
				fx := tc.build(t)
				e := newPollEnv(t)
				id := e.add(t, fx.launch)
				if fx.claude != "" {
					e.claudeAt(t, id, fx.claude)
				}
				if !alive {
					_, err := e.mgr.End(context.Background(), id)
					require.NoError(t, err)
				}

				e.tick()

				got := e.get(t, id).ClaudeLocation
				if !alive || fx.want == nil {
					assert.Nil(t, got, "claudeLocation is non-null iff alive and Claude is in another checkout")
					return
				}
				assert.Equal(t, fx.want, got)
			})
		}
	}
}

// TestRepoPoll_LocationFollowsTheMoveAndClears is user flows 2 and 3: entering a worktree
// shows a location, a checkout inside it updates its branch, and returning to the launch
// directory clears it.
func TestRepoPoll_LocationFollowsTheMoveAndClears(t *testing.T) {
	repo := newGitCheckout(t, "muster")
	wt := filepath.Join(repo, ".claude", "worktrees", "probewt")
	bobGit(t, repo, "worktree", "add", "-q", "-b", "worktree-probewt", wt)
	e := newPollEnv(t)
	id := e.add(t, repo)

	e.claudeAt(t, id, wt)
	e.tick()
	require.NotNil(t, e.get(t, id).ClaudeLocation)
	n := e.upsertCount()

	e.tick()
	assert.Equal(t, n, e.upsertCount(), "an unchanged derivation broadcasts nothing")

	bobGit(t, wt, "checkout", "-q", "-b", "inside")
	e.tick()
	assert.Equal(t, "inside", e.get(t, id).ClaudeLocation.Repo.Branch)
	assert.Equal(t, "main", branchOf(t, e.get(t, id)), "the card's own branch is the launch directory's")

	e.claudeAt(t, id, repo)
	e.tick()
	assert.Nil(t, e.get(t, id).ClaudeLocation, "ExitWorktree: the next report is the launch directory")
}

// TestRepoPoll_CancelledContextReadsNothing: a tick whose context is done stops before
// reading, so shutdown never races a git read against teardown.
func TestRepoPoll_CancelledContextReadsNothing(t *testing.T) {
	repo := newGitCheckout(t, "muster")
	e := newPollEnv(t)
	id := e.add(t, repo)
	bobGit(t, repo, "checkout", "-q", "-b", "fix")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	e.feature.tick(ctx)

	assert.Equal(t, "main", branchOf(t, e.get(t, id)))
}

// TestReadRepoState_OkIsFalseWhenTheReadingCannotBeTrusted pins the guard that keeps a card's
// last-known repo: a reading is trustworthy only while the context is live and the directory
// still exists after the git reads. An untrusted reading looks like "not a checkout" and would
// null the repo, so tick skips it. Called directly because the stat-to-git window and the read
// timeout cannot be hit on demand through tick.
func TestReadRepoState_OkIsFalseWhenTheReadingCannotBeTrusted(t *testing.T) {
	repo := newGitCheckout(t, "muster")
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	tests := []struct {
		name       string
		ctx        context.Context
		dir        string
		wantOK     bool
		wantBranch string
	}{
		{"live context on a real checkout is trusted", context.Background(), repo, true, "main"},
		{"directory that does not exist is untrusted", context.Background(), filepath.Join(resolvedTempDir(t), "gone"), false, ""},
		{"already-cancelled context on a real checkout is untrusted", cancelled, repo, false, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state, ok := readRepoState(tt.ctx, session.RepoTarget{Directory: tt.dir})

			assert.Equal(t, tt.wantOK, ok)
			if tt.wantOK {
				require.NotNil(t, state.Branch)
				assert.Equal(t, tt.wantBranch, *state.Branch)
			}
		})
	}
}

// TestReadRepoState_CarriesTheTargetsEpochBack: the reading must come back stamped with the
// death count the snapshot saw, or SetRepoState cannot tell it predates a death (and would
// drop every reading of a session that had died and resumed).
func TestReadRepoState_CarriesTheTargetsEpochBack(t *testing.T) {
	repo := newGitCheckout(t, "muster")

	for _, epoch := range []uint64{0, 3} {
		state, ok := readRepoState(context.Background(), session.RepoTarget{Directory: repo, Epoch: epoch})

		require.True(t, ok)
		assert.Equal(t, epoch, state.Epoch)
	}
}

// TestRepoPoll_RestartRederivesTheLocationFromTheRecordedDirectory is D7: claude_dir is
// persisted and claudeLocation is not, so a fresh manager over the same store has a null
// location until the first tick, which yields it.
func TestRepoPoll_RestartRederivesTheLocationFromTheRecordedDirectory(t *testing.T) {
	ctx := context.Background()
	repo := newGitCheckout(t, "muster")
	wt := filepath.Join(repo, ".claude", "worktrees", "probewt")
	bobGit(t, repo, "worktree", "add", "-q", "-b", "worktree-probewt", wt)
	st := openLauncherTestStore(t)
	first := newPollEnvOnStore(t, st, 0)
	id := first.add(t, repo)
	first.claudeAt(t, id, wt)

	second := newPollEnvOnStore(t, st, 0)
	require.NoError(t, second.mgr.LoadAll(ctx))
	require.Nil(t, second.get(t, id).ClaudeLocation, "fixture: nothing derived yet after the restart")
	require.Equal(t, wt, second.get(t, id).ClaudeDir)

	second.tick()

	loc := second.get(t, id).ClaudeLocation
	require.NotNil(t, loc)
	assert.Equal(t, wt, loc.Directory)
}

// TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge is D8 / edge case 25: with -repo-poll 0 the
// loop runs a tick at start and then only when nudged, and a nudge derives claudeLocation.
func TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge(t *testing.T) {
	repo := newGitCheckout(t, "muster")
	wt := filepath.Join(repo, ".claude", "worktrees", "probewt")
	bobGit(t, repo, "worktree", "add", "-q", "-b", "worktree-probewt", wt)
	e := newPollEnv(t)
	id := e.add(t, repo)
	bobGit(t, repo, "checkout", "-q", "-b", "fix")
	n := e.upsertCount()
	for len(e.signal) > 0 { // the launch's own upserts are not the loop's
		<-e.signal
	}

	e.feature.Start()
	t.Cleanup(func() { e.feature.Stop(context.Background()) })
	e.waitUpsert(t)
	assert.Equal(t, "fix", branchOf(t, e.get(t, id)), "the start tick reads the branch")

	e.claudeAt(t, id, wt) // the manager's callback nudges the poll, as server.New wires it
	e.waitUpsert(t)
	loc := e.get(t, id).ClaudeLocation
	require.NotNil(t, loc, "a nudge alone derives claudeLocation")
	assert.Equal(t, wt, loc.Directory)
	assert.Equal(t, n+2, e.upsertCount())
}

// TestRunTicked_NonPositiveIntervalRunsNoTimer: time.NewTicker panics on a non-positive
// interval, so -repo-poll 0 must not reach it. The loop runs one tick at start and one per
// refresh, and stops on cancel.
func TestRunTicked_NonPositiveIntervalRunsNoTimer(t *testing.T) {
	for _, interval := range []time.Duration{0, -time.Second} {
		t.Run(interval.String(), func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			ticks := make(chan struct{}, 8)
			refresh := make(chan struct{}, 1)
			done := make(chan struct{})
			go func() {
				defer close(done)
				runTicked(ctx, interval, refresh, func(context.Context) { ticks <- struct{}{} })
			}()

			<-ticks
			refresh <- struct{}{}
			<-ticks
			cancel()
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("runTicked did not exit on cancel")
			}
			assert.Empty(t, ticks, "exactly the start tick and the refresh tick ran")
		})
	}
}

// TestNew_ClaudeDirChangeNudgesTheRepoPoll is REQ-6 at the composition root: the manager's
// callback that server.New wires reaches the poll's nudge channel, once per burst
// (coalesced), and not at all for an unchanged directory.
func TestNew_ClaudeDirChangeNudgesTheRepoPoll(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := seedLiveSession(t, srv)
	apply := func(dir string) {
		t.Helper()
		_, err := srv.manager.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: &dir})
		require.NoError(t, err)
	}
	require.Empty(t, srv.repoRefresh.refresh, "fixture: nothing pending")

	apply("/work/a")
	assert.Len(t, srv.repoRefresh.refresh, 1, "a changed directory nudges")

	<-srv.repoRefresh.refresh
	apply("/work/a")
	assert.Empty(t, srv.repoRefresh.refresh, "an unchanged directory does not")

	apply("/work/b")
	apply("/work/c")
	assert.Len(t, srv.repoRefresh.refresh, 1, "nudges coalesce to one pending tick")
}

// TestStopLivenessPoll_AlsoStopsTheRepoPoll: the repo poll reads the same rows, so it stops
// with the liveness poll at the head of shutdown.
func TestStopLivenessPoll_AlsoStopsTheRepoPoll(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	srv.StopLivenessPoll(context.Background())

	exited := make(chan struct{})
	go func() {
		srv.repoRefresh.bg.wg.Wait()
		close(exited)
	}()
	select {
	case <-exited:
	case <-time.After(5 * time.Second):
		t.Fatal("the repo poll loop is still running after StopLivenessPoll")
	}
}

// TestIngest_MainAgentHookDirectoryBecomesClaudeLocation walks the whole path in one
// process: an enveloped hook reporting a worktree as its directory is ingested, the manager
// records it and nudges, the poll derives claudeLocation, and the wire carries it while
// `directory` stays the launch directory (REQ-3, REQ-5, REQ-6, REQ-8's wire half).
func TestIngest_MainAgentHookDirectoryBecomesClaudeLocation(t *testing.T) {
	repo := newGitCheckout(t, "muster")
	wt := filepath.Join(repo, ".claude", "worktrees", "probewt")
	bobGit(t, repo, "worktree", "add", "-q", "-b", "worktree-probewt", wt)
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := newLaunchedSessionIn(t, srv, repo)
	const claudeID = "wt-claude-1"
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), Source: "startup", TmuxPane: "%1"})).Code)

	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedHookInDirectory(int(sess.ID), "%1", "PostToolUse", claudeID, wt)).Code)

	require.Eventually(t, func() bool {
		got, ok := srv.manager.Get(sess.ID)
		return ok && got.ClaudeLocation != nil
	}, 10*time.Second, 20*time.Millisecond, "the hook's directory must surface as claudeLocation without waiting out a poll interval")
	got, _ := srv.manager.Get(sess.ID)
	w := toWireSession(got)
	require.NotNil(t, w.ClaudeLocation)
	assert.Equal(t, wt, w.ClaudeLocation.Directory)
	require.NotNil(t, w.ClaudeLocation.Repo)
	assert.Equal(t, "probewt", w.ClaudeLocation.Repo.Name)
	assert.Equal(t, repo, w.Directory, "the card stays on the launch directory")
}

// newLaunchedSessionIn is seedLiveSession for a real directory.
func newLaunchedSessionIn(t *testing.T, srv *testServer, dir string) *session.Session {
	t.Helper()
	repo, _, err := srv.store.UpsertRepo(context.Background(), store.UpsertRepoParams{Path: dir, Name: filepath.Base(dir), Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	sess, err := srv.manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, Branch: gitutil.Branch(context.Background(), dir),
		PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(t, err)
	final, err := srv.manager.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)
	return final
}
