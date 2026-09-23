package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

func postSessionsRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// sessionActionRequest fires one cookie-authed request at srv's mux and returns the
// recorded response — the shared shape D17/D18's End/Resume/Remove/Pane tests all need.
func sessionActionRequest(t *testing.T, srv *testServer, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// seedSessionRow inserts a repo+session row directly via the store (no real tmux/launch
// needed for D17/D18's error-path tests) and loads it into srv's manager so the HTTP
// handlers under test can find it. mutate, if non-nil, edits the freshly-inserted row
// before it's persisted and loaded — e.g. to seed a dead session or one with no
// claudeSessionId.
func seedSessionRow(t *testing.T, srv *testServer, mutate func(*store.SessionRow)) int64 {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	repo, _, err := srv.store.UpsertRepo(ctx, store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	row, err := srv.store.InsertSession(ctx, store.InsertSessionParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: "default",
	})
	require.NoError(t, err)
	if mutate != nil {
		mutate(&row)
		require.NoError(t, srv.store.UpdateSession(ctx, row))
	}
	require.NoError(t, srv.manager.LoadAll(ctx))
	return row.ID
}

func decodeErrorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	return envelope.Error.Code
}

// TestHandleCreateSession_RequiresCookie covers the auth wiring for the new endpoint.
func TestHandleCreateSession_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleCreateSession_InvalidJSONBodyIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postSessionsRequest(t, srv, `not valid json`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestHandleCreateSession_ValidationErrors covers the Protocol Contract's "400
// invalid_request also covers" list, exercised through the real HTTP handler (decode
// → delegate → encode); none of these ever reach the store or tmux.
func TestHandleCreateSession_ValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"missing directory", `{"model":"sonnet","permissionMode":"default"}`},
		{"relative directory", `{"directory":"relative/dir","model":"sonnet","permissionMode":"default"}`},
		{"non-existent directory", `{"directory":"/this/does/not/exist/anywhere","model":"sonnet","permissionMode":"default"}`},
		{"empty model", `{"directory":"` + os.TempDir() + `","model":"","permissionMode":"default"}`},
		{"missing model", `{"directory":"` + os.TempDir() + `","permissionMode":"default"}`},
		{"unknown permissionMode", `{"directory":"` + os.TempDir() + `","model":"sonnet","permissionMode":"bogus"}`},
		{"empty permissionMode", `{"directory":"` + os.TempDir() + `","model":"sonnet","permissionMode":""}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := postSessionsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour covers D4: the
// rejection message must name all four accepted values, not just say "invalid".
func TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postSessionsRequest(t, srv, `{"directory":"`+os.TempDir()+`","model":"sonnet","permissionMode":"bypassPermissions"}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "invalid_request", envelope.Error.Code)
	assert.Equal(t, "permissionMode must be one of default, plan, acceptEdits, auto", envelope.Error.Message)
}

