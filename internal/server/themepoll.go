package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
)

// ThemeConfig groups the Claude-theme poller's config. Poll <= 0 means the poller is
// never constructed at all (mirrors UsageConfig.Poll's shape) — a
// zero-value Config never opens ConfigFile.
type ThemeConfig struct {
	// Poll is the poll interval. <= 0 disables polling entirely: snapshot.claudeTheme.family
	// stays "unknown" forever.
	Poll time.Duration
	// ConfigFile is Claude Code's global config file to poll
	// (claudecode.DefaultConfigPath() in production) — a test seam like UsageConfig.TokenFile.
	ConfigFile string
}

// ClaudeThemeInfo is the `claudeTheme` object inside a snapshot
// (kb:anchor/ws.snapshot / kb:anchor/ws.claude-theme) — the daemon's latest read of
// Claude Code's own theme family. Family is always present: "unknown" while polling is
// disabled (-claude-theme-poll 0) or no read has yet succeeded.
type ClaudeThemeInfo struct {
	Family string `json:"family"`
}

// defaultClaudeThemeInfo is ClaudeThemeInfo's shape before themeFeature's first poll (or
// forever, when polling is disabled) — buildSnapshot's placeholder, matching
// themeFeature.contribute's own nil-poller case.
func defaultClaudeThemeInfo() ClaudeThemeInfo {
	return ClaudeThemeInfo{Family: string(claudecode.ThemeUnknown)}
}

// themeFeature owns the Claude-theme poller and the snapshot's claudeTheme object. It
// mounts no routes.
type themeFeature struct {
	poller *themePoller // nil when ThemeConfig.Poll <= 0
}

func newThemeFeature(cfg ThemeConfig, hub *wsHub, log zerolog.Logger) *themeFeature {
	f := &themeFeature{}
	if cfg.Poll > 0 {
		f.poller = newThemePoller(cfg.ConfigFile, claudecode.ReadThemeFamily, cfg.Poll, func(family claudecode.ThemeFamily) {
			hub.broadcast(claudeThemeMessage{Type: "claudeTheme", Family: string(family)})
		}, log)
	}
	return f
}

func (f *themeFeature) mount(_ *http.ServeMux, _ func(http.Handler) http.Handler) {}

func (f *themeFeature) Start() {
	if f.poller != nil {
		f.poller.Start()
	}
}

func (f *themeFeature) Stop(ctx context.Context) {
	if f.poller != nil {
		f.poller.Stop(ctx)
	}
}

func (f *themeFeature) contribute(_ context.Context, snap *Snapshot) {
	if f.poller != nil {
		snap.ClaudeTheme = ClaudeThemeInfo{Family: string(f.poller.Current())}
	}
}

// claudeThemeMessage is the WS `claudeTheme` envelope (kb:anchor/ws.claude-theme) — flat,
// unlike prefsMessage/usageMessage: no nested object, just the type tag and the family.
// Sent only when the polled family changes (never per tick, never with a timestamp).
type claudeThemeMessage struct {
	Type   string `json:"type"`
	Family string `json:"family"`
}

// themeRetryDelay is the torn-write guard's wait before a retry read: a time.After
// inside tick. Claude Code rewrites its own global config file; a tick can land mid-write
// and see a truncated or partial JSON body, which claudecode.ReadThemeFamily reports as
// Unknown like any other parse failure. The retry gives that self-overwrite a moment to
// finish before the poller treats a momentary blip as a real theme change.
const themeRetryDelay = 250 * time.Millisecond

// themeReader abstracts claudecode.ReadThemeFamily for tests: injecting the reader
// (func(string) claudecode.ThemeFamily) lets a test drive the poller without a real 10 s
// wait. Production always passes claudecode.ReadThemeFamily.
type themeReader func(path string) claudecode.ThemeFamily

// themePoller polls Claude Code's own theme setting on an interval, broadcasting
// `claudeTheme` only when the family changes (kb:anchor/ws.claude-theme,
// kb:adr/theme-claude-theme-read-only-poll). Embeds bgLoop (bgloop.go) for its
// Start/Stop/loop shape, same as usagePoller/shellActivityPoller; tick below is its own.
type themePoller struct {
	path      string
	reader    themeReader
	interval  time.Duration
	broadcast func(claudecode.ThemeFamily)
	log       zerolog.Logger

	mu      sync.RWMutex
	current claudecode.ThemeFamily

	bg bgLoop
}

func newThemePoller(path string, reader themeReader, interval time.Duration, broadcast func(claudecode.ThemeFamily), log zerolog.Logger) *themePoller {
	return &themePoller{
		path:      path,
		reader:    reader,
		interval:  interval,
		broadcast: broadcast,
		log:       log,
		current:   claudecode.ThemeUnknown,
	}
}

// Start begins the poll loop with an immediate first tick. Call once.
func (p *themePoller) Start() {
	p.bg.start(func(ctx context.Context) { runTicked(ctx, p.interval, nil, p.tick) })
}

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done
// (mirrors usagePoller.Stop).
func (p *themePoller) Stop(ctx context.Context) {
	p.bg.stop(ctx, p.log, "theme poller did not stop before shutdown deadline")
}

// Current returns the poller's latest family — used to fill snapshot.claudeTheme.
// ThemeUnknown before the first tick completes.
func (p *themePoller) Current() claudecode.ThemeFamily {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.current
}

// tick runs one read attempt, applying the torn-write retry guard before deciding
// whether the family changed since the previous tick. Broadcasts and logs one Debug line
// only on an actual change — never per tick (kb:adr/theme-claude-theme-read-only-poll).
func (p *themePoller) tick(ctx context.Context) {
	family := p.reader(p.path)

	previous := p.Current()

	// Retry once, after a short delay, only when a previously-known family suddenly
	// reads as unknown — the torn-write guard. A tick that was already unknown, or a
	// tick that reads a known family straight away, never waits.
	if family == claudecode.ThemeUnknown && previous != claudecode.ThemeUnknown {
		select {
		case <-time.After(themeRetryDelay):
		case <-ctx.Done():
			return
		}
		family = p.reader(p.path)
	}

	if family == previous {
		return
	}

	p.mu.Lock()
	p.current = family
	p.mu.Unlock()

	p.log.Debug().Str("family", string(family)).Msg("claude theme family changed")
	p.broadcast(family)
}
