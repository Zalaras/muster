package server

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// strPtr is this file's own helper for a createSessionRequest.ResumeSessionID literal —
// the field is a *string precisely so an absent JSON key differs from an explicit empty
// one (launcher.go's own doc comment on createSessionRequest).
func strPtr(s string) *string { return &s }

// resolvedCwd resolves dir's symlinks exactly like claudecode.PastSessions does before
// comparing a transcript's own cwd line — on macOS t.TempDir() sits under /var/folders,
// itself a symlink to /private/var/folders, so a fixture's cwd line must record the
// resolved form or it silently matches nothing.
func resolvedCwd(t *testing.T, dir string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(dir)
	require.NoError(t, err)
	return resolved
}

// TestValidateResumeRequest covers D14 and the directory-rules prefix it shares with the
// ordinary form's validateLaunchRequest — the resume form's pure prefix, checked with no
// launcher state at all.
func TestValidateResumeRequest(t *testing.T) {
	realDir := t.TempDir()

	tests := []struct {
		name    string
		req     createSessionRequest
		wantErr string // substring of the expected message; "" means nil (accepted)
	}{
		{
			name:    "missing directory",
			req:     createSessionRequest{ResumeSessionID: strPtr("abc")},
			wantErr: "directory must be an absolute path",
		},
		{
			name:    "relative directory",
			req:     createSessionRequest{Directory: "relative/dir", ResumeSessionID: strPtr("abc")},
			wantErr: "directory must be an absolute path",
		},
		{
			name:    "non-existent directory",
			req:     createSessionRequest{Directory: "/this/does/not/exist/anywhere", ResumeSessionID: strPtr("abc")},
			wantErr: "directory does not exist or is not a directory",
		},
		{
			name:    "empty resumeSessionId",
			req:     createSessionRequest{Directory: realDir, ResumeSessionID: strPtr("")},
			wantErr: "resumeSessionId must not be empty",
		},
		{
			name:    "resumeSessionId combined with title",
			req:     createSessionRequest{Directory: realDir, ResumeSessionID: strPtr("abc"), Title: "My Title"},
			wantErr: "resumeSessionId cannot be combined with title, model or permissionMode",
		},
		{
			name:    "resumeSessionId combined with model",
			req:     createSessionRequest{Directory: realDir, ResumeSessionID: strPtr("abc"), Model: "sonnet"},
			wantErr: "resumeSessionId cannot be combined with title, model or permissionMode",
		},
		{
			name:    "resumeSessionId combined with permissionMode",
			req:     createSessionRequest{Directory: realDir, ResumeSessionID: strPtr("abc"), PermissionMode: "default"},
			wantErr: "resumeSessionId cannot be combined with title, model or permissionMode",
		},
		{
			name: "a clean request is accepted",
			req:  createSessionRequest{Directory: realDir, ResumeSessionID: strPtr("abc")},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lerr := validateResumeRequest(tt.req)
			if tt.wantErr == "" {
				assert.Nil(t, lerr)
				return
			}
			require.NotNil(t, lerr)
			assert.Equal(t, "invalid_request", lerr.code)
			assert.Equal(t, tt.wantErr, lerr.message)
		})
	}
}

func TestFindPastSession(t *testing.T) {
	sessions := []claudecode.PastSession{{ClaudeSessionID: "a"}, {ClaudeSessionID: "b"}}

	found, ok := findPastSession(sessions, "b")
	require.True(t, ok)
	assert.Equal(t, "b", found.ClaudeSessionID)

	_, ok = findPastSession(sessions, "c")
	assert.False(t, ok)

	_, ok = findPastSession(nil, "a")
	assert.False(t, ok)
}

// newResumeLauncher builds a sessionLauncher wired for the resume-from-list branch:
// store+manager+fakeTmux like the rest of this package's launcher tests, plus
// projectsDir so launchResume's claudecode.PastSessions read has somewhere to look.
func newResumeLauncher(st *store.Store, mgr *session.Manager, fake *fakeTmux, projectsDir string) *sessionLauncher {
	return &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true", projectsDir: projectsDir,
	}
}

