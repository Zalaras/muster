package evict

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestOldest covers Oldest's own contract directly (Minor 4): internal/server's
// captureStore.put and internal/reader's WriteLog.Record each call it once per insert, so
// a dedicated test here is the only place "one entry evicted, the oldest by at()" is
// asserted independent of either caller's own map shape.
func TestOldest(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	at := func(v time.Time) time.Time { return v }

	t.Run("below limit evicts nothing", func(t *testing.T) {
		m := map[int]time.Time{1: base, 2: base.Add(time.Minute)}

		Oldest(m, 5, at)

		assert.Len(t, m, 2)
	})

	t.Run("exactly at limit evicts nothing", func(t *testing.T) {
		m := map[int]time.Time{1: base, 2: base.Add(time.Minute)}

		Oldest(m, 2, at)

		assert.Len(t, m, 2)
	})

	t.Run("one over limit evicts exactly the oldest", func(t *testing.T) {
		m := map[int]time.Time{
			1: base,
			2: base.Add(time.Minute),
			3: base.Add(2 * time.Minute),
		}

		Oldest(m, 2, at)

		assert.Len(t, m, 2)
		assert.NotContains(t, m, 1, "the oldest entry must be the one evicted")
		assert.Contains(t, m, 2)
		assert.Contains(t, m, 3)
	})

	t.Run("far over limit still evicts only one entry per call", func(t *testing.T) {
		// Both real call sites invoke Oldest once per insert, right after adding the new
		// entry — it only ever needs to remove at most one to get back within limit of an
		// insert that pushed it one over.
		m := map[int]time.Time{
			1: base,
			2: base.Add(time.Minute),
			3: base.Add(2 * time.Minute),
			4: base.Add(3 * time.Minute),
		}

		Oldest(m, 2, at)

		assert.Len(t, m, 3, "Oldest removes exactly one entry per call")
	})

	t.Run("tied oldest timestamps still evict exactly one entry", func(t *testing.T) {
		m := map[int]time.Time{1: base, 2: base, 3: base.Add(time.Minute)}

		Oldest(m, 2, at)

		assert.Len(t, m, 2)
		assert.Contains(t, m, 3, "the strictly newer entry must always survive a tie among the others")
	})

	t.Run("limit zero evicts down by one from a single entry", func(t *testing.T) {
		m := map[int]time.Time{1: base}

		Oldest(m, 0, at)

		assert.Empty(t, m)
	})

	t.Run("generic over a non-int key and a struct value", func(t *testing.T) {
		type entry struct{ seenAt time.Time }
		m := map[string]entry{
			"old": {seenAt: base},
			"new": {seenAt: base.Add(time.Minute)},
		}

		Oldest(m, 1, func(e entry) time.Time { return e.seenAt })

		assert.Len(t, m, 1)
		assert.Contains(t, m, "new")
	})
}
