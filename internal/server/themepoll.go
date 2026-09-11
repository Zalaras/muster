package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
)

// ThemeConfig groups the Claude-theme poller's config (plan code-breakup REQ-7). Poll <=
// 0 means the poller is never constructed at all (mirrors UsageConfig.Poll's shape) — a
// zero-value Config never opens ConfigFile.
type ThemeConfig struct {
	// Poll is the poll interval. <= 0 disables polling entirely: snapshot.claudeTheme.family
	// stays "unknown" forever.
	Poll time.Duration
	// ConfigFile is Claude Code's global config file to poll
	// (claudecode.DefaultConfigPath() in production) — a test seam like UsageConfig.TokenFile.
	ConfigFile string
}

// themeFeature owns the Claude-theme poller and the snapshot's claudeTheme object (plan
// code-breakup REQ-6). It mounts no routes.
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

// claudeThemeMessage is the WS `claudeTheme` envelope (docs/protocol.md §5.6) — flat,
// unlike prefsMessage/usageMessage: no nested object, just the type tag and the family.
// Sent only when the polled family changes (never per tick, never with a timestamp).
type claudeThemeMessage struct {
	Type   string `json:"type"`
	Family string `json:"family"`
}

// themeRetryDelay is the torn-write guard's wait before a retry read (REQ-14,
// Implementation Notes: "the 250 ms retry is a time.After inside tick"). Claude Code
// rewrites its own global config file; a tick can land mid-write and see a truncated or
// partial JSON body, which claudecode.ReadThemeFamily reports as Unknown like any other
// parse failure. The retry gives that self-overwrite a moment to finish before the
// poller treats a momentary blip as a real theme change.
const themeRetryDelay = 250 * time.Millisecond

// themeReader abstracts claudecode.ReadThemeFamily for tests (Implementation Notes:
// "Tests inject the reader (func(string) claudecode.ThemeFamily) ... — never a real
// 10 s wait"). Production always passes claudecode.ReadThemeFamily.
type themeReader func(path string) claudecode.ThemeFamily

// themePoller polls Claude Code's own theme setting on an interval, broadcasting
// `claudeTheme` only when the family changes (docs/protocol.md §5.6, REQ-14) — pattern
// copied from usagePoller (usagepoll.go)'s Start/Stop/loop/tick shape.
type themePoller struct {
	path      string
	reader    themeReader
	interval  time.Duration
	broadcast func(claudecode.ThemeFamily)
	log       zerolog.Logger

	mu      sync.RWMutex
	current claudecode.ThemeFamily

	cancel context.CancelFunc
	wg     sync.WaitGroup
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

// Start begins the poll loop with an immediate first tick (REQ-14). Call once.
func (p *themePoller) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		p.loop(ctx)
	}()
}

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done
// (mirrors usagePoller.Stop).
func (p *themePoller) Stop(ctx context.Context) {
	if p.cancel != nil {
		p.cancel()
	}
	done := make(chan struct{})
	go func() {
		p.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		p.log.Warn().Msg("theme poller did not stop before shutdown deadline")
	}
}

// Current returns the poller's latest family — used to fill snapshot.claudeTheme
// (REQ-15). ThemeUnknown before the first tick completes.
func (p *themePoller) Current() claudecode.ThemeFamily {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.current
}

func (p *themePoller) loop(ctx context.Context) {
	p.tick(ctx) // REQ-14: immediate fetch on Start, before the first ticker interval elapses.
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.tick(ctx)
		}
	}
}

// tick runs one read attempt, applying the torn-write retry guard (REQ-14) before
// deciding whether the family changed since the previous tick. Broadcasts and logs one
// Debug line only on an actual change — never per tick (REQ-14, R2).
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