// TestLauncher_LaunchResume_SpawnsResumeArgvAndSeedsFromListing covers D9: the argv
// carries --resume <id> and the transcript's own permission mode, no --model and no
// --name, and the returned session is seeded from the listing (title, model, mode).
func TestLauncher_LaunchResume_SpawnsResumeArgvAndSeedsFromListing(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	projectsRoot := t.TempDir()
	dir := t.TempDir()

	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-abc",
		claudecodetest.CwdLine(resolvedCwd(t, dir)),
		claudecodetest.CustomTitleLine("My Old Session"),
		claudecodetest.PermissionModeTranscriptLine("plan"),
		claudecodetest.AssistantModelLine("claude-opus-4"),
	)

	l := newResumeLauncher(st, mgr, fake, projectsRoot)

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-abc"),
	})

	require.Nil(t, lerr)
	require.NotNil(t, sess)
	require.NotNil(t, sess.Title)
	assert.Equal(t, "My Old Session", *sess.Title)
	require.NotNil(t, sess.Model)
	assert.Equal(t, "claude-opus-4", sess.Model.ID)
	assert.Equal(t, session.PermissionMode("plan"), sess.PermissionMode)
	assert.Equal(t, "seed", sess.PermissionModeSource)
	assert.True(t, sess.FirstLaunchHere)

	argv := fake.lastNewSessionArgv()
	require.NotEmpty(t, argv)
	assert.NotContains(t, argv, "--model", "REQ-10: a resume-from-list never names a model")
	assert.NotContains(t, argv, "--name", "REQ-10: a resume-from-list never names a title")
	assert.Contains(t, argv, "--resume")
	assert.Contains(t, argv, "claude-abc")
	assert.Contains(t, argv, "--permission-mode")
	assert.Contains(t, argv, "plan")
}

// TestLauncher_LaunchResume_RecordedUnofferedModeReachesArgvVerbatim covers the settled
// resume-passes-any-recorded-mode decision: a transcript-recorded permission mode the
// launch form itself never offers (kb:adr/launch-bypass-and-dontask-unoffered's
// "dontAsk") still reaches argv unchanged, rather than falling back to "default" the way
// an unrecognized mode used to.
func TestLauncher_LaunchResume_RecordedUnofferedModeReachesArgvVerbatim(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	projectsRoot := t.TempDir()
	dir := t.TempDir()

	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-dontask",
		claudecodetest.CwdLine(resolvedCwd(t, dir)),
		claudecodetest.PermissionModeTranscriptLine("dontAsk"),
	)

	l := newResumeLauncher(st, mgr, fake, projectsRoot)

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-dontask"),
	})

	require.Nil(t, lerr)
	assert.Equal(t, session.PermissionMode("dontAsk"), sess.PermissionMode)

	argv := fake.lastNewSessionArgv()
	require.NotEmpty(t, argv)
	assert.Contains(t, argv, "--permission-mode")
	assert.Contains(t, argv, "dontAsk")
}

// TestLauncher_LaunchResume_NoRecordedModeOrModeSeedsDefaultAndNilModel covers D9/D16's
// converse and REQ-10's "default when it records none": a fixture with no
// permission-mode or assistant-model line at all still spawns a --permission-mode
// default and seeds a nil Model, not a Model with an empty id
// (kb:adr/usage-unknown-renders-word-not-track via CreateSession's own nil-model fix).
func TestLauncher_LaunchResume_NoRecordedModeOrModeSeedsDefaultAndNilModel(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	projectsRoot := t.TempDir()
	dir := t.TempDir()

	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-bare", claudecodetest.CwdLine(resolvedCwd(t, dir)))

	l := newResumeLauncher(st, mgr, fake, projectsRoot)

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-bare"),
	})

	require.Nil(t, lerr)
	assert.Nil(t, sess.Title)
	assert.Nil(t, sess.Model, "D16: no assistant-model line recorded must seed a nil Model, not one with an empty id")
	assert.Equal(t, session.PermissionMode("default"), sess.PermissionMode)

	argv := fake.lastNewSessionArgv()
	assert.Contains(t, argv, "--permission-mode")
	assert.Contains(t, argv, "default")
}

// TestLauncher_LaunchResume_UnknownIDIs404AndWritesNothing covers D10: a
// resumeSessionId naming no transcript in the directory's listing is refused before any
// repo row is touched or session row created.
func TestLauncher_LaunchResume_UnknownIDIs404AndWritesNothing(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	projectsRoot := t.TempDir()
	dir := t.TempDir()
	// The directory has past sessions, just never this id.
	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-real", claudecodetest.CwdLine(resolvedCwd(t, dir)))

	l := newResumeLauncher(st, mgr, fake, projectsRoot)

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-nonexistent"),
	})

	require.NotNil(t, lerr)
	assert.Equal(t, 404, lerr.status)
	assert.Equal(t, "unknown_claude_session", lerr.code)

	repos, err := st.ListRepos(context.Background())
	require.NoError(t, err)
	assert.Empty(t, repos, "D10: nothing must be written for an unknown resumeSessionId")
	assert.Equal(t, 0, fake.newSessionCalls, "D10: tmux must never be touched for an unknown resumeSessionId")
}

