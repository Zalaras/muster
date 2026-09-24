package server

import (
	"context"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandlePutPrefs_ConcurrentSingleFieldPUTsAllLand asserts that two (or more)
// concurrent PUTs, each naming a distinct field, must both land in the final persisted
// object — never one silently discarding the other's field. Without a lock spanning
// handlePutPrefs' loadPrefs->apply->KVSet/broadcast sequence, two goroutines could both
// loadPrefs the same (default) base before either persisted, and whichever KVSet/
// broadcast ran last would win with a base object missing the other's field. This fires N
// goroutines, each targeting one distinct field, from a shared start gate (so they
// actually race the load, not just run one after another by scheduling luck) and asserts
// every field's new value survived.
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
// coverage to the broadcast side: holding the lock across load->persist->broadcast as one
// section means N concurrent accepted PUTs against N connected sockets must each still
// see the *full*, correctly-merged object on whichever broadcast(s) they receive — never
// a broadcast built from a base object that raced ahead of a sibling PUT's own persist.
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

	// Order between the two concurrent PUTs is not fixed, but load->persist->broadcast
	// is serialised under one lock, so whichever PUT's broadcast this client receives
	// *second* was necessarily the one whose load ran after the other's persist — its
	// frame must therefore carry both fields, not just its own. One client's outbox is
	// FIFO, so "second received" and "second serialised" are the same frame.
	first := readJSON[prefsWire](t, c)
	second := readJSON[prefsWire](t, c)
	assert.Equal(t, "tiles", second.Prefs.View,
		"the second-serialised PUT's broadcast must carry the first PUT's already-persisted field too")
	assert.Equal(t, "3x2", second.Prefs.Density,
		"the second-serialised PUT's broadcast must carry the first PUT's already-persisted field too")
	// The first-serialised PUT's own broadcast necessarily raced ahead of the other's
	// persist, so it carries only its own field — asserted here for completeness, not
	// as this test's main claim (the second frame, above, is).
	assert.True(t,
		(first.Prefs.View == "tiles" && first.Prefs.Density == "2x2") ||
			(first.Prefs.View == "focus" && first.Prefs.Density == "3x2"),
		"the first-serialised PUT's broadcast must reflect exactly its own field against the other's still-default value, got %+v", first.Prefs)

	got := loadPrefs(context.Background(), srv.store)
	assert.Equal(t, "tiles", got.View, "a concurrent sibling PUT must never erase this PUT's field")
	assert.Equal(t, "3x2", got.Density, "a concurrent sibling PUT must never erase this PUT's field")
}
