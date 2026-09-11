// Package server wires up musterd's HTTP+WS surface: auth, static serving, the ingest
// endpoints and the state stream. Business logic (parsing, persistence) is delegated to
// internal/claudecode and internal/store; handlers here only decode, delegate, encode.
package server

import (
	"context"
	"io"
	"net/http"
	"os/exec"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/ghissue"
	"github.com/Zalaras/muster/internal/locate"
	"github.com/Zalaras/muster/internal/selfupdate"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/termbridge"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/usage"
	"github.com/Zalaras/muster/internal/webui"
)

// ClaudeCodeInfo is the daemon's startup snapshot of the installed Claude Code against the
// canary-verified range, used to build the WS `hello` message (docs/protocol.md §5.1) and
// the issue-capture snapshot. Installed is nil iff Status is "unknown" (the startup version
// check failed, hung past its timeout, or was unparseable); Floor/Verified are always
// populated. internal/server carries Status only as a plain string — the status-word type
// itself lives in internal/claudecode (docs/conventions.md "Boundary").
type ClaudeCodeInfo struct {
	Installed *string
	Floor     string
	Verified  string
	Status    string
}

// paneSpawner is the tmux operations internal/server's own code (sessionLauncher,
// shellRegistry) makes directly — session creation and teardown. Defined here because
// internal/server is the consumer, in the shape internal/session's PaneChecker already
// sets (docs/design/test-strategy.md §Decision "Option 1"); *tmux.Client satisfies it
// without knowing.
type paneSpawner interface {
	NewSession(ctx context.Context, id int64, dir string, env map[string]string, command []string) (target, pane string, err error)
	NewNamedSession(ctx context.Context, name, dir string, env map[string]string, command []string) (target, pane string, err error)
	PaneExists(ctx context.Context, target string) (bool, error)
	KillWindow(ctx context.Context, target string) error
	KillSession(ctx context.Context, name string) error
}

// paneConn is the consumer-side view of a live terminal bridge — exactly the set
// terminal.go calls on one (Read, Write, Resize, Close). *termbridge.Bridge satisfies it
// without knowing; a test fakes it directly instead of holding a live PTY.
type paneConn interface {
	io.ReadWriter
	Resize(ctx context.Context, cols, rows int) error
	Close() error
}

// attachFunc opens a paneConn onto a tmux target. The seam exists because
// termbridge.Attach takes *tmux.Client concretely and returns *termbridge.Bridge, which
// a test cannot fabricate (it holds a live PTY) — attachFunc returns the paneConn
// interface instead. internal/termbridge itself is unchanged.
type attachFunc func(ctx context.Context, target string) (paneConn, error)