// TestLauncher_LaunchResume_AlreadyOpenIs409WithID covers D11: a resumeSessionId
// already bound to an alive Muster session is refused before any new row is written,
// and the envelope names the alive session's own id.
func TestLauncher_LaunchResume_AlreadyOpenIs409WithID(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	projectsRoot := t.TempDir()
	dir := t.TempDir()
	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-open", claudecodetest.CwdLine(resolvedCwd(t, dir)))

	// Bind an alive session to "claude-open" first (a real launch, or an earlier resume).
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	openSess, err := mgr.CreateSession(context.Background(), session.CreateParams{RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), openSess.ID, fmt.Sprintf("muster-%d:@1", openSess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), openSess.ID, "claude-open", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	l := newResumeLauncher(st, mgr, fake, projectsRoot)

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-open"),
	})

	require.NotNil(t, lerr)
	assert.Equal(t, 409, lerr.status)
	assert.Equal(t, "already_open", lerr.code)
	require.NotNil(t, lerr.id)
	assert.Equal(t, openSess.ID, *lerr.id)
	assert.Equal(t, 0, fake.newSessionCalls, "D11: tmux must never be touched once already_open is decided")
}

// TestLauncher_LaunchResume_RequestCombinationIsRejectedThroughLaunch covers D14 at the
// Launch entry point (not just validateResumeRequest in isolation): a resumeSessionId
// combined with title/model/permissionMode is refused before any transcript lookup.
func TestLauncher_LaunchResume_RequestCombinationIsRejectedThroughLaunch(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	l := newResumeLauncher(st, mgr, fake, t.TempDir())
	dir := t.TempDir()

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-x"), Model: "sonnet",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, "invalid_request", lerr.code)
	assert.Equal(t, 0, fake.newSessionCalls)
}

// TestLauncher_LaunchResume_AdvancesMRUAndCountWithoutTouchingRememberedModelOrMode
// covers D15 at the launcher level (internal/store/repo_test.go covers TouchRepo
// itself): a resume from the list into an already-known directory bumps launch_count
// but leaves the directory's remembered model/Start-in mode exactly as a real launch
// last set them.
func TestLauncher_LaunchResume_AdvancesMRUAndCountWithoutTouchingRememberedModelOrMode(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	projectsRoot := t.TempDir()
	dir := t.TempDir()
	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-abc", claudecodetest.CwdLine(resolvedCwd(t, dir)))

	_, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "opus", PermissionMode: "acceptEdits",
	})
	require.NoError(t, err)

	l := newResumeLauncher(st, mgr, fake, projectsRoot)

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-abc"),
	})
	require.Nil(t, lerr)

	repo, err := st.GetRepo(context.Background(), sess.RepoID)
	require.NoError(t, err)
	assert.Equal(t, 2, repo.LaunchCount)
	require.NotNil(t, repo.LastModel)
	assert.Equal(t, "opus", *repo.LastModel, "D15: TouchRepo must never clobber the remembered model")
	require.NotNil(t, repo.LastPermissionMode)
	assert.Equal(t, "acceptEdits", *repo.LastPermissionMode, "D15: TouchRepo must never clobber the remembered Start-in mode")
}

