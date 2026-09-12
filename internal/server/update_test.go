package server

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"aead.dev/minisign"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/selfupdate"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

// ---------------------------------------------------------------------------------------
// A fake GitHub Releases origin: /latest redirects to a configurable tag, and
// /download/<tag>/<name> serves configurable release assets. hold()/release() pause every
// request until released — D16/D18's "response arrives late"/"second request while one is
// in flight" fixtures need this, mirroring the plan's own FakeReleaseServer shape at unit
// scale.

type fakeOrigin struct {
	t   *testing.T
	srv *httptest.Server

	mu       sync.Mutex
	tag      string
	failNext bool
	assets   map[string]fakeAssetSet // tag -> assets
	counts   map[string]int          // request path -> count
	holdCh   chan struct{}           // non-nil: every request blocks here until released
}

type fakeAssetSet struct {
	archive, checksums, minisig []byte
}

func newFakeOrigin(t *testing.T) *fakeOrigin {
	t.Helper()
	o := &fakeOrigin{t: t, assets: map[string]fakeAssetSet{}, counts: map[string]int{}}
	o.srv = httptest.NewServer(http.HandlerFunc(o.handle))
	t.Cleanup(o.srv.Close)
	return o
}

func (o *fakeOrigin) URL() string { return o.srv.URL }

func (o *fakeOrigin) handle(w http.ResponseWriter, r *http.Request) {
	o.mu.Lock()
	o.counts[r.URL.Path]++
	hold := o.holdCh
	o.mu.Unlock()
	if hold != nil {
		<-hold
	}

	if r.URL.Path == "/latest" {
		o.mu.Lock()
		tag, fail := o.tag, o.failNext
		o.mu.Unlock()
		if fail {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Location", "/tag/"+tag)
		w.WriteHeader(http.StatusFound)
		return
	}

	// /download/<tag>/<name>
	rest := strings.TrimPrefix(r.URL.Path, "/download/")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) != 2 {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	tag, name := parts[0], parts[1]
	o.mu.Lock()
	set, ok := o.assets[tag]
	o.mu.Unlock()
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	var data []byte
	switch name {
	case "checksums.txt":
		data = set.checksums
	case "checksums.txt.minisig":
		data = set.minisig
	default:
		data = set.archive
	}
	if data == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (o *fakeOrigin) setLatest(tag string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.tag = tag
}

func (o *fakeOrigin) setFailNext(fail bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.failNext = fail
}

// hold makes every subsequent request block until release() is called.
func (o *fakeOrigin) hold() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.holdCh = make(chan struct{})
}

func (o *fakeOrigin) release() {
	o.mu.Lock()
	ch := o.holdCh
	o.holdCh = nil
	o.mu.Unlock()
	if ch != nil {
		close(ch)
	}
}

func (o *fakeOrigin) countOf(path string) int {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.counts[path]
}

func (o *fakeOrigin) totalRequests() int {
	o.mu.Lock()
	defer o.mu.Unlock()
	total := 0
	for _, c := range o.counts {
		total += c
	}
	return total
}

// publishRelease builds a valid, signed release for tag (a "musterd" member containing
// content) and registers it on the origin.
func publishRelease(t *testing.T, o *fakeOrigin, key minisign.PrivateKey, tag string, content []byte) {
	t.Helper()
	version, ok := selfupdate.ParseRelease(tag)
	require.True(t, ok)
	asset := selfupdate.AssetName(version.String(), "darwin", runtime.GOARCH)

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	require.NoError(t, tw.WriteHeader(&tar.Header{Name: "musterd", Mode: 0o755, Size: int64(len(content))}))
	_, err := tw.Write(content)
	require.NoError(t, err)
	require.NoError(t, tw.Close())
	require.NoError(t, gz.Close())
	archive := buf.Bytes()

	checksums := fmt.Appendf(nil, "%x  %s\n", sha256.Sum256(archive), asset)
	minisig := minisign.Sign(key, checksums)

	o.mu.Lock()
	o.assets[tag] = fakeAssetSet{archive: archive, checksums: checksums, minisig: minisig}
	o.mu.Unlock()
}

// newUpdateTestKey generates a fresh disposable minisign keypair — never Damian's real
// one (this agent never handles it, per the orchestrator's brief).
func newUpdateTestKey(t *testing.T) (pub minisign.PublicKey, priv minisign.PrivateKey, pubFile []byte) {
	t.Helper()
	pub, priv, err := minisign.GenerateKey(nil)
	require.NoError(t, err)
	pubFile, err = pub.MarshalText()
	require.NoError(t, err)
	return pub, priv, pubFile
}

// ---------------------------------------------------------------------------------------
// updateManager unit tests (D14-D17, D24) — constructed directly (white-box: this file is
// package server) rather than through a full Server/HTTP round trip, since the assertions
// are about the checker's own state machine, not wiring.

func newTestUpdateManager(t *testing.T, mutate func(*updateManagerConfig)) (*updateManager, chan UpdateInfo) {
	t.Helper()
	changes := make(chan UpdateInfo, 64)
	cfg := updateManagerConfig{
		Client:       http.DefaultClient,
		Base:         "http://example.invalid",
		Interval:     time.Hour, // long enough that no real tick ever fires during a test
		Install:      selfupdate.Install{Kind: selfupdate.KindInstaller},
		Running:      "0.10.0",
		CheckEnabled: true,
		Log:          zerolog.Nop(),
		OnChange:     func(u UpdateInfo) { changes <- u },
	}
	if mutate != nil {
		mutate(&cfg)
	}
	return newUpdateManager(cfg), changes
}

// TestUpdateManager_DisabledCheckingMakesNoRequests covers D14: with updateCheck false,
// construction, Start, three direct ticks and Refresh together make zero requests to the
// update base URL.
func TestUpdateManager_DisabledCheckingMakesNoRequests(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")

	m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
		c.Base = origin.URL()
		c.CheckEnabled = false
	})

	m.Start()
	m.tick(context.Background())
	m.tick(context.Background())
	m.tick(context.Background())
	m.Refresh()
	time.Sleep(50 * time.Millisecond) // let any buggy async path have its chance to fire
	m.Stop(context.Background())

	assert.Equal(t, 0, origin.totalRequests(), "checking disabled must make zero requests to the update base URL")
}

