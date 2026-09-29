package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpsertRepo_CreatesOnFirstLaunch(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	repo, created, err := st.UpsertRepo(ctx, UpsertRepoParams{
		Path: "/tmp/proj", Name: "proj", IsGit: true, Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)

	assert.True(t, created, "firstLaunchHere is sourced from this bool")
	assert.Equal(t, "/tmp/proj", repo.Path)
	assert.Equal(t, "proj", repo.Name)
	assert.True(t, repo.IsGit)
	assert.False(t, repo.Pinned)
	assert.Equal(t, 1, repo.LaunchCount)
	require.NotNil(t, repo.LastModel)
	assert.Equal(t, "sonnet", *repo.LastModel)
	require.NotNil(t, repo.LastPermissionMode)
	assert.Equal(t, "default", *repo.LastPermissionMode)
}

// TestUpsertRepo_SecondLaunchIncrementsCountAndUpdatesDefaults covers D6: launching
// twice into one directory yields one repo row with launch_count == 2 and updated
// defaults (REQ-3/REQ-5).
func TestUpsertRepo_SecondLaunchIncrementsCountAndUpdatesDefaults(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	first, created1, err := st.UpsertRepo(ctx, UpsertRepoParams{
		Path: "/tmp/proj", Name: "proj", IsGit: false, Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	require.True(t, created1)

	second, created2, err := st.UpsertRepo(ctx, UpsertRepoParams{
		Path: "/tmp/proj", Name: "proj", IsGit: true, Model: "opus", PermissionMode: "acceptEdits",
	})
	require.NoError(t, err)

	assert.False(t, created2, "the second launch into the same path must not be firstLaunchHere")
	assert.Equal(t, first.ID, second.ID, "one repo row, not two")
	assert.Equal(t, 2, second.LaunchCount)
	assert.True(t, second.IsGit, "is_git is refreshed on relaunch")
	require.NotNil(t, second.LastModel)
	assert.Equal(t, "opus", *second.LastModel)
	require.NotNil(t, second.LastPermissionMode)
	assert.Equal(t, "acceptEdits", *second.LastPermissionMode)

	rows, err := st.ListRepos(ctx)
	require.NoError(t, err)
	assert.Len(t, rows, 1)
}

// TestListRepos_OrdersPinnedThenMostRecentlyLaunched covers D20/REQ-5's MRU ordering:
// `pinned DESC, lastLaunchedAt DESC`. last_launched_at is set directly via SQL rather
// than real wall-clock gaps: the column is RFC3339 with second resolution, so two
// inserts in the same test process could otherwise land in the same second and make
// the ordering assertion flaky.
func TestListRepos_OrdersPinnedThenMostRecentlyLaunched(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	mustUpsertRepo(t, st, "/tmp/a")
	mustUpsertRepo(t, st, "/tmp/b")
	mustUpsertRepo(t, st, "/tmp/c")
	setLastLaunchedAt(t, st, "/tmp/a", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	setLastLaunchedAt(t, st, "/tmp/b", time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC))
	setLastLaunchedAt(t, st, "/tmp/c", time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC))

	rows, err := st.ListRepos(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 3)

	// No pins yet: pure most-recently-launched-first.
	paths := []string{rows[0].Path, rows[1].Path, rows[2].Path}
	assert.Equal(t, []string{"/tmp/c", "/tmp/b", "/tmp/a"}, paths)
}

func TestListRepos_PinnedSortsBeforeUnpinnedRegardlessOfRecency(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	mustUpsertRepo(t, st, "/tmp/old-pinned")
	mustUpsertRepo(t, st, "/tmp/newer-unpinned")
	_, err := st.db.ExecContext(ctx, `UPDATE repo SET pinned = 1 WHERE path = '/tmp/old-pinned'`)
	require.NoError(t, err)
	setLastLaunchedAt(t, st, "/tmp/old-pinned", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	setLastLaunchedAt(t, st, "/tmp/newer-unpinned", time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC))

	rows, err := st.ListRepos(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, "/tmp/old-pinned", rows[0].Path, "a pinned repo sorts first even though it's the older launch")
	assert.True(t, rows[0].Pinned)
}

func setLastLaunchedAt(t *testing.T, st *Store, path string, when time.Time) {
	t.Helper()
	_, err := st.db.ExecContext(context.Background(),
		`UPDATE repo SET last_launched_at = ? WHERE path = ?`, when.Format(time.RFC3339), path)
	require.NoError(t, err)
}

func TestGetRepo_ReturnsErrorForUnknownID(t *testing.T) {
	st := openTestStore(t)

	_, err := st.GetRepo(context.Background(), 999)

	assert.Error(t, err)
}

func TestGetRepo_RoundTrips(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	created, _, err := st.UpsertRepo(ctx, UpsertRepoParams{
		Path: "/tmp/proj", Name: "proj", IsGit: true, Model: "sonnet", PermissionMode: "plan",
	})
	require.NoError(t, err)

	got, err := st.GetRepo(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.Path, got.Path)
	assert.Equal(t, created.Name, got.Name)
	assert.True(t, got.IsGit)
}

func mustUpsertRepo(t *testing.T, st *Store, path string) Repo {
	t.Helper()
	repo, _, err := st.UpsertRepo(context.Background(), UpsertRepoParams{
		Path: path, Name: path, IsGit: false, Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	return repo
}

// TestTouchRepo_NeverBeforeSeenPathCreatesRowWithNullModelAndMode covers D15/REQ-15's
// new-directory half: a resume from the list carries no model or Start-in choice of its
// own, so a first-ever row for its directory gets both columns null, not empty strings.
func TestTouchRepo_NeverBeforeSeenPathCreatesRowWithNullModelAndMode(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	repo, created, err := st.TouchRepo(ctx, TouchRepoParams{Path: "/tmp/resumed", Name: "resumed", IsGit: true})
	require.NoError(t, err)

	assert.True(t, created)
	assert.Equal(t, "/tmp/resumed", repo.Path)
	assert.Equal(t, "resumed", repo.Name)
	assert.True(t, repo.IsGit)
	assert.Equal(t, 1, repo.LaunchCount)
	assert.Nil(t, repo.LastModel)
	assert.Nil(t, repo.LastPermissionMode)
}

// TestTouchRepo_ExistingRowAdvancesMRUAndCountButNeverTouchesModelOrMode is D15's core
// guarantee: a resume from an already-known directory bumps launch_count and
// last_launched_at like any launch, refreshes name/is_git like UpsertRepo does, but must
// never clobber the model/mode a real launch last remembered there.
func TestTouchRepo_ExistingRowAdvancesMRUAndCountButNeverTouchesModelOrMode(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	first, _, err := st.UpsertRepo(ctx, UpsertRepoParams{
		Path: "/tmp/proj", Name: "proj", IsGit: false, Model: "opus", PermissionMode: "acceptEdits",
	})
	require.NoError(t, err)
	require.NotNil(t, first.LastModel)

	second, created, err := st.TouchRepo(ctx, TouchRepoParams{Path: "/tmp/proj", Name: "proj-renamed", IsGit: true})
	require.NoError(t, err)

	assert.False(t, created, "the second call into an already-known path is not firstLaunchHere")
	assert.Equal(t, first.ID, second.ID, "one repo row, not two")
	assert.Equal(t, 2, second.LaunchCount)
	assert.True(t, second.IsGit, "is_git is refreshed, exactly like UpsertRepo")
	assert.Equal(t, "proj-renamed", second.Name, "name is refreshed, exactly like UpsertRepo")
	require.NotNil(t, second.LastModel, "TouchRepo must never null out a model UpsertRepo already recorded")
	assert.Equal(t, "opus", *second.LastModel)
	require.NotNil(t, second.LastPermissionMode)
	assert.Equal(t, "acceptEdits", *second.LastPermissionMode)

	rows, err := st.ListRepos(ctx)
	require.NoError(t, err)
	assert.Len(t, rows, 1)
}

// TestTouchRepo_TwoCallsIncrementLaunchCountTwice covers the plain MRU/count bump with
// no UpsertRepo in between — TouchRepo's own repeat-call shape, not just its interaction
// with UpsertRepo above.
func TestTouchRepo_TwoCallsIncrementLaunchCountTwice(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	first, created1, err := st.TouchRepo(ctx, TouchRepoParams{Path: "/tmp/only-resumed", Name: "only-resumed", IsGit: false})
	require.NoError(t, err)
	require.True(t, created1)
	assert.Equal(t, 1, first.LaunchCount)
	assert.Nil(t, first.LastModel)

	second, created2, err := st.TouchRepo(ctx, TouchRepoParams{Path: "/tmp/only-resumed", Name: "only-resumed", IsGit: false})
	require.NoError(t, err)

	assert.False(t, created2)
	assert.Equal(t, 2, second.LaunchCount)
	assert.Nil(t, second.LastModel, "a path only ever touched, never upserted, still has no model")
}
