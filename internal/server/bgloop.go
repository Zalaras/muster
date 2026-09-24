package server

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/boundedwait"
)

// bgLoop is the Start/cancel/bounded-wait-with-warn shape shared by usagePoller,
// themePoller, shellActivityPoller and updateManager. Embedding it leaves each poller
// owning only its own tick.
type bgLoop struct {
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// start runs fn on its own goroutine under a context that stop's cancel ends. Call once.
func (l *bgLoop) start(fn func(ctx context.Context)) {
	ctx, cancel := context.WithCancel(context.Background())
	l.cancel = cancel
	l.wg.Add(1)
	go func() {
		defer l.wg.Done()
		fn(ctx)
	}()
}

// stop cancels the loop and waits for it to exit, giving up when ctx is done.
func (l *bgLoop) stop(ctx context.Context, log zerolog.Logger, warnMsg string) {
	if l.cancel != nil {
		l.cancel()
	}
	boundedwait.Wait(ctx, &l.wg, log, warnMsg)
}

// runTicked runs tick immediately, then on every tick of interval and every receive from
// refresh, until ctx is done — the tick/ticker/refresh loop body shared by usagePoller,
// themePoller, shellActivityPoller and updateManager. refresh may be nil: a nil channel is
// never ready, so pollers with no refresh path (theme, shell activity) simply never take
// that case.
func runTicked(ctx context.Context, interval time.Duration, refresh <-chan struct{}, tick func(ctx context.Context)) {
	tick(ctx)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tick(ctx)
		case <-refresh:
			tick(ctx)
		}
	}
}
