package server

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
)

// postAdded reports dirs the way a status post does: led by the launch directory, spelled
// as given.
func (e *pollEnv) postAdded(t *testing.T, id int64, launch string, dirs ...string) {
	t.Helper()
	list := append([]string{launch}, dirs...)
	_, err := e.mgr.ApplyStatus(context.Background(), id, claudecode.StatusUpdate{AddedDirs: &list})
	require.NoError(t, err)
}

func repoReading(name, branch string, isWorktree bool) *session.LocationRepo {
	return &session.LocationRepo{Name: name, Branch: branch, IsWorktree: isWorktree}
}

// TestRepoPoll_AddedDirsGetTheirReading is D9 and D15 / REQ-5, REQ-5a: a directory is listed
// with a null repo by the status post that reports it, even when it is a git checkout (no git
// runs on the status path); one tick reads each (name of the checkout's top level, branch,
// worktree flag, null for a plain directory or a detached HEAD); an unchanged tick broadcasts
// nothing; a checkout made later shows on the next tick as one upsert.
func TestRepoPoll_AddedDirsGetTheirReading(t *testing.T) {
	launch := newGitCheckout(t, "muster")
	infra := newGitCheckout(t, "infra")
	infraWT := filepath.Join(resolvedTempDir(t), "infra-wt")
	bobGit(t, infra, "worktree", "add", "-q", "-b", "wt-branch", infraWT)
	plain := resolvedTempDir(t)
	detached := newGitCheckout(t, "detached")
	bobGit(t, detached, "checkout", "-q", "--detach")

	e := newPollEnv(t)
	id := e.add(t, launch)
	e.tick()
	n := e.upsertCount()

	e.postAdded(t, id, launch, infra, infraWT, plain, detached)

	got := e.get(t, id).AddedDirs
	require.Len(t, got, 4, "every directory is on the wire from the post that reports it")
	for _, d := range got {
		assert.Nil(t, d.Repo, "D15: no reading before the poll, though %s may be a checkout", d.Directory)
	}
	assert.Equal(t, n+1, e.upsertCount(), "the status post is one upsert")

	e.tick()

	assert.Equal(t, []session.Location{
		{Directory: infra, Repo: repoReading("infra", "main", false)},
		{Directory: infraWT, Repo: repoReading("infra-wt", "wt-branch", true)},
		{Directory: plain},
		{Directory: detached},
	}, e.get(t, id).AddedDirs)
	assert.Equal(t, n+2, e.upsertCount(), "the readings arrive as a single upsert")

	e.tick()
	assert.Equal(t, n+2, e.upsertCount(), "an unchanged tick broadcasts nothing")

	bobGit(t, infra, "checkout", "-q", "-b", "feat-x")
	e.tick()
	assert.Equal(t, repoReading("infra", "feat-x", false), e.get(t, id).AddedDirs[0].Repo)
	assert.Equal(t, n+3, e.upsertCount(), "a checkout in an added directory is one upsert on the next tick")
	assert.Equal(t, "main", branchOf(t, e.get(t, id)), "the launch directory's own reading is unaffected")
}

func mkSubdir(t *testing.T, dir, name string) string {
	t.Helper()
	sub := filepath.Join(dir, name)
	require.NoError(t, os.MkdirAll(sub, 0o755))
	return sub
}

// TestRepoPoll_AddedDirGoneKeepsItsLastReading is D9's last clause / edge case 12: a directory
// that was deleted, or replaced by a file, stays listed with the reading it had, and nothing
// is broadcast.
func TestRepoPoll_AddedDirGoneKeepsItsLastReading(t *testing.T) {
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
			launch := newGitCheckout(t, "muster")
			infra := newGitCheckout(t, "infra")
			other := newGitCheckout(t, "other")
			e := newPollEnv(t)
			id := e.add(t, launch)
			e.postAdded(t, id, launch, infra, other)
			bobGit(t, infra, "checkout", "-q", "-b", "feat-x")
			e.tick()
			require.Equal(t, repoReading("infra", "feat-x", false), e.get(t, id).AddedDirs[0].Repo, "fixture: read")
			n := e.upsertCount()

			tc.breakDir(t, infra)
			e.tick()

			got := e.get(t, id).AddedDirs
			require.Len(t, got, 2, "the directory stays listed: Claude still reports it")
			assert.Equal(t, session.Location{Directory: infra, Repo: repoReading("infra", "feat-x", false)}, got[0])
			assert.Equal(t, repoReading("other", "main", false), got[1].Repo, "the others in the same tick are read")
			assert.Equal(t, n, e.upsertCount())
		})
	}
}

