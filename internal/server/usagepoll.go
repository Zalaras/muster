package server

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/usage"
)

type usagePoller struct {
	client      *http.Client
	baseURL     string
	tokenReader claudecode.TokenReader
	interval    time.Duration
	aggregator  *usage.Aggregator
	modelScoped *usage.ModelScoped
	log         zerolog.Logger

	refresh chan struct{}
	changed chan struct{}
	bg      bgLoop
	watch   bgLoop
}

func newUsagePoller(client *http.Client, baseURL string, tokenReader claudecode.TokenReader, interval time.Duration, agg *usage.Aggregator, ms *usage.ModelScoped, log zerolog.Logger) *usagePoller {
	return &usagePoller{
		client:      client,
		baseURL:     baseURL,
		tokenReader: tokenReader,
		interval:    interval,
		aggregator:  agg,
		modelScoped: ms,
		log:         log,
		refresh:     make(chan struct{}, 1),
		changed:     make(chan struct{}, 1),
	}
}

// Start begins the poll loop with an immediate first fetch
// (kb:adr/usage-all-windows-polled-and-refetched-at-reset) and the reset watcher. Call once.
func (p *usagePoller) Start() {
	p.bg.start(func(ctx context.Context) { runTicked(ctx, p.interval, p.refresh, p.tick) })
	p.watch.start(p.watchResets)
}

func (p *usagePoller) Stop(ctx context.Context) {
	p.watch.stop(ctx, p.log, "usage reset watcher did not stop before shutdown deadline")
	p.bg.stop(ctx, p.log, "usage poller did not stop before shutdown deadline")
}

func (p *usagePoller) notify() {
	select {
	case p.changed <- struct{}{}:
	default:
	}
}

func (p *usagePoller) watchResets(ctx context.Context) {
	for {
		timer := time.NewTimer(time.Hour)
		var wake <-chan time.Time
		next, ok := nextReset(time.Now(), p.aggregator.Current(), p.modelScoped.Current().Windows)
		if ok {
			timer.Reset(time.Until(next))
			wake = timer.C
		}
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-p.changed:
		case <-wake:
			p.Refresh()
		}
		timer.Stop()
	}
}

func nextReset(now time.Time, snap usage.Snapshot, windows []usage.ModelWindow) (time.Time, bool) {
	var next time.Time
	consider := func(t time.Time) {
		if t.After(now) && (next.IsZero() || t.Before(next)) {
			next = t
		}
	}
	if snap.FiveHour != nil {
		consider(snap.FiveHour.ResetsAt)
	}
	if snap.SevenDay != nil {
		consider(snap.SevenDay.ResetsAt)
	}
	for _, w := range windows {
		consider(w.ResetsAt)
	}
	return next, !next.IsZero()
}

// Refresh wakes the poller for an immediate fetch (kb:anchor/usage.refresh). Coalesced: a
// refresh already pending in the buffered channel makes this a silent no-op, so any
// number of concurrent calls collapse into at most one extra fetch; a refresh arriving
// while a fetch is already in flight is picked up as the very next tick once the loop
// goroutine is free — there is never a second concurrent fetch, because one loop
// goroutine processes ticks and refreshes sequentially.
func (p *usagePoller) Refresh() {
	select {
	case p.refresh <- struct{}{}:
	default:
	}
}

// tick runs one fetch attempt. Both the token read and the HTTP call impose their own
// bounded timeouts (KeychainTokenReader's 2s, FetchUsage's 5s), so a tick can never block
// the loop goroutine indefinitely.
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

	p.recordBuckets(ctx, report)

	// A successful fetch is represented as a non-nil (possibly empty) slice even when
	// report.ModelScoped itself is nil — "an empty list is a valid, distinct successful
	// result" depends on this construction, not on InterpretUsageReport's own (ambiguous)
	// nil-vs-empty choice.
	windows := make([]usage.ModelWindow, len(report.ModelScoped))
	for i, w := range report.ModelScoped {
		windows[i] = usage.ModelWindow{DisplayName: w.DisplayName, UsedPct: w.UsedPct, ResetsAt: w.ResetsAt}
	}
	if err := p.modelScoped.Record(ctx, windows); err != nil {
		p.log.Warn().Err(err).Msg("recording usage model-scoped windows failed")
	}
}

func (p *usagePoller) recordBuckets(ctx context.Context, report claudecode.UsageReport) {
	if err := p.aggregator.RecordFetch(ctx, toOptionalUsageBucket(report.FiveHour), toOptionalUsageBucket(report.SevenDay)); err != nil {
		p.log.Warn().Err(err).Msg("recording usage buckets failed")
	}
}

func toUsageBucket(b claudecode.StatusBucket) usage.Bucket {
	return usage.Bucket{UsedPct: b.UsedPct, ResetsAt: b.ResetsAt}
}

func toOptionalUsageBucket(b *claudecode.StatusBucket) *usage.Bucket {
	if b == nil {
		return nil
	}
	converted := toUsageBucket(*b)
	return &converted
}

// usageErrorKind maps a poll failure to the wire's modelScopedError vocabulary
// (kb:anchor/ws.usage): ErrNoCredentials ->
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
