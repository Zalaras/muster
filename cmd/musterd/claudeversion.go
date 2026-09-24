package main

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/server"
)

// versionCheckTimeout bounds the startup Claude Code version check; a hung claude binary
// must not stall daemon startup.
const versionCheckTimeout = 5 * time.Second

// checkClaudeCode reports the installed Claude Code version against the canary-verified
// range (docs/claude-code-versions.md), without ever failing startup: no outcome here
// makes musterd exit non-zero or skip serving (INV-3). bin is the -claude-bin value, so
// the check and session launches agree on which binary "claude" is.
func checkClaudeCode(ctx context.Context, bin string, log zerolog.Logger) server.ClaudeCodeInfo {
	report := claudecode.CheckVersion(ctx, bin)

	event := log.Info()
	msg := "claude code version is within the verified range"
	switch report.Status {
	case claudecode.StatusVerified:
		// The Info event and message set above are already this case.
	case claudecode.StatusAbove:
		event = log.Warn()
		msg = "claude code version is newer than any version Muster has been tested with; behaviour past the verified range is best-effort (run make canary to verify it)"
	case claudecode.StatusBelow:
		event = log.Warn()
		msg = "claude code version is older than any version Muster has been tested with; behaviour is best-effort — update Claude Code"
	case claudecode.StatusUnknown:
		event = log.Warn()
		msg = "could not determine claude code version"
	}
	event = event.
		Str("floor", report.Floor).
		Str("verified", report.Verified).
		Str("status", string(report.Status)).
		Err(report.Err)
	if report.Installed != nil {
		event = event.Str("installed", *report.Installed)
	}
	event.Msg(msg)

	return server.ClaudeCodeInfo{
		Installed: report.Installed,
		Floor:     report.Floor,
		Verified:  report.Verified,
		Status:    string(report.Status),
	}
}
