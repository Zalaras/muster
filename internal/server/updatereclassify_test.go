package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/selfupdate"
)

// ---------------------------------------------------------------------------------------
// updateManager.reclassify (D4-D7, D10, D12, REQ-4/5/6/7/11) — the recheck-on-every-check
// half of kb:adr/update-install-rechecked-on-every-check.

// TestUpdateManager_Reclassify_RunsBeforeEveryCheck covers D5's first half: both the
// manual (POST /api/update/check) and automatic (tick) paths call the reclassify seam
// before the network request, and exactly once per check attempt — win or lose.
func TestUpdateManager_Reclassify_RunsBeforeEveryCheck(t *testing.T) {
	for _, tt := range []struct {
		name        string
		manual      bool
		originFails bool
	}{
		{"automatic path, check succeeds", false, false},
		{"automatic path, check fails", false, true},
		{"manual path, check succeeds", true, false},
		{"manual path, check fails", true, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			origin := newFakeOrigin(t)
			origin.setLatest("v0.11.0")
			origin.setFailNext(tt.originFails)

			var calls atomic.Int32
			m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
				c.Base = origin.URL()
				c.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
				c.Reclassify = func() selfupdate.Install {
					calls.Add(1)
					return selfupdate.Install{Kind: selfupdate.KindInstaller}
				}
			})

			_ = m.checkAvailability(context.Background(), tt.manual)

			assert.Equal(t, int32(1), calls.Load(), "reclassify must run exactly once per check attempt, regardless of the check's own outcome")
		})
	}
}

// TestUpdateManager_Reclassify_BroadcastsOnceOnChangeNeverOnNoChange covers D5/REQ-5's
// second half, isolated from the check's own separate broadcast by failing the check
// itself (edge case 5/8: "a manual check against a stopped host still reclassifies and
// broadcasts the change, then returns 502" — a no-change case never reaching the network
// at all would prove nothing about whether reclassify itself stayed silent).
func TestUpdateManager_Reclassify_BroadcastsOnceOnChangeNeverOnNoChange(t *testing.T) {
	t.Run("a kind change broadcasts exactly once, even though the check itself then fails", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setFailNext(true)
		next := selfupdate.Install{Kind: selfupdate.KindUnmanaged, Remedy: "some remedy"}
		m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) {
			c.Base = origin.URL()
			c.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
			c.Reclassify = func() selfupdate.Install { return next }
		})

		require.Error(t, m.checkAvailability(context.Background(), true), "sanity: the check itself must fail")

		got := <-changes
		assert.Equal(t, string(selfupdate.KindUnmanaged), got.Install)
		require.NotNil(t, got.Remedy)
		assert.Equal(t, "some remedy", *got.Remedy)

		select {
		case extra := <-changes:
			t.Fatalf("reclassify must broadcast exactly once, got an extra: %+v", extra)
		case <-time.After(100 * time.Millisecond):
		}
		assert.Equal(t, selfupdate.KindUnmanaged, m.installKind(), "the new classification must be committed even though the check failed")
	})

	t.Run("no change adds nothing beyond the check's own single broadcast", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setLatest("v0.11.0")
		same := selfupdate.Install{Kind: selfupdate.KindInstaller}
		m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) {
			c.Base = origin.URL()
			c.Install = same
			c.Reclassify = func() selfupdate.Install { return same }
		})

		require.NoError(t, m.checkAvailability(context.Background(), true))

		got := <-changes // the check's own single broadcast
		assert.NotNil(t, got.Available, "sanity: this is the check's own broadcast, not reclassify's")

		select {
		case extra := <-changes:
			t.Fatalf("a no-change reclassify must add nothing beyond the check's own broadcast, got an extra: %+v", extra)
		case <-time.After(100 * time.Millisecond):
		}
	})
}

