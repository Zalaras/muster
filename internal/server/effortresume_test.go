package server

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// effortReport is what an effort-carrying status post says: none (no post at all), a level,
// or the no-effort-setting reading.
type effortReport struct {
	posted bool
	level  *string
}

// deadEffortSession is a launched, bound session that launched asking for requested ("" =
// a default launch), received report as its status posts, and was then ended: the row the
// Resume button works on.
func deadEffortSession(t *testing.T, st *store.Store, mgr *session.Manager, dir, requested string, reports ...effortReport) int64 {
	t.Helper()
	ctx := context.Background()
	repo, _, err := st.UpsertRepo(ctx, store.UpsertRepoParams{Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	sess, err := mgr.CreateSession(ctx, session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", EffortRequested: requested,
	})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(ctx, sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, sess.ID, "claude-effort-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	for _, r := range reports {
		if r.posted {
			_, err = mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Effort: &claudecode.StatusEffort{Level: r.level}})
			require.NoError(t, err)
		}
	}
	_, err = mgr.End(ctx, sess.ID)
	require.NoError(t, err)
	return sess.ID
}

// TestLauncher_Resume_PassesTheRowsEffortAsFlag covers D9/REQ-10: the Resume button's
// argv carries --effort <level> iff the row's level is non-null, after --permission-mode;
// afterwards effort and warning are exactly what they were.
func TestLauncher_Resume_PassesTheRowsEffortAsFlag(t *testing.T) {
	high, medium := "high", "medium"
	tests := []struct {
		name        string
		requested   string
		reports     []effortReport
		wantFlag    string
		wantKnown   bool
		wantWarning bool
	}{
		{name: "reported medium", reports: []effortReport{{true, &medium}}, wantFlag: "medium", wantKnown: true},
		{name: "never reported", wantKnown: false},
		{name: "reported with no effort setting", reports: []effortReport{{true, nil}}, wantKnown: true},
		{name: "warned: the flag is the level it ran at, not the one asked for", requested: "max", reports: []effortReport{{true, &high}}, wantFlag: "high", wantKnown: true, wantWarning: true},
		{name: "changed mid-session: the latest level", requested: "high", reports: []effortReport{{true, &high}, {true, &medium}}, wantFlag: "medium", wantKnown: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			mgr := newSessionTestManager(t, st)
			fake := newFakeTmux()
			id := deadEffortSession(t, st, mgr, t.TempDir(), tt.requested, tt.reports...)
			before, ok := mgr.Get(id)
			require.True(t, ok)
			l := newResumeTitleLauncher(st, mgr, fake)

			resumed, lerr := l.Resume(context.Background(), id)

			require.Nil(t, lerr)
			argv := fake.lastNewSessionArgv()
			flag, has := argvFlagValue(argv, "--effort")
			assert.Equal(t, tt.wantFlag != "", has, "argv %v", argv)
			assert.Equal(t, tt.wantFlag, flag)
			if has {
				i := indexOf(argv, "--permission-mode")
				require.GreaterOrEqual(t, i, 0)
				assert.Equal(t, []string{"--permission-mode", "default", "--effort", tt.wantFlag}, argv[i:], "--effort follows --permission-mode")
			}
			assert.Equal(t, before.Effort, resumed.Effort, "the resumed row keeps its effort until the next report")
			assert.Equal(t, before.EffortWarning, resumed.EffortWarning)
			assert.Equal(t, tt.wantWarning, resumed.EffortWarning != nil)
			assert.Equal(t, tt.wantKnown, resumed.Effort != nil)
		})
	}
}

// TestLauncher_Resume_CancelsAPendingFirstReportCheck covers D9's "no check is pending"
// and edge case 11: a session that never reported before it ended and is resumed from the
// button raises no warning when its first report arrives.
func TestLauncher_Resume_CancelsAPendingFirstReportCheck(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	id := deadEffortSession(t, st, mgr, t.TempDir(), "max")
	l := newResumeTitleLauncher(st, mgr, newFakeTmux())
	_, lerr := l.Resume(context.Background(), id)
	require.Nil(t, lerr)

	got, err := mgr.ApplyStatus(context.Background(), id, claudecode.StatusUpdate{Effort: &claudecode.StatusEffort{Level: ptrTo("high")}})
	require.NoError(t, err)

	assert.Nil(t, got.EffortWarning)
	require.NotNil(t, got.Effort)
	assert.Equal(t, ptrTo("high"), got.Effort.Level)
}

