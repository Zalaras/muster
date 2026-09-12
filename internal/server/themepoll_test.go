package server

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

// themeReaderSequence is a themeReader that returns one family per call, from a fixed
// sequence — the injected seam Implementation Notes calls for ("Tests inject the reader
// ... never a real 10 s wait"). Once the sequence is exhausted, further calls repeat its
// last value, so a test only needs to spell out the calls that matter.
type themeReaderSequence struct {
	mu    sync.Mutex
	seq   []claudecode.ThemeFamily
	calls int
}

func newThemeReaderSequence(seq ...claudecode.ThemeFamily) *themeReaderSequence {
	return &themeReaderSequence{seq: seq}
}

func (s *themeReaderSequence) read(_ string) claudecode.ThemeFamily {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := s.calls
	if idx >= len(s.seq) {
		idx = len(s.seq) - 1
	}
	s.calls++
	return s.seq[idx]
}

func (s *themeReaderSequence) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

// recordingThemeBroadcaster records every broadcast call — the hub-spy pattern D10/D11
// need to assert exact broadcast counts and payloads without a real wsHub.
type recordingThemeBroadcaster struct {
	mu    sync.Mutex
	calls []claudecode.ThemeFamily
}

func (b *recordingThemeBroadcaster) broadcast(family claudecode.ThemeFamily) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.calls = append(b.calls, family)
}

func (b *recordingThemeBroadcaster) count() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.calls)
}

func (b *recordingThemeBroadcaster) reset() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.calls = nil
}

// TestThemePoller_Tick_FirstTickFromUnknownBroadcastsTheReadFamily covers REQ-14's
// "immediate first tick" from the poller's initial state: a fresh poller starts at
// ThemeUnknown, so its very first tick — reading any known family — is itself a change
// and must broadcast once.
func TestThemePoller_Tick_FirstTickFromUnknownBroadcastsTheReadFamily(t *testing.T) {
	reader := newThemeReaderSequence(claudecode.ThemeDark)
	b := &recordingThemeBroadcaster{}
	p := newThemePoller("unused", reader.read, time.Hour, b.broadcast, zerolog.Nop())

	p.tick(context.Background())

	assert.Equal(t, claudecode.ThemeDark, p.Current())
	require.Equal(t, 1, b.count())
	assert.Equal(t, claudecode.ThemeDark, b.calls[0])
}

// TestThemePoller_Tick_BroadcastsExactlyOnceOnChangeZeroTimesOtherwise covers D10
// directly: after establishing a known baseline family, three ticks with no change
// broadcast zero times, and a single tick where the family flips broadcasts exactly
// once, carrying the new family.
func TestThemePoller_Tick_BroadcastsExactlyOnceOnChangeZeroTimesOtherwise(t *testing.T) {
	reader := newThemeReaderSequence(claudecode.ThemeDark)
	b := &recordingThemeBroadcaster{}
	p := newThemePoller("unused", reader.read, time.Hour, b.broadcast, zerolog.Nop())

	p.tick(context.Background()) // baseline: Unknown -> Dark, one broadcast.
	require.Equal(t, 1, b.count())
	require.Equal(t, claudecode.ThemeDark, p.Current())
	b.reset()

	for range 3 {
		p.tick(context.Background())
	}
	assert.Equal(t, 0, b.count(), "three ticks reading the same family must not broadcast at all")
	assert.Equal(t, claudecode.ThemeDark, p.Current())

	reader.mu.Lock()
	reader.seq = append(reader.seq, claudecode.ThemeLight)
	reader.mu.Unlock()

	p.tick(context.Background())
	require.Equal(t, 1, b.count(), "a tick whose family flips must broadcast exactly once")
	assert.Equal(t, claudecode.ThemeLight, b.calls[0])
	assert.Equal(t, claudecode.ThemeLight, p.Current())
}

// TestThemePoller_Tick_SingleFailedReadSelfHealsWithoutBroadcast covers D11's first
// branch: a lone Unknown read after a previously-known family retries once after 250 ms
// (themeRetryDelay); when the retry read recovers the same known family, nothing
// changed and nothing broadcasts.
func TestThemePoller_Tick_SingleFailedReadSelfHealsWithoutBroadcast(t *testing.T) {
	reader := newThemeReaderSequence(
		claudecode.ThemeDark,    // baseline tick
		claudecode.ThemeUnknown, // tick 2's first read: torn write
		claudecode.ThemeDark,    // tick 2's retry read: self-healed
	)
	b := &recordingThemeBroadcaster{}
	p := newThemePoller("unused", reader.read, time.Hour, b.broadcast, zerolog.Nop())

	p.tick(context.Background())
	require.Equal(t, claudecode.ThemeDark, p.Current())
	b.reset()

	start := time.Now()
	p.tick(context.Background())
	elapsed := time.Since(start)

	assert.GreaterOrEqual(t, elapsed, themeRetryDelay, "a lone Unknown read after a known family must wait out the retry delay")
	assert.Equal(t, 0, b.count(), "a self-healed single failed read must never broadcast unknown")
	assert.Equal(t, claudecode.ThemeDark, p.Current(), "current family must be unchanged after a self-healed retry")
	assert.Equal(t, 3, reader.callCount(), "the retry must have issued a second read")
}