// TestUpdateManager_SetCheckEnabledFalseClearsAndBroadcastsOnce covers D15's disable
// half: clears available/checkedAt and broadcasts exactly one update.
func TestUpdateManager_SetCheckEnabledFalseClearsAndBroadcastsOnce(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) { c.Base = origin.URL() })

	m.checkAvailability(context.Background())
	first := <-changes
	require.NotNil(t, first.Available, "sanity: a check must have found v0.11.0 available first")

	m.SetCheckEnabled(false)

	got := <-changes
	assert.Nil(t, got.Available)
	assert.Nil(t, got.CheckedAt)
	select {
	case extra := <-changes:
		t.Fatalf("expected exactly one broadcast from SetCheckEnabled(false), got an extra: %+v", extra)
	case <-time.After(100 * time.Millisecond):
	}
}

// TestUpdateManager_SetCheckEnabledTrueTriggersImmediateCheck covers D15's enable half:
// re-enabling wakes an immediate check rather than waiting for the (here, very long)
// interval to elapse.
func TestUpdateManager_SetCheckEnabledTrueTriggersImmediateCheck(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) {
		c.Base = origin.URL()
		c.CheckEnabled = false
		c.Interval = time.Hour
	})
	m.Start()
	t.Cleanup(func() { m.Stop(context.Background()) })

	m.SetCheckEnabled(true)

	select {
	case got := <-changes:
		require.NotNil(t, got.Available)
		assert.Equal(t, "0.11.0", *got.Available)
	case <-time.After(2 * time.Second):
		t.Fatal("SetCheckEnabled(true) must trigger an immediate check, not wait for the interval")
	}
}

// TestUpdateManager_LateResponseAfterDisableIsDiscarded covers D16: a check already in
// flight when the pref is switched off must not clobber the disable with a stale result,
// and must broadcast nothing itself.
func TestUpdateManager_LateResponseAfterDisableIsDiscarded(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	origin.hold()
	m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) { c.Base = origin.URL() })

	done := make(chan struct{})
	go func() {
		m.checkAvailability(context.Background())
		close(done)
	}()
	time.Sleep(50 * time.Millisecond) // let the goroutine reach the held HTTP call

	m.SetCheckEnabled(false)
	disableBroadcast := <-changes
	assert.Nil(t, disableBroadcast.Available)

	origin.release()
	<-done

	select {
	case extra := <-changes:
		t.Fatalf("the late in-flight result must not broadcast anything, got: %+v", extra)
	case <-time.After(200 * time.Millisecond):
	}
	assert.Nil(t, m.Current().Available, "the discarded result must not have been committed")
	assert.Nil(t, m.Current().CheckedAt)
}

