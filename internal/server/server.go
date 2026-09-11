// Package server wires up musterd's HTTP+WS surface. server.go is the composition root
// only (docs/conventions.md § Composition roots): it builds Config, registers each
// feature once, and owns the core routes/lifecycle — every other endpoint is a feature method.
package server

import (
	"context"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/locate"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/termbridge"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/webui"
)

// Config wires everything a Server needs, built entirely in main (no init() magic, no
// package-level state). Core fields are shared by more than one feature or by the root
// itself; everything else groups into one sub-struct per feature, declared in that
// feature's own file (plan code-breakup REQ-7).
type Config struct {
	Store       *store.Store
	Logger      zerolog.Logger
	UIToken     string
	IngestToken string
	// WebDist, non-empty, serves the dashboard from disk instead of the embedded copy.
	WebDist         string
	DaemonVersion   string
	ClaudeCode      ClaudeCodeInfo
	IngestQueueSize int
	TmuxSocket      string
	// HTTPClient is shared by every feature with outbound HTTP calls (usage, issue,
	// update); nil defaults to http.DefaultClient in each.
	HTTPClient *http.Client
	// TmuxClient overrides the tmux client sessionLauncher/shellRegistry use; nil constructs tmux.New(cfg.TmuxSocket).
	TmuxClient paneSpawner
	// Attach overrides how a terminal socket attaches to a tmux target; nil uses termbridge.Attach.
	Attach attachFunc
	// Locator resolves a dropped file's path (kb:anchor/sessions.locate); nil answers 500, never a panic.
	Locator *locate.Locator
	Launch  LaunchConfig
	Usage   UsageConfig
	Theme   ThemeConfig
	Issue   IssueConfig
	Update  UpdateConfig
}

// feature is anything New registers: it mounts its own routes. lifecycle and
// snapshotContributor are optional; Start/Shutdown/currentSnapshot type-assert for them.
type feature interface {
	mount(mux *http.ServeMux, guard func(http.Handler) http.Handler)
}

// lifecycle is a feature with a background process to start/stop.
type lifecycle interface {
	Start()
	Stop(ctx context.Context)
}

// snapshotContributor is a feature that fills in part of a Snapshot.
type snapshotContributor interface {
	contribute(ctx context.Context, snap *Snapshot)
}

// register appends f to s.features and returns it, so a feature's construction is one
// line: s.usage = register(s, newUsageFeature(...)).
func register[F feature](s *Server, f F) F {
	s.features = append(s.features, f)
	return f
}

// Server holds the HTTP mux and long-lived pieces, plus one field per feature.
type Server struct {
	mux *http.ServeMux
	log zerolog.Logger

	store         *store.Store
	uiToken       string
	ingestToken   string
	webDist       string
	browseRoot    string
	tmuxSocket    string
	daemonVersion string
	claudeCode    ClaudeCodeInfo

	hub        *wsHub
	manager    *session.Manager
	tmuxClient paneSpawner
	tmuxLister tmuxSessionLister
	features   []feature

	sessions *sessionsFeature
	terminal *terminalFeature
	shell    *shellFeature
	ingest   *ingestFeature
	prefs    *prefsFeature
	usage    *usageFeature
	theme    *themeFeature
	issue    *issueFeature
	update   *updateFeature
	locate   *locateFeature
	browse   *browseFeature
	repos    *reposFeature
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
		browseRoot:    cfg.Launch.BrowseRoot,
		tmuxSocket:    cfg.TmuxSocket,
		daemonVersion: cfg.DaemonVersion,
		claudeCode:    cfg.ClaudeCode,
		hub:           newWSHub(),
	}

	// Always constructed (cheap); the default attachFunc closes over this concrete
	// client since termbridge.Attach needs one, not the paneSpawner interface.
	tmuxClient := tmux.New(cfg.TmuxSocket)
	var spawner paneSpawner = tmuxClient
	if cfg.TmuxClient != nil {
		spawner = cfg.TmuxClient
	}
	s.tmuxClient = spawner
	s.tmuxLister = tmuxClient // always the real client — restart-impact lists real tmux state
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
	terminals := newTerminalRegistry()
	shells := newShellRegistry(spawner, cfg.Logger)
	claudeBin := cfg.Launch.ClaudeBin
	if claudeBin == "" {
		claudeBin = "claude"
	}
	launcher := &sessionLauncher{
		store:            cfg.Store,
		manager:          s.manager,
		tmux:             spawner,
		log:              cfg.Logger,
		claudeBin:        claudeBin,
		hookScript:       cfg.Launch.HookScript,
		statusLineScript: cfg.Launch.StatusLineScript,
		legacyScripts:    cfg.Launch.LegacyScripts,
	}
	s.sessions = register(s, newSessionsFeature(s.manager, launcher, shells, terminals, cfg.Logger))
	s.terminal = register(s, newTerminalFeature(terminals, s.manager, attach, cfg.Logger))
	s.shell = register(s, newShellFeature(shells, terminals, s.manager, attach, cfg.Logger))
	s.locate = register(s, newLocateFeature(s.manager, cfg.Locator))
	s.browse = register(s, newBrowseFeature(&s.browseRoot))
	s.repos = register(s, newReposFeature(cfg.Store, cfg.Logger))
	s.issue = register(s, newIssueFeature(cfg.Issue, cfg.HTTPClient, s.manager, cfg.Store, cfg.DaemonVersion, cfg.ClaudeCode, cfg.Logger))
	// Edge Case 13's construction cycle: prefs needs update's SetCheckEnabled, update
	// needs prefs' persisted value at construction — build prefs first, then update,
	// then wire prefs.updateChecker to it (prefs has no Start/Stop, so REQ-11 below is unaffected).
	s.prefs = register(s, newPrefsFeature(cfg.Store, s.hub))
	// REQ-11's Start/Stop order — ingest, usage poller, theme poller, updates — is this
	// registration order. Start/Shutdown both loop s.features in it, unreversed: these
	// four run independent goroutines with no dependency on one another, so a LIFO
	// teardown would only suggest a dependency that doesn't exist.
	s.ingest = register(s, newIngestFeature(cfg.Store, cfg.Logger, size, cfg.IngestToken))
	s.ingest.queue.manager = s.manager
	s.usage = register(s, newUsageFeature(cfg.Usage, cfg.HTTPClient, cfg.Store, s.hub, cfg.Logger))
	s.ingest.queue.usage = s.usage.aggregator
	s.theme = register(s, newThemeFeature(cfg.Theme, s.hub, cfg.Logger))
	s.update = register(s, newUpdateFeature(cfg.Update, cfg.HTTPClient, cfg.DaemonVersion, loadPrefs(context.Background(), cfg.Store).UpdateCheck, s.tmuxLister, s.manager, s.hub, cfg.Logger))
	s.prefs.updateChecker = s.update

	s.routes()
	return s
}

