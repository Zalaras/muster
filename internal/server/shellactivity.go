package server

import (
	"context"
	"net/http"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tty"
)

// shellActivityPollInterval is the `shellActivity` poll rate (kb:anchor/ws.shell-activity, plan
// Protocol Contract: "a ~1 s poller").
const shellActivityPollInterval = time.Second

// shellActivityMessage is the WS `shellActivity` broadcast (kb:anchor/ws.shell-activity). Sent on
// every observed change of a shell's busy flag, never per tick and never replayed —
// snapshot.shellsBusy is what a reconnecting client re-syncs from.
type shellActivityMessage struct {
	Type      string `json:"type"`
	SessionID int64  `json:"sessionId"`
	Busy      bool   `json:"busy"`
}

// paneActivityLister abstracts tmux.Client.ListPaneActivity for tests, the same
// function-field seam themePoller uses for its reader (usagepoll.go/themepoll.go
// pattern) rather than a fake struct.
type paneActivityLister func(ctx context.Context) ([]tmux.PaneActivity, error)

// ttyCanonicalChecker abstracts tty.IsCanonical for tests.
type ttyCanonicalChecker func(ttyPath string) (bool, error)

// shellActivityFeature owns the shell-busy poller and the snapshot's shellsBusy field.
// It mounts no routes.
type shellActivityFeature struct {
	poller *shellActivityPoller
}

func newShellActivityFeature(hasShells func() bool, lister paneActivityLister, hub *wsHub, log zerolog.Logger) *shellActivityFeature {
	shellBase := filepath.Base(interactiveShellArgv()[0])
	f := &shellActivityFeature{}
	f.poller = newShellActivityPoller(lister, tty.IsCanonical, hasShells, shellBase, shellActivityPollInterval, func(sessionID int64, busy bool) {
		hub.broadcast(shellActivityMessage{Type: "shellActivity", SessionID: sessionID, Busy: busy})
	}, log)
	return f
}

func (f *shellActivityFeature) mount(_ *http.ServeMux, _ func(http.Handler) http.Handler) {}

func (f *shellActivityFeature) Start() { f.poller.Start() }

func (f *shellActivityFeature) Stop(ctx context.Context) { f.poller.Stop(ctx) }

func (f *shellActivityFeature) contribute(_ context.Context, snap *Snapshot) {
	snap.ShellsBusy = f.poller.Current()
}

// shellActivityPoller polls tmux's own process/tty state on an interval, broadcasting
// `shellActivity` only on a change (kb:anchor/ws.shell-activity, kb:adr/surfaces-shell-busy-from-tmux-process-state)
// — pattern copied from usagePoller/themePoller's Start/Stop/loop/tick shape.
type shellActivityPoller struct {
	lister    paneActivityLister
	canonical ttyCanonicalChecker
	hasShells func() bool
	shellBase string
	interval  time.Duration
	broadcast func(sessionID int64, busy bool)
	log       zerolog.Logger

	mu   sync.RWMutex
	busy map[int64]bool // session ids currently reported busy

	bg bgLoop
}

func newShellActivityPoller(lister paneActivityLister, canonical ttyCanonicalChecker, hasShells func() bool, shellBase string, interval time.Duration, broadcast func(int64, bool), log zerolog.Logger) *shellActivityPoller {
	return &shellActivityPoller{
		lister:    lister,
		canonical: canonical,
		hasShells: hasShells,
		shellBase: shellBase,
		interval:  interval,
		broadcast: broadcast,
		log:       log,
		busy:      make(map[int64]bool),
	}
}

// Start begins the poll loop with an immediate first tick. Call once.
func (p *shellActivityPoller) Start() {
	p.bg.start(func(ctx context.Context) { runTicked(ctx, p.interval, nil, p.tick) })
}

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done
// (mirrors usagePoller.Stop / themePoller.Stop).
func (p *shellActivityPoller) Stop(ctx context.Context) {
	p.bg.stop(ctx, p.log, "shell activity poller did not stop before shutdown deadline")
}

// Current returns every session id currently reported busy, sorted — always non-nil
// (snapshot.shellsBusy: "[] when none, always present").
func (p *shellActivityPoller) Current() []int64 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	ids := make([]int64, 0, len(p.busy))
	for id := range p.busy {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

// tick reads every shell pane's tmux-reported state and reconciles it against the
// previous tick's busy set, broadcasting one message per session whose busy flag
// changed. hasShells gates the tmux exec entirely when this daemon instance has never
// spawned a shell (plan Gotchas: "must not run a tmux invocation when no shell exists").
func (p *shellActivityPoller) tick(ctx context.Context) {
	if !p.hasShells() {
		return
	}
	panes, err := p.lister(ctx)
	if err != nil {
		p.log.Debug().Err(err).Msg("shell activity poll: listing pane activity failed")
		return
	}

	newBusy := make(map[int64]bool)
	for _, pa := range panes {
		id, ok := tmux.IsShellSessionName(pa.SessionName)
		if !ok {
			continue // a Claude pane, or something else on the socket
		}
		// D5/D9: alternate-screen or the shell's own idle prompt is never busy,
		// whatever its tty mode — cheaper to skip the ioctl for those panes.
		if pa.AlternateOn || pa.CurrentCommand == p.shellBase {
			continue
		}
		canonical, cerr := p.canonical(pa.Tty)
		if cerr != nil {
			// The tty can vanish between list-panes and the ioctl (the shell just
			// exited) — never fatal, just sit this session out of this tick.
			p.log.Debug().Err(cerr).Str("tty", pa.Tty).Int64("session_id", id).Msg("shell activity poll: reading tty mode failed")
			continue
		}
		if canonical {
			newBusy[id] = true
		}
	}
	p.reconcile(newBusy)
}

// reconcile swaps in newBusy and broadcasts one message per session whose busy flag
// changed since the previous tick — covers a shell going idle, going busy, and a shell
// disappearing from panes entirely (exited while busy, E7; reconcile-killed at daemon
// restart, E8 — both read as "no longer in newBusy", the same path as going idle).
func (p *shellActivityPoller) reconcile(newBusy map[int64]bool) {
	p.mu.Lock()
	old := p.busy
	p.busy = newBusy
	p.mu.Unlock()

	for id := range newBusy {
		if !old[id] {
			p.broadcast(id, true)
		}
	}
	for id := range old {
		if !newBusy[id] {
			p.broadcast(id, false)
		}
	}
}
