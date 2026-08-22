// Package server wires up musterd's HTTP+WS surface: auth, static serving, the ingest
// endpoints and the state stream. Business logic (parsing, persistence) is delegated to
// internal/claudecode and internal/store; handlers here only decode, delegate, encode.
package server

import (
	"context"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/store"
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
}

// Server holds musterd's HTTP mux and the long-lived pieces (ingest queue, WS registry)
// that outlive any single request.
type Server struct {
	mux *http.ServeMux
	log zerolog.Logger

	store       *store.Store
	uiToken     string
	ingestToken string
	webDist     string

	daemonVersion string
	claudeCode    ClaudeCodeInfo

	ingest *ingestQueue
	hub    *wsHub
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
		daemonVersion: cfg.DaemonVersion,
		claudeCode:    cfg.ClaudeCode,
		ingest:        newIngestQueue(cfg.Store, cfg.Logger, size),
		hub:           newWSHub(),
	}
	s.routes()
	return s
}

// Handler returns the root http.Handler to serve.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// Start begins asynchronous ingest processing. Call once, after New.
func (s *Server) Start() {
	s.ingest.Start()
}

// Shutdown closes every open WS connection (unblocking their handler goroutines, which
// http.Server.Shutdown cannot do for hijacked connections) and drains the ingest queue,
// giving up when ctx is done.
func (s *Server) Shutdown(ctx context.Context) {
	s.hub.closeAll()
	s.ingest.Stop(ctx)
}

func (s *Server) routes() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /auth", s.handleAuth)

	mux.Handle("GET /api/state", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleState)))
	mux.Handle("GET /ws", requireCookie(s.uiToken, writeJSONUnauthorized, http.HandlerFunc(s.handleWS)))

	mux.HandleFunc("POST /ingest/{token}/hook", s.handleIngestHook)
	mux.HandleFunc("POST /ingest/{token}/status", s.handleIngestStatus)

	static := http.FileServer(http.Dir(s.webDist))
	mux.Handle("/", requireCookie(s.uiToken, writeHTMLUnauthorized, static))

	s.mux = mux
}
