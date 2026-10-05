package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

// The groups tests drive the real handlers over a real session.Manager and store with fake
// tmux ports, and record every broadcast as the JSON the hub would send — so what they
// assert is the wire the dashboard reads, not an internal type.

// wireLog records each broadcast message as decoded JSON, in arrival order.
type wireLog struct {
	mu   sync.Mutex
	msgs []map[string]any
}

func (w *wireLog) add(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		panic(err)
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.msgs = append(w.msgs, m)
}

func (w *wireLog) all() []map[string]any {
	w.mu.Lock()
	defer w.mu.Unlock()
	return append([]map[string]any(nil), w.msgs...)
}

func (w *wireLog) reset() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.msgs = nil
}

// kinds renders the log as "groups", "sessionUpsert:<id>" and "sessionRemoved:<id>".
func (w *wireLog) kinds() []string {
	out := []string{}
	for _, m := range w.all() {
		switch m["type"] {
		case "sessionUpsert":
			out = append(out, fmt.Sprintf("sessionUpsert:%v", m["session"].(map[string]any)["id"]))
		case "sessionRemoved":
			out = append(out, fmt.Sprintf("sessionRemoved:%v", m["id"]))
		default:
			out = append(out, m["type"].(string))
		}
	}
	return out
}

func (w *wireLog) count(kind string) int {
	n := 0
	for _, m := range w.all() {
		if m["type"] == kind {
			n++
		}
	}
	return n
}

// last returns the most recent message of type kind.
func (w *wireLog) last(t *testing.T, kind string) map[string]any {
	t.Helper()
	msgs := w.all()
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i]["type"] == kind {
			return msgs[i]
		}
	}
	require.Failf(t, "no message", "no %q message was broadcast", kind)
	return nil
}

// namedKiller is the session.TmuxSessions double: it records every kill and fails the ones
// named in failFor, which is how a test forces a genuine kill failure for one session.
type namedKiller struct {
	mu      sync.Mutex
	killed  []string
	failFor map[string]error
}

func (k *namedKiller) KillSession(_ context.Context, name string) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	if err, ok := k.failFor[name]; ok {
		return err
	}
	k.killed = append(k.killed, name)
	return nil
}

func (k *namedKiller) ListSessions(context.Context) ([]string, error) { return nil, nil }

func (k *namedKiller) ResolveSessionTarget(context.Context, string) (string, string, error) {
	return "", "", errors.New("namedKiller: ResolveSessionTarget not supported")
}

func (k *namedKiller) failKill(name string) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.failFor == nil {
		k.failFor = map[string]error{}
	}
	k.failFor[name] = errors.New("boom: tmux kill failed")
}

func (k *namedKiller) killedNames() []string {
	k.mu.Lock()
	defer k.mu.Unlock()
	return append([]string(nil), k.killed...)
}

// shellSpawner wraps fakeTmux so the shell registry's kills are recorded: sessionsFeature's
// teardownRemoved ends in shells.Kill, which kills tmux.ShellSessionName(id), so the recorded
// names prove which sessions the server tore down.
type shellSpawner struct {
	*fakeTmux
	mu    sync.Mutex
	kills []string
}

func (s *shellSpawner) KillSession(ctx context.Context, name string) error {
	s.mu.Lock()
	s.kills = append(s.kills, name)
	s.mu.Unlock()
	return s.fakeTmux.KillSession(ctx, name)
}

func (s *shellSpawner) shellKills() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.kills...)
}

func withOnRemoved(f func(int64)) sessionManagerOpt {
	return func(c *session.Config) { c.OnRemoved = f }
}

func withOnGroups(f func([]session.Group, session.UngroupedLayout)) sessionManagerOpt {
	return func(c *session.Config) { c.OnGroups = f }
}

// groupsHarness is the groups and sessions features mounted on one mux over a real manager.
type groupsHarness struct {
	t       *testing.T
	st      *store.Store
	mgr     *session.Manager
	mux     *http.ServeMux
	wire    *wireLog
	killer  *namedKiller
	spawner *shellSpawner
	// launcher is the one POST /api/sessions uses; a test sets checkModel or projectsDir on it.
	launcher *sessionLauncher
	dir      string
	repoID   int64
	// preexistingGroups is how many group rows the test made on purpose before the request
	// under test, so assertNothingHappened can say none was added.
	preexistingGroups int
}

