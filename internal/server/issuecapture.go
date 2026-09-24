package server

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/Zalaras/muster/internal/evict"
)

// maxCaptures/captureTTL bound the in-memory capture store
// (kb:adr/issue-capture-then-file-server-held).
const maxCaptures = 8
const captureTTL = 15 * time.Minute

// issueCapture is one held, immutable snapshot
// (kb:adr/issue-capture-then-file-server-held): its snapshot and snapshotMarkdown are
// fixed at capture time and never recomputed, so filing later posts exactly what was
// previewed regardless of any state change in between.
type issueCapture struct {
	id               string
	capturedAt       time.Time
	snapshot         issueSnapshot
	snapshotMarkdown string
	consumed         bool
	inFlight         bool
}

// captureStore is the daemon-memory-only holder for captures
// (kb:adr/issue-capture-then-file-server-held) — never persisted: a snapshot that outlives
// the daemon that took it would describe a world that no longer exists.
type captureStore struct {
	mu       sync.Mutex
	captures map[string]*issueCapture
}

func newCaptureStore() *captureStore {
	return &captureStore{captures: make(map[string]*issueCapture)}
}

// put stores c, evicting the oldest-by-capturedAt entry once the store holds more than
// maxCaptures (kb:adr/issue-capture-then-file-server-held's capacity cap).
func (cs *captureStore) put(c *issueCapture) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.captures[c.id] = c
	evict.Oldest(cs.captures, maxCaptures, func(c *issueCapture) time.Time { return c.capturedAt })
}

// reserve returns the capture for id if it is usable — known, not expired, not already
// consumed, and not already being filed by a concurrent request — and marks it
// in-flight so a duplicate concurrent POST cannot also file it, belt to braces alongside
// the client-side Submit-disable. Returns nil otherwise, which the caller reports as 409
// capture_expired.
func (cs *captureStore) reserve(id string, now time.Time) *issueCapture {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	c, ok := cs.captures[id]
	if !ok || c.consumed || c.inFlight || now.Sub(c.capturedAt) > captureTTL {
		return nil
	}
	c.inFlight = true
	return c
}

// consume marks id filed successfully — permanent; a captureId can never be reused again
// (kb:adr/issue-capture-then-file-server-held).
func (cs *captureStore) consume(id string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if c, ok := cs.captures[id]; ok {
		c.consumed = true
		c.inFlight = false
	}
}

// release clears an id's in-flight reservation without consuming it — a failed filing
// attempt does not consume the capture, so a retry needs no re-capture
// (kb:adr/issue-capture-then-file-server-held).
func (cs *captureStore) release(id string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if c, ok := cs.captures[id]; ok {
		c.inFlight = false
	}
}

func randomCaptureID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating capture id: %w", err)
	}
	return hex.EncodeToString(b), nil
}
