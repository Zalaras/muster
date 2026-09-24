// Package evict holds the one generic map-eviction rule two packages need on opposite
// sides of a layering boundary: internal/server's captureStore and internal/reader's
// WriteLog each cap a map at a size limit by dropping its single oldest entry per insert.
// internal/reader must never import internal/server (the dependency runs the other way),
// so the shared rule lives here instead, importing nothing internal itself — the same
// shape as internal/boundedwait.
package evict

import "time"

// Oldest deletes the oldest entry from m once it holds more than limit entries, using at
// to read each entry's timestamp for comparison.
func Oldest[K comparable, V any](m map[K]V, limit int, at func(V) time.Time) {
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