// Handler returns the root http.Handler to serve.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// Start reloads and reconciles sessions, then starts every lifecycle feature in
// registration order (REQ-11). Call once, after New — Reconcile runs synchronously here
// so neither `/ws` nor `GET /api/state` can observe a pre-reconcile session list.
func (s *Server) Start() {
	ctx := context.Background()
	if err := s.manager.LoadAll(ctx); err != nil {
		s.log.Error().Err(err).Msg("failed to load sessions at startup")
	}
	if _, err := s.manager.Reconcile(ctx); err != nil {
		s.log.Error().Err(err).Msg("failed to reconcile sessions at startup")
	}
	s.manager.Start()
	for _, f := range s.features {
		if lc, ok := f.(lifecycle); ok {
			lc.Start()
		}
	}
}

// LiveSessionCount reports how many sessions are alive — cmd/musterd's `-on-exit=ask`
// uses it to decide whether to prompt at all.
func (s *Server) LiveSessionCount() int {
	count := 0
	for _, sess := range s.manager.List() {
		if sess.Alive {
			count++
		}
	}
	return count
}

// TmuxSocket returns the dedicated tmux socket this daemon instance is bound to.
func (s *Server) TmuxSocket() string {
	return s.tmuxSocket
}

// EndAllSessions ends every alive session (the `-on-exit=kill` path), ahead of Shutdown.
// Returns how many were ended.
func (s *Server) EndAllSessions(ctx context.Context) int {
	return s.manager.EndAll(ctx)
}

// Shutdown closes every open WS connection (unblocking hijacked-connection goroutines
// http.Server.Shutdown cannot reach) and terminal socket, stops the liveness poll, then
// stops every lifecycle feature in Start's registration order (REQ-11).
func (s *Server) Shutdown(ctx context.Context) {
	s.hub.closeAll()
	s.terminal.closeAll()
	s.manager.Stop(ctx)
	for _, f := range s.features {
		if lc, ok := f.(lifecycle); ok {
			lc.Stop(ctx)
		}
	}
}

// RestartRequests reports each in-place re-exec an apply requests
// (kb:anchor/update.apply). A disabled update feature yields a nil channel, so a select never fires on it.
func (s *Server) RestartRequests() <-chan struct{} {
	return s.update.restartRequestsChan()
}

func (s *Server) routes() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /auth", s.handleAuth)

	guard := func(h http.Handler) http.Handler { return requireCookie(s.uiToken, writeJSONUnauthorized, h) }

	mux.Handle("GET /api/state", guard(http.HandlerFunc(s.handleState)))
	mux.Handle("GET /ws", guard(http.HandlerFunc(s.handleWS)))

	for _, f := range s.features {
		f.mount(mux, guard)
	}

	// -web-dist non-empty serves disk (dev override); empty serves the embedded tree.
	// requireCookie wraps both branches identically.
	var static http.Handler
	if s.webDist != "" {
		static = http.FileServer(http.Dir(s.webDist))
	} else {
		static = http.FileServer(http.FS(webui.FS()))
	}
	mux.Handle("/", requireCookie(s.uiToken, writeHTMLUnauthorized, static))

	s.mux = mux
}
