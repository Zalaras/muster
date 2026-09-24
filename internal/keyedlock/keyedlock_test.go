package keyedlock

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestLocks_ZeroValueIsReadyToUse covers the doc comment's "the zero value is ready to
// use" — no constructor call anywhere in this test.
func TestLocks_ZeroValueIsReadyToUse(t *testing.T) {
	var l Locks[string]

	unlock := l.Lock("a")
	assert.NotPanics(t, unlock)
}

// TestLocks_SameKeySerializes drives N goroutines all locking the same key and
// incrementing a plain (unsynchronized) counter inside the critical section: if two
// callers were ever inside at once, the increments would race and -race would flag it
// (a wrong final count alone wouldn't prove ordering, since ints can lose updates
// silently — the race detector is the actual oracle here, run via `go test -race`).
func TestLocks_SameKeySerializes(t *testing.T) {
	var l Locks[int]
	const n = 50
	counter := 0

	var wg sync.WaitGroup
	wg.Add(n)
	for range n {
		go func() {
			defer wg.Done()
			unlock := l.Lock(1)
			defer unlock()
			counter++
		}()
	}
	wg.Wait()

	assert.Equal(t, n, counter)
}

// TestLocks_DifferentKeysDoNotBlock proves one key's held lock never delays another key's
// Lock call — the whole point of a per-key lock over one shared mutex.
func TestLocks_DifferentKeysDoNotBlock(t *testing.T) {
	var l Locks[string]

	unlockA := l.Lock("a")
	defer unlockA()

	done := make(chan struct{})
	go func() {
		unlockB := l.Lock("b")
		defer unlockB()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Lock(\"b\") was blocked by an unrelated key's held lock")
	}
}

// TestLocks_SecondLockOnHeldKeyBlocksUntilReleased is DifferentKeysDoNotBlock's mirror:
// the *same* key must actually serialise, not merely appear to via the counter test's
// timing.
func TestLocks_SecondLockOnHeldKeyBlocksUntilReleased(t *testing.T) {
	var l Locks[string]

	unlockFirst := l.Lock("x")

	acquired := make(chan struct{})
	go func() {
		unlockSecond := l.Lock("x")
		defer unlockSecond()
		close(acquired)
	}()

	select {
	case <-acquired:
		t.Fatal("a second Lock on an already-held key returned before the first was released")
	case <-time.After(100 * time.Millisecond):
	}

	unlockFirst()

	select {
	case <-acquired:
	case <-time.After(2 * time.Second):
		t.Fatal("the second Lock never acquired after the first was released")
	}
}

// TestLocks_ForgetThenLockAgainSucceeds covers Forget's documented intended use: once a
// key is known to be done for good, Forget lets a later Lock on the same key value (e.g. a
// reused/looping test id) start clean rather than accumulating map entries forever.
func TestLocks_ForgetThenLockAgainSucceeds(t *testing.T) {
	var l Locks[int64]

	unlock := l.Lock(7)
	unlock()
	l.Forget(7)

	done := make(chan struct{})
	go func() {
		unlock := l.Lock(7)
		defer unlock()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Lock after Forget never acquired")
	}
}

// TestLocks_ConcurrentLockAndForgetOnDifferentKeysNeverPanics is a light smoke test for
// the map-mutating half (l.mu) under concurrent, unrelated Lock/Forget traffic across many
// keys — internal/session's Manager and internal/server's shellRegistry/terminalRegistry
// all hit this map from arbitrary goroutines. -race is the actual oracle; a clean run with
// no panic and no race report is the test.
func TestLocks_ConcurrentLockAndForgetOnDifferentKeysNeverPanics(t *testing.T) {
	var l Locks[int]
	const n = 100
	var wg sync.WaitGroup
	var totalUnlocks atomic.Int64
	wg.Add(n)
	for i := range n {
		go func(key int) {
			defer wg.Done()
			unlock := l.Lock(key)
			totalUnlocks.Add(1)
			unlock()
			l.Forget(key)
		}(i)
	}
	wg.Wait()

	require.EqualValues(t, n, totalUnlocks.Load())
}