// TestHandleCreateSession_ADirectoryThatIsAFileIs400 covers the "not a directory" half
// of the Protocol Contract's validation clause.
func TestHandleCreateSession_ADirectoryThatIsAFileIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	file := filepath.Join(t.TempDir(), "not-a-dir.txt")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o644))

	rec := postSessionsRequest(t, srv, `{"directory":"`+file+`","model":"sonnet","permissionMode":"default"}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow covers D7/Edge Case
// 9's other half and the plan's "on spawn failure: delete the row" rollback rule — a
// corrupt settings.local.json is caught before tmux is ever touched, so this needs no
// tmux socket at all.
func TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, ".claude"), 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".claude", "settings.local.json"), []byte(`{not valid json`), 0o600))

	// REQ-10: the 500 body is now a fixed phrase, never the raw error — the offending
	// path lives only in the adjacent log line, so that's what this test reads instead of
	// the response body (daemon-implementation.md's Handoff on this exact test).
	var logBuf bytes.Buffer
	l := &sessionLauncher{
		store: st, manager: mgr, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, http.StatusInternalServerError, lerr.status)
	assert.Equal(t, "launch_failed", lerr.code)
	assert.Equal(t, msgLaunchFailed, lerr.message, "REQ-10: the response body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "settings.local.json", "REQ-10: the offending file's path lives in the daemon log, not the response body")

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "the inserted session row must be rolled back on a later launch-step failure")
}

func openLauncherTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	return st
}

// stubSessionOutFile is where sharedStubClaude (main_test.go) records the MUSTER_SESSION
// it was handed for sessionID. Reading that back is the only reliable way to observe what
// a tmux `new-window -e` actually passed the spawned process: tmux's own `show-environment`
// reflects a separate update-environment table, not the process env passed at spawn,
// confirmed by manual probe.
func stubSessionOutFile(sessionID int64) string {
	return filepath.Join(stubOutDir, "session-"+strconv.FormatInt(sessionID, 10))
}

// newTestTmuxClient returns a tmux.Client bound to a private, per-test socket (plan
// v1-cleanup REQ-4: tmuxtest.Socket replaces this file's own copy of the shared
// os.MkdirTemp + kill-server idiom) — never a bare -L name in tmux's shared socket
// directory (D12) and never the user's default server (CLAUDE.md hard rule). Used only
// by TestLauncher_SuccessfulLaunchEndToEnd (this file's keep-real test, per REQ-3's
// Implementation Notes list); TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault
// uses a fakeTmux instead.
func newTestTmuxClient(t *testing.T) *tmux.Client {
	t.Helper()
	return tmux.New(tmuxtest.Socket(t))
}

// TestLauncher_SuccessfulLaunchEndToEnd covers D4/D5/D6/D7/REQ-1/REQ-2 at the
// sessionLauncher level (below the HTTP handler, above tmux/store), complementing the
// E2E suite's browser-driven equivalent (E1): a real tmux window is spawned (on a
// private per-test socket) running a stub binary standing in for `claude`, settings
// are written, and the broadcast fires only once the real tmux target is known.
func TestLauncher_SuccessfulLaunchEndToEnd(t *testing.T) {
	st := openLauncherTestStore(t)
	var upserts []*session.Session
	mgr := session.NewManager(session.Config{
		Store:  st,
		Logger: zerolog.Nop(),
		OnUpsert: func(s *session.Session) {
			upserts = append(upserts, s.Clone())
		},
	})
	tmuxClient := newTestTmuxClient(t)
	dir := t.TempDir()

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: tmuxClient, log: zerolog.Nop(), claudeBin: sharedStubClaude,
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Title: "My Session", Model: "sonnet", PermissionMode: "default",
	})
	require.Nil(t, lerr)
	t.Cleanup(func() { _ = tmuxClient.KillWindow(context.Background(), sess.TmuxTarget) })

	assert.Equal(t, session.StateStarted, sess.State)
	assert.NotEmpty(t, sess.TmuxTarget)
	assert.True(t, sess.FirstLaunchHere)

	require.Len(t, upserts, 1, "REQ-2: exactly one broadcast, once the real tmux target is known")
	assert.Equal(t, sess.TmuxTarget, upserts[0].TmuxTarget)

	// D4: the pane environment carries MUSTER_SESSION=<id> — proven by the stub binary
	// itself observing it (see newStubClaudeBin's doc comment for why show-environment
	// can't be used here).
	envOutFile := stubSessionOutFile(sess.ID)
	require.Eventually(t, func() bool {
		b, err := os.ReadFile(envOutFile)
		return err == nil && len(b) > 0
	}, 3*time.Second, 20*time.Millisecond)
	got, err := os.ReadFile(envOutFile)
	require.NoError(t, err)
	assert.Equal(t, strconv.FormatInt(sess.ID, 10)+"\n", string(got))

	settingsPath := filepath.Join(dir, ".claude", "settings.local.json")
	require.FileExists(t, settingsPath)

	// D6: launching a second time into the same directory yields one repo row with
	// launch_count == 2 and updated defaults.
	sess2, lerr2 := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "opus", PermissionMode: "acceptEdits",
	})
	require.Nil(t, lerr2)
	t.Cleanup(func() { _ = tmuxClient.KillWindow(context.Background(), sess2.TmuxTarget) })
	assert.False(t, sess2.FirstLaunchHere, "the second launch into the same directory is not a first launch")

	repo, err := st.GetRepo(context.Background(), sess2.RepoID)
	require.NoError(t, err)
	assert.Equal(t, sess.RepoID, sess2.RepoID, "one repo row for both launches")
	assert.Equal(t, 2, repo.LaunchCount)
	require.NotNil(t, repo.LastModel)
	assert.Equal(t, "opus", *repo.LastModel)

	// D7: relaunching must merge settings idempotently — the file must still exist and
	// still be valid JSON (a corrupt merge would have failed the launch outright).
	require.FileExists(t, settingsPath)
	b, err := os.ReadFile(settingsPath)
	require.NoError(t, err)
	var doc map[string]any
	require.NoError(t, json.Unmarshal(b, &doc))
}

// TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault covers D3 (a launch with
// "auto" seeds the session's permission latch with {"auto", "seed"}) and D7 (the
// directory's per-directory default records "auto" as the raw requested value). Uses a
// fakeTmux (REQ-3): every assertion is about the returned Session/repo row, never a
// tmux-observable effect, so no real tmux server is needed.
func TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: newFakeTmux(), log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "auto",
	})
	require.Nil(t, lerr)

	// D3: the returned session's permission latch is seeded auto/seed.
	assert.Equal(t, session.PermissionAuto, sess.PermissionMode)
	assert.Equal(t, "seed", sess.PermissionModeSource)

	// D7: the directory's stored default now records the raw requested value "auto".
	repo, err := st.GetRepo(context.Background(), sess.RepoID)
	require.NoError(t, err)
	require.NotNil(t, repo.LastPermissionMode)
	assert.Equal(t, "auto", *repo.LastPermissionMode)
}

// --- plan new-session-improvement: REQ-1/REQ-2's model-catalog pre-check ---

// newModelCheckLauncher builds a sessionLauncher sharing st/mgr/fake, wired with a
// checkModel stub that returns verdict/err and counts its own calls — D7/D8/D9 fake at
// the verdict seam, never the stderr sentence itself, which stays inside
// internal/claudecode per D11 and is covered by modelcheck_test.go instead.
func newModelCheckLauncher(st *store.Store, mgr *session.Manager, fake *fakeTmux, verdict claudecode.ModelVerdict, err error, calls *int) *sessionLauncher {
	return &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
		checkModel: func(context.Context, string, string) (claudecode.ModelVerdict, error) {
			*calls++
			return verdict, err
		},
	}
}

// TestLauncher_ModelUnrecognised_RefusesAndWritesNothing is D7/INV-1, asserted from both
// of INV-1's source states: a never-launched directory (no repo row, no settings file)
// and a directory with a prior launch (repo row and settings.local.json already present).
// Either way, a refused launch leaves the store, the fake tmux and the settings file
// exactly as they started.
func TestLauncher_ModelUnrecognised_RefusesAndWritesNothing(t *testing.T) {
	tests := []struct {
		name        string
		priorLaunch bool
	}{
		{"never-launched directory", false},
		{"directory with a prior launch", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			var upserts []*session.Session
			mgr := session.NewManager(session.Config{
				Store: st, Logger: zerolog.Nop(),
				OnUpsert: func(s *session.Session) { upserts = append(upserts, s.Clone()) },
			})
			fake := newFakeTmux()
			dir := t.TempDir()
			settingsPath := filepath.Join(dir, ".claude", "settings.local.json")

			var priorSettings []byte
			if tt.priorLaunch {
				var okCalls int
				okLauncher := newModelCheckLauncher(st, mgr, fake, claudecode.ModelRecognised, nil, &okCalls)
				_, lerr := okLauncher.Launch(context.Background(), createSessionRequest{
					Directory: dir, Model: "sonnet", PermissionMode: "default",
				})
				require.Nil(t, lerr)
				var err error
				priorSettings, err = os.ReadFile(settingsPath)
				require.NoError(t, err)
				upserts = nil // only the refused attempt's broadcasts matter from here
			}

			reposBefore, err := st.ListRepos(context.Background())
			require.NoError(t, err)
			sessionsBefore, err := st.ListSessions(context.Background())
			require.NoError(t, err)
			newSessionCallsBefore := fake.newSessionCalls

			var checkCalls int
			l := newModelCheckLauncher(st, mgr, fake, claudecode.ModelUnrecognised, nil, &checkCalls)

			_, lerr := l.Launch(context.Background(), createSessionRequest{
				Directory: dir, Model: "zephyr", PermissionMode: "default",
			})

			require.NotNil(t, lerr)
			assert.Equal(t, 1, checkCalls)
			assert.Equal(t, http.StatusBadRequest, lerr.status)
			assert.Equal(t, "model_unrecognized", lerr.code)
			assert.Equal(t, `Claude Code doesn't recognise the model "zephyr" — update Claude Code, or pick another model`, lerr.message)

			reposAfter, err := st.ListRepos(context.Background())
			require.NoError(t, err)
			assert.Equal(t, reposBefore, reposAfter, "INV-1: the store's repo rows must be byte-identical after a refusal")

			sessionsAfter, err := st.ListSessions(context.Background())
			require.NoError(t, err)
			assert.Equal(t, sessionsBefore, sessionsAfter, "INV-1: no session row is inserted on a refusal")

			assert.Equal(t, newSessionCallsBefore, fake.newSessionCalls, "INV-1: no tmux session is spawned on a refusal")
			assert.Empty(t, upserts, "INV-1: no sessionUpsert is broadcast on a refusal")

			if tt.priorLaunch {
				afterSettings, err := os.ReadFile(settingsPath)
				require.NoError(t, err)
				assert.Equal(t, priorSettings, afterSettings, "INV-1: settings.local.json must be byte-identical after a refusal")
			} else {
				_, err := os.Stat(settingsPath)
				assert.True(t, os.IsNotExist(err), "INV-1: a never-launched directory must gain no settings.local.json on a refusal")
			}
		})
	}
}