// TestRepoPoll_AddedDirsAreReadPerAliveSession: each session's directories are read for it
// alone; a dead session has none and stays untouched in a tick that did run; the same
// directory added to two sessions is read for both.
func TestRepoPoll_AddedDirsAreReadPerAliveSession(t *testing.T) {
	ctx := context.Background()
	launchA := newGitCheckout(t, "alpha")
	launchB := newGitCheckout(t, "beta")
	launchDead := newGitCheckout(t, "gamma")
	shared := newGitCheckout(t, "shared")
	onlyB := newGitCheckout(t, "only-b")
	e := newPollEnv(t)
	a, b, dead := e.add(t, launchA), e.add(t, launchB), e.add(t, launchDead)
	e.postAdded(t, a, launchA, shared)
	e.postAdded(t, b, launchB, shared, onlyB)
	e.postAdded(t, dead, launchDead, shared)
	_, err := e.mgr.End(ctx, dead)
	require.NoError(t, err)
	require.Empty(t, e.get(t, dead).AddedDirs, "fixture: INV-1")
	deadBefore := e.get(t, dead)
	n := e.upsertCount()

	e.tick()

	assert.Equal(t, []session.Location{{Directory: shared, Repo: repoReading("shared", "main", false)}}, e.get(t, a).AddedDirs)
	assert.Equal(t, []session.Location{
		{Directory: shared, Repo: repoReading("shared", "main", false)},
		{Directory: onlyB, Repo: repoReading("only-b", "main", false)},
	}, e.get(t, b).AddedDirs)
	assert.Equal(t, deadBefore, e.get(t, dead), "the dead session is not read and not touched")
	assert.ElementsMatch(t, []int64{a, b}, e.upsertIDsSince(n))

	bobGit(t, onlyB, "checkout", "-q", "-b", "feat-b")
	m := e.upsertCount()
	e.tick()
	assert.Equal(t, []int64{b}, e.upsertIDsSince(m), "only the session that lists the changed directory broadcasts")
	assert.Equal(t, "main", e.get(t, a).AddedDirs[0].Repo.Branch)
}

// TestRepoPoll_RestartRereadsAddedDirs is D8 / E4's daemon half and edge case 10: the paths
// come back from the store with no reading, and the start-up tick (which runs even with
// -repo-poll 0) reads them.
func TestRepoPoll_RestartRereadsAddedDirs(t *testing.T) {
	ctx := context.Background()
	launch := newGitCheckout(t, "muster")
	infra := newGitCheckout(t, "infra")
	plain := resolvedTempDir(t)
	st := openLauncherTestStore(t)
	first := newPollEnvOnStore(t, st, 0)
	id := first.add(t, launch)
	first.postAdded(t, id, launch, infra, plain)
	first.tick()
	require.Equal(t, repoReading("infra", "main", false), first.get(t, id).AddedDirs[0].Repo, "fixture: read before the restart")

	second := newPollEnvOnStore(t, st, 0)
	require.NoError(t, second.mgr.LoadAll(ctx))

	assert.Equal(t, []session.Location{{Directory: infra}, {Directory: plain}}, second.get(t, id).AddedDirs, "paths survive, readings do not")

	second.tick()

	assert.Equal(t, []session.Location{{Directory: infra, Repo: repoReading("infra", "main", false)}, {Directory: plain}}, second.get(t, id).AddedDirs)
}

// TestRepoPoll_AddedDirsNudgeReadsThemAtOnce is REQ-5's "at once when the list changes": with
// no timer, a status post that adds a directory wakes the loop, and the reading follows the
// post's own upsert without waiting for a tick.
func TestRepoPoll_AddedDirsNudgeReadsThemAtOnce(t *testing.T) {
	launch := newGitCheckout(t, "muster")
	infra := newGitCheckout(t, "infra")
	e := newPollEnv(t)
	id := e.add(t, launch)
	e.feature.Start()
	t.Cleanup(func() { e.feature.Stop(context.Background()) })
	e.tick()
	for len(e.signal) > 0 {
		<-e.signal
	}
	n := e.upsertCount()

	e.postAdded(t, id, launch, infra)
	e.waitUpsert(t)
	e.waitUpsert(t)

	assert.Equal(t, repoReading("infra", "main", false), e.get(t, id).AddedDirs[0].Repo)
	assert.Equal(t, n+2, e.upsertCount(), "the post's upsert, then the reading's")
}