// TestUpdateManager_Reclassify_NeverRerunsForDevOrHomebrew covers D7/REQ-6: the
// reclassify seam is never even invoked when the current kind is dev or homebrew, so
// neither can be silently swapped to installer/unmanaged later however its directory's
// writability changes (edge case 7).
func TestUpdateManager_Reclassify_NeverRerunsForDevOrHomebrew(t *testing.T) {
	for _, kind := range []selfupdate.Kind{selfupdate.KindDev, selfupdate.KindHomebrew} {
		t.Run(string(kind), func(t *testing.T) {
			origin := newFakeOrigin(t)
			origin.setLatest("v0.11.0")
			var called bool
			m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
				c.Base = origin.URL()
				c.Install = selfupdate.Install{Kind: kind, Remedy: "fixed remedy"}
				c.Reclassify = func() selfupdate.Install {
					called = true
					return selfupdate.Install{Kind: selfupdate.KindInstaller}
				}
			})

			m.reclassify()

			assert.False(t, called, "reclassifyFn must never be invoked for dev/homebrew")
			assert.Equal(t, kind, m.installKind(), "the classification must stay exactly as constructed")
		})
	}
}

// TestUpdateManager_Reclassify_DuringInFlightApplyLeavesItRunning covers D6: a recheck
// that changes the classification while an apply is already downloading must not cancel
// or otherwise disturb it — the apply already passed RequestApply's MayApply gate, and
// finishes exactly as it would have (edge case 4).
func TestUpdateManager_Reclassify_DuringInFlightApplyLeavesItRunning(t *testing.T) {
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
		c.Reclassify = func() selfupdate.Install {
			return selfupdate.Install{Kind: selfupdate.KindUnmanaged, Remedy: "now blocked"}
		}
	})
	m.available = ptr("0.11.0")

	require.NoError(t, m.RequestApply(context.Background(), false))
	require.Eventually(t, func() bool {
		return origin.totalRequests() > 0
	}, 2*time.Second, 10*time.Millisecond, "the apply must have reached the origin before reclassify races it")

	m.reclassify()
	require.Equal(t, selfupdate.KindUnmanaged, m.installKind(), "sanity: the recheck did change the classification")

	origin.release()

	require.Eventually(t, func() bool {
		return m.Current().Apply.Phase == string(selfupdate.PhaseDone)
	}, 2*time.Second, 10*time.Millisecond, "the in-flight apply must finish exactly as it would have, unaffected by the recheck")

	got, err := os.ReadFile(exePath)
	require.NoError(t, err)
	assert.Equal(t, []byte("new content"), got, "the apply must have actually installed despite the classification changing mid-flight")
}

// TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent covers D14's still-missing half:
// the D6 test above calls reclassify() once, sequentially, only after RequestApply has
// already returned. This instead drives checkAvailability
// (reclassify's own caller), RequestApply and Current concurrently against the same
// manager for many iterations, with the Reclassify seam flipping installer<->unmanaged on
// every call, under `go test -race`. Every m.install read/write in updatemanager.go
// (reclassify, installKind, Remedy, RequestApply's MayApply/available/installed checks,
// Current) takes m.mu, so this proves that guard actually covers the concurrent case the
// plan names, not just the sequential one.
func TestUpdateManager_ReclassifyRacesRequestApplyAndCurrent(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")

	exePath := filepath.Join(t.TempDir(), "musterd")
	require.NoError(t, os.WriteFile(exePath, []byte("old"), 0o755))

	var flip atomic.Bool
	m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) {
		c.Base = origin.URL()
		c.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		c.ExePath = exePath
		c.Reclassify = func() selfupdate.Install {
			if flip.Load() {
				flip.Store(false)
				return selfupdate.Install{Kind: selfupdate.KindUnmanaged, Remedy: "flipped remedy"}
			}
			flip.Store(true)
			return selfupdate.Install{Kind: selfupdate.KindInstaller}
		}
	})

	// changes is a 64-slot buffered channel (newTestUpdateManager); this run's volume of
	// emits (every checkAvailability, every reclassify change, every failed apply) comfortably
	// exceeds that, so drain it for the run's duration or m.emit() would block a worker
	// goroutine on a full channel instead of exercising the race this test targets.
	drainDone := make(chan struct{})
	go func() {
		for {
			select {
			case <-changes:
			case <-drainDone:
				return
			}
		}
	}()

	const iterations = 200
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range iterations {
			_ = m.checkAvailability(context.Background(), i%2 == 0)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for range iterations {
			// The origin has no published release (setLatest only), so a started apply's
			// own download fails fast (404) rather than hanging — this goroutine is racing
			// reclassify's writes to m.install, not exercising a real download.
			_ = m.RequestApply(context.Background(), false)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for range iterations {
			assertINV1(t, m.Current())
		}
	}()

	wg.Wait()

	// A worker's last RequestApply may have started an apply goroutine that outlives the
	// loop; wait for it to settle (rather than leaving it to race the test's own end) before
	// the final assertion and before draining stops.
	require.Eventually(t, func() bool {
		m.mu.Lock()
		defer m.mu.Unlock()
		return !m.applyInFlight
	}, 2*time.Second, 10*time.Millisecond, "no apply goroutine should still be running once every RequestApply call has returned")
	close(drainDone)

	assertINV1(t, m.Current())
}