// TestUpdateManager_FailedCheckKeepsPreviousResultAndBroadcastsNothing covers D17: a
// failed check leaves available/checkedAt exactly as they were and produces no broadcast.
func TestUpdateManager_FailedCheckKeepsPreviousResultAndBroadcastsNothing(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) { c.Base = origin.URL() })

	m.checkAvailability(context.Background())
	first := <-changes
	require.NotNil(t, first.Available)
	require.NotNil(t, first.CheckedAt)

	origin.setFailNext(true)
	m.checkAvailability(context.Background())

	select {
	case extra := <-changes:
		t.Fatalf("a failed check must broadcast nothing, got: %+v", extra)
	case <-time.After(200 * time.Millisecond):
	}
	got := m.Current()
	assert.Equal(t, first.Available, got.Available, "a failed check must not clear the previous result")
	assert.Equal(t, first.CheckedAt, got.CheckedAt)
}

// TestUpdateManager_CheckSwap_DetectsAnExternalSwap covers D24's success half: a stat
// change plus a successful probe sets Installed.
func TestUpdateManager_CheckSwap_DetectsAnExternalSwap(t *testing.T) {
	dir := t.TempDir()
	exePath := filepath.Join(dir, "musterd")
	require.NoError(t, os.WriteFile(exePath, []byte("original"), 0o755))

	var probed string
	m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) {
		c.ExePath = exePath
		c.ExeRun = func(context.Context, string, ...string) (string, error) { return probed, nil }
	})

	// Change size+mtime relative to the construction-time stat.
	require.NoError(t, os.WriteFile(exePath, []byte("a different, longer size on disk"), 0o755))
	probed = "musterd v0.11.0"

	m.checkSwap(context.Background())

	got := <-changes
	require.NotNil(t, got.Installed)
	assert.Equal(t, "0.11.0", *got.Installed)
}

// TestUpdateManager_CheckSwap_ProbeFailureOrTimeoutLeavesInstalledNull covers D24's
// failure half: a probe that errors, or one that never returns before its deadline, must
// leave Installed null rather than committing a bogus value.
func TestUpdateManager_CheckSwap_ProbeFailureOrTimeoutLeavesInstalledNull(t *testing.T) {
	t.Run("probe returns an error", func(t *testing.T) {
		dir := t.TempDir()
		exePath := filepath.Join(dir, "musterd")
		require.NoError(t, os.WriteFile(exePath, []byte("original"), 0o755))
		m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
			c.ExePath = exePath
			c.ExeRun = func(context.Context, string, ...string) (string, error) { return "", assert.AnError }
		})
		require.NoError(t, os.WriteFile(exePath, []byte("changed"), 0o755))

		m.checkSwap(context.Background())

		assert.Nil(t, m.Current().Installed)
	})

	t.Run("probe hangs past its deadline", func(t *testing.T) {
		dir := t.TempDir()
		exePath := filepath.Join(dir, "musterd")
		require.NoError(t, os.WriteFile(exePath, []byte("original"), 0o755))
		m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) {
			c.ExePath = exePath
			c.ExeRun = func(ctx context.Context, _ string, _ ...string) (string, error) {
				<-ctx.Done()
				return "", ctx.Err()
			}
		})
		require.NoError(t, os.WriteFile(exePath, []byte("changed"), 0o755))

		// checkSwap wraps the incoming ctx with ProbeVersionTimeout via
		// context.WithTimeout — passing an already-short-deadline ctx here makes the
		// *effective* deadline the shorter one, so this test proves the timeout path
		// without waiting out the real 5s constant.
		shortCtx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
		defer cancel()

		m.checkSwap(shortCtx)

		assert.Nil(t, m.Current().Installed)
	})
}

// ---------------------------------------------------------------------------------------
// HTTP-level tests (D18, D19, D20, D23) — built through a real *Server so routing, auth
// and the WS broadcast wiring are exercised too.

func newUpdateTestServer(t *testing.T, mutate func(*Config)) *testServer {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	cfg := Config{
		Store: st, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "0.10.0",
		Update: UpdateConfig{CheckInterval: time.Hour},
	}
	if mutate != nil {
		mutate(&cfg)
	}
	srv := New(cfg)
	return &testServer{Server: srv, dbPath: dbPath, store: st}
}