// TestReadAddedRepos is the git half as a table: a checkout reads as its top level's name and
// branch, a plain directory and a detached HEAD read as present-but-null (so a stale branch is
// cleared), and a directory that is gone is left out so its last reading is kept.
func TestReadAddedRepos(t *testing.T) {
	infra := newGitCheckout(t, "infra")
	plain := resolvedTempDir(t)
	detached := newGitCheckout(t, "detached")
	bobGit(t, detached, "checkout", "-q", "--detach")
	gone := filepath.Join(resolvedTempDir(t), "gone")
	file := filepath.Join(resolvedTempDir(t), "file")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o644))

	cases := []struct {
		name string
		dirs []string
		want map[string]*session.LocationRepo
	}{
		{"no directories reads nothing", nil, nil},
		{"a checkout", []string{infra}, map[string]*session.LocationRepo{infra: repoReading("infra", "main", false)}},
		{"a plain directory is present with a nil repo", []string{plain}, map[string]*session.LocationRepo{plain: nil}},
		{"a detached HEAD is present with a nil repo", []string{detached}, map[string]*session.LocationRepo{detached: nil}},
		{"a missing directory is absent", []string{gone}, map[string]*session.LocationRepo{}},
		{"a file is absent", []string{file}, map[string]*session.LocationRepo{}},
		{
			"a mix keeps each verdict apart", []string{gone, infra, plain},
			map[string]*session.LocationRepo{infra: repoReading("infra", "main", false), plain: nil},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, readAddedRepos(context.Background(), tc.dirs))
		})
	}
}

// TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel is REQ-5's reading of a directory
// inside a checkout: the checkout's folder name and branch (the top level's basename, not the
// subdirectory's), and the checkout's worktree flag, not a property of where git ran: false
// under an ordinary checkout, true under a linked worktree.
func TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel(t *testing.T) {
	infra := newGitCheckout(t, "infra")
	infraWT := filepath.Join(resolvedTempDir(t), "infra-wt")
	bobGit(t, infra, "worktree", "add", "-q", "-b", "wt-branch", infraWT)

	cases := []struct {
		name string
		sub  string
		want *session.LocationRepo
	}{
		{"ordinary checkout, one level down", mkSubdir(t, infra, "pkg"), repoReading("infra", "main", false)},
		{"ordinary checkout, two levels down", mkSubdir(t, mkSubdir(t, infra, "pkg"), "deep"), repoReading("infra", "main", false)},
		{"linked worktree, one level down", mkSubdir(t, infraWT, "pkg"), repoReading("infra-wt", "wt-branch", true)},
		{"linked worktree, two levels down", mkSubdir(t, mkSubdir(t, infraWT, "pkg"), "deep"), repoReading("infra-wt", "wt-branch", true)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := readAddedRepos(context.Background(), []string{tc.sub})

			require.Contains(t, got, tc.sub)
			assert.Equal(t, tc.want, got[tc.sub])
		})
	}
}

// TestReadAddedRepos_MoreDirectoriesThanWorkers: a list longer than addedReadWorkers reads
// every entry (a slot freed by one read admits the next), each under its own key.
func TestReadAddedRepos_MoreDirectoriesThanWorkers(t *testing.T) {
	root := resolvedTempDir(t)
	want := make(map[string]*session.LocationRepo)
	var dirs []string
	for i := range 3 * addedReadWorkers {
		dir := mkSubdir(t, root, fmt.Sprintf("d%02d", i))
		dirs = append(dirs, dir)
		want[dir] = nil
	}

	assert.Equal(t, want, readAddedRepos(context.Background(), dirs))
}

// TestReadAddedRepos_ExpiredContextLeavesEveryDirectoryOut: a read whose deadline has passed
// cannot tell "not a checkout" from a killed git, so no directory is reported and each keeps
// its last-known reading at apply.
func TestReadAddedRepos_ExpiredContextLeavesEveryDirectoryOut(t *testing.T) {
	infra := newGitCheckout(t, "infra")
	plain := resolvedTempDir(t)
	expired, cancel := context.WithCancel(context.Background())
	cancel()

	assert.Empty(t, readAddedRepos(expired, []string{infra, plain}))
}

