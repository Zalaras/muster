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
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/mattn/go-isatty"
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/locate"
	"github.com/Zalaras/muster/internal/selfupdate"
	"github.com/Zalaras/muster/internal/server"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/webui"
)

// version is set at build time via -ldflags (see the Makefile).
var version = "dev"

// versionCheckTimeout bounds the startup Claude Code version check; a hung claude binary
// must not stall daemon startup.
const versionCheckTimeout = 5 * time.Second

// shutdownTimeout bounds graceful shutdown: HTTP connections closing, WS sockets
// closing, and the ingest queue draining, combined.
const shutdownTimeout = 10 * time.Second

// onExitPromptTimeout bounds the `-on-exit=ask` confirmation (REQ-3): unanswered within
// this window (or stdin isn't a TTY at all) resolves to "leave", never a silent kill.
const onExitPromptTimeout = 10 * time.Second

// defaultUsagePoll is -usage-poll's default (plan usage-model-bar REQ-1).
const defaultUsagePoll = 5 * time.Minute

// defaultClaudeThemePoll is -claude-theme-poll's default (plan new-ui-design-colors
// REQ-14).
const defaultClaudeThemePoll = 10 * time.Second

// defaultUpdateBaseURL is -update-base-url's default (plan auto-update REQ-5) — empty
// disables checking and apply entirely, the IssueAPIURL shape; every E2E daemon passes
// "" explicitly (web/e2e/helpers/daemon.ts), so this default is only ever live outside
// tests.
const defaultUpdateBaseURL = "https://github.com/Zalaras/muster/releases"

// defaultUpdateCheckInterval is -update-check-interval's default (plan auto-update REQ-4).
const defaultUpdateCheckInterval = 24 * time.Hour

func main() {
	err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)

	var restart *errRestart
	if errors.As(err, &restart) {
		// Only returns on failure (Implementation Notes "Re-exec") — everything needed
		// for a clean shutdown already happened inside run() before it returned this.
		if execErr := reexec(restart.exe); execErr != nil {
			fmt.Fprintln(os.Stderr, "musterd: restarting:", execErr)
			os.Exit(1)
		}
		return
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, "musterd:", err)
		os.Exit(1)
	}
}

// cliFlags is every -flag musterd accepts, already parsed and validated by parseFlags.
type cliFlags struct {
	showVersion         bool
	addr                string
	dataDir             string
	webDist             string
	debug               bool
	claudeBin           string
	tmuxSocket          string
	browseRoot          string
	onExit              string
	usagePoll           time.Duration
	usageAPIURL         string
	usageTokenFile      string
	issueRepo           string
	issueAPIURL         string
	issueTokenFile      string
	openFlag            bool
	openCmd             string
	claudeThemePoll     time.Duration
	claudeConfigFile    string
	updateFlag          bool
	updateBaseURL       string
	updateCheckInterval time.Duration
	updatePublicKeyFile string
}

