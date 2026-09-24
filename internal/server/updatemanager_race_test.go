package server

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/selfupdate"
)

// blockForeverRoundTripper never returns — it deliberately ignores the request's context
// entirely, unlike a real *http.Transport (which TestUpdateManager_
// StopCancelsAndBoundedWaitsForInFlightApply already relies on to make Stop's own
// cancellation unblock a held request quickly). This test needs the opposite: an apply
// that stays genuinely in flight for as long as the test lets it, so that a Stop call
// which actually waited for it is distinguishable, by two orders of magnitude, from a
// Stop call that raced ahead of RequestApply's own bookkeeping and returned without
// waiting for anything at all.
type blockForeverRoundTripper struct {
	proceed chan struct{}
}

func (rt *blockForeverRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	<-rt.proceed
	return nil, req.Context().Err()
}

// TestUpdateManager_StopNeverRacesAnApplyThatHasRegistered covers updatemanager.go's own
// RequestApply comment: applyWG.Add(1) must happen inside the same mu critical section
// that checks shuttingDown, so Stop's Lock()/Wait() sequence can never observe an empty
// applyWG for an apply RequestApply has already committed to (returned nil for). Pre-fix,
// Add happened after mu.Unlock() — a window with no I/O boundary to gate with a channel,
// so this forces the interleaving with a flood of concurrent contenders racing
// RequestApply's own mu.Unlock() instead of a sleep: each trial's stoppers goroutines spin
// reading applyInFlight under mu (the same lock RequestApply's critical section holds)
// and, the instant they observe it flip true, immediately call the real Stop — maximizing
// the chance that at least one of them lands its own mu.Lock() in the pre-fix gap before
// RequestApply's goroutine reaches applyWG.Add on some trial.
//
// Correctness signal: every apply this test starts is held forever in
// blockForeverRoundTripper (context-blind, unlike a real transport), so a Stop that
// genuinely waited on applyWG must run out its own bounded deadline (stopTimeout) before
// returning; a Stop that instead read a zero counter returns almost immediately. Bounding
// the assertion at stopTimeout/2 leaves a two-orders-of-magnitude margin, so it needs no
// fine-grained timing.
//
// Written to FAIL on the pre-FW-D3 code: see daemon-tests-FW-D3.md for the captured
// failure against the restored pre-fix internal/server/updatemanager.go (applyWG.Add
// moved back to after mu.Unlock()).
func TestUpdateManager_StopNeverRacesAnApplyThatHasRegistered(t *testing.T) {
	const trials = 200
	const stoppers = 24
	const stopTimeout = 150 * time.Millisecond

	for trial := range trials {
		exePath := filepath.Join(t.TempDir(), "musterd")
		require.NoError(t, os.WriteFile(exePath, []byte("old"), 0o755))

		rt := &blockForeverRoundTripper{proceed: make(chan struct{})}
		m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
			c.Client = &http.Client{Transport: rt}
			c.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
			c.ExePath = exePath
		})
		v := "9.9.9"
		m.available = &v // installed nil: RequestApply's skipDownload is false, so runApply
		// reaches rt's held fetch instead of finishing without ever touching the network.

		var wg sync.WaitGroup
		elapsed := make(chan time.Duration, stoppers)
		for range stoppers {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for {
					m.mu.Lock()
					flag := m.applyInFlight
					m.mu.Unlock()
					if flag {
						break
					}
				}
				ctx, cancel := context.WithTimeout(context.Background(), stopTimeout)
				defer cancel()
				t0 := time.Now()
				m.Stop(ctx)
				elapsed <- time.Since(t0)
			}()
		}

		require.NoError(t, m.RequestApply(context.Background(), false))
		wg.Wait()
		close(elapsed)

		for d := range elapsed {
			assert.GreaterOrEqual(t, d, stopTimeout/2,
				"trial %d: a Stop call returned in %s while its apply was still (deliberately) blocked — "+
					"it raced ahead of RequestApply's applyWG.Add and never actually waited", trial, d)
		}

		// Release the held request and wait for this trial's own apply goroutine to
		// actually finish before starting the next trial, so trials never overlap.
		close(rt.proceed)
		m.applyWG.Wait()
	}
}
