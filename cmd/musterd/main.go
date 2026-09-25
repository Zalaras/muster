// Command musterd is the Muster daemon: it owns the tmux sessions, ingests Claude Code
// hooks and status-line posts, derives session state, and serves the dashboard.
package main

import (
	"context"
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
	"syscall"
	"time"

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

// shutdownTimeout bounds graceful shutdown: HTTP connections closing, WS sockets
// closing, and the ingest queue draining, combined.
const shutdownTimeout = 10 * time.Second

// defaultUsagePoll is -usage-poll's default: the per-model window is polled on a slow
// timer, not derived from the status line (kb:adr/usage-model-window-polled-from-oauth-api).
const defaultUsagePoll = 5 * time.Minute

// defaultClaudeThemePoll is -claude-theme-poll's default poll interval for Claude Code's
// theme config key (kb:adr/theme-claude-theme-read-only-poll).
const defaultClaudeThemePoll = 10 * time.Second

// defaultUpdateBaseURL is -update-base-url's default — empty disables checking and apply
// entirely, the same "empty disables the feature" shape -issue-api-url and -usage-api-url
// use; every E2E daemon passes "" explicitly (web/e2e/helpers/daemon.ts), so this default
// is only ever live outside tests (kb:adr/update-check-runs-in-daemon-daily).
const defaultUpdateBaseURL = "https://github.com/Zalaras/muster/releases"

// defaultUpdateCheckInterval is -update-check-interval's default: daily, so every open tab
// agrees over the life of a long-running daemon (kb:adr/update-check-runs-in-daemon-daily).
const defaultUpdateCheckInterval = 24 * time.Hour

func main() {
	err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)

	var restart *errRestart
	if errors.As(err, &restart) {
		// reexec only returns on failure — everything needed for a clean shutdown
		// already happened inside run() before it returned this (kb:adr/update-restart-is-in-place-reexec-not-shutdown).
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

	// -claude-config-file's default is empty when DefaultConfigPath itself fails (no
	// home directory) — polling then stays enabled but every read reports "unknown",
	// never a fallback constant duplicating the file's own name outside
	// internal/claudecode.
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
	fset.StringVar(&f.claudeBin, "claude-bin", "claude", "the `claude` binary to spawn for a launched session (lets E2E launch a stub)")
	fset.StringVar(&f.tmuxSocket, "tmux-socket", "muster", "dedicated tmux socket (never the user's default server); a value containing '/' is used as a filesystem path (-S), otherwise a named socket (-L)")
	fset.StringVar(&f.browseRoot, "browse-root", "", "root of the launch modal's folder browser — GET /api/browse's no-param default and its Up ceiling (empty = the user's home directory; E2E passes its scratch dir)")
	fset.StringVar(&f.onExit, "on-exit", "ask", "what to do with live sessions on shutdown: ask (default, prompts once if stdin is a TTY) | leave | kill")
	fset.DurationVar(&f.usagePoll, "usage-poll", defaultUsagePoll, "how often musterd polls Claude Code's per-model weekly usage endpoint; 0 disables polling (POST /api/usage/refresh then 404s)")
	fset.StringVar(&f.usageAPIURL, "usage-api-url", "https://api.anthropic.com", "base URL for the per-model usage endpoint — a test seam like -claude-bin")
	fset.StringVar(&f.usageTokenFile, "usage-token-file", "", "read the Claude Code OAuth token from this file instead of the macOS Keychain — a test seam like -claude-bin (empty = the daemon's usual Keychain lookup)")
	fset.StringVar(&f.issueRepo, "issue-repo", "Zalaras/muster", "GitHub repo (owner/name) the Issue button files issues against")
	fset.StringVar(&f.issueAPIURL, "issue-api-url", "https://api.github.com", "base URL for the GitHub API the Issue button posts to — a test seam like -usage-api-url; empty disables issue capture entirely (POST /api/issue/captures and POST /api/issues then 404)")
	fset.StringVar(&f.issueTokenFile, "issue-token-file", "", "read the GitHub bearer token from this file's trimmed contents instead of running `gh auth token` — a test seam like -usage-token-file (empty = the daemon's usual `gh auth token`)")
	fset.BoolVar(&f.openFlag, "open", true, "auto-open the dashboard in the default browser at startup; fires only when stdin is also a real terminal")
	fset.StringVar(&f.openCmd, "open-cmd", "open", "the program run with the dashboard URL to auto-open it — a test seam like -claude-bin")
	fset.DurationVar(&f.claudeThemePoll, "claude-theme-poll", defaultClaudeThemePoll, "how often musterd polls Claude Code's own theme setting for the terminal pane ground and the dashboard's Follow Claude Code preference; 0 disables polling (claudeTheme.family stays unknown)")
	fset.StringVar(&f.claudeConfigFile, "claude-config-file", defaultClaudeConfigFile, "path to Claude Code's global config file to poll for its theme setting — a test seam like -usage-token-file")
	fset.BoolVar(&f.updateFlag, "update", false, "check for and apply the latest release, then exit — never starts the daemon or restarts anything")
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

// resolveInstall classifies how musterd was installed (kb:adr/update-install-kinds-decide-who-may-apply)
// and picks the minisign public key releases are verified against. A failure resolving the
// executable path is not fatal: exePath stays "", which Classify treats no differently than
// any other unwritable/unresolvable directory. The returned reclassify closure re-runs the
// same write probe and git-tree walk against the same exePath/home
// (kb:adr/update-install-rechecked-on-every-check) — server.UpdateConfig.Reclassify calls it
// at the start of every release check.
func resolveInstall(updatePublicKeyFile string) (string, selfupdate.Install, func() selfupdate.Install, []byte, error) {
	exePath, resolveErr := os.Executable()
	if resolveErr == nil {
		if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
			exePath = resolved
		}
	}
	home, _ := os.UserHomeDir()
	install := selfupdate.Classify(version, exePath, os.Getenv, home, selfupdate.WritableDir)
	reclassify := func() selfupdate.Install {
		return selfupdate.Reclassify(exePath, home, selfupdate.WritableDir)
	}

	updatePublicKey := selfupdate.PublicKey()
	if updatePublicKeyFile != "" {
		data, err := os.ReadFile(updatePublicKeyFile)
		if err != nil {
			return "", install, reclassify, nil, fmt.Errorf("reading -update-public-key-file: %w", err)
		}
		updatePublicKey = data
	}
	return exePath, install, reclassify, updatePublicKey, nil
}

func run(args []string, stdin *os.File, stdout, stderr io.Writer) error {
	f, err := parseFlags(args, stderr)
	if err != nil {
		return err
	}

	if f.showVersion {
		fmt.Fprintf(stdout, "%s%s (Claude Code verified %s)\n", selfupdate.VersionLinePrefix, version, claudecode.FormatRange(claudecode.Floor(), claudecode.Verified()))
		return nil
	}

	// Install classification happens here — before tmux preflight, data dir creation or
	// anything else below — because both -update and the normal server path need it, and
	// -update needs nothing heavier than this to run.
	exePath, install, reclassify, updatePublicKey, err := resolveInstall(f.updatePublicKeyFile)
	if err != nil {
		return err
	}

	if f.updateFlag {
		return runUpdate(context.Background(), stdout, stderr, f.updateBaseURL, updatePublicKey, version, exePath, install)
	}

	// Read once, then unset immediately — a restarted daemon must not leave the variable
	// set for whatever it execs later (a shell alias, a future restart of its own), and
	// openDashboard's guard below is the only thing that ever needs the value
	// (kb:adr/update-restart-is-in-place-reexec-not-shutdown).
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
	st, err := store.Open(ctx, dbPath, log)
	if err != nil {
		return fmt.Errorf("opening store: %w", err)
	}
	defer func() { _ = st.Close() }()

	serving, err := prepareServing(ctx, f, st, log)
	if err != nil {
		return err
	}

	srv := server.New(buildServerConfig(f, st, log, serving, install, reclassify, exePath, updatePublicKey))
	srv.Start()

	httpServer := &http.Server{Handler: srv.Handler()}

	serveErr := make(chan error, 1)
	go func() {
		serveErr <- httpServer.Serve(serving.listener)
	}()

	logStartup(log, f, serving, preflight, install, exePath)

	// Fires only when both the flag and stdin's terminal-ness hold — the terminal
	// condition is load-bearing: it is what guarantees no test run can open a browser,
	// independent of any flag a test does or doesn't pass
	// (kb:adr/connection-dashboard-auto-opens-on-terminal). Runs on its own goroutine and
	// never logs dashboardURL itself. A restarted daemon skips this too — stdin is still
	// the original TTY, so without the check a restart would pop a second browser tab.
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
		// A restart is not a shutdown — it never reaches the -on-exit prompt below and
		// never kills a session (reconcile re-adopts every Claude session on the way
		// back up, kb:anchor/state.liveness). The graceful stop happens here,
		// synchronously, so the WAL is checkpointed and no ingest event is lost before
		// main performs the actual syscall.Exec (kb:adr/update-restart-is-in-place-reexec-not-shutdown).
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

// prepareStartup runs every check that must pass before the daemon has any side effect, in
// order: the socket path tmux has to be able to bind, the tmux preflight itself
// (kb:adr/surfaces-tmux-preflight-at-startup), the dashboard-serving precedence, and
// finally the data dir — the first step here that actually writes anything.
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
	// Paths only, never the token or URL either script embeds (never log hook payloads
	// or credentials, CLAUDE.md).
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
func buildServerConfig(f *cliFlags, st *store.Store, log zerolog.Logger, serving *servingEnv, install selfupdate.Install, reclassify func() selfupdate.Install, exePath string, updatePublicKey []byte) server.Config {
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
			Reclassify:    reclassify,
		},
	}
}