// Config wires everything a Server needs. Built entirely in main — no init() magic, no
// package-level state.
type Config struct {
	Store       *store.Store
	Logger      zerolog.Logger
	UIToken     string
	IngestToken string
	// WebDist, when non-empty, serves the dashboard from this on-disk directory instead
	// of the embedded copy (dev override, plan embed-dashboard REQ-2) — behaviour
	// unchanged from before that plan. Empty (the new -web-dist default) serves
	// internal/webui's go:embed-ed tree instead.
	WebDist       string
	DaemonVersion string
	ClaudeCode    ClaudeCodeInfo

	// IngestQueueSize bounds the ingest queue; a full queue drops and logs rather than
	// blocking the HTTP response (REQ-23). Zero uses a sane default.
	IngestQueueSize int

	// The following wire up m1-sessions' launch path (plan Implementation Notes).
	// Zero values are safe for tests that never call POST /api/sessions.

	// ClaudeBin is the `claude` binary to spawn (REQ-19's -claude-bin, default "claude").
	ClaudeBin string
	// TmuxSocket is the dedicated tmux socket name (REQ-19's -tmux-socket, default "muster").
	TmuxSocket string
	// BrowseRoot is the folder browser's root (protocol §3.6): GET /api/browse's
	// no-param default and the "Up" ceiling. Empty means the daemon user's home
	// directory. E2E passes its per-run scratch dir so browse tests never touch
	// the real home.
	BrowseRoot string
	// HookScript/StatusLineScript are the absolute paths to the generated command-hook
	// wrapper scripts (internal/claudecode.WriteWrapperScripts) — every event, including
	// SessionStart, is registered against HookScript now.
	HookScript       string
	StatusLineScript string
	// LegacyScripts lists prior wrapper paths MergeSettings must still recognise and
	// drop from an already-instrumented directory (REQ-3/REQ-4) — currently just the
	// pre-plan hook-sessionstart.sh path WriteWrapperScripts returns for removal.
	LegacyScripts []string

	// The following wire up usage-model-bar's per-model weekly usage poller (plan
	// Implementation Notes). Zero values are safe: UsagePoll <= 0 means the poller is
	// never constructed at all (Edge Case 14) — the default test server never hits the
	// network by construction, not by an extra guard.

	// UsagePoll is the poll interval (-usage-poll). <= 0 disables polling entirely:
	// POST /api/usage/refresh then 404s (docs/protocol.md §3.9).
	UsagePoll time.Duration
	// UsageAPIURL is the per-model usage endpoint's base URL (-usage-api-url). main
	// always passes the flag's non-empty default, so this is the *only* place that
	// URL is defined — there is deliberately no fallback constant here duplicating it.
	// Empty disables the poller entirely (same fail-safe shape as UsagePoll <= 0):
	// a zero-value Config must never reach the real api.anthropic.com.
	UsageAPIURL string
	// UsageTokenFile, when non-empty, reads the Claude Code OAuth token from this file
	// instead of the macOS Keychain (-usage-token-file, REQ-13's test seam — makes it
	// structurally impossible for a test using it to fall through to the real Keychain).
	UsageTokenFile string
	// KeychainUser is the account name `security` looks the Keychain item up under
	// (main passes os/user.Current()'s value) — used only when UsageTokenFile is empty.
	KeychainUser string
	// HTTPClient is the client FetchUsage uses; nil defaults to http.DefaultClient.
	HTTPClient *http.Client

	// The following wire up new-ui-design-colors' Claude-theme poller (plan
	// Implementation Notes, REQ-14). ClaudeThemePoll <= 0 means the poller is never
	// constructed at all (mirrors UsagePoll's Edge Case 14 shape) — a zero-value Config
	// never opens ClaudeConfigFile.

	// ClaudeThemePoll is the poll interval (-claude-theme-poll). <= 0 disables polling
	// entirely: snapshot.claudeTheme.family stays "unknown" forever.
	ClaudeThemePoll time.Duration
	// ClaudeConfigFile is Claude Code's global config file to poll
	// (-claude-config-file, default claudecode.DefaultConfigPath()) — a test seam like
	// UsageTokenFile (INV-5: E2E always passes a scratch path).
	ClaudeConfigFile string

	// The following wire up issue-capture's file-an-issue button (plan Implementation
	// Notes: "-issue-api-url's empty-disables-everything behaviour mirrors
	// UsageAPIURL's"). A zero-value Config must never reach the real GitHub API host or
	// execute `gh`, for the same reason UsagePoll/UsageAPIURL's zero values are fail-safe.

	// IssueRepo is the GitHub repo issues are filed against (-issue-repo).
	IssueRepo string
	// IssueAPIURL is the GitHub API's base URL (-issue-api-url). main always passes the
	// flag's non-empty default, so this is the only place that URL is defined — no
	// fallback constant duplicates it here. Empty disables both new endpoints entirely:
	// they 404 not_found (docs/protocol.md §3.12/§3.13).
	IssueAPIURL string
	// IssueTokenFile, when non-empty, reads the bearer token from this file's trimmed
	// contents instead of running `gh auth token` (-issue-token-file, REQ-14's test seam
	// — makes it structurally impossible for a test using it to execute the real gh).
	IssueTokenFile string

	// The following wire up auto-update's checker/apply (plan auto-update, 2026-09-10).
	// UpdateBaseURL empty disables checking and apply entirely — the IssueAPIURL shape
	// (main always passes the flag's non-empty default; a zero-value Config must never
	// reach github.com).

	// UpdateBaseURL is the GitHub Releases base URL (-update-base-url); "" means no
	// updateManager is constructed at all (mirrors usagePoller's nil-when-disabled shape,
	// Edge Case 14).
	UpdateBaseURL string
	// UpdateCheckInterval is how often the daemon re-checks for a newer release
	// (-update-check-interval, REQ-4).
	UpdateCheckInterval time.Duration
	// UpdatePublicKey is the minisign public key file's raw bytes verification trusts
	// (-update-public-key-file overrides the embedded selfupdate.PublicKey() — a test
	// seam; production always passes the embedded key).
	UpdatePublicKey []byte
	// Install is the startup install classification (selfupdate.Classify), computed once
	// in cmd/musterd from the resolved executable path — constant for the daemon's life.
	Install selfupdate.Install
	// ExePath is the resolved (os.Executable + filepath.EvalSymlinks) real path of the
	// running binary — where an apply installs the new one (REQ-17) and what REQ-26's
	// swap detection stats.
	ExePath string
	// ExeRun runs `<exe> -version` for REQ-26's swap-detection probe — an injectable seam
	// like ClaudeBin's execFunc (selfupdate.RunVersionProbe in production).
	ExeRun func(ctx context.Context, name string, args ...string) (string, error)

	// Locator resolves a dropped file's original path for POST /api/sessions/{id}/locate
	// (plan file-drop-fix, docs/protocol.md §3.14). main always constructs locate.New();
	// tests that never exercise the endpoint may leave this nil.
	Locator *locate.Locator

	// TmuxClient overrides the paneSpawner sessionLauncher and shellRegistry use (plan
	// v1-cleanup REQ-1). Nil constructs the real tmux.New(cfg.TmuxSocket) exactly as
	// before this plan — every production call site, main included, leaves this nil.
	TmuxClient paneSpawner
	// Attach overrides how a terminal socket attaches to a tmux target (plan v1-cleanup
	// REQ-2). Nil goes through termbridge.Attach against the server's own tmux client
	// exactly as before this plan — every production call site, main included, leaves
	// this nil.
	Attach attachFunc
}