// TestLauncher_ModelRecognised_ProceedsToCreated is D8: a launch whose check reports
// ModelRecognised proceeds to a 201 with the same row a launch with no check configured
// at all would produce — the check itself leaves nothing else about the launch path
// different. Proven by launching the same request twice on the same store, once through
// a checkModel:nil launcher (TestLauncher_SuccessfulLaunchEndToEnd's real-tmux
// equivalent) and once through the ModelRecognised launcher, into a second directory,
// and comparing every field that does not necessarily differ between two distinct
// launches sharing one store's counters (id, RepoID, TmuxTarget/TmuxPane, RailPos,
// StateSince/CreatedAt and Directory itself all encode which launch produced them, so
// those are excluded; every other field must match).
func TestLauncher_ModelRecognised_ProceedsToCreated(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	fake := newFakeTmux()

	noCheckLauncher := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}
	baseline, lerrBaseline := noCheckLauncher.Launch(context.Background(), createSessionRequest{
		Directory: t.TempDir(), Model: "sonnet", PermissionMode: "default",
	})
	require.Nil(t, lerrBaseline)

	var checkCalls int
	l := newModelCheckLauncher(st, mgr, fake, claudecode.ModelRecognised, nil, &checkCalls)

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: t.TempDir(), Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr)
	assert.Equal(t, 1, checkCalls)
	assert.Equal(t, session.StateStarted, sess.State)
	assert.NotEmpty(t, sess.TmuxTarget)
	require.NotNil(t, baseline.Model, "D8: baseline launch must have resolved a model")
	require.NotNil(t, sess.Model)

	// Whole-struct comparison after zeroing the fields that necessarily differ between
	// two distinct launches sharing one store's counters (id, RepoID, TmuxTarget/TmuxPane,
	// RailPos, StateSince/CreatedAt and Directory itself all encode which launch produced
	// them) proves every other field — including ones no individual assertion names, so
	// the claim in the doc comment above stays true as fields are added.
	baselineCmp, sessCmp := *baseline, *sess
	for _, c := range []*session.Session{&baselineCmp, &sessCmp} {
		c.ID = 0
		c.RepoID = 0
		c.TmuxTarget = ""
		c.TmuxPane = ""
		c.RailPos = 0
		c.StateSince = time.Time{}
		c.CreatedAt = time.Time{}
		c.Directory = ""
	}
	assert.Equal(t, baselineCmp, sessCmp, "D8: every field but id/RepoID/TmuxTarget/TmuxPane/RailPos/StateSince/CreatedAt/Directory must match regardless of whether a check ran")

	// D8: the repo row's defaults are recorded identically regardless of whether a check ran.
	baselineRepo, err := st.GetRepo(context.Background(), baseline.RepoID)
	require.NoError(t, err)
	repo, err := st.GetRepo(context.Background(), sess.RepoID)
	require.NoError(t, err)
	assert.Equal(t, baselineRepo.LaunchCount, repo.LaunchCount)
	require.NotNil(t, baselineRepo.LastModel)
	require.NotNil(t, repo.LastModel)
	assert.Equal(t, *baselineRepo.LastModel, *repo.LastModel)
	require.NotNil(t, baselineRepo.LastPermissionMode)
	require.NotNil(t, repo.LastPermissionMode)
	assert.Equal(t, *baselineRepo.LastPermissionMode, *repo.LastPermissionMode)
}

// TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn is D6's server half (D6 itself,
// "a run func that returns an error ... yields an error from CheckModel, and Launch
// proceeds to a 201", is exercised at the claudecode-package level in modelcheck_test.go
// — this is Launch's own reaction to that error): a checkModel error never blocks the
// launch, and the warn log names the directory and model. The error text here is a
// realistic process-level failure ("executable file not found"), not raw stderr — REQ-2's
// "never the stderr body" is CheckModel/RunModelCheck's own contract (the returned error
// only ever wraps a process-start/timeout failure, never the captured stderr bytes,
// which CheckModel discards on the error path — see modelcheck_test.go), not something a
// fake at this seam can independently prove.
func TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	fake := newFakeTmux()
	dir := t.TempDir()

	var logBuf bytes.Buffer
	var checkCalls int
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
		checkModel: func(context.Context, string, string) (claudecode.ModelVerdict, error) {
			checkCalls++
			return claudecode.ModelRecognised, errors.New(`exec: "claude": executable file not found in $PATH`)
		},
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr, "REQ-2: a check error must fail open, never block the launch")
	assert.Equal(t, 1, checkCalls)
	assert.Equal(t, session.StateStarted, sess.State)
	assert.Contains(t, logBuf.String(), dir, "REQ-2: the warn log must name the directory")
	assert.Contains(t, logBuf.String(), "sonnet", "REQ-2: the warn log must name the model")
}

// TestLauncher_ValidationFailure_NeverInvokesTheModelCheck is D9: a request that fails
// validateLaunchRequest is rejected before checkModel is ever called — an invalid
// directory here (relative, not absolute) triggers the same 400 invalid_request the
// unrelated table in TestHandleCreateSession_ValidationErrors covers at the HTTP layer;
// this asserts the launcher-level side effect that check never fires.
func TestLauncher_ValidationFailure_NeverInvokesTheModelCheck(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	fake := newFakeTmux()

	var checkCalls int
	l := newModelCheckLauncher(st, mgr, fake, claudecode.ModelUnrecognised, nil, &checkCalls)

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: "relative/dir", Model: "sonnet", PermissionMode: "default",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, "invalid_request", lerr.code)
	assert.Equal(t, 0, checkCalls, "D9: validateLaunchRequest must reject before checkModel is ever invoked")
}

// --- plan session-lifecycle: red tests, written and run against the unmodified tree
// (Implementation Notes § Red-first). Each covers one D* acceptance criterion; the
// package will not build until tmux.ErrSessionExists exists (D4/D5 below), which is the
// correct red state.

// TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies covers plan
// session-lifecycle D21/review Critical 2: Resume's 409 not_resumable covers two causes
// (still alive; dead but never bound a claudeSessionId) and REQ-17/docs/protocol.md both
// promise "the message names which, since only one of the two is ever recoverable" — but
// sessions.go's notResumable call is one byte-identical string for both causes today. This
// doesn't pin exact prose (the impl keeps freedom of wording): it asserts the two messages
// differ, and that only the alive-cause one mentions "alive" — today both causes return
// the identical shared string, so both assertions fail together.
func TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: newFakeTmux(), log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	// Cause 1: still alive.
	aliveSess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), aliveSess.ID, fmt.Sprintf("muster-%d:@1", aliveSess.ID), "%1")
	require.NoError(t, err)

	_, aliveErr := l.Resume(context.Background(), aliveSess.ID)
	require.NotNil(t, aliveErr)
	require.Equal(t, "not_resumable", aliveErr.code)

	// Cause 2: dead, and never bound a claudeSessionId (End with no SessionKiller/
	// PaneChecker configured on this mgr goes straight to the direct markEnded path, no
	// tmux needed).
	deadSess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: false,
	})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), deadSess.ID, fmt.Sprintf("muster-%d:@1", deadSess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.End(context.Background(), deadSess.ID)
	require.NoError(t, err)

	_, noIDErr := l.Resume(context.Background(), deadSess.ID)
	require.NotNil(t, noIDErr)
	require.Equal(t, "not_resumable", noIDErr.code)

	assert.NotEqual(t, aliveErr.message, noIDErr.message,
		"D21/Critical 2: the two not_resumable causes must produce different messages")
	assert.Contains(t, strings.ToLower(aliveErr.message), "alive", "the alive-session message must name that cause")
	assert.NotContains(t, strings.ToLower(noIDErr.message), "alive", "the no-claudeSessionId message must not also claim the session is alive")
}

// TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch is the #26 reproducer
// (plan session-lifecycle D3): an orphaned muster-1 tmux session with an otherwise-empty
// store must not wedge every future launch. Today, the very first CreateSession in a
// fresh store allocates id 1, so `tmux new-session -s muster-1` collides with the
// pre-existing orphan and Launch rolls the row back and returns 500 launch_failed —
// permanently, since the rollback frees id 1 again for the next attempt.
func TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch(t *testing.T) {
	socket := tmuxtest.Socket(t)
	client := tmux.New(socket)
	dir := t.TempDir()
	// Pre-create the orphan issue #26 describes: muster-1 exists on the socket, but the
	// store has never heard of it (e.g. a prior daemon crashed after spawning it).
	_, _, err := client.NewSession(context.Background(), 1, dir, nil, sleepForeverCommand())
	require.NoError(t, err)

	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	logBuf := &syncBuffer{}
	srv := New(Config{
		Store: st, Logger: zerolog.New(logBuf), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version", TmuxSocket: socket,
		Launch: LaunchConfig{ClaudeBin: sharedStubClaude, HookScript: "/bin/true", StatusLineScript: "/bin/true"},
	})
	testSrv := &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st}
	testSrv.Start() // runs the ordinary startup Reconcile — must not adopt or kill muster-1
	t.Cleanup(func() { testSrv.Shutdown(context.Background()) })

	rec := postSessionsRequest(t, testSrv, `{"directory":"`+dir+`","model":"sonnet","permissionMode":"default"}`)

	require.Equal(t, http.StatusCreated, rec.Code, "D3/#26: an orphaned muster-1 must never wedge every future launch")
	var wire struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &wire))
	assert.GreaterOrEqual(t, wire.ID, int64(2), "the new session's id must not collide with the orphan's")
	t.Cleanup(func() { _ = client.KillSession(context.Background(), fmt.Sprintf("muster-%d", wire.ID)) })

	names, err := client.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Contains(t, names, "muster-1", "the orphan must be left untouched — never adopted, never killed")
}

// TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError covers plan
// session-lifecycle D2's launcher half: a MaxSessionID probe failure must be tolerated,
// never fail the launch (REQ-7: "degrades to floor 0 — it never fails a launch"). Today
// Launch never calls MaxSessionID at all, so the probe count stays at zero.
func TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	fake := newFakeTmux()
	fake.maxSessionIDErr = errors.New("boom: tmux unreadable")

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr, "REQ-7: a MaxSessionID probe failure must never fail the launch")
	assert.GreaterOrEqual(t, fake.maxSessionIDCalls, 1, "REQ-7: Launch must probe MaxSessionID (and tolerate its failure) before CreateSession")
}

// TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID covers plan
// session-lifecycle D4: a single tmux.ErrSessionExists on the first NewSession attempt
// must be retried transparently, with a strictly higher session id on the retry, and the
// retry must succeed.
func TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	fake := newFakeTmux()
	fake.queueNewSessionErrs(tmux.ErrSessionExists)

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr, "REQ-7: a single collision must be retried transparently, never surfaced to the caller")
	assert.Equal(t, 2, fake.newSessionCalls, "D4: exactly one retry (two attempts total)")
	ids := fake.newSessionIDsSeen()
	require.Len(t, ids, 2)
	assert.Greater(t, ids[1], ids[0], "D4: the retry's session id must be strictly greater than the first attempt's")
	assert.NotEmpty(t, sess.TmuxTarget)
}

// TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists covers plan
// session-lifecycle D5: a launcher that keeps colliding gives up after 3 attempts with a
// 500 launch_failed naming the tmux session, rather than retrying forever or leaking a row
// per attempt.
func TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	fake := newFakeTmux()
	fake.newSessionErr = tmux.ErrSessionExists

	// REQ-10: the 500 body is a fixed phrase now — the colliding tmux session's name
	// lives only in the adjacent log line (daemon-implementation.md's Handoff on this
	// exact test).
	var logBuf bytes.Buffer
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, http.StatusInternalServerError, lerr.status)
	assert.Equal(t, "launch_failed", lerr.code)
	assert.Equal(t, msgLaunchFailed, lerr.message, "REQ-10: the response body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "muster-", "D5/REQ-10: the colliding tmux session's name lives in the daemon log, not the response body")
	assert.Equal(t, 3, fake.newSessionCalls, "D5: exactly three attempts before giving up")

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "every attempt's row must be rolled back, never leaked")
}

