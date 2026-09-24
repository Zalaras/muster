// Package boundedwait holds the one piece of a background-loop shutdown that crosses
// package boundaries: bounded-wait-with-warn. internal/session's liveness poll and
// internal/server's ingest queue and four pollers each hand-wrote "cancel (or close), wait
// for the goroutine to exit, but give up and warn once ctx is done" — extracting the
// duplicated pattern here removes that repetition. internal/session must never import
// internal/server (kb:diagram/daemon-components), so the shared half lives here instead,
// importing nothing internal itself. Named for the wait, not "lifecycle" —
// internal/server already uses that word for its own feature Start/Stop interface.
package boundedwait

import (
	"context"
	"sync"

	"github.com/rs/zerolog"
)

// Wait blocks until wg is done, or until ctx is done first — in which case it logs msg at
// Warn via log and returns without waiting further. The caller is responsible for making
// wg eventually reach zero (cancel a context, close a channel, whatever the loop needs);
// Wait only owns the "did it stop in time" half.
func Wait(ctx context.Context, wg *sync.WaitGroup, log zerolog.Logger, msg string) {
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		log.Warn().Msg(msg)
	}
}