// TestLauncher_LaunchResume_Effort covers D12/REQ-11: the transcript's last assistant
// effort reaches the argv after --permission-mode and seeds the row's effort with no check
// pending; a transcript that recorded none sends no flag and seeds null; the repo row's
// lastEffort is left as it was, and a new repo row gets null.
func TestLauncher_LaunchResume_Effort(t *testing.T) {
	tests := []struct {
		name       string
		assistant  []string
		wantFlag   string
		wantEffort *string
	}{
		{name: "the last recorded level wins", assistant: []string{claudecodetest.AssistantEffortLine("claude-opus-4-5", "high"), claudecodetest.AssistantEffortLine("claude-opus-4-5", "medium")}, wantFlag: "medium", wantEffort: ptrTo("medium")},
		{name: "a session with no completed turn records none", assistant: nil},
		{name: "assistant lines without the key record none", assistant: []string{claudecodetest.AssistantModelLine("claude-haiku-4-5")}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			mgr := newSessionTestManager(t, st)
			fake := newFakeTmux()
			projectsRoot := t.TempDir()
			dir := t.TempDir()
			lines := append([]string{claudecodetest.CwdLine(resolvedCwd(t, dir)), claudecodetest.PermissionModeTranscriptLine("plan")}, tt.assistant...)
			claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-past", lines...)
			l := newResumeLauncher(st, mgr, fake, projectsRoot)

			sess, lerr := l.Launch(context.Background(), createSessionRequest{Directory: dir, ResumeSessionID: strPtr("claude-past")})

			require.Nil(t, lerr)
			argv := fake.lastNewSessionArgv()
			flag, has := argvFlagValue(argv, "--effort")
			assert.Equal(t, tt.wantFlag != "", has, "argv %v", argv)
			assert.Equal(t, tt.wantFlag, flag)
			if has {
				i := indexOf(argv, "--permission-mode")
				require.GreaterOrEqual(t, i, 0)
				assert.Equal(t, []string{"--permission-mode", "plan", "--effort", tt.wantFlag}, argv[i:])
			}
			if tt.wantEffort == nil {
				assert.Nil(t, sess.Effort)
			} else {
				require.NotNil(t, sess.Effort)
				assert.Equal(t, tt.wantEffort, sess.Effort.Level)
			}
			assert.Nil(t, sess.EffortWarning)

			got, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Effort: &claudecode.StatusEffort{Level: ptrTo("low")}})
			require.NoError(t, err)
			assert.Nil(t, got.EffortWarning, "a Resume-tab resume starts no first-report check")

			repo, err := st.GetRepo(context.Background(), sess.RepoID)
			require.NoError(t, err)
			assert.Nil(t, repo.LastEffort, "a repo row created by a Resume-tab resume has no remembered effort")
		})
	}
}

// TestLauncher_LaunchResume_LeavesTheRepoLastEffortAlone: a directory last launched at xhigh
// still reads xhigh after a Resume-tab resume of a session recorded at medium, as
// lastModel and lastPermissionMode are left alone.
func TestLauncher_LaunchResume_LeavesTheRepoLastEffortAlone(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	projectsRoot := t.TempDir()
	dir := t.TempDir()
	_, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{Path: dir, Name: "proj", Model: "opus", PermissionMode: "auto", Effort: ptrTo("xhigh")})
	require.NoError(t, err)
	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-past", claudecodetest.CwdLine(resolvedCwd(t, dir)), claudecodetest.AssistantEffortLine("claude-opus-4-5", "medium"))
	l := newResumeLauncher(st, mgr, newFakeTmux(), projectsRoot)

	sess, lerr := l.Launch(context.Background(), createSessionRequest{Directory: dir, ResumeSessionID: strPtr("claude-past")})

	require.Nil(t, lerr)
	repo, err := st.GetRepo(context.Background(), sess.RepoID)
	require.NoError(t, err)
	assert.Equal(t, ptrTo("xhigh"), repo.LastEffort)
	assert.Equal(t, 2, repo.LaunchCount, "the resume still advances the MRU position")
}