// errKiller is a session.Killer double whose KillSession always fails with a fixed,
// non-nil error — used to force a *genuine* kill failure for D15. Phase 1 shipped REQ-6
// (internal/tmux.Client.KillSession treats an already-gone tmux session as a successful
// kill), so a fabricated/never-spawned tmux target no longer reproduces this scenario; a
// Killer double is the only way left to get a kill that must still fail. ListSessions is
// never exercised by the Remove path this test drives.
type errKiller struct {
	killErr error
}

func (k *errKiller) KillSession(_ context.Context, _ string) error {
	return k.killErr
}

func (k *errKiller) ListSessions(_ context.Context) ([]string, error) {
	return nil, nil
}

// TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent covers plan
// session-lifecycle D15/REQ-13: a Remove whose End fails (a genuine tmux kill failure —
// here, errKiller standing in for "tmux unreachable") must not have already destroyed the
// shell tmux session, and the row must still be there afterward. Today handleRemoveSession
// kills the shell and closes terminal sockets *before* calling manager.Remove, so both are
// already gone by the time Remove fails.
func TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent(t *testing.T) {
	socket := tmuxtest.Socket(t)
	client := tmux.New(socket) // real tmux — backs only the shell registry below
	st := openLauncherTestStore(t)
	killer := &errKiller{killErr: errors.New("boom: tmux unreachable")}
	manager := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop(), SessionKiller: killer})
	shells := newShellRegistry(client, zerolog.Nop())
	terminals := newTerminalRegistry()
	launcher := &sessionLauncher{store: st, manager: manager, tmux: client, log: zerolog.Nop()}
	// D7/REQ-10: a captured logger, not zerolog.Nop() — the raw error must reach the log
	// even though the response body below only ever carries the fixed phrase.
	var logBuf bytes.Buffer
	f := newSessionsFeature(manager, launcher, shells, terminals, zerolog.New(&logBuf))

	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	// The tmux target itself no longer matters here — errKiller fails regardless of what
	// (if anything) actually exists on the socket.
	_, err = manager.RecordLaunch(context.Background(), sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)

	_, _, err = shells.Ensure(context.Background(), sess.ID, dir)
	require.NoError(t, err)
	shellName := tmux.ShellSessionName(sess.ID)
	existsBefore, err := client.PaneExists(context.Background(), shellName)
	require.NoError(t, err)
	require.True(t, existsBefore, "sanity: the shell must actually be running before Remove is attempted")

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/sessions/%d", sess.ID), nil)
	req.SetPathValue("id", strconv.FormatInt(sess.ID, 10))
	rec := httptest.NewRecorder()
	f.handleRemoveSession(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code, "errKiller forces a genuine kill failure, so Remove must fail")
	assert.Equal(t, msgRemoveFailed, decodeErrorMessage(t, rec), "D7/REQ-10: the body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "boom: tmux unreachable", "D7: the raw error must reach the daemon log")
	assert.True(t, manager.Exists(sess.ID), "D15: a failed Remove must leave the row present")

	stillExists, err := client.PaneExists(context.Background(), shellName)
	require.NoError(t, err)
	assert.True(t, stillExists, "D15/REQ-13: a failed Remove must leave the shell tmux session running")
}

// terminalConnFor reads back the *terminalConn currently registered for id's Claude
// surface, directly from the registry's own map (in-package access) — a deterministic,
// non-network way to assert "the terminal socket was (or wasn't) touched" that doesn't
// depend on a bounded-wait read against the live websocket.
func terminalConnFor(terminals *terminalRegistry, id int64) *terminalConn {
	terminals.mu.Lock()
	defer terminals.mu.Unlock()
	return terminals.conns[terminalKey{sessionID: id, surface: surfaceClaude}]
}

// TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen covers plan session-lifecycle
// D23/review Major 2: REQ-13 says "a failed End or Remove leaves terminal sockets and the
// shell as they were", but handleEndSession's default (genuine-failure) branch still calls
// f.terminals.closeSession(id) before writing the 500 — recreating the dead-surface-over-
// a-live-session defect the plan's own Overview names. Uses the same errKiller double as
// D15 to force a genuine (non-idempotent-tolerated) kill failure; the terminal WS is a
// real coder/websocket connection (registered via a fake attach, since no real tmux target
// exists here) so "still registered, same connection object" is a genuine assertion about
// terminalRegistry's own state, not a guess from a bounded-wait read.
func TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen(t *testing.T) {
	st := openLauncherTestStore(t)
	killer := &errKiller{killErr: errors.New("boom: tmux unreachable")}
	manager := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop(), SessionKiller: killer})
	terminals := newTerminalRegistry()
	fake := newFakeTmux()
	terminalFeat := newTerminalFeature(terminals, manager, fake.attach, zerolog.Nop())
	shells := newShellRegistry(fake, zerolog.Nop())
	launcher := &sessionLauncher{store: st, manager: manager, tmux: fake, log: zerolog.Nop()}
	// D7/REQ-10: a captured logger, not zerolog.Nop() — the raw error must reach the log
	// even though the response body below only ever carries the fixed phrase.
	var logBuf bytes.Buffer
	sessionsFeat := newSessionsFeature(manager, launcher, shells, terminals, zerolog.New(&logBuf))

	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	_, err = manager.RecordLaunch(context.Background(), sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)

	noGuard := func(h http.Handler) http.Handler { return h }
	mux := http.NewServeMux()
	sessionsFeat.mount(mux, noGuard)
	terminalFeat.mount(mux, noGuard)
	httpSrv := httptest.NewServer(mux)
	t.Cleanup(httpSrv.Close)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	// Drain frames on the client side throughout: a graceful websocket.Conn.Close() (which
	// closeSession calls) waits for the peer's own close-frame acknowledgement, and a
	// client that never reads would otherwise make this test pay that wait's full grace
	// period for no reason relevant to the assertion below.
	go func() {
		for {
			if _, _, err := c.Read(context.Background()); err != nil {
				return
			}
		}
	}()

	var before *terminalConn
	require.Eventually(t, func() bool {
		before = terminalConnFor(terminals, sess.ID)
		return before != nil
	}, 3*time.Second, 10*time.Millisecond, "sanity: the terminal connection must actually register before End is attempted")

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/sessions/%d/end", sess.ID), nil)
	req.SetPathValue("id", strconv.FormatInt(sess.ID, 10))
	rec := httptest.NewRecorder()
	sessionsFeat.handleEndSession(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code, "errKiller forces a genuine kill failure, so End must fail")
	assert.Equal(t, msgEndFailed, decodeErrorMessage(t, rec), "D7/REQ-10: the body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "boom: tmux unreachable", "D7: the raw error must reach the daemon log")

	after := terminalConnFor(terminals, sess.ID)
	assert.Same(t, before, after, "D23/REQ-13: a failed End must leave the terminal socket exactly as it was, never closed")
}