func postApplyUpdate(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/update/apply", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func getRestartImpact(t *testing.T, srv *testServer) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/update/restart-impact", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHandleApplyUpdate_ErrorTable covers D18's whole error table (bar the "second
// request in flight" and success cases, covered by their own tests below).
func TestHandleApplyUpdate_ErrorTable(t *testing.T) {
	t.Run("bad JSON body is 400", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) { c.Update.BaseURL = "http://example.invalid" })
		rec := postApplyUpdate(t, srv, `not json`)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
	})

	t.Run("empty body defaults restart to false and is accepted", func(t *testing.T) {
		origin := newFakeOrigin(t)
		_, key, pubFile := newUpdateTestKey(t)
		origin.setLatest("v0.11.0")
		publishRelease(t, origin, key, "v0.11.0", []byte("new"))
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = origin.URL()
			c.Update.PublicKey = pubFile
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
			c.Update.ExePath = filepath.Join(t.TempDir(), "musterd")
		})
		require.NoError(t, os.WriteFile(srv.update.um.exePath, []byte("old"), 0o755))
		srv.update.um.available = ptr("0.11.0")

		rec := postApplyUpdate(t, srv, ``)
		assert.Equal(t, http.StatusAccepted, rec.Code)

		require.Eventually(t, func() bool {
			return srv.update.um.Current().Apply.Phase == string(selfupdate.PhaseDone)
		}, 2*time.Second, 10*time.Millisecond, "let the background apply finish before the test ends")
	})

	t.Run("no update manager (UpdateBaseURL empty) is 404 not_found", func(t *testing.T) {
		srv := newUpdateTestServer(t, nil) // UpdateBaseURL left empty
		rec := postApplyUpdate(t, srv, `{}`)
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Equal(t, "not_found", decodeErrorCode(t, rec))
	})

	t.Run("dev install is 404 not_found", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = "http://example.invalid"
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindDev}
			c.DaemonVersion = "dev"
		})
		rec := postApplyUpdate(t, srv, `{}`)
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Equal(t, "not_found", decodeErrorCode(t, rec))
	})

	for _, kind := range []selfupdate.Kind{selfupdate.KindHomebrew, selfupdate.KindUnmanaged} {
		t.Run(string(kind)+" install is 409 update_unsupported with message==remedy", func(t *testing.T) {
			remedy := "some remedy sentence"
			srv := newUpdateTestServer(t, func(c *Config) {
				c.Update.BaseURL = "http://example.invalid"
				c.Update.Install = selfupdate.Install{Kind: kind, Remedy: remedy}
			})
			rec := postApplyUpdate(t, srv, `{}`)
			assert.Equal(t, http.StatusConflict, rec.Code)
			assert.Equal(t, "update_unsupported", decodeErrorCode(t, rec))
			assert.Equal(t, remedy, decodeErrorMessage(t, rec))
		})
	}

	t.Run("nothing available and nothing installed is 409 nothing_to_apply", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = "http://example.invalid"
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})
		rec := postApplyUpdate(t, srv, `{}`)
		assert.Equal(t, http.StatusConflict, rec.Code)
		assert.Equal(t, "nothing_to_apply", decodeErrorCode(t, rec))
	})

	t.Run("shutting down is 409 shutting_down", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = "http://example.invalid"
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})
		srv.update.um.available = ptr("0.11.0")
		srv.update.um.Stop(context.Background())

		rec := postApplyUpdate(t, srv, `{}`)
		assert.Equal(t, http.StatusConflict, rec.Code)
		assert.Equal(t, "shutting_down", decodeErrorCode(t, rec))
	})

	t.Run("requires cookie", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) { c.Update.BaseURL = "http://example.invalid" })
		req := httptest.NewRequest(http.MethodPost, "/api/update/apply", strings.NewReader(`{}`))
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

func decodeErrorMessage(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var envelope struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	return envelope.Error.Message
}

func ptr(s string) *string { return &s }

