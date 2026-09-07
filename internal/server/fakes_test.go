package server

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

// fakeTmux is the paneSpawner (REQ-1) and attachFunc source (REQ-2) test double for
// every test in this package whose assertion is about call shape, counts or error
// propagation — never a tmux-observable effect (PTY stream, geometry, liveness, pane
// env, real client attachment): those stay on a real per-test tmux socket, per this
// plan's keep-real list (Implementation Notes). No fakeTmux method ever execs a real
// tmux process; a spawned "pane" is just an entry in an in-memory table.
//
// Spawn/kill/attach all thread through the same table so a Kill (real or simulated by a
// fakePaneConn's Close, e.g. a shell that "exited") is visible to a later PaneExists or
// Ensure call, exactly as it would be against a real socket.
type fakeTmux struct {
	mu    sync.Mutex
	panes map[string]bool // target/session name -> exists
	next  int

	newSessionErr      error
	newNamedSessionErr error

	newSessionCalls      int
	newNamedSessionCalls int
	killWindowCalls      int
	killSessionCalls     int

	lastConn *fakePaneConn // the most recent attach's connection, for tests that need to inspect it (e.g. a recorded resize)
}

func newFakeTmux() *fakeTmux {
	return &fakeTmux{panes: make(map[string]bool)}
}

func (f *fakeTmux) NewSession(_ context.Context, id int64, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.newSessionCalls++
	if f.newSessionErr != nil {
		return "", "", f.newSessionErr
	}
	f.next++
	target = fmt.Sprintf("muster-%d:@%d", id, f.next)
	f.panes[target] = true
	return target, fmt.Sprintf("%%%d", f.next), nil
}

func (f *fakeTmux) NewNamedSession(_ context.Context, name, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.newNamedSessionCalls++
	if f.newNamedSessionErr != nil {
		return "", "", f.newNamedSessionErr
	}
	f.next++
	f.panes[name] = true
	return name, fmt.Sprintf("%%%d", f.next), nil
}

func (f *fakeTmux) PaneExists(_ context.Context, target string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.panes[target], nil
}

func (f *fakeTmux) KillWindow(_ context.Context, target string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.killWindowCalls++
	delete(f.panes, target)
	return nil
}

func (f *fakeTmux) KillSession(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.killSessionCalls++
	delete(f.panes, name)
	return nil
}

// markGone simulates a pane dying on its own (e.g. a shell that received "exit") —
// called by fakePaneConn.Close so a subsequent PaneExists/Ensure observes "no pane" the
// same way it would against a real tmux session, without a real process ever running.
func (f *fakeTmux) markGone(target string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.panes, target)
}

// attach is the attachFunc closing over this fakeTmux (REQ-2's Config.Attach override):
// it fabricates a paneConn for target regardless of whether the fake currently believes
// a pane exists there (attach's own error path is covered for real by the keep-real
// tests), and marks the pane gone when the connection closes — modeling a real bridge
// close/PTY-EOF's effect on the underlying tmux session.
func (f *fakeTmux) attach(_ context.Context, target string) (paneConn, error) {
	conn := newFakePaneConn(func() { f.markGone(target) })
	f.mu.Lock()
	f.lastConn = conn
	f.mu.Unlock()
	return conn, nil
}

// lastPaneConn returns the most recent attach's fakePaneConn, or nil if attach was never
// called — used by tests that need to assert something the connection itself recorded
// (e.g. a resize), without a tmux-observable effect to check against instead.
func (f *fakeTmux) lastPaneConn() *fakePaneConn {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.lastConn
}

// fakePaneConn is the paneConn (REQ-2) test double: an in-memory stand-in for a real PTY
// bridge, never a real tmux attach. Read blocks until Close, mirroring how a real
// bridge.Read unblocks only once the bridge is torn down (terminal.go's teardown
// comment) — there is no real process generating output for a fake to stream. Write
// records what was sent and, if it sees "exit" (mirroring an interactive shell told to
// exit), closes itself asynchronously to simulate the resulting PTY EOF.
type fakePaneConn struct {
	mu         sync.Mutex
	closed     bool
	closeCh    chan struct{}
	writes     [][]byte
	resizeCols int
	resizeRows int
	onClose    func()
}