// TestLauncher_ConcurrentResumesSpawnExactlyOnce covers plan session-lifecycle D19/REQ-11:
// Resume's check-then-act (read sess.Alive == false, only flip it much later in
// RecordResume) is not serialised per session id, so two concurrent Resume calls for the
// same dead-but-resumable session can both pass the alive gate and both call NewSession.
// Post-Phase-1 this is invisible in either caller's status code — the loser hits
// tmux.ErrSessionExists and REQ-8's repair path hands it back a plain 200 — so the spawn
// count is the only place the bug still shows. A per-test WaitGroup gated on a shared
// `ready` channel (no artificial delay or fake-side barrier needed) reproduced the race
// 20/20 under `-count=20` and 20/20 under `-race` with no data race reported, both while
// iterating on this test before committing it — real disk I/O inside writeSettings
// (os.ReadFile/os.WriteFile against a real temp dir) between the alive-check and the
// tmux call is enough to reliably widen the window.
func TestLauncher_ConcurrentResumesSpawnExactlyOnce(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)

	// Make it dead-but-resumable: alive=false with a bound claudeSessionId — the ordinary
	// "died, has a resumable conversation" shape Resume expects, reloaded into the
	// manager the same way a daemon restart would.
	row, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	row.Alive = false
	claudeID := "claude-resume-race"
	row.ClaudeSessionID = &claudeID
	require.NoError(t, st.UpdateSession(context.Background(), row))
	require.NoError(t, mgr.LoadAll(context.Background()))

	fake := newFakeTmux()
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	const attempts = 2
	ready := make(chan struct{})
	var wg sync.WaitGroup
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-ready
			_, _ = l.Resume(context.Background(), sess.ID)
		}()
	}
	close(ready)
	wg.Wait()

	assert.Equal(t, 1, fake.newSessionCalls, "D19/REQ-11: two concurrent Resumes for one session must spawn exactly once")
}

// barrierTmux is REQ-5(e)/D4's paneSpawner double: NewSession blocks the first caller
// until a second caller has also arrived, then releases both together — proving two
// concurrent Launch calls actually overlap in tmux rather than being serialized behind
// each other. A build that took the per-id lock *before* allocating an id (instead of
// after, per Launch's own doc comment) would make the second Launch's NewSession never
// arrive until the first's completes, and this fake times out instead of releasing.
type barrierTmux struct {
	mu        sync.Mutex
	arrived   int
	callOrder []int64
	release   chan struct{}
}

func newBarrierTmux() *barrierTmux {
	return &barrierTmux{release: make(chan struct{})}
}

func (b *barrierTmux) NewSession(ctx context.Context, id int64, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	b.mu.Lock()
	b.callOrder = append(b.callOrder, id)
	b.arrived++
	first := b.arrived == 1
	b.mu.Unlock()

	if first {
		select {
		case <-b.release:
		case <-time.After(3 * time.Second):
			return "", "", errors.New("barrierTmux: second concurrent NewSession never arrived — the Launch calls were serialized")
		case <-ctx.Done():
			return "", "", ctx.Err()
		}
	} else {
		close(b.release)
	}
	return fmt.Sprintf("muster-%d:@1", id), "%1", nil
}

func (b *barrierTmux) NewNamedSession(_ context.Context, name, _ string, _ map[string]string, _ []string) (string, string, error) {
	return name, "%1", nil
}
func (b *barrierTmux) PaneExists(_ context.Context, _ string) (bool, error) { return false, nil }
func (b *barrierTmux) KillWindow(_ context.Context, _ string) error         { return nil }
func (b *barrierTmux) KillSession(_ context.Context, _ string) error        { return nil }
func (b *barrierTmux) MaxSessionID(_ context.Context) (int64, error)        { return 0, nil }

func (b *barrierTmux) newSessionCalls() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.callOrder)
}

// TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows covers
// REQ-5(e)/D4's first half: two concurrent Launch calls into the same directory both
// succeed, produce two distinct session rows and two distinct tmux spawns — Launch takes
// its per-id lock only after CreateSession has already allocated a fresh id, so different
// ids' spawns never serialize behind one another.
//
// A captured logger (not zerolog.Nop()) is used deliberately: REQ-10 moved the raw error
// out of the response body, so a failure here needs the log to say why.
func TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	fake := newBarrierTmux()

	var logBuf bytes.Buffer
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	type launchResult struct {
		sess *session.Session
		lerr *launchError
	}
	results := make(chan launchResult, 2)
	for range 2 {
		go func() {
			sess, lerr := l.Launch(context.Background(), createSessionRequest{
				Directory: dir, Model: "sonnet", PermissionMode: "default",
			})
			results <- launchResult{sess, lerr}
		}()
	}

	var sessions []*session.Session
	for range 2 {
		r := <-results
		require.Nil(t, r.lerr, "REQ-5(e): both concurrent launches into the same directory must succeed: "+logBuf.String())
		sessions = append(sessions, r.sess)
	}

	require.NotEqual(t, sessions[0].ID, sessions[1].ID, "two distinct session rows")
	assert.Equal(t, 2, fake.newSessionCalls(), "two distinct tmux spawns")

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Len(t, rows, 2, "both rows persisted, never one rolled back for no reason")
}

// spawnerKiller is REQ-5(e)/D4's second fake: a paneSpawner (for the launcher) and a
// session.Killer (for the manager's End) sharing one call log, so a test can observe
// whether a Launch's spawn and an End's kill for the *same* id ever overlap. Production
// wiring shares a single *tmux.Client across both roles the same way.
type spawnerKiller struct {
	mu          sync.Mutex
	callOrder   []string
	newSessRel  chan struct{}
	newSessHold bool // when true, NewSession blocks on newSessRel before returning
}

func newSpawnerKiller() *spawnerKiller {
	return &spawnerKiller{newSessRel: make(chan struct{})}
}

func (k *spawnerKiller) record(s string) {
	k.mu.Lock()
	k.callOrder = append(k.callOrder, s)
	k.mu.Unlock()
}

func (k *spawnerKiller) NewSession(ctx context.Context, id int64, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	k.record("NewSession-start")
	if k.newSessHold {
		select {
		case <-k.newSessRel:
		case <-ctx.Done():
			return "", "", ctx.Err()
		}
	}
	k.record("NewSession-end")
	return fmt.Sprintf("muster-%d:@1", id), "%1", nil
}
func (k *spawnerKiller) NewNamedSession(_ context.Context, name, _ string, _ map[string]string, _ []string) (string, string, error) {
	return name, "%1", nil
}
func (k *spawnerKiller) PaneExists(_ context.Context, _ string) (bool, error) { return true, nil }
func (k *spawnerKiller) KillWindow(_ context.Context, _ string) error         { return nil }
func (k *spawnerKiller) KillSession(_ context.Context, _ string) error {
	k.record("KillSession")
	return nil
}
func (k *spawnerKiller) MaxSessionID(_ context.Context) (int64, error) { return 0, nil }
func (k *spawnerKiller) ListSessions(_ context.Context) ([]string, error) {
	return nil, nil
}

