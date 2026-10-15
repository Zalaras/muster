package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// --- the dismiss route (REQ-9, D13) ---

func deleteEffortWarning(t *testing.T, srv *testServer, id int64) *httptest.ResponseRecorder {
	t.Helper()
	return authedRequest(t, srv, http.MethodDelete, fmt.Sprintf("/api/sessions/%d/effort-warning", id), "")
}

func withWarning(requested string, actual *string, model *string) func(*store.SessionRow) {
	return func(r *store.SessionRow) {
		r.EffortKnown = true
		r.EffortLevel = actual
		r.EffortWarningRequested = &requested
		r.EffortWarningActual = actual
		r.EffortWarningModel = model
	}
}

func TestHandleDismissEffortWarning_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodDelete, "/api/sessions/1/effort-warning", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleDismissEffortWarning_UnknownSessionIs404WithTheSharedBody covers D13's last
// clause. The route serves the one shared unknown-session envelope every other session
// route serves (kb:adr/focus-effort-dismiss-404-uses-shared-body), spelled literally in
// wantUnknownSessionBody (respond_unknown_session_test.go).
func TestHandleDismissEffortWarning_UnknownSessionIs404WithTheSharedBody(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"unknown id", "/api/sessions/999999/effort-warning"},
		{"malformed id", "/api/sessions/not-a-number/effort-warning"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := authedRequest(t, srv, http.MethodDelete, tt.path, "")

			assert.Equal(t, http.StatusNotFound, rec.Code)
			assert.JSONEq(t, wantUnknownSessionBody, rec.Body.String())
		})
	}
}

// TestHandleDismissEffortWarning_ClearsPersistsAndBroadcastsOnce covers D13's first
// clause through the real handler and a connected socket: 204 with no body, the row's
// warning columns cleared (effort kept), exactly one sessionUpsert carrying a null
// effortWarning, and the other warned session untouched.
func TestHandleDismissEffortWarning_ClearsPersistsAndBroadcastsOnce(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	model := "Opus 4.5"
	high := "high"
	id := seedSessionRow(t, srv, withWarning("max", &high, &model))
	otherID := seedSessionRow(t, srv, withWarning("high", nil, &model))

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := deleteEffortWarning(t, srv, id)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())

	var upsert struct {
		Session struct {
			ID            int64           `json:"id"`
			Effort        json.RawMessage `json:"effort"`
			EffortWarning json.RawMessage `json:"effortWarning"`
		} `json:"session"`
	}
	require.NoError(t, json.Unmarshal(readUntilType(t, c, "sessionUpsert"), &upsert))
	assert.Equal(t, id, upsert.Session.ID)
	assert.Equal(t, "null", string(upsert.Session.EffortWarning), "the key is present and null, not omitted")
	assert.JSONEq(t, `{"level":"high"}`, string(upsert.Session.Effort), "dismiss leaves effort alone")
	assertNoSessionUpsertArrives(t, c)

	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	assert.Nil(t, row.EffortWarningRequested)
	assert.Nil(t, row.EffortWarningActual)
	assert.Nil(t, row.EffortWarningModel)
	assert.True(t, row.EffortKnown)

	other, err := srv.store.GetSession(context.Background(), otherID)
	require.NoError(t, err)
	require.NotNil(t, other.EffortWarningRequested, "a second warned session is untouched")
	assert.Equal(t, "high", *other.EffortWarningRequested)
}

func TestHandleDismissEffortWarning_NullWarningIs204WithNoBroadcast(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := deleteEffortWarning(t, srv, id)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assertNoSessionUpsertArrives(t, c)

	again := deleteEffortWarning(t, srv, id)
	assert.Equal(t, http.StatusNoContent, again.Code, "edge case 18: a second window's dismiss is still 204")
}

// --- the Session wire (REQ-5, REQ-7) ---