// parseFlags declares, parses and validates musterd's command line. Flag defaults that
// depend on the environment (the data dir under the user's home, Claude Code's own config
// path) are resolved here too; both degrade to a usable value rather than failing.
func parseFlags(args []string, stderr io.Writer) (*cliFlags, error) {
	fset := flag.NewFlagSet("musterd", flag.ContinueOnError)
	fset.SetOutput(stderr)

	defaultDataDir := "muster-data"
	if home, err := os.UserHomeDir(); err == nil {
		defaultDataDir = filepath.Join(home, "Library", "Application Support", "Muster")
	}

	// -claude-config-file's default (plan new-ui-design-colors, Affected Files): empty
	// when DefaultConfigPath itself fails (no home directory) — polling then stays
	// enabled but every read reports "unknown", never a fallback constant duplicating
	// the file's own name outside internal/claudecode.
	defaultClaudeConfigFile := ""
	if p, err := claudecode.DefaultConfigPath(); err == nil {
		defaultClaudeConfigFile = p
	}

	var f cliFlags
	fset.BoolVar(&f.showVersion, "version", false, "print version and exit")
	fset.StringVar(&f.addr, "addr", "127.0.0.1:8765", "listen address (localhost only by design)")
	fset.StringVar(&f.dataDir, "data-dir", defaultDataDir, "directory for the database, tokens and other daemon-local state")
	fset.StringVar(&f.webDist, "web-dist", "", "serve the dashboard from this directory instead of the embedded copy (dev override; empty uses the binary's embedded dashboard)")
	fset.BoolVar(&f.debug, "debug", false, "debug logging")
	fset.StringVar(&f.claudeBin, "claude-bin", "claude", "the `claude` binary to spawn for a launched session (REQ-19: lets E2E launch a stub)")
	fset.StringVar(&f.tmuxSocket, "tmux-socket", "muster", "dedicated tmux socket (REQ-19: never the user's default server); a value containing '/' is used as a filesystem path (-S), otherwise a named socket (-L) — m2-terminal REQ-5")
	fset.StringVar(&f.browseRoot, "browse-root", "", "root of the launch modal's folder browser — GET /api/browse's no-param default and its Up ceiling (empty = the user's home directory; E2E passes its scratch dir)")
	fset.StringVar(&f.onExit, "on-exit", "ask", "what to do with live sessions on shutdown: ask (default, prompts once if stdin is a TTY) | leave | kill")
	fset.DurationVar(&f.usagePoll, "usage-poll", defaultUsagePoll, "how often musterd polls Claude Code's per-model weekly usage endpoint; 0 disables polling (POST /api/usage/refresh then 404s)")
	fset.StringVar(&f.usageAPIURL, "usage-api-url", "https://api.anthropic.com", "base URL for the per-model usage endpoint — a test seam like -claude-bin")
	fset.StringVar(&f.usageTokenFile, "usage-token-file", "", "read the Claude Code OAuth token from this file instead of the macOS Keychain — a test seam like -claude-bin (empty = the daemon's usual Keychain lookup)")
	fset.StringVar(&f.issueRepo, "issue-repo", "Zalaras/muster", "GitHub repo (owner/name) the Issue button files issues against")
	fset.StringVar(&f.issueAPIURL, "issue-api-url", "https://api.github.com", "base URL for the GitHub API the Issue button posts to — a test seam like -usage-api-url; empty disables issue capture entirely (POST /api/issue/captures and POST /api/issues then 404)")
	fset.StringVar(&f.issueTokenFile, "issue-token-file", "", "read the GitHub bearer token from this file's trimmed contents instead of running `gh auth token` — a test seam like -usage-token-file (empty = the daemon's usual `gh auth token`)")
	fset.BoolVar(&f.openFlag, "open", true, "auto-open the dashboard in the default browser at startup; fires only when stdin is also a real terminal (REQ-6)")
	fset.StringVar(&f.openCmd, "open-cmd", "open", "the program run with the dashboard URL to auto-open it — a test seam like -claude-bin (REQ-7)")
	fset.DurationVar(&f.claudeThemePoll, "claude-theme-poll", defaultClaudeThemePoll, "how often musterd polls Claude Code's own theme setting for the terminal pane ground and the dashboard's Follow Claude Code preference; 0 disables polling (claudeTheme.family stays unknown)")
	fset.StringVar(&f.claudeConfigFile, "claude-config-file", defaultClaudeConfigFile, "path to Claude Code's global config file to poll for its theme setting — a test seam like -usage-token-file")
	fset.BoolVar(&f.updateFlag, "update", false, "check for and apply the latest release, then exit — never starts the daemon or restarts anything (REQ-22)")
	fset.StringVar(&f.updateBaseURL, "update-base-url", defaultUpdateBaseURL, "base URL for GitHub Releases the auto-updater checks/downloads from — a test seam like -usage-api-url; empty disables update checking and applying entirely")
	fset.DurationVar(&f.updateCheckInterval, "update-check-interval", defaultUpdateCheckInterval, "how often musterd checks for a newer release while update checking is enabled; must be > 0")
	fset.StringVar(&f.updatePublicKeyFile, "update-public-key-file", "", "verify releases against this minisign public key file instead of the one compiled into the binary — a test seam like -usage-token-file (empty = the embedded key)")

	if err := fset.Parse(args); err != nil {
		return nil, err
	}

	switch f.onExit {
	case "ask", "leave", "kill":
	default:
		return nil, fmt.Errorf("invalid -on-exit value %q: must be ask, leave, or kill", f.onExit)
	}
	if f.updateCheckInterval <= 0 {
		return nil, fmt.Errorf("invalid -update-check-interval value %q: must be > 0", f.updateCheckInterval.String())
	}
	return &f, nil
}