func (k *spawnerKiller) calls() []string {
	k.mu.Lock()
	defer k.mu.Unlock()
	out := make([]string, len(k.callOrder))
	copy(out, k.callOrder)
	return out
}

// TestLauncher_LaunchRacingEndOnTheSameIDCannotInterleave covers REQ-5(e)/D4's second
// half: an End call for the id Launch just allocated, fired while Launch's own tmux spawn
// for that same id is still in flight, must not run its kill until the spawn (and
// RecordLaunch) has finished — the manager's per-id lock (REQ-11, shared by End and by
// Launch's spawnAndRecordLaunch) serializes them. A build that dropped or narrowed that
// lock would let End's KillSession fire while NewSession is still blocked below, which
// this test would catch as a call-order violation.
func TestLauncher_LaunchRacingEndOnTheSameIDCannotInterleave(t *testing.T) {
	st := openLauncherTestStore(t)
	dir := t.TempDir()
	fake := newSpawnerKiller()
	fake.newSessHold = true
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop(), SessionKiller: fake})

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	launchDone := make(chan *launchError, 1)
	go func() {
		_, lerr := l.Launch(context.Background(), createSessionRequest{
			Directory: dir, Model: "sonnet", PermissionMode: "default",
		})
		launchDone <- lerr
	}()

	// Wait for Launch's spawn to actually be in flight (and, by construction, holding
	// the id's per-id lock) before racing End against it.
	require.Eventually(t, func() bool {
		calls := fake.calls()
		return len(calls) > 0 && calls[0] == "NewSession-start"
	}, 3*time.Second, 10*time.Millisecond)

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	require.Len(t, rows, 1, "CreateSession must have already allocated the row Launch is spawning for")
	id := rows[0].ID

	endDone := make(chan error, 1)
	go func() {
		_, endErr := mgr.End(context.Background(), id)
		endDone <- endErr
	}()

	// End must not have completed its kill yet — Launch's spawn (and RecordLaunch) is
	// still holding id's per-id lock.
	select {
	case <-endDone:
		t.Fatal("REQ-5(e)/D4: End completed while Launch's spawn for the same id was still blocked — the per-id lock did not serialize them")
	case <-time.After(300 * time.Millisecond):
	}

	close(fake.newSessRel)
	require.Nil(t, <-launchDone)
	require.NoError(t, <-endDone)

	assert.Equal(t, []string{"NewSession-start", "NewSession-end", "KillSession"}, fake.calls(),
		"End's kill must land strictly after Launch's spawn finished, never interleaved with it")
}

// TestHandleEndSession_AlreadyDeadSessionIs409NotAlive covers D17's first clause
// (kb:anchor/sessions.end): ending an already-ended session is a conflict, not a 404 or a
// silent success.
func TestHandleEndSession_AlreadyDeadSessionIs409NotAlive(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/end", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_alive", decodeErrorCode(t, rec))
}

func TestHandleEndSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodPost, "/api/sessions/999999/end")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleResumeSession_LiveSessionIs409NotResumable covers D17's second clause
// (kb:anchor/sessions.resume): resuming a still-alive session is a conflict.
func TestHandleResumeSession_LiveSessionIs409NotResumable(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		claudeID := "claude-1"
		row.ClaudeSessionID = &claudeID
		// row.Alive is already true from InsertSession.
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/resume", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_resumable", decodeErrorCode(t, rec))
}

// TestHandleResumeSession_DeadSessionWithoutClaudeIDIs409NotResumable covers D17's third
// clause: a dead session that never got a claude session id bound (e.g. it died before its
// first SessionStart hook ever landed) has nothing to resume.
func TestHandleResumeSession_DeadSessionWithoutClaudeIDIs409NotResumable(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
		row.ClaudeSessionID = nil
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/resume", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_resumable", decodeErrorCode(t, rec))
}

func TestHandleResumeSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodPost, "/api/sessions/999999/resume")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleRemoveSession_UnknownSessionIs404 covers D17's fourth clause
// (kb:anchor/sessions.remove): DELETE against an id nothing knows about is a 404, not a silent 204.
func TestHandleRemoveSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodDelete, "/api/sessions/999999")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleRemoveSession_DeadSessionSucceeds covers the ordinary (non-alive) Remove path
// at the HTTP layer: 204 with no body, and the row is actually gone afterward.
func TestHandleRemoveSession_DeadSessionSucceeds(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
	})

	rec := sessionActionRequest(t, srv, http.MethodDelete, fmt.Sprintf("/api/sessions/%d", id))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	_, err := srv.store.GetSession(context.Background(), id)
	assert.Error(t, err, "the row must actually be gone from the store")
}

// TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter covers D18
// (kb:anchor/sessions.pane): no capture yet is 404 no_snapshot; once one lands, GET returns text+capturedAt.
func TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := sessionActionRequest(t, srv, http.MethodGet, fmt.Sprintf("/api/sessions/%d/pane", id))
	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "no_snapshot", decodeErrorCode(t, rec))

	capturedAt := time.Now().UTC()
	require.NoError(t, srv.store.UpdateSnapshot(context.Background(), id, "captured pane text", capturedAt))
	require.NoError(t, srv.manager.LoadAll(context.Background()))

	rec2 := sessionActionRequest(t, srv, http.MethodGet, fmt.Sprintf("/api/sessions/%d/pane", id))
	assert.Equal(t, http.StatusOK, rec2.Code)
	var body struct {
		Text       string `json:"text"`
		CapturedAt string `json:"capturedAt"`
	}
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &body))
	assert.Equal(t, "captured pane text", body.Text)
	// D18: capturedAt must be the seeded value, not merely non-empty — a wrong-but-
	// non-empty timestamp must fail this test (review cycle 1 Minor 5). The store
	// truncates to RFC3339 seconds precision on write (session.go's UpdateSnapshot) and
	// the handler formats with the same layout, so exact string equality is sound and
	// deterministic, not a flaky sub-second race.
	assert.Equal(t, capturedAt.Format(time.RFC3339), body.CapturedAt)
}