// Server holds musterd's HTTP mux and the long-lived pieces (ingest queue, WS registry,
// session manager) that outlive any single request.
type Server struct {
	mux *http.ServeMux
	log zerolog.Logger

	store       *store.Store
	uiToken     string
	ingestToken string
	webDist     string
	browseRoot  string
	tmuxSocket  string

	daemonVersion string
	claudeCode    ClaudeCodeInfo

	ingest      *ingestQueue
	hub         *wsHub
	manager     *session.Manager
	usage       *usage.Aggregator
	modelScoped *usage.ModelScoped
	usagePoller *usagePoller // nil when UsagePoll <= 0 (Edge Case 14)
	themePoller *themePoller // nil when ClaudeThemePoll <= 0
	launcher    *sessionLauncher
	tmuxClient  paneSpawner
	attach      attachFunc
	terminals   *terminalRegistry
	shells      *shellRegistry
	locator     *locate.Locator

	issueRepo     string
	issueAPIURL   string
	issueCaptures *captureStore
	issueClient   *ghissue.Client

	install    selfupdate.Install
	updates    *updateManager // nil when UpdateBaseURL == "" (Edge Case 14 shape)
	tmuxLister interface {
		ListSessions(ctx context.Context) ([]string, error)
	}
}

const defaultIngestQueueSize = 1024