// TestHandleApplyUpdate_SecondRequestWhileInFlightReturns202WithoutASecondDownload
// covers D18/D20's REQ-20 half: a second POST while an apply is downloading returns 202
// without starting a second download, and the first request's own restart value wins.
func TestHandleApplyUpdate_SecondRequestWhileInFlightReturns202WithoutASecondDownload(t *testing.T) {
	origin := newFakeOrigin(t)
	_, key, pubFile := newUpdateTestKey(t)
	origin.setLatest("v0.11.0")
	publishRelease(t, origin, key, "v0.11.0", []byte("new content"))
	srv := newUpdateTestServer(t, func(c *Config) {
		c.Update.BaseURL = origin.URL()
		c.Update.PublicKey = pubFile
		c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		c.Update.ExePath = filepath.Join(t.TempDir(), "musterd")
	})
	require.NoError(t, os.WriteFile(srv.update.um.exePath, []byte("old"), 0o755))
	srv.update.um.available = ptr("0.11.0")

	origin.hold() // block the archive/checksums download mid-flight
	first := postApplyUpdate(t, srv, `{}`)
	require.Equal(t, http.StatusAccepted, first.Code)

	require.Eventually(t, func() bool {
		return origin.totalRequests() > 0
	}, 2*time.Second, 10*time.Millisecond, "the first apply must have reached the origin before the second request races it")

	second := postApplyUpdate(t, srv, `{"restart":true}`)
	assert.Equal(t, http.StatusAccepted, second.Code)

	archiveAsset := selfupdate.AssetName("0.11.0", "darwin", runtime.GOARCH)
	assert.LessOrEqual(t, origin.countOf("/download/v0.11.0/"+archiveAsset), 1, "no second download must start")

	origin.release()
	require.Eventually(t, func() bool {
		return srv.update.um.Current().Apply.Phase == string(selfupdate.PhaseDone)
	}, 5*time.Second, 20*time.Millisecond)
	// The joined (second) request's restart:true must not have been silently dropped —
	// kb:anchor/update.apply says the *first* request's own restart value wins, and the
	// first request here passed no restart at all (false).
	select {
	case <-srv.update.um.restartRequests:
		t.Fatal("the first request's restart:false must win over the joined second request's restart:true")
	case <-time.After(200 * time.Millisecond):
	}
}

// TestHandleApplyUpdate_SuccessfulApplyBroadcastsPhasesInOrder covers D19: a successful
// apply broadcasts downloading -> verifying -> installing -> done in order with version
// set, and INV-4 holds after every broadcast.
func TestHandleApplyUpdate_SuccessfulApplyBroadcastsPhasesInOrder(t *testing.T) {
	origin := newFakeOrigin(t)
	_, key, pubFile := newUpdateTestKey(t)
	origin.setLatest("v0.11.0")
	publishRelease(t, origin, key, "v0.11.0", []byte("new content"))
	srv := newUpdateTestServer(t, func(c *Config) {
		c.Update.BaseURL = origin.URL()
		c.Update.PublicKey = pubFile
		c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		c.Update.ExePath = filepath.Join(t.TempDir(), "musterd")
	})
	require.NoError(t, os.WriteFile(srv.update.um.exePath, []byte("old"), 0o755))
	srv.update.um.available = ptr("0.11.0")

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := postApplyUpdate(t, srv, `{}`)
	require.Equal(t, http.StatusAccepted, rec.Code)

	var phases []string
	for range 4 {
		msg := readJSON[updateWireForTest](t, c)
		require.Equal(t, "update", msg.Type)
		phases = append(phases, msg.Update.Apply.Phase)
		assertINV4(t, msg.Update.Apply)
	}
	assert.Equal(t, []string{"downloading", "verifying", "installing", "done"}, phases)
}

// TestHandleApplyUpdate_RestartTrueBroadcastsRestartingAndSignalsExactlyOnce covers D20.
func TestHandleApplyUpdate_RestartTrueBroadcastsRestartingAndSignalsExactlyOnce(t *testing.T) {
	origin := newFakeOrigin(t)
	_, key, pubFile := newUpdateTestKey(t)
	origin.setLatest("v0.11.0")
	publishRelease(t, origin, key, "v0.11.0", []byte("new content"))
	srv := newUpdateTestServer(t, func(c *Config) {
		c.Update.BaseURL = origin.URL()
		c.Update.PublicKey = pubFile
		c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		c.Update.ExePath = filepath.Join(t.TempDir(), "musterd")
	})
	require.NoError(t, os.WriteFile(srv.update.um.exePath, []byte("old"), 0o755))
	srv.update.um.available = ptr("0.11.0")

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := postApplyUpdate(t, srv, `{"restart":true}`)
	require.Equal(t, http.StatusAccepted, rec.Code)

	var phases []string
	for range 5 {
		msg := readJSON[updateWireForTest](t, c)
		phases = append(phases, msg.Update.Apply.Phase)
	}
	assert.Equal(t, []string{"downloading", "verifying", "installing", "done", "restarting"}, phases)

	select {
	case <-srv.RestartRequests():
	case <-time.After(2 * time.Second):
		t.Fatal("expected exactly one value on RestartRequests()")
	}
	select {
	case <-srv.RestartRequests():
		t.Fatal("expected exactly one value on RestartRequests(), got a second")
	case <-time.After(200 * time.Millisecond):
	}
}

