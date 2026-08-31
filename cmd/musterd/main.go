// Command musterd is the Muster daemon: it owns the tmux sessions, ingests Claude Code
// hooks and status-line posts, derives session state, and serves the dashboard.
package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/server"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/webui"
)

// version is set at build time via -ldflags (see the Makefile).
var version = "dev"

// versionCheckTimeout bounds the startup drift check; a hung claude binary must not stall
// daemon startup.
const versionCheckTimeout = 5 * time.Second

// shutdownTimeout bounds graceful shutdown: HTTP connections closing, WS sockets
// closing, and the ingest queue draining, combined.
const shutdownTimeout = 10 * time.Second

// onExitPromptTimeout bounds the `-on-exit=ask` confirmation (REQ-3): unanswered within
// this window (or stdin isn't a TTY at all) resolves to "leave", never a silent kill.
const onExitPromptTimeout = 10 * time.Second

// defaultUsagePoll is -usage-poll's default (plan usage-model-bar REQ-1).
const defaultUsagePoll = 5 * time.Minute

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "musterd:", err)
		os.Exit(1)
	}
}

func run(args []string, stdin *os.File, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("musterd", flag.ContinueOnError)
	fs.SetOutput(stderr)

	defaultDataDir := "muster-data"
	if home, err := os.UserHomeDir(); err == nil {
		defaultDataDir = filepath.Join(home, "Library", "Application Support", "Muster")
	}

	var (
		showVersion    = fs.Bool("version", false, "print version and exit")
		addr           = fs.String("addr", "127.0.0.1:8765", "listen address (localhost only by design)")
		dataDir        = fs.String("data-dir", defaultDataDir, "directory for the database, tokens and other daemon-local state")
		webDist        = fs.String("web-dist", "", "serve the dashboard from this directory instead of the embedded copy (dev override; empty uses the binary's embedded dashboard)")
		debug          = fs.Bool("debug", false, "debug logging")
		claudeBin      = fs.String("claude-bin", "claude", "the `claude` binary to spawn for a launched session (REQ-19: lets E2E launch a stub)")
		tmuxSocket     = fs.String("tmux-socket", "muster", "dedicated tmux socket (REQ-19: never the user's default server); a value containing '/' is used as a filesystem path (-S), otherwise a named socket (-L) — m2-terminal REQ-5")
		browseRoot     = fs.String("browse-root", "", "root of the launch modal's folder browser — GET /api/browse's no-param default and its Up ceiling (empty = the user's home directory; E2E passes its scratch dir)")
		onExit         = fs.String("on-exit", "ask", "what to do with live sessions on shutdown: ask (default, prompts once if stdin is a TTY) | leave | kill")
		usagePoll      = fs.Duration("usage-poll", defaultUsagePoll, "how often musterd polls Claude Code's per-model weekly usage endpoint; 0 disables polling (POST /api/usage/refresh then 404s)")
		usageAPIURL    = fs.String("usage-api-url", "https://api.anthropic.com", "base URL for the per-model usage endpoint — a test seam like -claude-bin")
		usageTokenFile = fs.String("usage-token-file", "", "read the Claude Code OAuth token from this file instead of the macOS Keychain — a test seam like -claude-bin (empty = the daemon's usual Keychain lookup)")
	)
	if err := fs.Parse(args); err != nil {
		return err
	}

	switch *onExit {
	case "ask", "leave", "kill":
	default:
		return fmt.Errorf("invalid -on-exit value %q: must be ask, leave, or kill", *onExit)
	}

	if *showVersion {
		fmt.Fprintf(stdout, "musterd %s (pinned to Claude Code %s)\n", version, claudecode.PinnedVersion)
		return nil
	}

	// Fail fast on a socket path tmux cannot bind (AF_UNIX sun_path limit) — otherwise
	// the failure surfaces later as a bare "File name too long" from inside tmux.
	if err := tmux.ValidateSocket(*tmuxSocket); err != nil {
		return err
	}

	level := zerolog.InfoLevel
	if *debug {
		level = zerolog.DebugLevel
	}
	log := zerolog.New(zerolog.ConsoleWriter{Out: stderr}).Level(level).With().Timestamp().Logger()

	if err := checkWebDist(*webDist, log); err != nil {
		return err
	}

	if err := os.MkdirAll(*dataDir, 0o700); err != nil {
		return fmt.Errorf("creating data dir %q: %w", *dataDir, err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbPath := filepath.Join(*dataDir, "muster.db")
	st, err := store.Open(ctx, dbPath)
	if err != nil {
		return fmt.Errorf("opening store: %w", err)
	}
	defer func() { _ = st.Close() }()

	uiToken, ingestToken, err := bootstrapTokens(ctx, st)
	if err != nil {
		return fmt.Errorf("bootstrapping tokens: %w", err)
	}

	versionCtx, versionCancel := context.WithTimeout(ctx, versionCheckTimeout)
	installed, drift := checkClaudeCode(versionCtx, log)
	versionCancel()

	var lc net.ListenConfig
	ln, err := lc.Listen(ctx, "tcp", *addr)
	if err != nil {
		return fmt.Errorf("listening on %s: %w", *addr, err)
	}

	port := 0
	if tcpAddr, ok := ln.Addr().(*net.TCPAddr); ok {
		port = tcpAddr.Port
	}

	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)
	dashboardURL := fmt.Sprintf("%s/auth?token=%s", baseURL, uiToken)
	if err = writeTokensFile(*dataDir, dashboardURL, uiToken, ingestToken); err != nil {
		return fmt.Errorf("writing tokens file: %w", err)
	}

	hookScript, statusLineScript, legacyScript, err := claudecode.WriteWrapperScripts(*dataDir, baseURL, ingestToken)
	if err != nil {
		return fmt.Errorf("writing hook wrapper scripts: %w", err)
	}
	// REQ-16: paths only, never the token or URL either script embeds.
	log.Info().Str("hook_script", hookScript).Str("status_line_script", statusLineScript).
		Msg("wrote hook wrapper scripts")

	srv := server.New(server.Config{
		Store:         st,
		Logger:        log,
		UIToken:       uiToken,
		IngestToken:   ingestToken,
		WebDist:       *webDist,
		DaemonVersion: version,
		ClaudeCode: server.ClaudeCodeInfo{
			Pinned:    claudecode.PinnedVersion,
			Installed: installed,
			Drift:     drift,
		},
		ClaudeBin:        *claudeBin,
		TmuxSocket:       *tmuxSocket,
		BrowseRoot:       *browseRoot,
		HookScript:       hookScript,
		StatusLineScript: statusLineScript,
		LegacyScripts:    []string{legacyScript},
		UsagePoll:        *usagePoll,
		UsageAPIURL:      *usageAPIURL,
		UsageTokenFile:   *usageTokenFile,
		KeychainUser:     keychainUser(),
	})
	srv.Start()

	httpServer := &http.Server{Handler: srv.Handler()}

	serveErr := make(chan error, 1)
	go func() {
		serveErr <- httpServer.Serve(ln)
	}()

	log.Info().
		Str("version", version).
		Int("port", port).
		Str("data_dir", *dataDir).
		Str("dashboard_url", dashboardURL).
		Msg("musterd starting")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Info().Str("signal", sig.String()).Msg("shutting down")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serving http: %w", err)
		}
		return nil
	}

	// Resolved (and, for "ask", possibly prompted) before the shutdown timeout budget
	// starts — the REQ-3 prompt has its own 10s timeout, separate from shutdownTimeout's
	// budget for the rest of teardown. Zero live sessions: neither branch below prints
	// anything (REQ-3).
	live := srv.LiveSessionCount()
	if live > 0 {
		switch resolveOnExit(*onExit, stdin, stderr, live, srv.TmuxSocket()) {
		case onExitKill:
			// Bounded (review cycle 1 Minor 3): context.Background() had no deadline at
			// all, so a wedged tmux kill-session could hang shutdown indefinitely,
			// outside shutdownTimeout's own budget for the rest of teardown below.
			endAllCtx, endAllCancel := context.WithTimeout(context.Background(), shutdownTimeout)
			ended := srv.EndAllSessions(endAllCtx)
			endAllCancel()
			log.Info().Int("count", ended).Str("tmux_socket", srv.TmuxSocket()).Msg("ended live sessions on shutdown")
		case onExitLeave:
			log.Info().Int("count", live).Str("tmux_socket", srv.TmuxSocket()).Msg("leaving live sessions running")
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Warn().Err(err).Msg("http server shutdown")
	}
	srv.Shutdown(shutdownCtx)

	return nil
}