// fakeGitWedgingIn puts a `git` first on $PATH that hangs when run in a directory named
// "wedge" and otherwise runs the real git. The daemon's git runs have no seam in package
// server, so the wedge has to be a binary.
func fakeGitWedgingIn(t *testing.T) {
	t.Helper()
	realGit, err := exec.LookPath("git")
	require.NoError(t, err)
	dir := t.TempDir()
	script := "#!/bin/sh\ncase \"$(pwd)\" in */wedge) exec sleep 60;; esac\nexec " + realGit + " \"$@\"\n"
	require.NoError(t, os.WriteFile(filepath.Join(dir, "git"), []byte(script), 0o755))
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

// TestReadRepoState_WedgedAddedDirectoryKeepsTheLaunchReading is the browser review's long-list
// regression: the added directories are read under their own deadline, so one that outlasts it
// (here two wedged checkouts; a few hundred slow ones do the same) leaves the launch
// directory's reading trusted (ok true, its moved branch applies), keeps the readable
// siblings, and leaves the unread directories out so they keep their last-known reading.
// It shortens repoReadTimeout; safe because t.Setenv keeps it out of the parallel phase.
func TestReadRepoState_WedgedAddedDirectoryKeepsTheLaunchReading(t *testing.T) {
	old := repoReadTimeout
	repoReadTimeout = 1500 * time.Millisecond
	t.Cleanup(func() { repoReadTimeout = old })
	launch := newGitCheckout(t, "muster")
	bobGit(t, launch, "checkout", "-q", "-b", "moved")
	infra := newGitCheckout(t, "infra")
	plain := resolvedTempDir(t)
	wedgeA := newGitCheckout(t, "wedge")
	wedgeB := newGitCheckout(t, "wedge")
	fakeGitWedgingIn(t)
	target := session.RepoTarget{Directory: launch, AddedDirs: []string{wedgeA, infra, wedgeB, plain}}

	start := time.Now()
	state, ok := readRepoState(context.Background(), target)
	elapsed := time.Since(start)

	require.GreaterOrEqual(t, elapsed, repoReadTimeout-time.Second, "fixture: the added read ran to its deadline")
	assert.True(t, ok, "the added read's deadline does not discard the launch directory's reading")
	require.NotNil(t, state.Branch)
	assert.Equal(t, "moved", *state.Branch)
	assert.Equal(t, map[string]*session.LocationRepo{infra: repoReading("infra", "main", false), plain: nil}, state.AddedRepos,
		"readable siblings apply; the wedged directories are absent, so they keep their last-known reading")
}

// TestReadRepoState_CarriesTheAddedDirsReading: the per-session reading includes the added
// directories of its target and nothing for a target without any.
func TestReadRepoState_CarriesTheAddedDirsReading(t *testing.T) {
	launch := newGitCheckout(t, "muster")
	infra := newGitCheckout(t, "infra")

	with, ok := readRepoState(context.Background(), session.RepoTarget{Directory: launch, AddedDirs: []string{infra}})
	without, ok2 := readRepoState(context.Background(), session.RepoTarget{Directory: launch})

	require.True(t, ok)
	require.True(t, ok2)
	assert.Equal(t, map[string]*session.LocationRepo{infra: repoReading("infra", "main", false)}, with.AddedRepos)
	assert.Empty(t, without.AddedRepos)
}

// TestNew_AddedDirsChangeNudgesTheRepoPoll: server.New wires the manager's nudge for a changed
// list as it does for a moved directory; an unchanged list does not nudge.
func TestNew_AddedDirsChangeNudgesTheRepoPoll(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := seedLiveSession(t, srv)
	post := func(dirs ...string) {
		t.Helper()
		list := append([]string{sess.Directory}, dirs...)
		_, err := srv.manager.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{AddedDirs: &list})
		require.NoError(t, err)
	}
	require.Empty(t, srv.repoRefresh.refresh, "fixture: nothing pending")

	post("/work/infra")
	assert.Len(t, srv.repoRefresh.refresh, 1, "a changed list nudges")

	<-srv.repoRefresh.refresh
	post("/work/infra")
	assert.Empty(t, srv.repoRefresh.refresh, "an unchanged list does not")
}