type updateWireForTest struct {
	Type   string `json:"type"`
	Update struct {
		Apply struct {
			Phase   string  `json:"phase"`
			Version *string `json:"version"`
			Error   *string `json:"error"`
		} `json:"apply"`
	} `json:"update"`
}

func assertINV4(t *testing.T, apply struct {
	Phase   string  `json:"phase"`
	Version *string `json:"version"`
	Error   *string `json:"error"`
}) {
	t.Helper()
	if apply.Phase == "failed" {
		assert.NotNil(t, apply.Error, "INV-4: error must be non-nil when phase is failed")
	} else {
		assert.Nil(t, apply.Error, "INV-4: error must be nil when phase is not failed")
	}
	if apply.Phase == "idle" {
		assert.Nil(t, apply.Version, "INV-4: version must be nil when phase is idle")
	} else {
		assert.NotNil(t, apply.Version, "INV-4: version must be non-nil when phase is not idle")
	}
}

// ---------------------------------------------------------------------------------------
// GET /api/update/restart-impact (D23) — uses a real per-test tmux socket, since the
// endpoint's own job is to read real tmux state (docs/conventions.md: real tmux only
// where the assertion is about a tmux-observable effect).

func newRestartImpactTestServer(t *testing.T) *testServer {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	socket := tmuxtest.Socket(t)
	srv := New(Config{
		Store: st, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "0.10.0", TmuxSocket: socket,
	})
	return &testServer{Server: srv, dbPath: dbPath, store: st, tmuxSocket: socket}
}

func createRealShellSession(t *testing.T, socket, name string) {
	t.Helper()
	out, err := exec.Command("tmux", "-S", socket, "new-session", "-d", "-s", name).CombinedOutput()
	require.NoError(t, err, "tmux new-session: %s", out)
	t.Cleanup(func() {
		_ = exec.Command("tmux", "-S", socket, "kill-session", "-t", name).Run()
	})
}

// TestHandleRestartImpact_EmptyWhenNoShellsAreOpen covers D23's empty case.
func TestHandleRestartImpact_EmptyWhenNoShellsAreOpen(t *testing.T) {
	srv := newRestartImpactTestServer(t)

	rec := getRestartImpact(t, srv)

	require.Equal(t, http.StatusOK, rec.Code)
	var body restartImpactResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Empty(t, body.Shells)
}

// TestHandleRestartImpact_ListsEachShellWithItsSessionTitle covers D23's happy path: an
// alive muster-<n>-shell session is listed with its owning session's title, and a shell
// whose id matches no known session lists a null title.
func TestHandleRestartImpact_ListsEachShellWithItsSessionTitle(t *testing.T) {
	srv := newRestartImpactTestServer(t)

	title := "fix auth"
	id := seedSessionRow(t, srv, func(r *store.SessionRow) { r.Title = &title })
	createRealShellSession(t, srv.tmuxSocket, tmux.ShellSessionName(id))

	unknownID := int64(99999)
	createRealShellSession(t, srv.tmuxSocket, tmux.ShellSessionName(unknownID))

	rec := getRestartImpact(t, srv)

	require.Equal(t, http.StatusOK, rec.Code)
	var body restartImpactResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Shells, 2)

	byID := map[int64]*string{}
	for _, s := range body.Shells {
		byID[s.SessionID] = s.Title
	}
	require.Contains(t, byID, id)
	require.NotNil(t, byID[id])
	assert.Equal(t, title, *byID[id])
	require.Contains(t, byID, unknownID)
	assert.Nil(t, byID[unknownID], "a shell whose session id is unknown must render a null title")
}

// TestHandleRestartImpact_RequiresCookie covers the auth wiring for the new endpoint.
func TestHandleRestartImpact_RequiresCookie(t *testing.T) {
	srv := newRestartImpactTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/update/restart-impact", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleRestartImpact_WorksEvenWhenUpdatesAreDisabled covers the daemon-implementation
// Decision that kb:anchor/update.restart-impact carries "no errors beyond auth", independent of whether an
// updateManager exists at all (UpdateBaseURL empty in newRestartImpactTestServer above).
func TestHandleRestartImpact_WorksEvenWhenUpdatesAreDisabled(t *testing.T) {
	srv := newRestartImpactTestServer(t)
	require.Nil(t, srv.update.um, "sanity: this server must have updates disabled")

	rec := getRestartImpact(t, srv)

	assert.Equal(t, http.StatusOK, rec.Code)
}
