package reader

import (
	"sync"
	"time"

	"github.com/Zalaras/muster/internal/evict"
)

// maxWriteLogPaths caps WriteLog's per-session memory: once a session's map exceeds this
// many entries, Record drops the single oldest.
const maxWriteLogPaths = 512

// WriteLog is the daemon's in-memory record of routed writes, per session — forgotten on
// daemon restart, like shells: nothing here is written to disk. Record is called from
// internal/server's single ingest worker; Get and Forget are called from HTTP handlers and
// session removal. mu guards bySession against that concurrent access.
type WriteLog struct {
	mu        sync.Mutex
	bySession map[int64]map[string]time.Time
}

// NewWriteLog builds an empty WriteLog.
func NewWriteLog() *WriteLog {
	return &WriteLog{bySession: make(map[int64]map[string]time.Time)}
}

// Record notes that path was written at at, capping each session at maxWriteLogPaths
// entries by dropping the single oldest once the cap is exceeded.
func (l *WriteLog) Record(sessionID int64, path string, at time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	m, ok := l.bySession[sessionID]
	if !ok {
		m = make(map[string]time.Time)
		l.bySession[sessionID] = m
	}
	m[path] = at
	evict.Oldest(m, maxWriteLogPaths, func(t time.Time) time.Time { return t })
}

// Get returns the last recorded write time for path in sessionID, if any.
func (l *WriteLog) Get(sessionID int64, path string) (time.Time, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	m, ok := l.bySession[sessionID]
	if !ok {
		return time.Time{}, false
	}
	at, ok := m[path]
	return at, ok
}

// Forget drops sessionID's whole write log — Remove's cleanup.
func (l *WriteLog) Forget(sessionID int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.bySession, sessionID)
}
