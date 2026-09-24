package server

import "time"

// evictOldest deletes the oldest entry from m once it holds more than limit entries,
// using at to read each entry's timestamp for comparison. captureStore.put (issue.go) and
// writeLog.record (reader.go) each wrote this "insert then evict-oldest-by-time once past
// a cap" loop out by hand over their own map shape — this is its one home.
func evictOldest[K comparable, V any](m map[K]V, limit int, at func(V) time.Time) {
	if len(m) <= limit {
		return
	}
	var oldestKey K
	var oldestAt time.Time
	first := true
	for k, v := range m {
		t := at(v)
		if first || t.Before(oldestAt) {
			oldestKey, oldestAt, first = k, t, false
		}
	}
	delete(m, oldestKey)
}