// New builds a Server and wires its routes. Nothing here starts a goroutine; call Start
// once the caller is ready to begin processing.
func New(cfg Config) *Server {
	size := cfg.IngestQueueSize
	if size <= 0 {
		size = defaultIngestQueueSize
	}

	s := &Server{
		log:           cfg.Logger,
		store:         cfg.Store,
		uiToken:       cfg.UIToken,
		ingestToken:   cfg.IngestToken,
		webDist:       cfg.WebDist,
		browseRoot:    cfg.BrowseRoot,
		tmuxSocket:    cfg.TmuxSocket,
		daemonVersion: cfg.DaemonVersion,
		claudeCode:    cfg.ClaudeCode,
		hub:           newWSHub(),
		terminals:     newTerminalRegistry(),
		locator:       cfg.Locator,
	}

	// tmuxClient is always constructed from TmuxSocket, independent of TmuxClient/Attach
	// overrides (D1/D2): it is cheap (no process spawn — tmux.New just holds a socket
	// name) and the default attachFunc closes over this concrete client, since
	// termbridge.Attach needs one concretely and cannot take the paneSpawner interface.
	tmuxClient := tmux.New(cfg.TmuxSocket)

	var spawner paneSpawner = tmuxClient
	if cfg.TmuxClient != nil {
		spawner = cfg.TmuxClient
	}
	s.tmuxClient = spawner
	s.tmuxLister = tmuxClient // always the real client, independent of a TmuxClient override — REQ-27 lists real tmux state

	attach := cfg.Attach
	if attach == nil {
		attach = func(ctx context.Context, target string) (paneConn, error) {
			bridge, err := termbridge.Attach(ctx, tmuxClient, target)
			if err != nil {
				return nil, err
			}
			return bridge, nil
		}
	}
	s.attach = attach

	s.shells = newShellRegistry(spawner, cfg.Logger)
	s.manager = session.NewManager(session.Config{
		Store:           cfg.Store,
		Logger:          cfg.Logger,
		PaneChecker:     tmuxClient,
		PaneSnapshotter: tmuxClient,
		SessionKiller:   tmuxClient,
		OnUpsert: func(sess *session.Session) {
			s.hub.broadcast(sessionUpsertMessage{Type: "sessionUpsert", Session: toWireSession(sess)})
		},
		OnRemoved: func(id int64) {
			s.hub.broadcast(sessionRemovedMessage{Type: "sessionRemoved", ID: id})
		},
	})

	s.usage = usage.NewAggregator(usage.Config{
		Store:  cfg.Store,
		Logger: cfg.Logger,
		OnChange: func(snap usage.Snapshot) {
			s.hub.broadcast(usageMessage{Type: "usage", Usage: toWireUsage(snap, s.modelScoped.Current())})
		},
	})

	// ModelScoped is always constructed, independent of whether the poller runs
	// (Edge Case 14): -usage-poll 0 still needs a holder so the wire's modelScoped*
	// fields render their honest null/"subscription-api" shape.
	s.modelScoped = usage.NewModelScoped(usage.ModelScopedConfig{
		Store:  cfg.Store,
		Logger: cfg.Logger,
		OnChange: func(msnap usage.ModelSnapshot) {
			s.hub.broadcast(usageMessage{Type: "usage", Usage: toWireUsage(s.usage.Current(), msnap)})
		},
	})

	switch {
	case cfg.UsagePoll > 0 && cfg.UsageAPIURL != "":
		client := cfg.HTTPClient
		if client == nil {
			client = http.DefaultClient
		}
		var tokenReader claudecode.TokenReader
		if cfg.UsageTokenFile != "" {
			tokenReader = claudecode.FileTokenReader(cfg.UsageTokenFile)
		} else {
			tokenReader = claudecode.KeychainTokenReader(cfg.KeychainUser, claudecode.RunCommand)
		}
		s.usagePoller = newUsagePoller(client, cfg.UsageAPIURL, tokenReader, cfg.UsagePoll, s.modelScoped, cfg.Logger)
	case cfg.UsagePoll > 0:
		// Misconfiguration, not a code path main.go can ever hit (it always passes
		// the flag's non-empty default): fail toward no polling rather than toward a
		// silent default that would reach the real api.anthropic.com/Keychain.
		cfg.Logger.Warn().Msg("usage polling requested (-usage-poll > 0) but UsageAPIURL is empty; usage polling disabled")
	}

	if cfg.ClaudeThemePoll > 0 {
		s.themePoller = newThemePoller(cfg.ClaudeConfigFile, claudecode.ReadThemeFamily, cfg.ClaudeThemePoll, func(family claudecode.ThemeFamily) {
			s.hub.broadcast(claudeThemeMessage{Type: "claudeTheme", Family: string(family)})
		}, cfg.Logger)
	}

	claudeBin := cfg.ClaudeBin
	if claudeBin == "" {
		claudeBin = "claude"
	}
	s.launcher = &sessionLauncher{
		store:            cfg.Store,
		manager:          s.manager,
		tmux:             spawner,
		log:              cfg.Logger,
		claudeBin:        claudeBin,
		hookScript:       cfg.HookScript,
		statusLineScript: cfg.StatusLineScript,
		legacyScripts:    cfg.LegacyScripts,
	}

	q := newIngestQueue(cfg.Store, cfg.Logger, size)
	q.manager = s.manager
	q.usage = s.usage
	s.ingest = q

	issueHTTPClient := cfg.HTTPClient
	if issueHTTPClient == nil {
		issueHTTPClient = http.DefaultClient
	}
	var issueTokenReader ghissue.TokenReader
	if cfg.IssueTokenFile != "" {
		issueTokenReader = ghissue.FileTokenReader(cfg.IssueTokenFile)
	} else {
		issueTokenReader = ghissue.GhCLITokenReader(exec.LookPath, ghissue.RunCommand)
	}
	s.issueRepo = cfg.IssueRepo
	s.issueAPIURL = cfg.IssueAPIURL
	s.issueCaptures = newCaptureStore()
	s.issueClient = &ghissue.Client{HTTPClient: issueHTTPClient, BaseURL: cfg.IssueAPIURL, TokenReader: issueTokenReader}

	s.install = cfg.Install
	if cfg.UpdateBaseURL != "" {
		updateHTTPClient := cfg.HTTPClient
		if updateHTTPClient == nil {
			updateHTTPClient = http.DefaultClient
		}
		pubKey := cfg.UpdatePublicKey
		if len(pubKey) == 0 {
			pubKey = selfupdate.PublicKey()
		}
		s.updates = newUpdateManager(updateManagerConfig{
			Client:       updateHTTPClient,
			Base:         cfg.UpdateBaseURL,
			Interval:     cfg.UpdateCheckInterval,
			PubKey:       pubKey,
			Install:      cfg.Install,
			Running:      cfg.DaemonVersion,
			ExePath:      cfg.ExePath,
			ExeRun:       cfg.ExeRun,
			CheckEnabled: s.loadPrefs(context.Background()).UpdateCheck,
			Log:          cfg.Logger,
			OnChange: func(u UpdateInfo) {
				s.hub.broadcast(updateMessage{Type: "update", Update: u})
			},
		})
	}

	s.routes()
	return s
}

