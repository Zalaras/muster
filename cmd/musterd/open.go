package main

import (
	"context"
	"os/exec"
	"time"

	"github.com/rs/zerolog"
)

// openDashboardTimeout bounds the -open-cmd subprocess (REQ-8, Edge Case 9): a program
// that never exits must not delay shutdown or leak past startup.
const openDashboardTimeout = 10 * time.Second

// openDashboard runs cmdName with url as its single argument on its own goroutine, never
// blocking the caller (REQ-6/REQ-8). A missing program, a non-zero exit (e.g. macOS open
// with no default browser configured, Edge Case 8) or the bounded timeout only logs a
// warning — startup and shutdown continue regardless. The warning never includes url
// itself (R4 — it already carries the UI token, and tokens.json plus the dashboard_url
// field on the "musterd starting" log line are the only two places that token appears).
func openDashboard(ctx context.Context, cmdName, url string, log zerolog.Logger) {
	go func() {
		runCtx, cancel := context.WithTimeout(ctx, openDashboardTimeout)
		defer cancel()

		if err := exec.CommandContext(runCtx, cmdName, url).Run(); err != nil {
			log.Warn().Err(err).Str("open_cmd", cmdName).Msg("could not auto-open the dashboard")
		}
	}()
}