func TestHandlePaneSnapshot_UnknownSessionIs404UnknownSession(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodGet, "/api/sessions/999999/pane")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestSessionActionHandlers_RequireCookie covers the auth wiring shared by all four new
// endpoints — none of them may be reachable without the muster_auth cookie.
func TestSessionActionHandlers_RequireCookie(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
	}{
		{"end", http.MethodPost, "/api/sessions/1/end"},
		{"resume", http.MethodPost, "/api/sessions/1/resume"},
		{"remove", http.MethodDelete, "/api/sessions/1"},
		{"pane", http.MethodGet, "/api/sessions/1/pane"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
}

// putSessionPinRequest issues PUT /api/sessions/{id}/pin with the UI cookie attached
// (plan order-sidebar, mirrors putPrefsRequest/postSessionsRequest for the other write
// endpoints).
func putSessionPinRequest(t *testing.T, srv *testServer, id int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/sessions/%d/pin", id), strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// putSessionOrderRequest issues PUT /api/sessions/order with the UI cookie attached.
func putSessionOrderRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/sessions/order", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHandlePinSession_RequiresCookie covers the auth wiring for plan order-sidebar's
// new endpoint.
func TestHandlePinSession_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPut, "/api/sessions/1/pin", strings.NewReader(`{"pinned":true}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandlePinSession_InvalidBodyIs400 covers kb:anchor/sessions.pin's 400 invalid_request clause: body
// not JSON, or pinned missing/not a boolean.
func TestHandlePinSession_InvalidBodyIs400(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"not JSON", `not valid json`},
		{"pinned missing", `{}`},
		{"pinned is a string, not a boolean", `{"pinned":"true"}`},
		{"pinned is null", `{"pinned":null}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			id := seedSessionRow(t, srv, nil)

			rec := putSessionPinRequest(t, srv, id, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

func TestHandlePinSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putSessionPinRequest(t, srv, 999999, `{"pinned":true}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandlePinSession_SuccessIs204AndPersists covers D6 through the real HTTP handler
// (decode -> delegate -> encode): a valid pin request returns 204 with no body and the
// store row reflects the new pinned flag.
func TestHandlePinSession_SuccessIs204AndPersists(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := putSessionPinRequest(t, srv, id, `{"pinned":true}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	assert.True(t, row.Pinned)
}

// TestHandlePinSession_NoOpIs204WithNoBroadcast covers D8 at the HTTP layer: pinning a
// session already in the requested state is still a 204, and no sessionUpsert reaches a
// connected UI socket.
func TestHandlePinSession_NoOpIs204WithNoBroadcast(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil) // freshly seeded rows start pinned:false

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putSessionPinRequest(t, srv, id, `{"pinned":false}`) // already false

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assertNoSessionUpsertArrives(t, c)
}

// assertNoSessionUpsertArrives mirrors prefs_test.go's assertNoPrefsMessageArrives for
// the sessionUpsert message type (D8/INV-5's no-broadcast half): a short read either
// times out (nothing arrived) or, if something did arrive, it must never be a
// sessionUpsert.
func assertNoSessionUpsertArrives(t *testing.T, c *websocket.Conn) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_, data, err := c.Read(ctx)
	if err != nil {
		return // timeout: nothing arrived, as expected
	}
	var msg struct {
		Type string `json:"type"`
	}
	require.NoError(t, json.Unmarshal(data, &msg))
	assert.NotEqual(t, "sessionUpsert", msg.Type, "no sessionUpsert broadcast was expected for a no-op pin call")
}

// TestSessionOrderAndPinHandlers_RequireCookie extends the shared cookie-check table
// with the two new endpoints.
func TestSessionOrderAndPinHandlers_RequireCookie(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"pin", http.MethodPut, "/api/sessions/1/pin", `{"pinned":true}`},
		{"order", http.MethodPut, "/api/sessions/order", `{"ids":[],"pinnedCount":0}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
}

// TestHandleSetOrder_InvalidBodyIs400 covers kb:anchor/sessions.order's 400 invalid_request clause: body
// not JSON, ids/pinnedCount missing, a duplicate/unknown id, or pinnedCount out of
// range — exercised through the real HTTP handler.
func TestHandleSetOrder_InvalidBodyIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	tests := []struct {
		name string
		body string
	}{
		{"not JSON", `not valid json`},
		{"ids missing", `{"pinnedCount":0}`},
		{"pinnedCount missing", fmt.Sprintf(`{"ids":[%d]}`, id)},
		{"pinnedCount negative", fmt.Sprintf(`{"ids":[%d],"pinnedCount":-1}`, id)},
		{"pinnedCount above len(ids)", fmt.Sprintf(`{"ids":[%d],"pinnedCount":2}`, id)},
		{"duplicate id", fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":0}`, id, id)},
		{"unknown id", `{"ids":[999999],"pinnedCount":0}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := putSessionOrderRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleSetOrder_SuccessIs204AndAppliesTheOrder covers D9 through the real HTTP
// handler: a valid order request returns 204 and the store reflects the new
// pinned/railPos values.
func TestHandleSetOrder_SuccessIs204AndAppliesTheOrder(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	idA := seedSessionRow(t, srv, nil)
	idB := seedSessionRow(t, srv, nil)

	rec := putSessionOrderRequest(t, srv, fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":1}`, idB, idA))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	rowB, err := srv.store.GetSession(context.Background(), idB)
	require.NoError(t, err)
	rowA, err := srv.store.GetSession(context.Background(), idA)
	require.NoError(t, err)
	assert.True(t, rowB.Pinned)
	assert.False(t, rowA.Pinned)
	assert.Less(t, rowB.RailPos, rowA.RailPos)
}

// TestHandleSetOrder_EmptyIDsIs204AndChangesNothing covers kb:anchor/sessions.order's explicit "empty ids
// is valid (a no-op ...)" clause through the real HTTP handler.
func TestHandleSetOrder_EmptyIDsIs204AndChangesNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)
	before, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)

	rec := putSessionOrderRequest(t, srv, `{"ids":[],"pinnedCount":0}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	after, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	assert.Equal(t, before, after)
}

// Note: a dedicated "tmux spawn failure rolls back the row" test was attempted and
// deliberately dropped. Manual probing (`tmux new-window -c <nonexistent dir> --
// <nonexistent binary>`) showed tmux's `new-window` returns exit 0 and a valid
// window/pane in both cases — the fork succeeds synchronously and only the child's
// later exec fails asynchronously in the pane, which tmux.Client.NewWindow has no way
// to observe. There is no environment-independent way to make `tmux.Client.NewWindow`
// itself return a synchronous error from this package (the binary name "tmux" isn't
// injectable), so the rollback code path for that specific step is covered only
// structurally, by TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow
// exercising the same `rollback` helper from an earlier failing step.