func TestToWireSession_EffortShapes(t *testing.T) {
	high, maxLevel := "high", "max"
	opus := "Opus 4.5"
	tests := []struct {
		name        string
		effort      *session.Effort
		warning     *session.EffortWarning
		wantEffort  string
		wantWarning string
	}{
		{name: "not yet reported", wantEffort: `null`, wantWarning: `null`},
		{name: "a level", effort: &session.Effort{Level: &high}, wantEffort: `{"level":"high"}`, wantWarning: `null`},
		{name: "reported with no effort setting", effort: &session.Effort{}, wantEffort: `{"level":null}`, wantWarning: `null`},
		{name: "a clamped warning", effort: &session.Effort{Level: &high},
			warning:    &session.EffortWarning{Requested: "max", Actual: &high, Model: &opus},
			wantEffort: `{"level":"high"}`, wantWarning: `{"requested":"max","actual":"high","model":"Opus 4.5"}`},
		{name: "a no-effort warning with no model", effort: &session.Effort{},
			warning:    &session.EffortWarning{Requested: maxLevel},
			wantEffort: `{"level":null}`, wantWarning: `{"requested":"max","actual":null,"model":null}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := minimalSession()
			s.Effort, s.EffortWarning = tt.effort, tt.warning

			b, err := json.Marshal(toWireSession(s))
			require.NoError(t, err)

			var got map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(b, &got))
			require.Contains(t, got, "effort", "required key, never omitted")
			require.Contains(t, got, "effortWarning", "required key, never omitted")
			assert.JSONEq(t, tt.wantEffort, string(got["effort"]))
			assert.JSONEq(t, tt.wantWarning, string(got["effortWarning"]))
		})
	}
}

// --- POST /api/sessions: the effort field (REQ-2, REQ-3, REQ-4, D3, D4) ---

func newEffortLauncher(st *store.Store, mgr *session.Manager, fake *fakeTmux) *sessionLauncher {
	return &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "claude",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}
}

const effortInvalidMessage = "effort must be one of low, medium, high, xhigh, max"

// TestHandleCreateSession_InvalidEffortIs400AndWritesNothing covers D3 through the real
// handler: every value outside the five (case, other vocabulary, empty, wrong JSON type)
// is refused with the contract's message, and no repo row, settings file or session row is
// written.
func TestHandleCreateSession_InvalidEffortIs400AndWritesNothing(t *testing.T) {
	tests := []struct {
		name   string
		effort string
		want   string
	}{
		{"upper case", `"HIGH"`, effortInvalidMessage},
		{"auto", `"auto"`, effortInvalidMessage},
		{"ultracode", `"ultracode"`, effortInvalidMessage},
		{"empty string", `""`, effortInvalidMessage},
		{"padded", `" high"`, effortInvalidMessage},
		{"default is the form's word, not a wire value", `"default"`, effortInvalidMessage},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			dir := t.TempDir()

			rec := postSessionsRequest(t, srv, `{"directory":"`+dir+`","model":"sonnet","permissionMode":"default","effort":`+tt.effort+`}`)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.JSONEq(t, `{"error":{"code":"invalid_request","message":"`+tt.want+`"}}`, rec.Body.String())
			repos, err := srv.store.ListRepos(context.Background())
			require.NoError(t, err)
			assert.Empty(t, repos, "no repo row")
			sessions, err := srv.store.ListSessions(context.Background())
			require.NoError(t, err)
			assert.Empty(t, sessions, "no session row")
			assert.NoDirExists(t, filepath.Join(dir, ".claude"), "no settings written")
		})
	}
}

// TestValidateLaunchRequest_EffortCheckOrder covers the load-bearing order: effort is
// checked after directory, model and permissionMode, so a request invalid in several ways
// reports the earlier one, and effort is checked before the model pre-check runs.
func TestValidateLaunchRequest_EffortCheckOrder(t *testing.T) {
	dir := t.TempDir()
	bad := "HIGH"
	tests := []struct {
		name string
		req  createSessionRequest
		want string
	}{
		{"bad effort alone", createSessionRequest{Directory: dir, Model: "sonnet", PermissionMode: "default", Effort: &bad}, effortInvalidMessage},
		{"bad effort and bad permissionMode: permissionMode wins", createSessionRequest{Directory: dir, Model: "sonnet", PermissionMode: "bogus", Effort: &bad},
			"permissionMode must be one of default, plan, acceptEdits, auto, bypassPermissions"},
		{"bad effort and empty model: model wins", createSessionRequest{Directory: dir, Model: "", PermissionMode: "default", Effort: &bad}, "model must not be empty"},
		{"bad effort and bad directory: directory wins", createSessionRequest{Directory: "relative", Model: "sonnet", PermissionMode: "default", Effort: &bad}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lerr := validateLaunchRequest(tt.req)

			require.NotNil(t, lerr)
			assert.Equal(t, "invalid_request", lerr.code)
			if tt.want != "" {
				assert.Equal(t, tt.want, lerr.message)
			} else {
				assert.NotEqual(t, effortInvalidMessage, lerr.message)
			}
		})
	}

	for _, ok := range []*string{nil, ptrTo("low"), ptrTo("medium"), ptrTo("high"), ptrTo("xhigh"), ptrTo("max")} {
		assert.Nil(t, validateLaunchRequest(createSessionRequest{Directory: dir, Model: "sonnet", PermissionMode: "default", Effort: ok}))
	}
}

func ptrTo[T any](v T) *T { return &v }

// TestLauncher_InvalidEffortNeverReachesTheModelCheck covers "after permissionMode and
// before the model pre-check": a request invalid by effort reports invalid_request and the
// catalog check is never asked, even when it would have refused the model.
func TestLauncher_InvalidEffortNeverReachesTheModelCheck(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	calls := 0
	l := newModelCheckLauncher(st, mgr, fake, claudecode.ModelUnrecognised, nil, &calls)
	bad := "ultracode"

	_, lerr := l.Launch(context.Background(), createSessionRequest{Directory: t.TempDir(), Model: "zephyr", PermissionMode: "default", Effort: &bad})

	require.NotNil(t, lerr)
	assert.Equal(t, "invalid_request", lerr.code)
	assert.Equal(t, 0, calls)
	assert.Equal(t, 0, fake.newSessionCalls)
}

// TestLauncher_LaunchEffort covers D4/D8/REQ-2/REQ-4: a level reaches the argv right
// after --permission-mode and is recorded as the repo's lastEffort; absent and null send
// no flag and record null (a later default launch clears a remembered level); the session
// starts with effort null and warning null.
func TestLauncher_LaunchEffort(t *testing.T) {
	tests := []struct {
		name       string
		effort     *string
		wantArgv   []string
		wantRecord *string
	}{
		{"a level", ptrTo("max"), []string{"--permission-mode", "auto", "--effort", "max"}, ptrTo("max")},
		{"absent or null: no flag", nil, nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			mgr := newSessionTestManager(t, st)
			fake := newFakeTmux()
			l := newEffortLauncher(st, mgr, fake)
			dir := t.TempDir()

			sess, lerr := l.Launch(context.Background(), createSessionRequest{Directory: dir, Model: "opus", PermissionMode: "auto", Effort: tt.effort})

			require.Nil(t, lerr)
			argv := fake.lastNewSessionArgv()
			if tt.wantArgv != nil {
				i := indexOf(argv, "--permission-mode")
				require.GreaterOrEqual(t, i, 0)
				assert.Equal(t, tt.wantArgv, argv[i:])
			} else {
				assert.NotContains(t, argv, "--effort")
			}
			assert.Nil(t, sess.Effort, "a launched session's effort starts null")
			assert.Nil(t, sess.EffortWarning)
			repo, err := st.GetRepo(context.Background(), sess.RepoID)
			require.NoError(t, err)
			assert.Equal(t, tt.wantRecord, repo.LastEffort)
		})
	}

	t.Run("a default launch clears the remembered level", func(t *testing.T) {
		st := openLauncherTestStore(t)
		mgr := newSessionTestManager(t, st)
		l := newEffortLauncher(st, mgr, newFakeTmux())
		dir := t.TempDir()
		first, lerr := l.Launch(context.Background(), createSessionRequest{Directory: dir, Model: "opus", PermissionMode: "auto", Effort: ptrTo("xhigh")})
		require.Nil(t, lerr)
		repo, err := st.GetRepo(context.Background(), first.RepoID)
		require.NoError(t, err)
		require.Equal(t, ptrTo("xhigh"), repo.LastEffort)

		second, lerr := l.Launch(context.Background(), createSessionRequest{Directory: dir, Model: "opus", PermissionMode: "auto"})

		require.Nil(t, lerr)
		repo, err = st.GetRepo(context.Background(), second.RepoID)
		require.NoError(t, err)
		assert.Nil(t, repo.LastEffort)
	})
}

// TestLauncher_LaunchEffortStartsTheFirstReportCheck: a launch with a level leaves the
// check pending on the row, so the first routed status post decides the warning, while a
// default launch leaves none.
func TestLauncher_LaunchEffortStartsTheFirstReportCheck(t *testing.T) {
	tests := []struct {
		name     string
		effort   *string
		report   *string
		wantWarn bool
	}{
		{"asked max, started high", ptrTo("max"), ptrTo("high"), true},
		{"asked high, started high", ptrTo("high"), ptrTo("high"), false},
		{"asked high, no effort setting", ptrTo("high"), nil, true},
		{"default launch, any report", nil, ptrTo("low"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			mgr := newSessionTestManager(t, st)
			l := newEffortLauncher(st, mgr, newFakeTmux())
			sess, lerr := l.Launch(context.Background(), createSessionRequest{Directory: t.TempDir(), Model: "opus", PermissionMode: "auto", Effort: tt.effort})
			require.Nil(t, lerr)

			got, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Effort: &claudecode.StatusEffort{Level: tt.report}})
			require.NoError(t, err)

			assert.Equal(t, tt.wantWarn, got.EffortWarning != nil)
		})
	}
}

// --- GET /api/repos: lastEffort (REQ-4, D8) ---

func TestHandleListRepos_LastEffort(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	ctx := context.Background()
	_, _, err := srv.store.UpsertRepo(ctx, store.UpsertRepoParams{Path: "/tmp/a", Name: "a", Model: "sonnet", PermissionMode: "default", Effort: ptrTo("xhigh")})
	require.NoError(t, err)
	_, _, err = srv.store.UpsertRepo(ctx, store.UpsertRepoParams{Path: "/tmp/b", Name: "b", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)

	rec := getReposRequest(t, srv)

	require.Equal(t, http.StatusOK, rec.Code)
	var raw []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &raw))
	byPath := map[string]string{}
	for _, r := range raw {
		require.Contains(t, r, "lastEffort", "the key is always present")
		var path string
		require.NoError(t, json.Unmarshal(r["path"], &path))
		byPath[path] = string(r["lastEffort"])
	}
	assert.Equal(t, map[string]string{"/tmp/a": `"xhigh"`, "/tmp/b": `null`}, byPath)
}

// --- the resume form (REQ-3, REQ-11, D12) ---

func TestValidateResumeRequest_EffortOnTheResumeForm(t *testing.T) {
	dir := t.TempDir()
	tests := []struct {
		name    string
		body    string
		wantErr string
	}{
		{"effort absent", `{"directory":"` + dir + `","resumeSessionId":"abc"}`, ""},
		{"effort null decodes as not given", `{"directory":"` + dir + `","resumeSessionId":"abc","effort":null}`, ""},
		{"effort a level", `{"directory":"` + dir + `","resumeSessionId":"abc","effort":"low"}`, "resumeSessionId cannot be combined with title, model, permissionMode or effort"},
		{"effort an invalid value is still the combination error", `{"directory":"` + dir + `","resumeSessionId":"abc","effort":"HIGH"}`, "resumeSessionId cannot be combined with title, model, permissionMode or effort"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req createSessionRequest
			require.NoError(t, json.NewDecoder(strings.NewReader(tt.body)).Decode(&req))

			lerr := validateResumeRequest(req)

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
