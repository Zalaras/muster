package server

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// installedCalls records what the installed-version callback was told.
type installedCalls struct{ got []string }

func (c *installedCalls) record(_ context.Context, installed *string) {
	if installed == nil {
		c.got = append(c.got, "<nil>")
		return
	}
	c.got = append(c.got, *installed)
}

// TestClaudeVersion_FollowInstalledIsToldEveryChangedResult: the callback
// runs after each changed result with the installed version (nil for unknown), and not for an
// unchanged one.
func TestClaudeVersion_FollowInstalledIsToldEveryChangedResult(t *testing.T) {
	calls := &installedCalls{}
	f, rig := newVersionFeatureTold(t, time.Hour, nil, calls.record)

	steps := []struct {
		name   string
		id     int64
		report claudecode.VersionReport
		want   []string
	}{
		{"first known result", 1, versionReportFor("2.1.318"), []string{"2.1.318"}},
		{"a new binary landing on the same result", 2, versionReportFor("2.1.318"), []string{"2.1.318"}},
		{"a newer install", 3, versionReportFor("2.1.319"), []string{"2.1.318", "2.1.319"}},
		{"the check fails", 4, unknownVersionReport(), []string{"2.1.318", "2.1.319", "<nil>"}},
		{"it fails again", 5, unknownVersionReport(), []string{"2.1.318", "2.1.319", "<nil>"}},
		{"a rollback", 6, versionReportFor("2.1.300"), []string{"2.1.318", "2.1.319", "<nil>", "2.1.300"}},
	}
	for _, s := range steps {
		rig.set(binaryIdentity(s.id), s.report)
		f.tick(context.Background())
		assert.Equal(t, s.want, calls.got, s.name)
	}
}

// reloadedHeld is a daemon start whose reloaded session carries a stored restart mark: the
// mark is off the wire (not pending, not behind) and in the store until the manager is told
// what is installed.
func reloadedHeld(t *testing.T) (*restartHarness, int64) {
	t.Helper()
	h := newRestartHarness(t)
	id := h.pending("working")
	h.build()
	h.requireHeld(id)
	return h, id
}

// TestClaudeVersion_FirstFailedCheckTellsTheManagerThatInstalledIsUnknown covers a
// daemon start: a pending session reloaded from the row is held off the wire until the manager
// is told the installed version, and a first check that fails is a result like any other —
// the held mark is dropped, in the store too, rather than the wire showing behind and
// restartPending beside claudeCode.installed null.
func TestClaudeVersion_FirstFailedCheckTellsTheManagerThatInstalledIsUnknown(t *testing.T) {
	h, id := reloadedHeld(t)
	f, rig := newVersionFeatureTold(t, time.Hour, nil, h.feature.installedKnown)
	rig.set(binaryIdentity(1), unknownVersionReport())

	f.tick(context.Background())

	got := h.get(id)
	assert.Nil(t, f.Current().Installed, "the daemon's classification is unknown")
	assert.False(t, got.ClaudeBehind, "behind is true only while installed is known")
	assert.False(t, got.RestartPending, "and a pending mark does not outlive it")
	assert.False(t, h.storedMark(id), "the held mark is dropped from the store")
	assert.False(t, h.mgr.IsRestartDue(id))
	assert.Empty(t, h.drain(), "nothing is queued")
}

// TestClaudeVersion_FirstTickToldOnceWhateverItFinds: the manager is told the installed
// version on the first tick even when nothing is known yet — a failed check or a binary that
// cannot be resolved — exactly once, and later unchanged or unresolved looks do not tell it
// again. A first known result is told as before.
func TestClaudeVersion_FirstTickToldOnceWhateverItFinds(t *testing.T) {
	cases := []struct {
		name  string
		setup func(rig *versionRig)
		want  []string
	}{
		{"unresolvable binary", func(rig *versionRig) { rig.setIdentityErr(errors.New("resolving claude on PATH: not found")) }, []string{"<nil>"}},
		{"failed check", func(rig *versionRig) { rig.set(binaryIdentity(1), unknownVersionReport()) }, []string{"<nil>"}},
		{"known result", func(rig *versionRig) { rig.set(binaryIdentity(1), versionReportFor("2.1.318")) }, []string{"2.1.318"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			calls := &installedCalls{}
			f, rig := newVersionFeatureTold(t, time.Hour, nil, calls.record)
			c.setup(rig)

			for range 3 {
				f.tick(context.Background())
			}

			assert.Equal(t, c.want, calls.got)
		})
	}
}

// TestClaudeVersion_UnresolvedBinaryOnFirstTickClearsAReloadedPendingMark is the manager half
// of the unresolved-first-tick path: no claude on PATH is "installed unknown", so a mark
// reloaded from the row and held is dropped, in the store too, and never due.
func TestClaudeVersion_UnresolvedBinaryOnFirstTickClearsAReloadedPendingMark(t *testing.T) {
	h, id := reloadedHeld(t)
	f, rig := newVersionFeatureTold(t, time.Hour, nil, h.feature.installedKnown)
	rig.setIdentityErr(errors.New("resolving claude on PATH: not found"))

	f.tick(context.Background())

	got := h.get(id)
	assert.False(t, got.ClaudeBehind)
	assert.False(t, got.RestartPending)
	assert.False(t, h.storedMark(id), "the held mark is dropped from the store")
	assert.False(t, h.mgr.IsRestartDue(id))
	assert.Empty(t, h.drain(), "nothing is queued")
}

// TestClaudeVersion_UnresolvedAfterKnownDoesNotTellTheManagerAgain: once a result has been
// told, a later unresolved stretch holds the value and says nothing to the manager.
func TestClaudeVersion_UnresolvedAfterKnownDoesNotTellTheManagerAgain(t *testing.T) {
	calls := &installedCalls{}
	f, rig := newVersionFeatureTold(t, time.Hour, nil, calls.record)
	rig.set(binaryIdentity(1), versionReportFor("2.1.318"))
	f.tick(context.Background())

	rig.setIdentityErr(errors.New("dangling symlink"))
	f.tick(context.Background())
	f.tick(context.Background())

	assert.Equal(t, []string{"2.1.318"}, calls.got)
}

// TestNew_FollowsTheInstalledVersionIntoTheManager: the wiring in New — a changed claudeCode
// result reaches the manager, so a session behind the new installed version flips and is
// broadcast.
func TestNew_FollowsTheInstalledVersionIntoTheManager(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	ctx := t.Context()
	repo, _, err := srv.store.UpsertRepo(ctx, store.UpsertRepoParams{Path: t.TempDir(), Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	sess, err := srv.manager.CreateSession(ctx, session.CreateParams{RepoID: repo.ID, Directory: repo.Path, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = srv.manager.RecordLaunch(ctx, sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)
	_, err = srv.manager.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Version: ptrTo("2.1.317")})
	require.NoError(t, err)

	rig := &versionRig{}
	srv.claudeVersion.identify, srv.claudeVersion.check, srv.claudeVersion.broadcast = rig.identify, rig.check, rig.broadcast
	rig.set(binaryIdentity(1), versionReportFor("2.1.318"))
	srv.claudeVersion.tick(ctx)

	got, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.True(t, got.ClaudeBehind, "the manager was told the installed version")

	rig.set(binaryIdentity(2), versionReportFor("2.1.317"))
	srv.claudeVersion.tick(ctx)

	got, _ = srv.manager.Get(sess.ID)
	assert.False(t, got.ClaudeBehind)
}
