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

// ClaudeCodeInfo is the daemon's startup snapshot of the installed Claude Code against
// the canary-verified range, used to build the WS `hello` message
// (kb:anchor/ws.hello) and the issue-capture snapshot. Installed is nil iff Status is "unknown" (the
// startup version check failed, hung past its timeout, or was unparseable); Floor/Verified
// are always populated. A Config field (server.go, not ws.go): main computes it once, at
// startup, before New exists.
type ClaudeCodeInfo struct {
	Installed *string
	Floor     string
	Verified  string
	Status    string
}

// Config wires everything a Server needs, built entirely in main (no init() magic, no
// package-level state). Core fields are shared by more than one feature or by the root
// itself; everything else groups into one sub-struct per feature, declared in that
// feature's own file.
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
	// update); nil defaults to http.DefaultClient, resolved once by New (like TmuxClient
	// and Attach below) since all three features need the same default.
	HTTPClient *http.Client
	// TmuxClient overrides the tmux client sessionLauncher/shellRegistry use; nil constructs tmux.New(cfg.TmuxSocket).
	TmuxClient paneSpawner
	// Attach overrides how a terminal socket attaches to a tmux target; nil uses termbridge.Attach.
	Attach attachFunc
	// ShellScroll overrides the shell socket's copy-mode driver (kb:anchor/terminal.shell-ws); nil
	// uses the real tmux client (the same one TmuxClient's override does not affect —
	// production always wants real tmux copy-mode commands regardless of a paneSpawner
	// test double).
	ShellScroll shellScroller
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
	tmuxSocket    string
	daemonVersion string
	claudeCode    ClaudeCodeInfo

	hub        *wsHub
	manager    *session.Manager
	tmuxClient paneSpawner
	// features is Start/Stop order: a property of the order register(s, f) is called in
	// below, independent of the order each f was constructed in — usage and ingest are
	// constructed out of registration order (ingest's constructor takes usage's
	// aggregator) but registered ingest-then-usage, so registration order, not
	// construction order, is what Start/Stop honours.
	features []feature

	sessions      *sessionsFeature
	terminal      *terminalFeature
	ingest        *ingestFeature
	prefs         *prefsFeature
	usage         *usageFeature
	theme         *themeFeature
	shellActivity *shellActivityFeature
	issue         *issueFeature
	update        *updateFeature
	locate        *locateFeature
	reader        *readerFeature
}

