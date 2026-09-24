package server

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// TestProcess_ApplyPersistFailureLogsSessionID covers item (c): ErrUnknownSession (and
// every other error manager.Apply can return) carries no session id of its own to print,
// so process's warn log must add one explicitly rather than relying on err's own text.
//
// Two separate *store.Store handles open the same SQLite file — store.Open on an
// already-migrated path is a supported, tested pattern
// (TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations) — so the manager's own store can
// be closed to force Apply's persist to fail, without also failing the ingest queue's own
// InsertEvent, which runs first in process() and would otherwise mask this log entirely.
func TestProcess_ApplyPersistFailureLogsSessionID(t *testing.T) {
	path := filepath.Join(t.TempDir(), "muster.db")
	mgrStore, err := store.Open(context.Background(), path, zerolog.Nop())
	require.NoError(t, err)
	t.Cleanup(func() { _ = mgrStore.Close() })
	ingestStore, err := store.Open(context.Background(), path, zerolog.Nop())
	require.NoError(t, err)
	t.Cleanup(func() { _ = ingestStore.Close() })

	mgr := newSessionTestManager(t, mgrStore)
	repo, _, err := mgrStore.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: "/tmp/ingest-log-test", Name: "ingest-log-test", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: "/tmp/ingest-log-test", PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(t, err)
	final, err := mgr.RecordLaunch(context.Background(), sess.ID, "muster-ingest-log:@1", "%1")
	require.NoError(t, err)

	require.NoError(t, mgrStore.Close(), "closing only the manager's store forces Apply's own persist to fail")

	var logBuf strings.Builder
	q := newIngestQueue(ingestStore, zerolog.New(&logBuf), 4, mgr, nil, nil)

	q.process(ingestJob{
		kind: claudecode.KindHook,
		body: []byte(claudecodetest.EnvelopedHookBody(int(final.ID), "%1", "SessionStart", "claude-log-test")),
	})

	logged := logBuf.String()
	assert.Contains(t, logged, "applying ingest event to session state failed")
	assert.Contains(t, logged, fmt.Sprintf(`"session_id":%d`, final.ID), "the warn log must name the session explicitly, since Apply's own error does not")
}

// TestProcessStatus_ApplyStatusPersistFailureLogsSessionID covers item (c)'s status-line
// sibling log line. processStatus is called directly (bypassing process()'s InsertEvent,
// which processStatus never touches) so a single closed store is enough to force
// ApplyStatus's persist to fail deterministically.
func TestProcessStatus_ApplyStatusPersistFailureLogsSessionID(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: "/tmp/ingest-log-test-2", Name: "ingest-log-test-2", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: "/tmp/ingest-log-test-2", PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(t, err)
	final, err := mgr.RecordLaunch(context.Background(), sess.ID, "muster-ingest-log-2:@1", "%1")
	require.NoError(t, err)

	require.NoError(t, st.Close())

	var logBuf strings.Builder
	q := newIngestQueue(nil, zerolog.New(&logBuf), 4, mgr, nil, nil)

	q.processStatus(context.Background(), final.ID, []byte(`{"session_name":"a new title"}`))

	logged := logBuf.String()
	assert.Contains(t, logged, "applying status update to session failed")
	assert.Contains(t, logged, fmt.Sprintf(`"session_id":%d`, final.ID), "the warn log must name the session explicitly, since ApplyStatus's own error does not")
}