// checkWebDist validates the -web-dist / embedded-dashboard serving precedence at
// startup (plan embed-dashboard REQ-3/REQ-9). An on-disk override (-web-dist set) is a
// permissive dev override: a directory missing index.html only logs a warning and
// startup proceeds — cmd/musterd/onexit_test.go:125 depends on an empty -web-dist dir
// being accepted, and Edge Case 2 calls this out explicitly ("serve whatever is there").
// Falling through to the embedded dashboard (-web-dist unset) with nothing actually
// embedded — a binary built before any `make web-build` — is fatal: it replaces today's
// silent 404-everything failure with an actionable error naming both remedies, before
// the daemon ever starts listening.
func checkWebDist(webDist string, log zerolog.Logger) error {
	if webDist != "" {
		if _, err := os.Stat(filepath.Join(webDist, "index.html")); err != nil {
			log.Warn().Str("web_dist", webDist).
				Msg("-web-dist directory has no index.html; serving whatever is there")
		}
		return nil
	}
	if !webui.HasDashboard(webui.FS()) {
		return fmt.Errorf("no dashboard embedded in this binary: run `make web-build` before building musterd, or pass -web-dist pointing at a built dashboard directory")
	}
	return nil
}

// bootstrapTokens loads the UI and ingest tokens from kv, generating and persisting them
// on first run (REQ-2).
func bootstrapTokens(ctx context.Context, st *store.Store) (uiToken, ingestToken string, err error) {
	uiToken, err = getOrCreateToken(ctx, st, "ui_token")
	if err != nil {
		return "", "", err
	}
	ingestToken, err = getOrCreateToken(ctx, st, "ingest_token")
	if err != nil {
		return "", "", err
	}
	return uiToken, ingestToken, nil
}

