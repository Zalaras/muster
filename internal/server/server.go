// Package server wires up musterd's HTTP+WS surface: auth, static serving, the ingest
// endpoints and the state stream. Business logic (parsing, persistence) is delegated to
// internal/claudecode and internal/store; handlers here only decode, delegate, encode.
package server

import (
	"context"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/usage"
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
	Store         *store.Store
	Logger        zerolog.Logger
	UIToken       string
	IngestToken   string
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
	// BaseURL is the daemon's own http://127.0.0.1:<port> — used to build the ingest
	// URLs written into a launched directory's settings.local.json.
	BaseURL string
	// SessionStartScript/StatusLineScript are the absolute paths to the generated
	// command-hook wrapper scripts (internal/claudecode.WriteWrapperScripts).
	SessionStartScript string
	StatusLineScript   string
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

	daemonVersion string
	claudeCode    ClaudeCodeInfo

	ingest     *ingestQueue
	hub        *wsHub
	manager    *session.Manager
	usage      *usage.Aggregator
	launcher   *sessionLauncher
	tmuxClient *tmux.Client
	terminals  *terminalRegistry
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
		daemonVersion: cfg.DaemonVersion,
		claudeCode:    cfg.ClaudeCode,
		hub:           newWSHub(),
		terminals:     newTerminalRegistry(),
	}

	tmuxClient := tmux.New(cfg.TmuxSocket)
	s.tmuxClient = tmuxClient
	s.manager = session.NewManager(session.Config{
		Store:       cfg.Store,
		Logger:      cfg.Logger,
		PaneChecker: tmuxClient,
		OnUpsert: func(sess *session.Session) {
			s.hub.broadcast(sessionUpsertMessage{Type: "sessionUpsert", Session: toWireSession(sess)})
		},
	})

	s.usage = usage.NewAggregator(usage.Config{
		Store:  cfg.Store,
		Logger: cfg.Logger,
		OnChange: func(snap usage.Snapshot) {
			s.hub.broadcast(usageMessage{Type: "usage", Usage: toWireUsage(snap)})
		},
	})

	claudeBin := cfg.ClaudeBin
	if claudeBin == "" {
		claudeBin = "claude"
	}
	s.launcher = &sessionLauncher{
		store:              cfg.Store,
		manager:            s.manager,
		tmux:               tmuxClient,
		log:                cfg.Logger,
		claudeBin:          claudeBin,
		hookURL:            cfg.BaseURL + "/ingest/" + cfg.IngestToken + "/hook",
		statusURL:          cfg.BaseURL + "/ingest/" + cfg.IngestToken + "/status",
		sessionStartScript: cfg.SessionStartScript,
		statusLineScript:   cfg.StatusLineScript,
	}

	q := newIngestQueue(cfg.Store, cfg.Logger, size)
	q.manager = s.manager
	q.usage = s.usage
	s.ingest = q

	s.routes()
	return s
}

// Handler returns the root http.Handler to serve.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// Start reloads persisted sessions, begins the liveness poll, and begins asynchronous
// ingest processing. Call once, after New.
func (s *Server) Start() {
	ctx := context.Background()
	if err := s.manager.LoadAll(ctx); err != nil {
		s.log.Error().Err(err).Msg("failed to load sessions at startup")
	}
	s.manager.Start()
	s.ingest.Start()
}

// Shutdown closes every open WS connection (unblocking their handler goroutines, which
// http.Server.Shutdown cannot do for hijacked connections), stops the liveness poll, and
// drains the ingest queue, giving up when ctx is done.
func (s *Server) Shutdown(ctx context.Context) {
	s.hub.closeAll()
	s.terminals.closeAll()
	s.manager.Stop(ctx)
	s.ingest.Stop(ctx)
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
	mux.Handle("GET /ws/terminal/{id}", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleTerminal)))

	mux.HandleFunc("POST /ingest/{token}/hook", s.handleIngestHook)
	mux.HandleFunc("POST /ingest/{token}/status", s.handleIngestStatus)

	static := http.FileServer(http.Dir(s.webDist))
	mux.Handle("/", requireCookie(s.uiToken, writeHTMLUnauthorized, static))

	s.mux = mux
}