// TestLauncher_Resume_RefusesADeadSessionWhoseClaudeIDAnAliveSessionHolds covers D12:
// the Resume action on a dead row must not resurrect it into a second live pane once
// another alive session already holds the same Claude session id (a resume-from-list
// elsewhere, kb:adr/launch-resume-one-alive-row-per-claude-session) — proven with a
// *third*, unrelated alive session present too, so the guard is shown not to trip on
// every alive session, only the one actually bound to this Claude id.
func TestLauncher_Resume_RefusesADeadSessionWhoseClaudeIDAnAliveSessionHolds(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: newFakeTmux(), log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	// An unrelated, alive session bound to a different Claude id — must not be disturbed
	// and must not make the guard trip for the wrong reason.
	unrelated, err := mgr.CreateSession(context.Background(), session.CreateParams{RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), unrelated.ID, fmt.Sprintf("muster-%d:@1", unrelated.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), unrelated.ID, "claude-unrelated", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	// The dead session: bound to "claude-shared", then ended.
	deadSess, err := mgr.CreateSession(context.Background(), session.CreateParams{RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), deadSess.ID, fmt.Sprintf("muster-%d:@1", deadSess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), deadSess.ID, "claude-shared", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = mgr.End(context.Background(), deadSess.ID)
	require.NoError(t, err)

	// A second, alive session now holds "claude-shared" (as a resume-from-list would
	// have created it).
	newAlive, err := mgr.CreateSession(context.Background(), session.CreateParams{RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), newAlive.ID, fmt.Sprintf("muster-%d:@1", newAlive.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), newAlive.ID, "claude-shared", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	_, lerr := l.Resume(context.Background(), deadSess.ID)

	require.NotNil(t, lerr)
	assert.Equal(t, "not_resumable", lerr.code)
	assert.Contains(t, lerr.message, fmt.Sprintf("%d", newAlive.ID), "the message must name the other session already holding this Claude session")

	// The unrelated alive session must be entirely untouched by this refusal.
	still, ok := mgr.Get(unrelated.ID)
	require.True(t, ok)
	assert.True(t, still.Alive)
}

// TestLauncher_LaunchResume_AlreadyOpenIs409WhenTheOpenRowWasBoundByAResume covers the
// open row already holding this Claude session id having itself been bound via
// KindResumeBind (the SessionStart{source:"resume"} a real `claude --resume` sends),
// rather than an ordinary KindBind — the two must be equally visible to
// AliveByClaudeSessionID's one-alive-row guard (kb:adr/launch-resume-one-alive-row-per-claude-session).
func TestLauncher_LaunchResume_AlreadyOpenIs409WhenTheOpenRowWasBoundByAResume(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	projectsRoot := t.TempDir()
	dir := t.TempDir()
	claudecodetest.WriteTranscript(t, projectsRoot, dir, "claude-open", claudecodetest.CwdLine(resolvedCwd(t, dir)))

	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	openSess, err := mgr.CreateSession(context.Background(), session.CreateParams{RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), openSess.ID, fmt.Sprintf("muster-%d:@1", openSess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), openSess.ID, "claude-open", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, true)
	require.NoError(t, err)

	l := newResumeLauncher(st, mgr, fake, projectsRoot)

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, ResumeSessionID: strPtr("claude-open"),
	})

	require.NotNil(t, lerr)
	assert.Equal(t, 409, lerr.status)
	assert.Equal(t, "already_open", lerr.code)
	require.NotNil(t, lerr.id)
	assert.Equal(t, openSess.ID, *lerr.id)
	assert.Equal(t, 0, fake.newSessionCalls)
}

// TestLauncher_Resume_RefusesADeadSessionWhoseClaudeIDAResumeBoundAliveSessionHolds
// covers the same "another alive row already holds this claude id" guard the Resume
// action applies (kb:adr/launch-resume-one-alive-row-per-claude-session), this time with
// the other row bound via KindResumeBind rather than KindBind.
func TestLauncher_Resume_RefusesADeadSessionWhoseClaudeIDAResumeBoundAliveSessionHolds(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: newFakeTmux(), log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	deadSess, err := mgr.CreateSession(context.Background(), session.CreateParams{RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet"})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), deadSess.ID, fmt.Sprintf("muster-%d:@1", deadSess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), deadSess.ID, "claude-shared", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = mgr.End(context.Background(), deadSess.ID)
	require.NoError(t, err)

	// A resume-from-list creates the new row with a pending claim before its own bind
	// lands (kb:adr/launch-resume-pending-resume-holds-id), then the SessionStart
	// resume-bind arrives.
	newAlive, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet",
		ResumeClaudeSessionID: "claude-shared",
	})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), newAlive.ID, fmt.Sprintf("muster-%d:@1", newAlive.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), newAlive.ID, "claude-shared", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, true)
	require.NoError(t, err)

	_, lerr := l.Resume(context.Background(), deadSess.ID)

	require.NotNil(t, lerr)
	assert.Equal(t, "not_resumable", lerr.code)
	assert.Contains(t, lerr.message, fmt.Sprintf("%d", newAlive.ID))
}
