package server

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// deadBoundSession is a launched session bound to claudeID, whose Claude Code name is
// claudeName (when non-nil), then ended: the kept-for-resume row Resume works on.
func deadBoundSession(t *testing.T, st *store.Store, mgr *session.Manager, dir, claudeID string, claudeName *string) int64 {
	t.Helper()
	ctx := context.Background()
	repo, _, err := st.UpsertRepo(ctx, store.UpsertRepoParams{Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	sess, err := mgr.CreateSession(ctx, session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(ctx, sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	if claudeName != nil {
		_, err = mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: claudeName})
		require.NoError(t, err)
	}
	_, err = mgr.End(ctx, sess.ID)
	require.NoError(t, err)
	return sess.ID
}

func newResumeTitleLauncher(st *store.Store, mgr *session.Manager, fake *fakeTmux) *sessionLauncher {
	return &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "claude",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}
}

// argvFlagValue returns the element after flag, and whether flag is followed by one.
func argvFlagValue(argv []string, flag string) (string, bool) {
	for i, a := range argv {
		if a == flag && i+1 < len(argv) {
			return argv[i+1], true
		}
	}
	return "", false
}

// TestLauncher_Resume_CarriesTheUnsentTitleAsName covers REQ-6 and edge cases 10 and 12: a
// resume of a dead session whose override is set and differs from Claude's last-known name
// carries it as --name beside --resume and counts as that value's one send (the next prompt
// sends nothing); every other shape resumes with no --name.
func TestLauncher_Resume_CarriesTheUnsentTitleAsName(t *testing.T) {
	tests := []struct {
		name string
		// claudeName is Claude's last-known name on the row; override is the dashboard rename.
		claudeName *string
		override   *string
		// delivered runs TakeTitleToSend before the resume (the send already happened).
		delivered bool
		wantName  string // "" means no --name on the argv
	}{
		{name: "override differing from Claude's name rides --name", claudeName: strPtr("Orig"), override: strPtr("Mine"), wantName: "Mine"},
		{name: "override on a row Claude never named rides --name", override: strPtr("Mine"), wantName: "Mine"},
		{name: "edge 10: no override, no --name", claudeName: strPtr("Orig")},
		{name: "override equal to Claude's name, no --name", claudeName: strPtr("Mine"), override: strPtr("Mine")},
		{name: "override already sent by a prompt, no --name", claudeName: strPtr("Orig"), override: strPtr("Mine"), delivered: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			mgr := newSessionTestManager(t, st)
			fake := newFakeTmux()
			dir := t.TempDir()
			id := deadBoundSession(t, st, mgr, dir, "claude-resume-1", tt.claudeName)
			if tt.override != nil {
				_, err := mgr.SetTitle(context.Background(), id, tt.override)
				require.NoError(t, err)
			}
			if tt.delivered {
				_, send := mgr.TakeTitleToSend(id)
				require.True(t, send)
			}
			l := newResumeTitleLauncher(st, mgr, fake)

			resumed, lerr := l.Resume(context.Background(), id)

			require.Nil(t, lerr)
			require.NotNil(t, resumed)
			argv := fake.lastNewSessionArgv()
			resumeID, hasResume := argvFlagValue(argv, "--resume")
			require.True(t, hasResume)
			assert.Equal(t, "claude-resume-1", resumeID)
			name, hasName := argvFlagValue(argv, "--name")
			assert.Equal(t, tt.wantName != "", hasName, "argv %v", argv)
			assert.Equal(t, tt.wantName, name)
			if hasName {
				// --name sits straight after --resume <id> (BuildArgv's documented order).
				i := indexOf(argv, "--resume")
				assert.Equal(t, []string{"--resume", "claude-resume-1", "--name", tt.wantName}, argv[i:i+4])
			}

			// The resume was the one send: the next prompt carries nothing.
			_, send := mgr.TakeTitleToSend(id)
			assert.False(t, send, "after the resume the override must not be sent again")
			_, pending := mgr.PendingTitle(id)
			assert.False(t, pending)
		})
	}
}

func indexOf(s []string, v string) int {
	for i, e := range s {
		if e == v {
			return i
		}
	}
	return -1
}

// TestLauncher_Resume_AFailedSpawnDoesNotSpendTheSend covers REQ-6's "counts as that value's
// one send": only a resume that actually spawned counts, so a spawn that failed leaves the
// override for the next resume or prompt.
func TestLauncher_Resume_AFailedSpawnDoesNotSpendTheSend(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	fake.newSessionErr = errors.New("tmux refused")
	id := deadBoundSession(t, st, mgr, t.TempDir(), "claude-resume-fail", strPtr("Orig"))
	_, err := mgr.SetTitle(context.Background(), id, strPtr("Mine"))
	require.NoError(t, err)
	l := newResumeTitleLauncher(st, mgr, fake)

	_, lerr := l.Resume(context.Background(), id)

	require.NotNil(t, lerr)
	title, pending := mgr.PendingTitle(id)
	assert.True(t, pending, "the send is still owed")
	assert.Equal(t, "Mine", title)
}

// TestLauncher_Resume_OnlyTheResumedSessionSpendsItsSend: two dead sessions each with a
// pending rename; resuming one leaves the other's untouched.
func TestLauncher_Resume_OnlyTheResumedSessionSpendsItsSend(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	first := deadBoundSession(t, st, mgr, t.TempDir(), "claude-one", strPtr("Orig One"))
	second := deadBoundSession(t, st, mgr, t.TempDir(), "claude-two", strPtr("Orig Two"))
	_, err := mgr.SetTitle(context.Background(), first, strPtr("Mine One"))
	require.NoError(t, err)
	_, err = mgr.SetTitle(context.Background(), second, strPtr("Mine Two"))
	require.NoError(t, err)
	l := newResumeTitleLauncher(st, mgr, fake)

	_, lerr := l.Resume(context.Background(), first)
	require.Nil(t, lerr)

	name, _ := argvFlagValue(fake.lastNewSessionArgv(), "--name")
	assert.Equal(t, "Mine One", name)
	_, pendingFirst := mgr.PendingTitle(first)
	assert.False(t, pendingFirst)
	title, pendingSecond := mgr.PendingTitle(second)
	assert.True(t, pendingSecond, "the other session's rename is still owed")
	assert.Equal(t, "Mine Two", title)
}