func newFakePaneConn(onClose func()) *fakePaneConn {
	return &fakePaneConn{closeCh: make(chan struct{}), onClose: onClose}
}

func (c *fakePaneConn) Read(_ []byte) (int, error) {
	<-c.closeCh
	return 0, io.EOF
}

func (c *fakePaneConn) Write(p []byte) (int, error) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return 0, io.ErrClosedPipe
	}
	buf := make([]byte, len(p))
	copy(buf, p)
	c.writes = append(c.writes, buf)
	shouldClose := containsExit(p)
	c.mu.Unlock()

	if shouldClose {
		// Asynchronous: a real shell's "exit" produces the PTY EOF sometime after the
		// input is delivered, never synchronously inside the write call itself — and
		// Write must not block on Close's onClose callback (which may itself call back
		// into fakeTmux under its own lock).
		go func() { _ = c.Close() }()
	}
	return len(p), nil
}

func containsExit(p []byte) bool {
	const exit = "exit"
	if len(p) < len(exit) {
		return false
	}
	for i := 0; i+len(exit) <= len(p); i++ {
		if string(p[i:i+len(exit)]) == exit {
			return true
		}
	}
	return false
}

func (c *fakePaneConn) Resize(_ context.Context, cols, rows int) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.resizeCols, c.resizeRows = cols, rows
	return nil
}

// resize reads back the most recently applied cols/rows under the same lock Resize
// writes them with — a test must never read the bare fields directly (data race).
func (c *fakePaneConn) resize() (cols, rows int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.resizeCols, c.resizeRows
}

// Close is idempotent (terminal.go's teardown and a simulated "exit" can both call it)
// and calls onClose, if set, exactly once, strictly before unblocking Read — so any
// caller that only observes "Read returned" (e.g. via the WS socket's own resulting
// close) is guaranteed onClose has already run, with no race window.
func (c *fakePaneConn) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.closed = true
	c.mu.Unlock()

	if c.onClose != nil {
		c.onClose()
	}
	close(c.closeCh)
	return nil
}

// newFakeTmuxTestServer builds a Server whose paneSpawner and attachFunc are both fakes
// (REQ-1/REQ-2): no real tmux server is ever started, matching REQ-3's "moved" tests.
// The manager's own PaneChecker/PaneSnapshotter/SessionKiller are unaffected by this
// (server.go's New always constructs those from a real, if never-actually-touched,
// tmux.Client bound to cfg.TmuxSocket — an independent seam this plan does not add) —
// callers must never invoke a path that reaches them (Nudge, End, Remove, Reconcile,
// Start's poller) from a test built by this constructor; use markSessionDead instead of
// killing a "pane" and nudging liveness.
func newFakeTmuxTestServer(t *testing.T) (*testServer, *fakeTmux) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	fake := newFakeTmux()
	logBuf := &syncBuffer{}
	srv := New(Config{
		Store: st, Logger: zerolog.New(logBuf), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		TmuxClient: fake, Attach: fake.attach,
	})
	return &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st}, fake
}

// markSessionDead flips id's Alive flag to false directly in the store and reloads the
// manager's in-memory copy, without ever nudging the liveness poll (which would reach
// the manager's own always-real PaneChecker — see newFakeTmuxTestServer's doc comment).
// Used only by fakes-based tests that need a dead session.
func markSessionDead(t *testing.T, srv *testServer, id int64) {
	t.Helper()
	ctx := context.Background()
	row, err := srv.store.GetSession(ctx, id)
	require.NoError(t, err)
	row.Alive = false
	now := time.Now().UTC()
	row.EndedAt = &now
	require.NoError(t, srv.store.UpdateSession(ctx, row))
	require.NoError(t, srv.manager.LoadAll(ctx))
}