// resolveInstall classifies how musterd was installed (REQ-21) and picks the minisign
// public key releases are verified against. A failure resolving the executable path is not
// fatal: exePath stays "", which Classify treats no differently than any other
// unwritable/unresolvable directory.
func resolveInstall(updatePublicKeyFile string) (string, selfupdate.Install, []byte, error) {
	exePath, resolveErr := os.Executable()
	if resolveErr == nil {
		if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
			exePath = resolved
		}
	}
	home, _ := os.UserHomeDir()
	install := selfupdate.Classify(version, exePath, os.Getenv, home, selfupdate.WritableDir)

	updatePublicKey := selfupdate.PublicKey()
	if updatePublicKeyFile != "" {
		data, err := os.ReadFile(updatePublicKeyFile)
		if err != nil {
			return "", install, nil, fmt.Errorf("reading -update-public-key-file: %w", err)
		}
		updatePublicKey = data
	}
	return exePath, install, updatePublicKey, nil
}

func run(args []string, stdin *os.File, stdout, stderr io.Writer) error {
	f, err := parseFlags(args, stderr)
	if err != nil {
		return err
	}

	if f.showVersion {
		fmt.Fprintf(stdout, "musterd %s (Claude Code verified %s)\n", version, claudecode.FormatRange(claudecode.Floor(), claudecode.Verified()))
		return nil
	}

	// Install classification (REQ-21) happens here — before tmux preflight, data dir
	// creation or anything else below — because both -update and the normal server path
	// need it, and -update needs nothing heavier than this to run.
	exePath, install, updatePublicKey, err := resolveInstall(f.updatePublicKeyFile)
	if err != nil {
		return err
	}

	if f.updateFlag {
		return runUpdate(context.Background(), stdout, stderr, f.updateBaseURL, updatePublicKey, version, exePath, install)
	}

	// REQ-19: read once, then unset immediately — a restarted daemon must not leave the
	// variable set for whatever it execs later (a shell alias, a future restart of its
	// own), and openDashboard's guard below is the only thing that ever needs the value.
	restarted := os.Getenv("MUSTER_RESTARTED") != ""
	_ = os.Unsetenv("MUSTER_RESTARTED")

	log := newLogger(f.debug, stderr)

	preflight, err := prepareStartup(f, stderr, log)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbPath := filepath.Join(f.dataDir, "muster.db")
	st, err := store.Open(ctx, dbPath)
	if err != nil {
		return fmt.Errorf("opening store: %w", err)
	}
	defer func() { _ = st.Close() }()

	serving, err := prepareServing(ctx, f, st, log)
	if err != nil {
		return err
	}

	srv := server.New(buildServerConfig(f, st, log, serving, install, exePath, updatePublicKey))
	srv.Start()

	httpServer := &http.Server{Handler: srv.Handler()}

	serveErr := make(chan error, 1)
	go func() {
		serveErr <- httpServer.Serve(serving.listener)
	}()

	logStartup(log, f, serving, preflight, install)

	// REQ-6: fires only when both the flag and stdin's terminal-ness hold — the
	// terminal condition is load-bearing (Implementation Notes): it is what guarantees
	// no test run can open a browser, independent of any flag a test does or doesn't
	// pass. Runs on its own goroutine (REQ-8) and never logs dashboardURL itself (R4).
	// A restarted daemon skips this too (auto-update REQ-19) — stdin is still the
	// original TTY, so without the check a restart would pop a second browser tab.
	maybeOpenDashboard(ctx, f, stdin, restarted, serving.dashboardURL, log)

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
	case <-srv.RestartRequests():
		// auto-update REQ-19: a restart is not a shutdown — it never reaches the
		// -on-exit prompt below and never kills a session (reconcile re-adopts every
		// Claude session on the way back up, kb:anchor/state.liveness). The graceful stop happens here,
		// synchronously, so the WAL is checkpointed and no ingest event is lost before
		// main performs the actual syscall.Exec (Implementation Notes "Re-exec").
		log.Info().Msg("restarting musterd to apply an update")
		stopForRestart(httpServer, srv, st, log)
		return &errRestart{exe: exePath}
	}

	shutdownGracefully(f, srv, httpServer, stdin, stderr, log)
	return nil
}

