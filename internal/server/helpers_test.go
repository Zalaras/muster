package server

import (
	"bytes"
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"

	_ "modernc.org/sqlite"
)

const (
	testUIToken     = "test-ui-token"
	testIngestToken = "test-ingest-token"
)

// syncBuffer is a mutex-guarded bytes.Buffer: the ingest worker goroutine writes log lines
// concurrently with the test goroutine reading them back, and a bare bytes.Buffer is not
// safe for that (zerolog itself makes no thread-safety promise about an arbitrary
// io.Writer — synchronizing access to it is the caller's job).
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// testServer bundles a Server with the pieces tests need to inspect: the backing store's
// db path (for out-of-band SQL assertions the store package itself doesn't expose) and a
// buffer capturing every log line (for D11's "never log payload bodies" assertions).
type testServer struct {
	*Server
	dbPath string
	logs   *syncBuffer
	store  *store.Store
	// tmuxSocket is the socket path backing srv.tmuxClient, populated only by
	// newTerminalTestServer (terminal_test.go). It exists purely so terminal tests can
	// run their own tmux CLI oracle queries (list-clients, #{session_attached}) that
	// tmux.Client itself does not expose — production code has no reason to read either
	// (CLAUDE.md: capture/attach are display + oracle only, never a state source).
	tmuxSocket string
}

// newTestServer builds a Server against a fresh temp-dir SQLite store. It does not call
// Start(); tests that need the ingest worker running call srv.Start() themselves and are
// responsible for Stop-equivalent cleanup via t.Cleanup.
func newTestServer(t *testing.T, cc ClaudeCodeInfo) *testServer {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	logBuf := &syncBuffer{}
	logger := zerolog.New(logBuf)

	srv := New(Config{
		Store:         st,
		Logger:        logger,
		UIToken:       testUIToken,
		IngestToken:   testIngestToken,
		WebDist:       t.TempDir(),
		DaemonVersion: "test-version",
		ClaudeCode:    cc,
	})

	return &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st}
}

// queryDB opens a second, independent connection to the same SQLite file the server's
// store writes to, purely for test-side assertions the store package's own API doesn't
// expose (e.g. reading back seq/type columns by claude_session_id). WAL mode allows this
// reader to run concurrently with the store's single writer connection. This mirrors what
// the E2E harness does out-of-process via the sqlite3 CLI (plan's Protocol Contract note
// on `<data-dir>/muster.db`).
func (srv *testServer) queryDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", srv.dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return db
}