// Handler returns the root http.Handler to serve.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// Start reloads persisted sessions, reconciles them against tmux reality, begins the
// liveness poll, and begins asynchronous ingest processing. Call once, after New —
// Reconcile (m4-reconcile REQ-1) runs synchronously here, before the caller starts
// accepting connections, so neither `/ws` nor `GET /api/state` can observe a
// pre-reconcile session list.
func (s *Server) Start() {
	ctx := context.Background()
	if err := s.manager.LoadAll(ctx); err != nil {
		s.log.Error().Err(err).Msg("failed to load sessions at startup")
	}
	if _, err := s.manager.Reconcile(ctx); err != nil {
		s.log.Error().Err(err).Msg("failed to reconcile sessions at startup")
	}
	s.manager.Start()
	s.ingest.Start()
	if s.usagePoller != nil {
		s.usagePoller.Start()
	}
	if s.themePoller != nil {
		s.themePoller.Start()
	}
	if s.updates != nil {
		s.updates.Start()
	}
}

// LiveSessionCount reports how many sessions are currently alive — used by cmd/musterd's
// `-on-exit=ask` prompt to decide whether to prompt at all (REQ-3: zero live sessions,
// no prompt, no log line).
func (s *Server) LiveSessionCount() int {
	count := 0
	for _, sess := range s.manager.List() {
		if sess.Alive {
			count++
		}
	}
	return count
}

// TmuxSocket returns the dedicated tmux socket this daemon instance is bound to — used
// by cmd/musterd's `-on-exit=ask` prompt copy ("N live sessions on tmux socket X").
func (s *Server) TmuxSocket() string {
	return s.tmuxSocket
}

// EndAllSessions ends every currently alive session (REQ-3's `-on-exit=kill` path): a
// final snapshot, tmux kill, and alive:=false for each, before the rest of shutdown
// proceeds. cmd/musterd calls this itself, ahead of Shutdown, once it has resolved
// (and, for `-on-exit=ask`, prompted) the final leave/kill decision — Shutdown's own
// signature is unchanged so it keeps working for every existing caller that never deals
// with the on-exit policy at all. Returns how many sessions were ended.
func (s *Server) EndAllSessions(ctx context.Context) int {
	return s.manager.EndAll(ctx)
}