// assertINV1 checks the plan's INV-1: remedy is non-null iff install is homebrew or
// unmanaged.
func assertINV1(t *testing.T, got UpdateInfo) {
	t.Helper()
	wantRemedy := got.Install == string(selfupdate.KindHomebrew) || got.Install == string(selfupdate.KindUnmanaged)
	if wantRemedy {
		assert.NotNil(t, got.Remedy, "INV-1: remedy must be non-null for install=%s", got.Install)
	} else {
		assert.Nil(t, got.Remedy, "INV-1: remedy must be null for install=%s", got.Install)
	}
}

// TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates covers D10: INV-1 crossed
// against every source state the plan names — the *startup* kind reclassify is running
// from, the reclassified (next) kind, the apply phase in progress at the time (with
// `installed` set to match runApply's own done-phase state, not applyVersion alone), the
// pref on/off, and whether the check itself then succeeds or fails — proving the invariant
// from every reachable source state, not just the convenient one
// (kb:lesson/invariant-missed-by-per-transition-tests), crossing both the startup kind and
// a done phase with `installed` actually set alongside it.
func TestUpdateManager_Reclassify_INV1HoldsAcrossSourceStates(t *testing.T) {
	starts := []selfupdate.Install{
		{Kind: selfupdate.KindInstaller},
		{Kind: selfupdate.KindUnmanaged, Remedy: "startup remedy"},
	}
	nexts := []selfupdate.Install{
		{Kind: selfupdate.KindInstaller},
		{Kind: selfupdate.KindUnmanaged, Remedy: "unmanaged remedy"},
	}
	phases := []selfupdate.Phase{selfupdate.PhaseIdle, selfupdate.PhaseDownloading, selfupdate.PhaseDone, selfupdate.PhaseFailed}

	for _, start := range starts {
		for _, next := range nexts {
			for _, phase := range phases {
				for _, checkEnabled := range []bool{true, false} {
					for _, checkFails := range []bool{false, true} {
						name := fmt.Sprintf("start=%s next=%s phase=%s checkEnabled=%v checkFails=%v", start.Kind, next.Kind, phase, checkEnabled, checkFails)
						t.Run(name, func(t *testing.T) {
							origin := newFakeOrigin(t)
							origin.setLatest("v0.11.0")
							origin.setFailNext(checkFails)
							m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
								c.Base = origin.URL()
								c.Install = start
								c.CheckEnabled = checkEnabled
								c.Reclassify = func() selfupdate.Install { return next }
							})
							m.mu.Lock()
							m.applyPhase = phase
							if phase != selfupdate.PhaseIdle {
								v := "0.10.5"
								m.applyVersion = &v
							}
							if phase == selfupdate.PhaseDone {
								// runApply (updatemanager.go) always sets installed alongside
								// applyVersion on a successful apply; a "done" source state
								// with applyVersion but no installed can't actually occur.
								v := "0.10.5"
								m.installed = &v
							}
							m.mu.Unlock()

							_ = m.checkAvailability(context.Background(), true)

							assertINV1(t, m.Current())
						})
					}
				}
			}
		}
	}
}

// TestHandleApplyUpdate_UnsupportedUsesTheCurrentRemedyAfterARecheck covers D12/REQ-7: the
// 409 update_unsupported body is the *current* remedy — the one a recheck just produced —
// never the one computed at daemon construction.
func TestHandleApplyUpdate_UnsupportedUsesTheCurrentRemedyAfterARecheck(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	srv := newUpdateTestServer(t, func(c *Config) {
		c.Update.BaseURL = origin.URL()
		c.Update.Install = selfupdate.Install{Kind: selfupdate.KindUnmanaged, Remedy: "startup remedy"}
		c.Update.Reclassify = func() selfupdate.Install {
			return selfupdate.Install{Kind: selfupdate.KindUnmanaged, Remedy: "recheck remedy"}
		}
	})

	before := postApplyUpdate(t, srv, `{}`)
	require.Equal(t, http.StatusConflict, before.Code)
	assert.Equal(t, "startup remedy", decodeErrorMessage(t, before))

	rec := postCheckUpdate(t, srv)
	require.Equal(t, http.StatusOK, rec.Code)

	after := postApplyUpdate(t, srv, `{}`)
	require.Equal(t, http.StatusConflict, after.Code)
	assert.Equal(t, "recheck remedy", decodeErrorMessage(t, after), "D12: the refusal must read the current classification, not the startup one")
}

