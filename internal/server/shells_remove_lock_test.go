package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

// gatedPaneExistsTmux wraps a real paneSpawner so PaneExists for one specific target
// blocks until release is closed, signalling entered exactly once first — the
// review.maintainability.b-server.md Major 3 interleaving's fixture: "Give the fake
// paneSpawner's PaneExists ... a controllable gate". Embedding the paneSpawner interface
// gives every other method (NewSession, NewNamedSession, MaxSessionID, KillWindow,
// KillSession) unmodified, so this only needs to override the one method the interleaving
// gates.
//
// Wraps a *real* per-test tmux client (via tmuxtest.Socket), not fakeTmux: this test's
// DELETE goroutine reaches session.Manager.Remove's End path, and Manager's own
// PaneChecker/TmuxSessions ports are always the real, unconditionally-constructed tmux
// client bound to Config.TmuxSocket (fakes_test.go's newFakeTmuxTestServer doc comment) —
// independent of Config.TmuxClient. Gating only Config.TmuxClient's PaneExists (which
// shellRegistry.Ensure calls) while Manager's own ports talk to the same real, working
// socket keeps Remove's own tmux calls fast and correct, which is what this interleaving
// actually needs bounded ("B has not returned yet") rather than accidentally slow for an
// unrelated reason.
type gatedPaneExistsTmux struct {
	paneSpawner
	gateTarget string
	entered    chan struct{}
	release    chan struct{}
	enterOnce  sync.Once
}

func newGatedPaneExistsTmux(inner paneSpawner) *gatedPaneExistsTmux {
	return &gatedPaneExistsTmux{paneSpawner: inner, entered: make(chan struct{}), release: make(chan struct{})}
}

func (g *gatedPaneExistsTmux) PaneExists(ctx context.Context, target string) (bool, error) {
	if target == g.gateTarget {
		g.enterOnce.Do(func() { close(g.entered) })
		select {
		case <-g.release:
		case <-ctx.Done():
			return false, ctx.Err()
		}
	}
	return g.paneSpawner.PaneExists(ctx, target)
}

// TestHandleCreateShell_BlocksConcurrentRemoveUntilEnsureCompletes covers
// review.maintainability.b-server.md Major 3: a POST .../shell in flight (blocked inside
// shellRegistry.Ensure's PaneExists check) must hold session.Manager's per-id lock for its
// whole existence-check-then-spawn, so a concurrent DELETE's session.Manager.Remove (which
// takes the same lock) cannot even remove the row until the shell POST finishes — and once
// it does, Remove's own shells.Kill cleans up whatever the shell POST just spawned.
// Pre-fix, handleCreateShell held no session.Manager lock at all (only shellRegistry's own,
// unrelated, per-id lock), so manager.Remove could run to completion concurrently and
// Ensure would then spawn a shell for an id Remove had already deleted.
//
// The assertion is deliberately srv.manager.Exists(id), not "has the DELETE response come
// back yet": handleRemoveSession's own HTTP response only returns once it has *also*
// called shells.Kill, which serialises on shellRegistry's own (unrelated) per-id lock that
// Ensure is separately holding — so the whole handler appears to "not have returned" for
// the same span both pre- and post-fix, which would make that a non-discriminating check.
// The row's actual existence is what the fix changes: pre-fix it is deleted almost
// immediately (independent of Ensure's lock); post-fix it must survive for as long as
// Ensure holds session.Manager's lock.
//
// Written to FAIL on the pre-F2 code: see daemon-tests-F2.md for the captured failure
// against the restored pre-fix internal/server/shells.go.
func TestHandleCreateShell_BlocksConcurrentRemoveUntilEnsureCompletes(t *testing.T) {
	t.Setenv("SHELL", "/bin/sh") // interactiveShellArgv() reads $SHELL; keeps the spawned shell fast/deterministic

	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath, zerolog.Nop())
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	socket := tmuxtest.Socket(t)
	gated := newGatedPaneExistsTmux(tmux.New(socket))
	logBuf := &syncBuffer{}
	srvRaw := New(Config{
		Store: st, Logger: zerolog.New(logBuf), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		TmuxSocket: socket, TmuxClient: gated,
	})
	srv := &testServer{Server: srvRaw, dbPath: dbPath, logs: logBuf, store: st, tmuxSocket: socket}

	sess := launchRealSession(t, srv, sleepForeverCommand())
	gated.gateTarget = tmux.ShellSessionName(sess.ID)

	// The request is built and served here (rather than via postShellRequest, which
	// itself asserts) so the goroutine below never calls into testify from a non-test
	// goroutine (testifylint's go-require); the response body is decoded back on the
	// main test goroutine once ensureDone fires.
	shellReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+strconv.FormatInt(sess.ID, 10)+"/shell", nil)
	shellReq.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	shellRec := httptest.NewRecorder()
	ensureDone := make(chan struct{})
	go func() {
		defer close(ensureDone)
		srv.Handler().ServeHTTP(shellRec, shellReq)
	}()

	select {
	case <-gated.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("handleCreateShell never reached the gated PaneExists call")
	}

	removeDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		removeDone <- sessionActionRequest(t, srv, http.MethodDelete, "/api/sessions/"+strconv.FormatInt(sess.ID, 10))
	}()

	// While handleCreateShell is stuck inside Ensure's gated PaneExists, the session row
	// must survive: manager.Remove cannot even acquire session.Manager's per-id lock (held
	// by handleCreateShell) to delete it. Polled repeatedly (not a single check after a
	// fixed sleep) to catch a regression that deletes the row at any point during the
	// window, not just at its end.
	deadline := time.Now().Add(300 * time.Millisecond)
	for time.Now().Before(deadline) {
		if !srv.manager.Exists(sess.ID) {
			t.Fatal("Major 3 regression: the session row was removed while handleCreateShell still held session.Manager's per-id lock inside Ensure")
		}
		time.Sleep(10 * time.Millisecond)
	}

	close(gated.release)

	select {
	case <-ensureDone:
	case <-time.After(2 * time.Second):
		t.Fatal("handleCreateShell never completed after its gate was released")
	}
	require.Equal(t, http.StatusOK, shellRec.Code)
	var shellBody createShellResponse
	require.NoError(t, json.Unmarshal(shellRec.Body.Bytes(), &shellBody))
	assert.True(t, shellBody.Created, "the session was still alive when Ensure's existence check ran, so it must have spawned")
	shellTarget := shellBody.Target
	assert.Equal(t, tmux.ShellSessionName(sess.ID), shellTarget)

	var remRec *httptest.ResponseRecorder
	select {
	case remRec = <-removeDone:
	case <-time.After(3 * time.Second):
		t.Fatal("DELETE never completed after handleCreateShell released the lock")
	}
	assert.Equal(t, http.StatusNoContent, remRec.Code)
	assert.False(t, srv.manager.Exists(sess.ID), "Remove must have completed once Ensure released the lock")

	require.Eventually(t, func() bool {
		exists, existsErr := gated.paneSpawner.PaneExists(context.Background(), shellTarget)
		return existsErr == nil && !exists
	}, 3*time.Second, 20*time.Millisecond, "Remove's shells.Kill must have cleaned up the shell handleCreateShell just spawned")
}
