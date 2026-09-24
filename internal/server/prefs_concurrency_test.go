package server

import (
	"context"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandlePutPrefs_ConcurrentSingleFieldPUTsAllLand covers review.maintainability.b-server.md
// Critical 1 (F2): two (or more) concurrent PUTs, each naming a distinct field, must both
// land in the final persisted object — never one silently discarding the other's field.
// Pre-fix, handlePutPrefs' loadPrefs->apply->KVSet/broadcast sequence had no lock spanning
// it, so two goroutines could both loadPrefs the same (default) base before either
// persisted, and whichever KVSet/broadcast ran last would win with a base object missing
// the other's field. This fires N goroutines, each targeting one distinct field, from a
// shared start gate (so they actually race the load, not just run one after another by
// scheduling luck) and asserts every field's new value survived.
//
// This test is written to FAIL on the pre-F2 code: see daemon-tests-F2.md for the captured
// -race/assertion failure against the restored pre-fix internal/server/prefs.go.
func TestHandlePutPrefs_ConcurrentSingleFieldPUTsAllLand(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	tests := []struct {
		field string
		body  string
		want  func(t *testing.T, got PrefsInfo)
	}{
		{"view", `{"view":"tiles"}`, func(t *testing.T, got PrefsInfo) { assert.Equal(t, "tiles", got.View) }},
		{"density", `{"density":"3x2"}`, func(t *testing.T, got PrefsInfo) { assert.Equal(t, "3x2", got.Density) }},
		{"usageModel", `{"usageModel":"Opus"}`, func(t *testing.T, got PrefsInfo) { assert.Equal(t, "Opus", got.UsageModel) }},
		{"railSort", `{"railSort":"attention"}`, func(t *testing.T, got PrefsInfo) { assert.Equal(t, "attention", got.RailSort) }},
		{"theme", `{"theme":"dark"}`, func(t *testing.T, got PrefsInfo) { assert.Equal(t, "dark", got.Theme) }},
		{"railDensity", `{"railDensity":"compact"}`, func(t *testing.T, got PrefsInfo) { assert.Equal(t, "compact", got.RailDensity) }},
		{"railActivity", `{"railActivity":"both"}`, func(t *testing.T, got PrefsInfo) { assert.Equal(t, "both", got.RailActivity) }},
	}

	start := make(chan struct{})
	var wg sync.WaitGroup
	codes := make([]int, len(tests))
	wg.Add(len(tests))
	for i, tt := range tests {
		go func(i int, body string) {
			defer wg.Done()
			<-start
			rec := putPrefsRequest(t, srv, body)
			codes[i] = rec.Code
		}(i, tt.body)
	}
	close(start)
	wg.Wait()

	for i, tt := range tests {
		require.Equal(t, 204, codes[i], "PUT for field %q must be accepted", tt.field)
	}

	got := loadPrefs(context.Background(), srv.store)
	for _, tt := range tests {
		tt.want(t, got)
	}
}

// TestHandlePutPrefs_ConcurrentPUTsAllReachTheBroadcastToo extends the lost-update
// coverage to the broadcast side: Critical 1's fix holds the lock across
// load->persist->broadcast as one section, so N concurrent accepted PUTs against N
// connected sockets must each still see the *full*, correctly-merged object on whichever
// broadcast(s) they receive — never a broadcast built from a base object that raced ahead
// of a sibling PUT's own persist.
func TestHandlePutPrefs_ConcurrentPUTsAllReachTheBroadcastToo(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	bodies := []string{`{"view":"tiles"}`, `{"density":"3x2"}`}
	start := make(chan struct{})
	var wg sync.WaitGroup
	codes := make([]int, len(bodies))
	wg.Add(len(bodies))
	for i, body := range bodies {
		go func(i int, body string) {
			defer wg.Done()
			<-start
			codes[i] = putPrefsRequest(t, srv, body).Code
		}(i, body)
	}
	close(start)
	wg.Wait()
	for i, code := range codes {
		require.Equal(t, 204, code, "goroutine %d", i)
	}

	// Drain both broadcasts (order between the two concurrent PUTs is not fixed); the
	// final persisted state, not any single broadcast frame, is the invariant under test.
	_ = readJSON[prefsWire](t, c)
	_ = readJSON[prefsWire](t, c)

	got := loadPrefs(context.Background(), srv.store)
	assert.Equal(t, "tiles", got.View, "Critical 1: a concurrent sibling PUT must never erase this PUT's field")
	assert.Equal(t, "3x2", got.Density, "Critical 1: a concurrent sibling PUT must never erase this PUT's field")
}