// ---------------------------------------------------------------------------------------
// REQ-11: log level (warn for a user-initiated failure, debug for the daily schedule's
// own silent failure; an apply failure is always request-triggered, so always warn).

// TestUpdateManager_CheckAvailability_LogsAtWarnForManualDebugForAutomatic covers REQ-11's
// check half.
func TestUpdateManager_CheckAvailability_LogsAtWarnForManualDebugForAutomatic(t *testing.T) {
	t.Run("manual failure logs at warn, not debug", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setFailNext(true)
		var buf bytes.Buffer
		m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
			c.Base = origin.URL()
			c.Log = zerolog.New(&buf)
		})

		require.Error(t, m.checkAvailability(context.Background(), true))

		assert.Contains(t, buf.String(), `"level":"warn"`)
		assert.NotContains(t, buf.String(), `"level":"debug"`)
	})

	t.Run("automatic failure logs at debug, not warn", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setFailNext(true)
		var buf bytes.Buffer
		m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
			c.Base = origin.URL()
			c.Log = zerolog.New(&buf)
		})

		require.Error(t, m.checkAvailability(context.Background(), false))

		assert.Contains(t, buf.String(), `"level":"debug"`)
		assert.NotContains(t, buf.String(), `"level":"warn"`)
	})
}

// TestUpdateManager_FinishApplyFailed_LogsAtWarn covers REQ-11's apply half: every apply
// failure logs the full chain at warn, since an apply is always request-triggered, never
// automatic.
func TestUpdateManager_FinishApplyFailed_LogsAtWarn(t *testing.T) {
	var buf bytes.Buffer
	m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
		c.Log = zerolog.New(&buf)
	})

	m.finishApplyFailed("0.11.0", errors.New("boom: disk full"))

	assert.Contains(t, buf.String(), `"level":"warn"`)
	assert.Contains(t, buf.String(), "boom: disk full", "the full error chain must reach the log, not just the short wire text")
}

// ---------------------------------------------------------------------------------------
// D8/D9: the exact REQ-8/REQ-9 wire text, wired all the way through the HTTP layer (the
// pure-function exhaustiveness lives in internal/selfupdate/failure_test.go; these prove
// handleCheckUpdate/setApplyPhase actually call it).

// TestHandleCheckUpdate_ExactREQ8Message covers D8 at the HTTP layer: the 502 body's
// message is REQ-8's exact sentence, not a generic "fail" substring.
func TestHandleCheckUpdate_ExactREQ8Message(t *testing.T) {
	t.Run("transport failure", func(t *testing.T) {
		origin := newFakeOrigin(t)
		base := origin.URL()
		origin.srv.Close() // stopped host: connection refused

		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = base
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})

		rec := postCheckUpdate(t, srv)
		require.Equal(t, http.StatusBadGateway, rec.Code)
		assert.Equal(t, "update check failed: couldn't reach the release host (connection refused)", decodeErrorMessage(t, rec))
	})

	t.Run("non-redirect status", func(t *testing.T) {
		mux := http.NewServeMux()
		mux.HandleFunc("/latest", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
		httpSrv := httptest.NewServer(mux)
		t.Cleanup(httpSrv.Close)

		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = httpSrv.URL
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})

		rec := postCheckUpdate(t, srv)
		require.Equal(t, http.StatusBadGateway, rec.Code)
		assert.Equal(t, "update check failed: the release host answered 200, not a redirect", decodeErrorMessage(t, rec))
	})

	t.Run("unparseable tag", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setLatest("nightly")

		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = origin.URL()
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})

		rec := postCheckUpdate(t, srv)
		require.Equal(t, http.StatusBadGateway, rec.Code)
		assert.Equal(t, `update check failed: the latest release tag "nightly" is not a release version`, decodeErrorMessage(t, rec))
	})

	// The fourth REQ-8 class ("anything else", e.g. no Location header) goes through
	// checkAvailability's own return path exactly like the three typed classes above,
	// end to end through handleCheckUpdate; a bare errors.New passed straight to
	// DescribeCheckFailure (selfupdate's own table) never crosses that path, so it can't
	// catch a caller-added prefix doubling up with DescribeCheckFailure's own.
	t.Run("anything else: no Location header on the redirect", func(t *testing.T) {
		mux := http.NewServeMux()
		mux.HandleFunc("/latest", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusFound) })
		httpSrv := httptest.NewServer(mux)
		t.Cleanup(httpSrv.Close)

		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = httpSrv.URL
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})

		rec := postCheckUpdate(t, srv)
		require.Equal(t, http.StatusBadGateway, rec.Code)
		got := decodeErrorMessage(t, rec)
		assert.Equal(t, "update check failed: latest release redirect carried no Location header", got)
		assert.Equal(t, 1, strings.Count(got, "update check failed:"), "the prefix must appear exactly once, never doubled")
	})
}

