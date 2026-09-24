package server

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/selfupdate"
)

// TestUpdateManager_StopCancelsAndBoundedWaitsForInFlightApply covers
// review.maintainability.b-server.md Minor 11: Stop must cancel an in-flight
// RequestApply's context and bounded-wait for its goroutine to actually exit, rather than
// returning immediately and leaving the apply running under its own
// context.WithoutCancel past the daemon's own shutdown.
//
// origin.hold() makes the fake release origin block every request — including the
// archive/checksums download RequestApply's non-skipDownload path triggers via
// selfupdate.Apply — so the apply goroutine is genuinely blocked inside an in-flight HTTP
// request when Stop is called, exactly as the interleaving specifies (a fake transport
// that blocks until either a test channel fires or the request's own context is done):
// reusing fakeOrigin (update_test.go) for this gets the same effect as a bespoke
// RoundTripper, since Go's net/http itself aborts a pending request the moment its context
// is canceled.
//
// Written to FAIL on the pre-F2 code: see daemon-tests-F2.md for the captured failure
// against the restored pre-fix internal/server/updatemanager.go.
func TestUpdateManager_StopCancelsAndBoundedWaitsForInFlightApply(t *testing.T) {
	origin := newFakeOrigin(t)
	_, key, pubFile := newUpdateTestKey(t)
	origin.setLatest("v0.11.0")
	publishRelease(t, origin, key, "v0.11.0", []byte("new content"))
	origin.hold()

	exePath := filepath.Join(t.TempDir(), "musterd")
	require.NoError(t, os.WriteFile(exePath, []byte("old"), 0o755))

	m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
		c.Base = origin.URL()
		c.PubKey = pubFile
		c.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		c.ExePath = exePath
	})
	// available set, installed nil: RequestApply's skipDownload clause is false, so it
	// takes the real selfupdate.Apply download path this test needs blocked.
	m.available = ptr("0.11.0")

	require.NoError(t, m.RequestApply(context.Background(), false))

	require.Eventually(t, func() bool {
		return origin.totalRequests() > 0
	}, 2*time.Second, 10*time.Millisecond, "RequestApply's download must have reached the fake origin before Stop is exercised")

	stopCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	stopStart := time.Now()
	m.Stop(stopCtx)
	stopElapsed := time.Since(stopStart)

	assert.Less(t, stopElapsed, 1500*time.Millisecond,
		"Minor 11: Stop must return once cancellation actually unblocks the apply goroutine (near-instant), not wait out its own 3s bounded deadline")

	assert.Eventually(t, func() bool {
		return m.Current().Apply.Phase == string(selfupdate.PhaseFailed)
	}, 2*time.Second, 10*time.Millisecond, "the canceled apply must record itself failed, never left stuck mid-flight")

	origin.release() // let the fake origin's blocked handler goroutine unwind
}