// New builds a Server and wires its routes. Nothing here starts a goroutine; call Start
// once the caller is ready to begin processing.
func New(cfg Config) *Server {
	s := &Server{
		log:           cfg.Logger,
		store:         cfg.Store,
		uiToken:       cfg.UIToken,
		ingestToken:   cfg.IngestToken,
		webDist:       cfg.WebDist,
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
	// httpClient is shared by usage/issue/update, resolved once here rather than in each
	// (like spawner/attach above): all three want the same default.
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	// terminals is constructed before the manager (composition-root wiring only) so it
	// can be passed straight in as the manager's Watcher
	// (kb:adr/rail-unread-inferred-from-live-terminal-client): the terminal registry
	// already knows who's attached to what, so the manager needs no separate bookkeeping.
	terminals := newTerminalRegistry()
	s.manager = session.NewManager(session.Config{
		Store:           cfg.Store,
		Logger:          cfg.Logger,
		PaneChecker:     tmuxClient,
		PaneSnapshotter: tmuxClient,
		TmuxSessions:    tmuxClient,
		Watcher:         terminals,
		OnUpsert:        func(sess *session.Session) { s.hub.broadcast(sessionUpsertWire(sess)) },
		OnRemoved:       func(id int64) { s.hub.broadcast(sessionRemovedWire(id)) },
	})
	shells := newShellRegistry(spawner, cfg.Logger)
	launcher := newSessionLauncher(cfg.Store, s.manager, spawner, cfg.Launch, cfg.Logger)

	// reader has no dependency on sessions (only on manager/hub, already built above), so
	// it's built first and handed into newSessionsFeature — sessions' only use of it is
	// Remove's write-log drop.
	s.reader = register(s, newReaderFeature(s.manager, s.hub, cfg.Logger))
	s.sessions = register(s, newSessionsFeature(s.manager, launcher, shells, terminals, s.reader, cfg.Logger))
	s.terminal = register(s, newTerminalFeature(terminals, s.manager, attach, cfg.Logger))
	register(s, newShellFeature(shells, terminals, s.manager, attach, cfg.ShellScroll, tmuxClient, cfg.Logger))
	s.locate = register(s, newLocateFeature(s.manager, cfg.Locator, cfg.Logger))
	register(s, newBrowseFeature(cfg.Launch.BrowseRoot, cfg.Logger))
	register(s, newReposFeature(cfg.Store, cfg.Logger))
	s.issue = register(s, newIssueFeature(cfg.Issue, httpClient, s.manager, cfg.Store, cfg.DaemonVersion, cfg.ClaudeCode, cfg.Logger))

	// update is built before prefs so prefs can take it as its checkEnabledSetter
	// straight from the constructor — update's own initial checkEnabled value comes from
	// its own loadPrefs read (update.go), not from a *prefsFeature, so there is no cycle
	// forcing the reverse order.
	updateFeat := newUpdateFeature(cfg.Update, httpClient, cfg.DaemonVersion, cfg.Store, s.manager, s.hub, cfg.Logger)
	s.prefs = register(s, newPrefsFeature(cfg.Store, s.hub, updateFeat, cfg.Logger))

	// usage is built before ingest so ingest's constructor can take its aggregator; both
	// are registered in the fixed order (ingest, then usage) regardless — see features'
	// doc comment above.
	usageFeat := newUsageFeature(cfg.Usage, httpClient, cfg.Store, s.hub, cfg.Logger)
	s.ingest = register(s, newIngestFeature(cfg.Store, cfg.IngestQueueSize, cfg.IngestToken, s.manager, s.reader, usageFeat.aggregator, cfg.Logger))
	s.usage = register(s, usageFeat)
	s.theme = register(s, newThemeFeature(cfg.Theme, s.hub, cfg.Logger))
	s.shellActivity = register(s, newShellActivityFeature(shells.HasAny, tmuxClient.ListPaneActivity, s.hub, cfg.Logger))
	s.update = register(s, updateFeat)

	s.routes()
	return s
}

// Handler returns the root http.Handler to serve.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// Start reloads and reconciles sessions, then starts every lifecycle feature in
// registration order. Call once, after New — Reconcile runs synchronously here
// so neither `/ws` nor `GET /api/state` can observe a pre-reconcile session list.
func (s *Server) Start() {
	ctx := context.Background()
	if err := s.manager.LoadAll(ctx); err != nil {
		s.log.Error().Err(err).Msg("failed to load sessions at startup")
	}
	s.manager.Reconcile(ctx)
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

// KillAllShells kills every shell tmux session on the socket — the `-on-exit=kill`
// companion to EndAllSessions, run after it (sessions may hold the socket busy),
// per kb:adr/surfaces-shell-dies-at-kill-shutdown-too.
func (s *Server) KillAllShells(ctx context.Context) (int, error) {
	return s.manager.KillAllShells(ctx)
}

// ShellCount counts every shell tmux session on the socket — the on-exit prompt's count,
// per kb:adr/surfaces-shell-dies-at-kill-shutdown-too.
func (s *Server) ShellCount(ctx context.Context) (int, error) {
	return s.manager.ShellCount(ctx)
}

// StopLivenessPoll stops the session manager's background liveness poll and waits for it
// to exit, without touching any other feature. Call this first, before any other shutdown
// step (ShellCount's tmux round trip, the on-exit prompt, EndAllSessions/KillAllShells):
// those steps run for up to several seconds after the shutdown signal arrives, and the
// poll's own 5s ticker is not otherwise paused during that window. A pane that dies right
// then would otherwise race its own liveness tick against the fresh process's next-startup
// Reconcile — the still-shutting-down process marking+persisting alive:false before the
// row is ever handed to Reconcile makes Reconcile sweep it instead of keeping it ended
// (kb:adr/lifecycle-reconcile-converges-with-the-socket only keeps a row that was still
// alive:true at Reconcile time). Deliberately narrower than Shutdown, which also closes
// WS/terminal connections and stops every other feature that EndAllSessions/KillAllShells
// still need; Shutdown stops the poll again itself (idempotent) for callers, such as the
// auto-update restart path, that go straight to it without this earlier call.
func (s *Server) StopLivenessPoll(ctx context.Context) {
	s.manager.Stop(ctx)
}

// Shutdown closes every open WS connection (unblocking hijacked-connection goroutines
// http.Server.Shutdown cannot reach) and terminal socket, stops the liveness poll, then
// stops every lifecycle feature in Start's registration order.
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