func getOrCreateToken(ctx context.Context, st *store.Store, key string) (string, error) {
	if value, ok, err := st.KVGet(ctx, key); err != nil {
		return "", fmt.Errorf("reading %s: %w", key, err)
	} else if ok {
		return value, nil
	}

	token, err := randomToken()
	if err != nil {
		return "", err
	}
	if err := st.KVSet(ctx, key, token); err != nil {
		return "", fmt.Errorf("persisting %s: %w", key, err)
	}
	return token, nil
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating random token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

type tokensFile struct {
	DashboardURL string `json:"dashboardUrl"`
	UIToken      string `json:"uiToken"`
	IngestToken  string `json:"ingestToken"`
}

// writeTokensFile writes <data-dir>/tokens.json (mode 0600) on every startup — the
// launcher/E2E handoff (REQ-3). Rewritten identically across restarts since the tokens
// themselves persist in kv.
func writeTokensFile(dataDir, dashboardURL, uiToken, ingestToken string) error {
	tf := tokensFile{
		DashboardURL: dashboardURL,
		UIToken:      uiToken,
		IngestToken:  ingestToken,
	}
	b, err := json.MarshalIndent(tf, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding tokens file: %w", err)
	}

	path := filepath.Join(dataDir, "tokens.json")
	if err := os.WriteFile(path, b, 0o600); err != nil {
		return fmt.Errorf("writing %s: %w", path, err)
	}
	// os.WriteFile only applies the mode to a newly-created file; force it on every
	// startup regardless (REQ-3: "mode 0600" is a standing property, not a one-time one).
	if err := os.Chmod(path, 0o600); err != nil {
		return fmt.Errorf("chmod %s: %w", path, err)
	}
	return nil
}

// keychainUser returns the current OS account name for KeychainTokenReader's
// `security find-generic-password -a <user>` lookup (Implementation Notes: "user from
// os/user.Current() in main, passed in"). Empty on lookup failure — KeychainTokenReader
// then simply fails every tick with ErrNoCredentials rather than musterd refusing to
// start.
func keychainUser() string {
	u, err := user.Current()
	if err != nil {
		return ""
	}
	return u.Username
}

// checkClaudeCode reports the installed Claude Code version and whether it drifted from
// the pin, without failing startup (docs/claude-code-pin.md). Both return values are nil
// when the check itself failed (claude missing/hung) — REQ-8/Edge Case 12.
func checkClaudeCode(ctx context.Context, log zerolog.Logger) (installed *string, drift *bool) {
	err := claudecode.CheckPin(ctx)
	if err == nil {
		pinned := claudecode.PinnedVersion
		noDrift := false
		return &pinned, &noDrift
	}

	var driftErr *claudecode.VersionDriftError
	if errors.As(err, &driftErr) {
		log.Warn().
			Str("installed", driftErr.Installed).
			Str("pinned", driftErr.Pinned).
			Msg("claude code version drift; run `make canary` before trusting Muster against this version")
		got := driftErr.Installed
		yesDrift := true
		return &got, &yesDrift
	}

	log.Warn().Err(err).Msg("could not determine claude code version")
	return nil, nil
}

// onExitDecision is -on-exit's final, already-resolved leave/kill decision (REQ-3):
// "ask" is resolved to one of these by resolveOnExit before run's shutdown path acts on
// it — nothing downstream of resolveOnExit ever sees "ask" itself.
type onExitDecision int

const (
	onExitLeave onExitDecision = iota
	onExitKill
)

// resolveOnExit turns the raw -on-exit flag value into a final leave/kill decision.
// "leave"/"kill" pass straight through; "ask" prompts once — but only when stdin is a
// character device (a real terminal, checked via Stat's ModeCharDevice, per
// Implementation Notes — stdlib only, no new dependency) — and otherwise resolves to
// "leave" without printing anything. Callers only invoke this once they already know
// liveSessions > 0 (REQ-3: zero live sessions gets no prompt and no log line at all).
func resolveOnExit(flagValue string, stdin *os.File, stderr io.Writer, liveSessions int, tmuxSocket string) onExitDecision {
	switch flagValue {
	case "kill":
		return onExitKill
	case "leave":
		return onExitLeave
	}
	if !isCharDevice(stdin) {
		return onExitLeave
	}
	return askKillPrompt(stdin, stderr, liveSessions, tmuxSocket)
}

// isCharDevice reports whether f is a TTY-shaped file (stdin's Stat().Mode(), stdlib
// only — Implementation Notes: "os.Stdin.Stat() mode ModeCharDevice"). A stat failure or
// nil file is treated as "not a TTY" (Edge Case: never prompt into the void).
func isCharDevice(f *os.File) bool {
	if f == nil {
		return false
	}
	info, err := f.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice != 0
}

// askKillPrompt prints the REQ-3 confirmation to stderr and reads one line from stdin,
// racing a 10s timeout: only "y"/"Y"/"yes" (case-insensitive) answers kill; anything
// else, or the timeout firing first, answers leave (Edge Case 10: a TTY with nobody
// watching must never be silently killed).
func askKillPrompt(stdin *os.File, stderr io.Writer, liveSessions int, tmuxSocket string) onExitDecision {
	fmt.Fprintf(stderr, "%d live sessions on tmux socket %s — kill them? [y/N] ", liveSessions, tmuxSocket)

	answer := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(stdin).ReadString('\n')
		answer <- strings.TrimSpace(line)
	}()

	select {
	case a := <-answer:
		switch strings.ToLower(a) {
		case "y", "yes":
			return onExitKill
		default:
			return onExitLeave
		}
	case <-time.After(onExitPromptTimeout):
		fmt.Fprintln(stderr)
		return onExitLeave
	}
}
