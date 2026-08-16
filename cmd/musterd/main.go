// Command musterd is the Muster daemon: it owns the tmux sessions, ingests Claude Code
// hooks and status-line posts, derives session state, and serves the dashboard.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
)

// version is set at build time via -ldflags (see the Makefile).
var version = "dev"

// versionCheckTimeout bounds the startup drift check; a hung claude binary must not stall
// daemon startup.
const versionCheckTimeout = 5 * time.Second

// errNotImplemented marks the pre-M0 stub. M0 replaces it with the real server.
var errNotImplemented = errors.New("serve: not implemented (pre-M0)")

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "musterd:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("musterd", flag.ContinueOnError)
	fs.SetOutput(stderr)
	var (
		showVersion = fs.Bool("version", false, "print version and exit")
		addr        = fs.String("addr", "127.0.0.1:8765", "listen address (localhost only by design)")
		debug       = fs.Bool("debug", false, "debug logging")
	)
	if err := fs.Parse(args); err != nil {
		return err
	}

	if *showVersion {
		fmt.Fprintf(stdout, "musterd %s (pinned to Claude Code %s)\n", version, claudecode.PinnedVersion)
		return nil
	}

	level := slog.LevelInfo
	if *debug {
		level = slog.LevelDebug
	}
	log := slog.New(slog.NewTextHandler(stderr, &slog.HandlerOptions{Level: level}))

	ctx, cancel := context.WithTimeout(context.Background(), versionCheckTimeout)
	defer cancel()
	warnOnVersionDrift(ctx, log)
	log.Info("musterd starting", "version", version, "addr", *addr)

	// M0 lands the HTTP+WS server, token auth, SQLite and the claudecode ingest here.
	// See SPEC.md §10.
	return errNotImplemented
}

// warnOnVersionDrift reports a Claude Code version mismatch without failing startup.
// Muster leaves the auto-updater alone, so drift is expected eventually; it must be visible
// but must never stop the user working. See docs/claude-code-pin.md.
func warnOnVersionDrift(ctx context.Context, log *slog.Logger) {
	err := claudecode.CheckPin(ctx)
	if err == nil {
		return
	}
	var drift *claudecode.VersionDriftError
	if errors.As(err, &drift) {
		log.Warn("claude code version drift",
			"installed", drift.Installed,
			"pinned", drift.Pinned,
			"action", "run `make canary` before trusting Muster against this version")
		return
	}
	log.Warn("could not determine claude code version", "err", err)
}
