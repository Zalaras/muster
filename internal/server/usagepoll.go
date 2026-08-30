package server

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/usage"
)

// usagePoller polls Claude Code's per-model weekly usage endpoint
// (internal/claudecode.FetchUsage) on an interval, mapping each successful fetch into
// internal/usage.ModelScoped — the seam ingest.go's processStatus is for the
// status-line half of the `usage` message. Refresh wakes it early (docs/protocol.md
// §3.9), coalesced to at most one extra fetch.
//
// Pattern copied from internal/session.Manager's liveness poll (manager.go:126-151 for
// Start/Stop, :715-726 for the ticker loop).
type usagePoller struct {
	client      *http.Client
	baseURL     string
	tokenReader claudecode.TokenReader
	interval    time.Duration
	modelScoped *usage.ModelScoped
	log         zerolog.Logger

	refresh chan struct{}
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

func newUsagePoller(client *http.Client, baseURL string, tokenReader claudecode.TokenReader, interval time.Duration, ms *usage.ModelScoped, log zerolog.Logger) *usagePoller {
	return &usagePoller{
		client:      client,
		baseURL:     baseURL,
		tokenReader: tokenReader,
		interval:    interval,
		modelScoped: ms,
		log:         log,
		refresh:     make(chan struct{}, 1),
	}
}

// Start begins the poll loop with an immediate first fetch (REQ-1). Call once.
func (p *usagePoller) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		p.loop(ctx)
	}()
}

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done
// (mirrors session.Manager.Stop / the ingest queue's Stop).
func (p *usagePoller) Stop(ctx context.Context) {
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
		p.log.Warn().Msg("usage poller did not stop before shutdown deadline")
	}
}

// Refresh wakes the poller for an immediate fetch (docs/protocol.md §3.9). Coalesced: a
// refresh already pending in the buffered channel makes this a silent no-op, so any
// number of concurrent calls collapse into at most one extra fetch (Edge Case 7); a
// refresh arriving while a fetch is already in flight is picked up as the very next tick
// once the loop goroutine is free (Edge Case 8) — there is never a second concurrent
// fetch, because one loop goroutine processes ticks and refreshes sequentially.
func (p *usagePoller) Refresh() {
	select {
	case p.refresh <- struct{}{}:
	default:
	}
}

func (p *usagePoller) loop(ctx context.Context) {
	p.tick(ctx) // REQ-1: immediate fetch on Start, before the first ticker interval elapses.
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.tick(ctx)
		case <-p.refresh:
			p.tick(ctx)
		}
	}
}

// tick runs one fetch attempt. Both the token read and the HTTP call impose their own
// bounded timeouts (KeychainTokenReader's 2s, FetchUsage's 5s), so a tick can never block
// the loop goroutine indefinitely (Edge Case 11).
func (p *usagePoller) tick(ctx context.Context) {
	token, err := p.tokenReader(ctx)
	if err != nil {
		// Debug, not Warn: SetError already escalates a *kind* transition to Warn once
		// (usage.ModelScoped.SetError). This just gives an operator who bumps the log
		// level the underlying cause. Safe to log — the token isn't read yet, so err
		// cannot contain it.
		p.log.Debug().Err(err).Msg("usage poll: reading token failed")
		p.modelScoped.SetError(usageErrorKind(err))
		return
	}

	report, err := claudecode.FetchUsage(ctx, p.client, p.baseURL, token)
	if err != nil {
		// Debug, same reasoning. Safe to log: the token travels only in the
		// Authorization header, never echoed into FetchUsage's returned error text
		// (pinned by TestFetchUsage_ErrorMessagesNeverContainTheToken).
		p.log.Debug().Err(err).Msg("usage poll: fetching usage failed")
		p.modelScoped.SetError(usageErrorKind(err))
		return
	}

	// A successful fetch is represented as a non-nil (possibly empty) slice even when
	// report.ModelScoped itself is nil — REQ-14/INV-1's "an empty list is a valid,
	// distinct successful result" depends on this construction, not on
	// InterpretUsageReport's own (ambiguous) nil-vs-empty choice.
	windows := make([]usage.ModelWindow, len(report.ModelScoped))
	for i, w := range report.ModelScoped {
		windows[i] = usage.ModelWindow{DisplayName: w.DisplayName, UsedPct: w.UsedPct, ResetsAt: w.ResetsAt}
	}
	if err := p.modelScoped.Record(ctx, windows); err != nil {
		p.log.Warn().Err(err).Msg("recording usage model-scoped windows failed")
	}
}

// usageErrorKind maps a poll failure to the wire's modelScopedError vocabulary
// (docs/protocol.md §5.4 / plan Implementation Notes): ErrNoCredentials ->
// "no-credentials", ErrUnauthorized -> "unauthorized", anything else (timeout, DNS,
// 5xx, decode error) -> "unreachable".
func usageErrorKind(err error) string {
	switch {
	case errors.Is(err, claudecode.ErrNoCredentials):
		return "no-credentials"
	case errors.Is(err, claudecode.ErrUnauthorized):
		return "unauthorized"
	default:
		return "unreachable"
	}
}
