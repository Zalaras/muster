package reader

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestWriteLog covers the write log's record/get/forget contract and its 512-entry cap
// (Implementation Notes: "when a session's map exceeds 512 entries drop the oldest").
func TestWriteLog(t *testing.T) {
	t.Run("record then get round-trips, scoped per session", func(t *testing.T) {
		l := NewWriteLog()
		at := time.Date(2026, 9, 13, 9, 0, 0, 0, time.UTC)

		l.Record(1, "/tmp/a.md", at)

		got, ok := l.Get(1, "/tmp/a.md")
		require.True(t, ok)
		assert.True(t, got.Equal(at))

		_, ok = l.Get(1, "/tmp/other.md")
		assert.False(t, ok, "an unrecorded path must not be found")
		_, ok = l.Get(2, "/tmp/a.md")
		assert.False(t, ok, "the write log is scoped per session")
	})

	t.Run("forget drops the whole session", func(t *testing.T) {
		l := NewWriteLog()
		l.Record(1, "/tmp/a.md", time.Now())

		l.Forget(1)

		_, ok := l.Get(1, "/tmp/a.md")
		assert.False(t, ok)
	})

	t.Run("exceeding the cap drops exactly the oldest entry", func(t *testing.T) {
		l := NewWriteLog()
		base := time.Date(2026, 9, 13, 0, 0, 0, 0, time.UTC)
		for i := range maxWriteLogPaths {
			l.Record(1, fmt.Sprintf("/tmp/f%d.md", i), base.Add(time.Duration(i)*time.Second))
		}
		l.mu.Lock()
		require.Len(t, l.bySession[1], maxWriteLogPaths, "sanity: exactly at the cap before the extra insert")
		l.mu.Unlock()

		// One more, strictly newer than every existing entry, must evict the single
		// oldest (f0) and leave every other entry intact.
		l.Record(1, "/tmp/newest.md", base.Add(time.Duration(maxWriteLogPaths)*time.Second))

		l.mu.Lock()
		assert.Len(t, l.bySession[1], maxWriteLogPaths, "the cap must never be exceeded")
		l.mu.Unlock()
		_, ok := l.Get(1, "/tmp/f0.md")
		assert.False(t, ok, "the single oldest entry must have been dropped")
		_, ok = l.Get(1, "/tmp/f1.md")
		assert.True(t, ok, "every other entry must survive")
		_, ok = l.Get(1, "/tmp/newest.md")
		assert.True(t, ok)
	})
}
