package store

import (
	"context"
	"strconv"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestBumpIDWatermark_ConcurrentWithInsertSessionNeverLowersThePersistedWatermark covers
// a-M3: BumpIDWatermark used to read the watermark, then write minID back in a second,
// separate statement — two round trips on the store's single connection
// (Open's SetMaxOpenConns(1)), so a real InsertSession could commit a higher watermark in
// the gap between them, and Bump's stale write would overwrite it back down. That reopens
// exactly the id-reuse bug kb:adr/lifecycle-session-ids-monotonic-never-reused exists to
// close: a lowered watermark lets a future InsertSession reissue an id a since-removed
// row already used.
//
// Each round races a burst of InsertSession calls (which push the true watermark up by
// burst) against one BumpIDWatermark call whose minID is only valid against the
// watermark as it stood *before* the burst — legitimate to attempt when Bump reads it,
// but wrong by the time a non-atomic write actually lands. `allocated` tracks the id
// count from this test's own inserts (never deleted, so table MAX(id) is exact), so the
// invariant checked after every round is a real, table-verified fact, not a heuristic.
func TestBumpIDWatermark_ConcurrentWithInsertSessionNeverLowersThePersistedWatermark(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	const iterations = 100
	const burst = 5

	var allocated int64
	for i := range iterations {
		minID := allocated + 1

		var wg sync.WaitGroup
		wg.Add(burst + 1)
		ids := make([]int64, burst)
		errs := make([]error, burst)
		for k := range burst {
			go func() {
				defer wg.Done()
				row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
				ids[k] = row.ID
				errs[k] = err
			}()
		}
		var bumpErr error
		go func() {
			defer wg.Done()
			bumpErr = st.BumpIDWatermark(ctx, minID)
		}()
		wg.Wait()

		for k, err := range errs {
			require.NoErrorf(t, err, "iteration %d insert %d", i, k)
		}
		require.NoErrorf(t, bumpErr, "iteration %d bump", i)

		var maxID int64
		for _, id := range ids {
			if id > maxID {
				maxID = id
			}
		}
		allocated = maxID // table MAX(id) after this round, exactly (no deletes in this test)

		watermarkStr, ok, err := st.KVGet(ctx, sessionIDWatermarkKey)
		require.NoError(t, err)
		require.True(t, ok)
		watermark, err := strconv.ParseInt(watermarkStr, 10, 64)
		require.NoError(t, err)
		assert.GreaterOrEqualf(t, watermark, maxID, "iteration %d: the persisted watermark must never end up below the highest id InsertSession actually committed this round", i)
	}
}