func newGroupsHarness(t *testing.T) *groupsHarness {
	t.Helper()
	st := openLauncherTestStore(t)
	h := &groupsHarness{t: t, st: st, wire: &wireLog{}, killer: &namedKiller{}, dir: t.TempDir()}
	h.spawner = &shellSpawner{fakeTmux: newFakeTmux()}
	h.mgr = newSessionTestManager(t, st,
		withTmuxSessions(h.killer),
		withOnUpsert(func(s *session.Session) { h.wire.add(sessionUpsertWire(s)) }),
		withOnRemoved(func(id int64) { h.wire.add(sessionRemovedWire(id)) }),
		withOnGroups(func(g []session.Group, u session.UngroupedLayout) { h.wire.add(groupsWire(g, u)) }),
	)
	require.NoError(t, h.mgr.LoadAll(context.Background()))

	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: h.dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	h.repoID = repo.ID

	shells := newShellRegistry(h.spawner, zerolog.Nop())
	terminals := newTerminalRegistry()
	h.launcher = &sessionLauncher{
		store: st, manager: h.mgr, tmux: h.spawner, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}
	sessionsFeat := newSessionsFeature(h.mgr, h.launcher, shells, terminals, nil, zerolog.Nop())
	groupsFeat := newGroupsFeature(h.mgr, sessionsFeat.teardownRemoved, zerolog.Nop())
	noGuard := func(next http.Handler) http.Handler { return next }
	h.mux = http.NewServeMux()
	sessionsFeat.mount(h.mux, noGuard)
	groupsFeat.mount(h.mux, noGuard)
	return h
}

// launch creates and launches a session in group (nil = Ungrouped), live and announced.
func (h *groupsHarness) launch(group *int64) int64 {
	h.t.Helper()
	sess, err := h.mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: h.repoID, Directory: h.dir, PermissionMode: session.PermissionDefault, Model: "sonnet",
		FirstLaunchHere: true, GroupID: group,
	})
	require.NoError(h.t, err)
	_, err = h.mgr.RecordLaunch(context.Background(), sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(h.t, err)
	return sess.ID
}

func (h *groupsHarness) newGroup(name string, sessionIDs ...int64) int64 {
	h.t.Helper()
	g, err := h.mgr.CreateGroup(context.Background(), name, sessionIDs)
	require.NoError(h.t, err)
	return g.ID
}

// do sends one request straight to the mux (no auth guard: the cookie wiring is covered
// against the real server by TestGroupEndpoints_RequireTheCookie).
func (h *groupsHarness) do(method, path, body string) *httptest.ResponseRecorder {
	h.t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	rec := httptest.NewRecorder()
	h.mux.ServeHTTP(rec, req)
	return rec
}

// sessionGroup returns a session's group id, 0 for Ungrouped.
func (h *groupsHarness) sessionGroup(id int64) int64 {
	h.t.Helper()
	s, ok := h.mgr.Get(id)
	require.True(h.t, ok, "session %d is gone", id)
	if s.GroupID == nil {
		return 0
	}
	return *s.GroupID
}

func (h *groupsHarness) groupIDs() []int64 {
	groups, _ := h.mgr.Groups()
	ids := make([]int64, len(groups))
	for i, g := range groups {
		ids[i] = g.ID
	}
	return ids
}

// groupRowCount is how many rail_group rows the store holds, hidden launch groups included.
func (h *groupsHarness) groupRowCount() int {
	h.t.Helper()
	rows, err := h.st.ListGroups(context.Background())
	require.NoError(h.t, err)
	return len(rows)
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &m), "body: %s", rec.Body.String())
	return m
}

// shellName is the shell session name teardownRemoved kills for id.
func shellName(id int64) string { return tmux.ShellSessionName(id) }

// jsonIDs renders ids as a JSON array literal.
func jsonIDs(ids ...int64) string {
	b, _ := json.Marshal(ids)
	return string(b)
}

// idList turns a decoded JSON array of numbers into []int64.
func idList(t *testing.T, v any) []int64 {
	t.Helper()
	arr, ok := v.([]any)
	require.True(t, ok, "expected a JSON array, got %T (%v)", v, v)
	out := make([]int64, len(arr))
	for i, e := range arr {
		out[i] = int64(e.(float64))
	}
	return out
}