// TestHandleApplyUpdate_FailedDownloadReportsTheExactREQ9Sentence covers D9's download
// failure class end to end: apply.error on the wire is the exact one-sentence, URL-free
// text, not Go's raw transport chain.
func TestHandleApplyUpdate_FailedDownloadReportsTheExactREQ9Sentence(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	base := origin.URL()
	origin.srv.Close() // stopped host: every download now fails with connection refused

	srv := newUpdateTestServer(t, func(c *Config) {
		c.Update.BaseURL = base
		c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		c.Update.ExePath = filepath.Join(t.TempDir(), "musterd")
	})
	require.NoError(t, os.WriteFile(srv.update.um.exePath, []byte("old"), 0o755))
	srv.update.um.available = ptr("0.11.0")

	rec := postApplyUpdate(t, srv, `{}`)
	require.Equal(t, http.StatusAccepted, rec.Code)

	require.Eventually(t, func() bool {
		return srv.update.um.Current().Apply.Phase == string(selfupdate.PhaseFailed)
	}, 2*time.Second, 10*time.Millisecond)

	got := srv.update.um.Current().Apply.Error
	require.NotNil(t, got)
	asset := selfupdate.AssetName("0.11.0", "darwin", runtime.GOARCH)
	want := fmt.Sprintf("couldn't download %s (connection refused); nothing was installed", asset)
	assert.Equal(t, want, *got)
	assert.NotContains(t, *got, "://")

	got2, err := os.ReadFile(srv.update.um.exePath)
	require.NoError(t, err)
	assert.Equal(t, []byte("old"), got2, "a failed download must leave the binary untouched")
}

// TestHandleApplyUpdate_MissingSignatureReportsTheExactREQ9Sentence covers D9's minisig-404
// class end to end.
func TestHandleApplyUpdate_MissingSignatureReportsTheExactREQ9Sentence(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	_, key, pubFile := newUpdateTestKey(t)
	publishRelease(t, origin, key, "v0.11.0", []byte("new content"))
	origin.mu.Lock()
	set := origin.assets["v0.11.0"]
	set.minisig = nil // the release has no signature published
	origin.assets["v0.11.0"] = set
	origin.mu.Unlock()

	srv := newUpdateTestServer(t, func(c *Config) {
		c.Update.BaseURL = origin.URL()
		c.Update.PublicKey = pubFile
		c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		c.Update.ExePath = filepath.Join(t.TempDir(), "musterd")
	})
	require.NoError(t, os.WriteFile(srv.update.um.exePath, []byte("old"), 0o755))
	srv.update.um.available = ptr("0.11.0")

	rec := postApplyUpdate(t, srv, `{}`)
	require.Equal(t, http.StatusAccepted, rec.Code)

	require.Eventually(t, func() bool {
		return srv.update.um.Current().Apply.Phase == string(selfupdate.PhaseFailed)
	}, 2*time.Second, 10*time.Millisecond)

	got := srv.update.um.Current().Apply.Error
	require.NotNil(t, got)
	assert.Equal(t, "couldn't download checksums.txt.minisig (status 404) — this release has no signature, refusing to apply", *got)
}