// newLogger builds the daemon's root logger, writing human-readable output to stderr.
func newLogger(debug bool, stderr io.Writer) zerolog.Logger {
	level := zerolog.InfoLevel
	if debug {
		level = zerolog.DebugLevel
	}
	return zerolog.New(zerolog.ConsoleWriter{Out: stderr}).Level(level).With().Timestamp().Logger()
}

// prepareStartup runs every check that must pass before the daemon has any side effect,
// in order (plan tmux-installation D4): the socket path tmux has to be able to bind, the
// tmux preflight itself, the dashboard-serving precedence, and finally the data dir —
// the first step here that actually writes anything.
//
// Fail fast on a socket path tmux cannot bind (AF_UNIX sun_path limit) — otherwise the
// failure surfaces later as a bare "File name too long" from inside tmux.
func prepareStartup(f *cliFlags, stderr io.Writer, log zerolog.Logger) (tmux.PreflightResult, error) {
	var zero tmux.PreflightResult
	if err := tmux.ValidateSocket(f.tmuxSocket); err != nil {
		return zero, err
	}

	preflight, preflightErr := runTmuxPreflight(context.Background(), stderr, tmux.Preflight)
	if preflightErr != nil {
		return zero, preflightErr
	}

	if err := checkWebDist(f.webDist, webui.FS(), log); err != nil {
		return zero, err
	}

	if err := os.MkdirAll(f.dataDir, 0o700); err != nil {
		return zero, fmt.Errorf("creating data dir %q: %w", f.dataDir, err)
	}
	return preflight, nil
}

// servingEnv is everything prepareServing brings up between opening the store and
// constructing the server: the tokens, the bound listener and the URLs and wrapper-script
// paths derived from them.
type servingEnv struct {
	uiToken          string
	ingestToken      string
	listener         net.Listener
	port             int
	dashboardURL     string
	claudeCodeInfo   server.ClaudeCodeInfo
	hookScript       string
	statusLineScript string
	legacyScript     string
}

