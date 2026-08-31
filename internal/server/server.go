// Package server wires up musterd's HTTP+WS surface: auth, static serving, the ingest
// endpoints and the state stream. Business logic (parsing, persistence) is delegated to
// internal/claudecode and internal/store; handlers here only decode, delegate, encode.
package server

import (
	"context"
	"net/http"
	"os/exec"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/ghissue"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/usage"
	"github.com/Zalaras/muster/internal/webui"
)

// ClaudeCodeInfo is the daemon's startup snapshot of the installed Claude Code, used to
// build the WS `hello` message (docs/protocol.md §5.1). Installed/Drift are nil when the
// startup version check failed or never ran.
type ClaudeCodeInfo struct {
	Pinned    string
	Installed *string
	Drift     *bool
}

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
	launcher    *sessionLauncher
	tmuxClient  *tmux.Client
	terminals   *terminalRegistry

	issueRepo     string
	issueAPIURL   string
	issueCaptures *captureStore
	issueClient   *ghissue.Client
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
	}

	tmuxClient := tmux.New(cfg.TmuxSocket)
	s.tmuxClient = tmuxClient
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

	claudeBin := cfg.ClaudeBin
	if claudeBin == "" {
		claudeBin = "claude"
	}
	s.launcher = &sessionLauncher{
		store:            cfg.Store,
		manager:          s.manager,
		tmux:             tmuxClient,
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
	mux.Handle("GET /api/sessions/{id}/pane", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handlePaneSnapshot)))
	mux.Handle("POST /api/sessions/{id}/end", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleEndSession)))
	mux.Handle("POST /api/sessions/{id}/resume", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleResumeSession)))
	mux.Handle("DELETE /api/sessions/{id}", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleRemoveSession)))
	// Registered ahead of PUT /api/sessions/{id}/pin (plan order-sidebar): Go's Go 1.22
	// mux prefers a literal segment over a wildcard, so "order" is never parsed as {id}
	// regardless of registration order, but the literal route is listed first here to
	// read that way too.
	mux.Handle("PUT /api/sessions/order", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleSetOrder)))
	mux.Handle("PUT /api/sessions/{id}/pin", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handlePinSession)))
	mux.Handle("POST /api/issue/captures", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleCreateCapture)))
	mux.Handle("POST /api/issues", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleCreateIssue)))

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