// logStartup writes the one-line startup record — including the resolved executable path
// as exe, one of the inputs (along with home and the write probe) an unmanaged/installer
// classification is computed from — plus the install remedy when there is one: a Homebrew
// or unmanaged install never sees the Settings-dialog remedy unless they open it, so name
// it here too (kb:adr/update-install-kinds-decide-who-may-apply).
func logStartup(log zerolog.Logger, f *cliFlags, serving *servingEnv, preflight tmux.PreflightResult, install selfupdate.Install, exePath string) {
	log.Info().
		Str("version", version).
		Int("port", serving.port).
		Str("data_dir", f.dataDir).
		Str("dashboard_url", serving.dashboardURL).
		Str("tmux", preflight.Version).
		Str("install", string(install.Kind)).
		Str("exe", exePath).
		Msg("musterd starting")

	if install.Remedy != "" {
		log.Info().Str("install", string(install.Kind)).Msg(install.Remedy)
	}
}

// maybeOpenDashboard applies the auto-open guard. The terminal condition is load-bearing:
// it, not the flag, is what guarantees no test run can ever open a browser
// (kb:adr/connection-dashboard-auto-opens-on-terminal).
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

// keychainUser returns the current OS account name for KeychainTokenReader's
// `security find-generic-password -a <user>` lookup — read once in main and passed in
// rather than looked up inside the adapter, so a lookup failure is this function's own
// concern and not a reason for KeychainTokenReader to have its own os/user import. Empty
// on lookup failure — KeychainTokenReader then simply fails every tick with
// ErrNoCredentials rather than musterd refusing to start.
func keychainUser() string {
	u, err := user.Current()
	if err != nil {
		return ""
	}
	return u.Username
}