// prepareServing bootstraps the tokens, classifies the installed Claude Code, binds the
// listener and writes the tokens file and hook wrapper scripts — in that order, since each
// step's output feeds the next.
func prepareServing(ctx context.Context, f *cliFlags, st *store.Store, log zerolog.Logger) (*servingEnv, error) {
	uiToken, ingestToken, err := bootstrapTokens(ctx, st)
	if err != nil {
		return nil, fmt.Errorf("bootstrapping tokens: %w", err)
	}

	versionCtx, versionCancel := context.WithTimeout(ctx, versionCheckTimeout)
	claudeCodeInfo := checkClaudeCode(versionCtx, f.claudeBin, log)
	versionCancel()

	var lc net.ListenConfig
	ln, err := lc.Listen(ctx, "tcp", f.addr)
	if err != nil {
		return nil, fmt.Errorf("listening on %s: %w", f.addr, err)
	}

	port := 0
	if tcpAddr, ok := ln.Addr().(*net.TCPAddr); ok {
		port = tcpAddr.Port
	}

	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)
	dashboardURL := fmt.Sprintf("%s/auth?token=%s", baseURL, uiToken)
	if err = writeTokensFile(f.dataDir, dashboardURL, uiToken, ingestToken); err != nil {
		return nil, fmt.Errorf("writing tokens file: %w", err)
	}

	hookScript, statusLineScript, legacyScript, err := claudecode.WriteWrapperScripts(f.dataDir, baseURL, ingestToken)
	if err != nil {
		return nil, fmt.Errorf("writing hook wrapper scripts: %w", err)
	}
	// REQ-16: paths only, never the token or URL either script embeds.
	log.Info().Str("hook_script", hookScript).Str("status_line_script", statusLineScript).
		Msg("wrote hook wrapper scripts")

	return &servingEnv{
		uiToken:          uiToken,
		ingestToken:      ingestToken,
		listener:         ln,
		port:             port,
		dashboardURL:     dashboardURL,
		claudeCodeInfo:   claudeCodeInfo,
		hookScript:       hookScript,
		statusLineScript: statusLineScript,
		legacyScript:     legacyScript,
	}, nil
}

// buildServerConfig assembles the server's configuration from the parsed flags and the
// already-bootstrapped runtime. Pure data assembly: it branches on nothing, so a wiring
// mistake here is a silent one — main_test.go pins its output field by field.
func buildServerConfig(f *cliFlags, st *store.Store, log zerolog.Logger, serving *servingEnv, install selfupdate.Install, exePath string, updatePublicKey []byte) server.Config {
	return server.Config{
		Store:         st,
		Logger:        log,
		UIToken:       serving.uiToken,
		IngestToken:   serving.ingestToken,
		WebDist:       f.webDist,
		DaemonVersion: version,
		ClaudeCode:    serving.claudeCodeInfo,
		TmuxSocket:    f.tmuxSocket,
		Locator:       locate.New(),

		Launch: server.LaunchConfig{
			ClaudeBin:        f.claudeBin,
			BrowseRoot:       f.browseRoot,
			HookScript:       serving.hookScript,
			StatusLineScript: serving.statusLineScript,
			LegacyScripts:    []string{serving.legacyScript},
		},
		Usage: server.UsageConfig{
			Poll:         f.usagePoll,
			APIURL:       f.usageAPIURL,
			TokenFile:    f.usageTokenFile,
			KeychainUser: keychainUser(),
		},
		Issue: server.IssueConfig{
			Repo:      f.issueRepo,
			APIURL:    f.issueAPIURL,
			TokenFile: f.issueTokenFile,
		},
		Theme: server.ThemeConfig{
			Poll:       f.claudeThemePoll,
			ConfigFile: f.claudeConfigFile,
		},
		Update: server.UpdateConfig{
			BaseURL:       f.updateBaseURL,
			CheckInterval: f.updateCheckInterval,
			PublicKey:     updatePublicKey,
			Install:       install,
			ExePath:       exePath,
			ExeRun:        selfupdate.RunVersionProbe,
		},
	}
}

// logStartup writes the one-line startup record, plus the install remedy when there is
// one: REQ-28, a Homebrew or unmanaged install never sees the Settings-dialog remedy
// unless they open it, so name it here too.
func logStartup(log zerolog.Logger, f *cliFlags, serving *servingEnv, preflight tmux.PreflightResult, install selfupdate.Install) {
	log.Info().
		Str("version", version).
		Int("port", serving.port).
		Str("data_dir", f.dataDir).
		Str("dashboard_url", serving.dashboardURL).
		Str("tmux", preflight.Version).
		Str("install", string(install.Kind)).
		Msg("musterd starting")

	if install.Remedy != "" {
		log.Info().Str("install", string(install.Kind)).Msg(install.Remedy)
	}
}