// TestThemePoller_Tick_TwoConsecutiveFailuresDoBroadcastUnknown covers D11's second
// branch: when both the initial read and the 250 ms retry read come back Unknown, that
// is a real change from a previously-known family and must broadcast.
func TestThemePoller_Tick_TwoConsecutiveFailuresDoBroadcastUnknown(t *testing.T) {
	reader := newThemeReaderSequence(
		claudecode.ThemeDark,    // baseline tick
		claudecode.ThemeUnknown, // tick 2's first read
		claudecode.ThemeUnknown, // tick 2's retry read: still broken
	)
	b := &recordingThemeBroadcaster{}
	p := newThemePoller("unused", reader.read, time.Hour, b.broadcast, zerolog.Nop())

	p.tick(context.Background())
	require.Equal(t, claudecode.ThemeDark, p.Current())
	b.reset()

	p.tick(context.Background())

	require.Equal(t, 1, b.count(), "two consecutive Unknown reads must broadcast exactly once")
	assert.Equal(t, claudecode.ThemeUnknown, b.calls[0])
	assert.Equal(t, claudecode.ThemeUnknown, p.Current())
	assert.Equal(t, 3, reader.callCount())
}

// TestThemePoller_Tick_UnknownReadWhileAlreadyUnknownNeverRetries covers the retry
// guard's own condition from the other reachable source state: a poller that is already
// Unknown must not wait 250 ms on every tick just because the read is (still) Unknown —
// only a previously-*known* family arms the retry.
func TestThemePoller_Tick_UnknownReadWhileAlreadyUnknownNeverRetries(t *testing.T) {
	reader := newThemeReaderSequence(claudecode.ThemeUnknown)
	b := &recordingThemeBroadcaster{}
	p := newThemePoller("unused", reader.read, time.Hour, b.broadcast, zerolog.Nop())

	start := time.Now()
	p.tick(context.Background())
	elapsed := time.Since(start)

	assert.Less(t, elapsed, themeRetryDelay, "a tick starting from Unknown must never invoke the retry wait")
	assert.Equal(t, 1, reader.callCount(), "no retry read should have been issued")
	assert.Equal(t, 0, b.count(), "Unknown staying Unknown is not a change and must not broadcast")
	assert.Equal(t, claudecode.ThemeUnknown, p.Current())
}

// TestThemePoller_NeverWritesTheConfigFile covers D9/INV-6 at the poller level (theme.go
// already gets its own function-level version): three ticks against a real fixture file,
// through the real claudecode.ReadThemeFamily reader, must never change its bytes or
// mtime.
func TestThemePoller_NeverWritesTheConfigFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "claude-config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"theme":"dark"}`), 0o600))
	before, err := os.ReadFile(path)
	require.NoError(t, err)
	statBefore, err := os.Stat(path)
	require.NoError(t, err)

	b := &recordingThemeBroadcaster{}
	p := newThemePoller(path, claudecode.ReadThemeFamily, time.Hour, b.broadcast, zerolog.Nop())

	for range 3 {
		p.tick(context.Background())
	}

	after, err := os.ReadFile(path)
	require.NoError(t, err)
	statAfter, err := os.Stat(path)
	require.NoError(t, err)
	assert.Equal(t, before, after, "the poller must never modify the config file's contents")
	assert.Equal(t, statBefore.ModTime(), statAfter.ModTime(), "the poller must never modify the config file's mtime")
}

// TestThemePoller_StartStop_ImmediateFirstTickThenPromptStop covers REQ-14's "immediate
// first tick on Start" and guards against a goroutine leak, mirroring
// TestUsagePoller_StartStop_LoopExitsPromptly.
func TestThemePoller_StartStop_ImmediateFirstTickThenPromptStop(t *testing.T) {
	reader := newThemeReaderSequence(claudecode.ThemeDark)
	b := &recordingThemeBroadcaster{}
	p := newThemePoller("unused", reader.read, time.Hour, b.broadcast, zerolog.Nop())

	p.Start()
	require.Eventually(t, func() bool { return reader.callCount() >= 1 }, time.Second, 5*time.Millisecond, "Start must read immediately (REQ-14)")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	p.Stop(ctx)

	assert.NoError(t, ctx.Err(), "Stop must return well within its deadline for a loop with no in-flight work")
}

// TestServer_ClaudeThemePollZeroConstructsNoPoller covers D17: a Config with
// ClaudeThemePoll <= 0 (the -claude-theme-poll 0 flag value) must construct no poller at
// all — nil field, so Start/Stop and currentSnapshot's poller read all skip it safely.
func TestServer_ClaudeThemePollZeroConstructsNoPoller(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	assert.Nil(t, srv.theme.poller, "a Config built with the zero-value ClaudeThemePoll must never construct a poller")
}

// TestServer_ClaudeThemePollPositiveConstructsAPoller covers the reverse of D17: a
// positive ClaudeThemePoll does construct one, from the reachable source state D17's own
// assertion needs a counterpart for.
func TestServer_ClaudeThemePollPositiveConstructsAPoller(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	srv := New(Config{
		Store: st, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		Theme: ThemeConfig{Poll: time.Second, ConfigFile: filepath.Join(t.TempDir(), "claude-config.json")},
	})

	assert.NotNil(t, srv.theme.poller, "a positive ClaudeThemePoll must construct a poller")
}