// Shutdown closes every open WS connection (unblocking their handler goroutines, which
// http.Server.Shutdown cannot do for hijacked connections), stops the liveness poll, and
// drains the ingest queue, giving up when ctx is done.
func (s *Server) Shutdown(ctx context.Context) {
	s.hub.closeAll()
	s.terminals.closeAll()
	s.manager.Stop(ctx)
	s.ingest.Stop(ctx)
	if s.usagePoller != nil {
		s.usagePoller.Stop(ctx)
	}
	if s.themePoller != nil {
		s.themePoller.Stop(ctx)
	}
	if s.updates != nil {
		s.updates.Stop(ctx)
	}
}

// RestartRequests reports each in-place re-exec an apply requests (REQ-19,
// docs/protocol.md §3.17's restart:true): cmd/musterd's shutdown select reads from this
// to run the graceful-stop-then-syscall.Exec path, never the -on-exit prompt. A disabled
// update manager (nil) returns a nil channel, which a select simply never fires on.
func (s *Server) RestartRequests() <-chan struct{} {
	if s.updates == nil {
		return nil
	}
	return s.updates.restartRequests
}

func (s *Server) routes() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /auth", s.handleAuth)

	mux.Handle("GET /api/state", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleState)))
	mux.Handle("GET /ws", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleWS)))
	mux.Handle("POST /api/sessions", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleCreateSession)))
	mux.Handle("GET /api/repos", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleListRepos)))
	mux.Handle("GET /api/browse", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleBrowse)))
	mux.Handle("PUT /api/prefs", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handlePutPrefs)))
	mux.Handle("POST /api/usage/refresh", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleUsageRefresh)))
	mux.Handle("GET /ws/terminal/{id}", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleTerminal)))
	mux.Handle("POST /api/sessions/{id}/shell", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleCreateShell)))
	mux.Handle("GET /ws/shell/{id}", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleShellTerminal)))
	mux.Handle("GET /api/sessions/{id}/pane", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handlePaneSnapshot)))
	mux.Handle("POST /api/sessions/{id}/locate", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleLocateFile)))
	mux.Handle("POST /api/sessions/{id}/end", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleEndSession)))
	mux.Handle("POST /api/sessions/{id}/resume", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleResumeSession)))
	mux.Handle("DELETE /api/sessions/{id}", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleRemoveSession)))
	// Registered ahead of PUT /api/sessions/{id}/pin (plan order-sidebar): Go's Go 1.22
	// mux prefers a literal segment over a wildcard, so "order" is never parsed as {id}
	// regardless of registration order, but the literal route is listed first here to
	// read that way too.
	mux.Handle("PUT /api/sessions/order", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleSetOrder)))
	mux.Handle("PUT /api/sessions/{id}/pin", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handlePinSession)))
	mux.Handle("PUT /api/sessions/{id}/title", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleSetTitle)))
	mux.Handle("POST /api/issue/captures", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleCreateCapture)))
	mux.Handle("POST /api/issues", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleCreateIssue)))
	mux.Handle("POST /api/update/apply", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleApplyUpdate)))
	mux.Handle("GET /api/update/restart-impact", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleRestartImpact)))

	mux.HandleFunc("POST /ingest/{token}/hook", s.handleIngestHook)
	mux.HandleFunc("POST /ingest/{token}/status", s.handleIngestStatus)

	// Serving precedence (plan embed-dashboard REQ-2): -web-dist non-empty serves the
	// disk directory exactly as before (dev override); empty serves the embedded
	// dashboard tree. requireCookie wraps both branches identically (R5) — the only
	// intended divergence is embed.FS's zero ModTime (no Last-Modified/304s), accepted
	// per the plan's Edge Case 7.
	var static http.Handler
	if s.webDist != "" {
		static = http.FileServer(http.Dir(s.webDist))
	} else {
		static = http.FileServer(http.FS(webui.FS()))
	}
	mux.Handle("/", requireCookie(s.uiToken, writeHTMLUnauthorized, static))

	s.mux = mux
}
