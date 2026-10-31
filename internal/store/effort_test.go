package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInsertSession_EffortSeeding covers the insert shape: a launch's requested level is
// stored as the pending check with effort still unknown, a Resume-tab seed is stored as a
// known level with no check, and neither leaves a warning.
func TestInsertSession_EffortSeeding(t *testing.T) {
	tests := []struct {
		name          string
		requested     *string
		seed          *string
		wantKnown     bool
		wantLevel     *string
		wantRequested *string
	}{
		{name: "neither is unknown with no check"},
		{name: "a launch level is a pending check, effort still unknown", requested: ptr("max"), wantRequested: ptr("max")},
		{name: "a Resume-tab seed is a known level with no check", seed: ptr("medium"), wantKnown: true, wantLevel: ptr("medium")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			repoID := seedTestRepo(t, st)

			row, err := st.InsertSession(ctx, InsertSessionParams{
				RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default",
				EffortRequested: tt.requested, EffortSeed: tt.seed,
			})
			require.NoError(t, err)

			got, err := st.GetSession(ctx, row.ID)
			require.NoError(t, err)
			for _, r := range []SessionRow{row, got} {
				assert.Equal(t, tt.wantKnown, r.EffortKnown)
				assert.Equal(t, tt.wantLevel, r.EffortLevel)
				assert.Equal(t, tt.wantRequested, r.EffortRequested)
				assert.Nil(t, r.EffortWarningRequested)
				assert.Nil(t, r.EffortWarningActual)
				assert.Nil(t, r.EffortWarningModel)
			}
		})
	}
}

// TestUpdateSession_EffortNullBearingShapesRoundTrip covers the two shapes the wire
// distinguishes by a NULL: known with a NULL level (reported, no effort setting) and a
// warning whose actual is NULL; then the warning cleared back to all-NULL without touching
// effort.
func TestUpdateSession_EffortNullBearingShapesRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	row.EffortKnown = true
	row.EffortWarningRequested = ptr("high")
	row.EffortWarningModel = ptr("Haiku 4.5")
	require.NoError(t, st.UpdateSession(ctx, row))
	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.True(t, got.EffortKnown)
	assert.Nil(t, got.EffortLevel, "known with a NULL level is reported-with-no-effort")
	assert.Equal(t, ptr("high"), got.EffortWarningRequested)
	assert.Nil(t, got.EffortWarningActual)
	assert.Equal(t, ptr("Haiku 4.5"), got.EffortWarningModel)

	got.EffortWarningRequested, got.EffortWarningModel = nil, nil
	require.NoError(t, st.UpdateSession(ctx, got))
	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.True(t, cleared.EffortKnown, "clearing the warning leaves effort alone")
	assert.Nil(t, cleared.EffortWarningRequested)
	assert.Nil(t, cleared.EffortWarningModel)
}

// TestRepo_LastEffort covers the storage half: UpsertRepo records the launch's effort
// (a level, or NULL for default, overwriting the previous one either way), TouchRepo leaves
// it alone and a repo row it creates gets NULL, and GetRepo/ListRepos read it back.
func TestRepo_LastEffort(t *testing.T) {
	t.Run("a launch records its level and a later default launch clears it", func(t *testing.T) {
		st := openTestStore(t)
		ctx := context.Background()
		p := UpsertRepoParams{Path: "/tmp/proj", Name: "proj", Model: "sonnet", PermissionMode: "default", Effort: ptr("xhigh")}

		first, _, err := st.UpsertRepo(ctx, p)
		require.NoError(t, err)
		assert.Equal(t, ptr("xhigh"), first.LastEffort)

		p.Effort = ptr("low")
		second, _, err := st.UpsertRepo(ctx, p)
		require.NoError(t, err)
		assert.Equal(t, ptr("low"), second.LastEffort)

		p.Effort = nil
		third, _, err := st.UpsertRepo(ctx, p)
		require.NoError(t, err)
		assert.Nil(t, third.LastEffort, "a default launch records NULL, not the previous level")

		got, err := st.GetRepo(ctx, third.ID)
		require.NoError(t, err)
		assert.Nil(t, got.LastEffort)
	})

	t.Run("TouchRepo leaves an existing level and gives a new row NULL", func(t *testing.T) {
		st := openTestStore(t)
		ctx := context.Background()
		launched, _, err := st.UpsertRepo(ctx, UpsertRepoParams{Path: "/tmp/proj", Name: "proj", Model: "opus", PermissionMode: "plan", Effort: ptr("max")})
		require.NoError(t, err)

		touched, created, err := st.TouchRepo(ctx, TouchRepoParams{Path: "/tmp/proj", Name: "proj"})
		require.NoError(t, err)
		require.False(t, created)
		assert.Equal(t, launched.ID, touched.ID)
		assert.Equal(t, ptr("max"), touched.LastEffort)

		fresh, created, err := st.TouchRepo(ctx, TouchRepoParams{Path: "/tmp/other", Name: "other"})
		require.NoError(t, err)
		require.True(t, created)
		assert.Nil(t, fresh.LastEffort)

		rows, err := st.ListRepos(ctx)
		require.NoError(t, err)
		byPath := map[string]*string{}
		for _, r := range rows {
			byPath[r.Path] = r.LastEffort
		}
		assert.Equal(t, map[string]*string{"/tmp/proj": ptr("max"), "/tmp/other": nil}, byPath)
	})
}