// maybeOpenDashboard applies REQ-6's guard. The terminal condition is load-bearing: it,
// not the flag, is what guarantees no test run can ever open a browser.
func maybeOpenDashboard(ctx context.Context, f *cliFlags, stdin *os.File, restarted bool, dashboardURL string, log zerolog.Logger) {
	if f.openFlag && isTerminal(stdin) && !restarted {
		openDashboard(ctx, f.openCmd, dashboardURL, log)
	}
}

// stopForRestart is the restart branch's teardown: it stops serving and closes the store
// synchronously, so the WAL is checkpointed and no ingest event is lost before main
// performs the actual syscall.Exec. Sessions are deliberately left running.
func stopForRestart(httpServer *http.Server, srv *server.Server, st *store.Store, log zerolog.Logger) {
	restartShutdownCtx, restartShutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer restartShutdownCancel()
	if err := httpServer.Shutdown(restartShutdownCtx); err != nil {
		log.Warn().Err(err).Msg("http server shutdown")
	}
	srv.Shutdown(restartShutdownCtx)
	if err := st.Close(); err != nil {
		log.Warn().Err(err).Msg("closing store before restart")
	}
}

// shutdownGracefully resolves the -on-exit policy and then tears the daemon down.
//
// The policy is resolved (and, for "ask", possibly prompted) before the shutdown timeout
// budget starts — the REQ-3 prompt has its own 10s timeout, separate from shutdownTimeout's
// budget for the rest of teardown. With zero live sessions neither branch prints anything.
func shutdownGracefully(f *cliFlags, srv *server.Server, httpServer *http.Server, stdin *os.File, stderr io.Writer, log zerolog.Logger) {
	live := srv.LiveSessionCount()
	if live > 0 {
		switch resolveOnExit(f.onExit, stdin, stderr, live, srv.TmuxSocket()) {
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
//
// dashboard is the embedded dashboard fs.FS (plan v1-cleanup REQ-9): run passes the real
// webui.FS(), and taking it as a parameter rather than calling webui.FS() directly makes
// the "nothing on disk, nothing embedded" fatal branch deterministically testable with a
// fake, empty fs.FS instead of depending on this binary's own build having embedded a
// dashboard.
func checkWebDist(webDist string, dashboard fs.FS, log zerolog.Logger) error {
	if webDist != "" {
		if _, err := os.Stat(filepath.Join(webDist, "index.html")); err != nil {
			log.Warn().Str("web_dist", webDist).
				Msg("-web-dist directory has no index.html; serving whatever is there")
		}
		return nil
	}
	if !webui.HasDashboard(dashboard) {
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
// real terminal (isTerminal) — and otherwise resolves to "leave" without printing
// anything. Callers only invoke this once they already know liveSessions > 0 (REQ-3:
// zero live sessions gets no prompt and no log line at all).
func resolveOnExit(flagValue string, stdin *os.File, stderr io.Writer, liveSessions int, tmuxSocket string) onExitDecision {
	switch flagValue {
	case "kill":
		return onExitKill
	case "leave":
		return onExitLeave
	}
	if !isTerminal(stdin) {
		return onExitLeave
	}
	return askKillPrompt(stdin, stderr, liveSessions, tmuxSocket)
}

// isTerminal reports whether f is attached to a real terminal, via
// github.com/mattn/go-isatty rather than Stat's ModeCharDevice (REQ-9): /dev/null is
// also a character device (measured 2026-08-31: mode=Dcrw-rw-rw- charDevice=true), which
// made the old check wrongly treat every /dev/null stdin — every onexit_test.go
// subprocess, every E2E-spawned scratch daemon — as if it were a terminal. A stat/fd
// failure or a nil file is treated as "not a terminal" (Edge Case 13: run's own
// nil-stdin callers must keep resolving to false).
func isTerminal(f *os.File) bool {
	if f == nil {
		return false
	}
	return isatty.IsTerminal(f.Fd())
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
