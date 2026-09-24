// Package keyedlock holds one small primitive internal/session's Manager and
// internal/server's shellRegistry and terminalRegistry each need: a lazily-created,
// per-key mutex that serialises one key's whole check-then-act without blocking any other
// key's (kb:adr/actions-serialized-per-session). internal/session must never import
// internal/server (kb:diagram/daemon-components), so — like internal/boundedwait — the
// shared piece lives in its own leaf package, importing nothing internal itself.
package keyedlock

import "sync"

// Locks is a set of per-key mutexes, created on first use. The zero value is ready to
// use. Its own mu guards only the map itself (lookup/insert) — never a caller's actual
// work, which happens after Lock returns and before unlock is called.
type Locks[K comparable] struct {
	mu    sync.Mutex
	locks map[K]*sync.Mutex
}

// Lock acquires key's mutex, creating it on first use, and returns the func that releases
// it. Held across a whole logical action — including any I/O it does — never across l's
// own mu.
func (l *Locks[K]) Lock(key K) (unlock func()) {
	l.mu.Lock()
	if l.locks == nil {
		l.locks = make(map[K]*sync.Mutex)
	}
	m, ok := l.locks[key]
	if !ok {
		m = &sync.Mutex{}
		l.locks[key] = m
	}
	l.mu.Unlock()

	m.Lock()
	return m.Unlock
}

// Forget removes key's entry. Callers must only call this once key can never be locked
// again (e.g. a session id, never reissued, once its row is gone) — reclaiming it any
// earlier would let a Lock call already queued on the old *sync.Mutex race a fresh one a
// later Lock(key) creates.
func (l *Locks[K]) Forget(key K) {
	l.mu.Lock()
	delete(l.locks, key)
	l.mu.Unlock()
}
