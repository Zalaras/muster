package server

import (
	"context"
	"net/http"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tty"
)

// shellActivityPollInterval is the `shellActivity` poll rate: a ~1 s poller
// (kb:anchor/ws.shell-activity).
const shellActivityPollInterval = time.Second

// paneActivityLister abstracts tmux.Client.ListPaneActivity for tests, the same
// function-field seam themePoller uses for its reader (usagepoll.go/themepoll.go
// pattern) rather than a fake struct.
type paneActivityLister func(ctx context.Context) ([]tmux.PaneActivity, error)

// ttyCanonicalChecker abstracts tty.IsCanonical for tests.
type ttyCanonicalChecker func(ttyPath string) (bool, error)

// shellActivityFeature owns the terminal-list poller and the snapshot's terminals field.
// It mounts no routes.
type shellActivityFeature struct {
	poller *shellActivityPoller
}

func newShellActivityFeature(hasShells func() bool, lister paneActivityLister, names *terminalNames, hub *wsHub, log zerolog.Logger) *shellActivityFeature {
	shellBase := filepath.Base(interactiveShellArgv()[0])
	f := &shellActivityFeature{}
	f.poller = newShellActivityPoller(lister, tty.IsCanonical, hasShells, shellBase, shellActivityPollInterval, names, func(sessionID int64, terminals []terminalWire) {
		hub.broadcast(terminalsMessage{Type: "terminals", SessionID: sessionID, Rev: f.poller.revFor(sessionID), Terminals: terminals})
	}, log)
	return f
}

func (f *shellActivityFeature) mount(_ *http.ServeMux, _ func(http.Handler) http.Handler) {}

func (f *shellActivityFeature) Start() { f.poller.Start() }

func (f *shellActivityFeature) Stop(ctx context.Context) { f.poller.Stop(ctx) }

func (f *shellActivityFeature) contribute(_ context.Context, snap *Snapshot) {
	snap.Terminals, snap.TerminalsRev = f.poller.snapshot()
}

type shellActivityPoller struct {
	lister    paneActivityLister
	canonical ttyCanonicalChecker
	hasShells func() bool
	shellBase string
	interval  time.Duration
	names     *terminalNames
	broadcast func(sessionID int64, terminals []terminalWire)
	log       zerolog.Logger

	// tickMu serialises tick and sync, so each diff-and-broadcast sees the previous one's
	// result and two lists for one session never go out of order; it is also the only
	// writer's guard on revs' assignment order. mu guards terms, rev and revs together, so a
	// reader never sees lists older than the revision it reads.
	tickMu sync.Mutex
	mu     sync.RWMutex
	terms  map[int64][]terminalWire
	rev    int64
	revs   map[int64]int64

	bg bgLoop
}

func newShellActivityPoller(lister paneActivityLister, canonical ttyCanonicalChecker, hasShells func() bool, shellBase string, interval time.Duration, names *terminalNames, broadcast func(int64, []terminalWire), log zerolog.Logger) *shellActivityPoller {
	return &shellActivityPoller{
		lister:    lister,
		canonical: canonical,
		hasShells: hasShells,
		shellBase: shellBase,
		interval:  interval,
		names:     names,
		broadcast: broadcast,
		log:       log,
		terms:     make(map[int64][]terminalWire),
		revs:      make(map[int64]int64),
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

func (p *shellActivityPoller) Current() map[string][]terminalWire {
	lists, _ := p.snapshot()
	return lists
}

func (p *shellActivityPoller) snapshot() (map[string][]terminalWire, int64) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make(map[string][]terminalWire, len(p.terms))
	for id, list := range p.terms {
		out[strconv.FormatInt(id, 10)] = append([]terminalWire(nil), list...)
	}
	return out, p.rev
}

func (p *shellActivityPoller) revFor(sessionID int64) int64 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.revs[sessionID]
}

func (p *shellActivityPoller) sync(ctx context.Context) { p.tick(ctx) }

func (p *shellActivityPoller) tick(ctx context.Context) {
	p.tickMu.Lock()
	defer p.tickMu.Unlock()
	if !p.hasShells() && !p.listed() {
		return
	}
	panes, err := p.lister(ctx)
	if err != nil {
		p.log.Debug().Err(err).Msg("shell activity poll: listing pane activity failed")
		return
	}

	next := make(map[int64][]terminalWire)
	for _, pa := range panes {
		id, n, ok := tmux.ParseTerminalName(pa.SessionName)
		if !ok {
			continue // a Claude pane, or something else on the socket
		}
		next[id] = append(next[id], terminalWire{N: n, Name: p.names.effective(id, n), Busy: p.busy(pa, id)})
	}
	for _, list := range next {
		sort.Slice(list, func(i, j int) bool { return list[i].N < list[j].N })
	}
	p.reconcile(next)
}

func (p *shellActivityPoller) listed() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.terms) > 0
}

func (p *shellActivityPoller) busy(pa tmux.PaneActivity, id int64) bool {
	if pa.AlternateOn || pa.CurrentCommand == p.shellBase {
		return false
	}
	canonical, err := p.canonical(pa.Tty)
	if err != nil {
		p.log.Debug().Err(err).Str("tty", pa.Tty).Int64("session_id", id).Msg("shell activity poll: reading tty mode failed")
		return false
	}
	return canonical
}

type pendingBroadcast struct {
	sessionID int64
	terminals []terminalWire
}

func (p *shellActivityPoller) reconcile(next map[int64][]terminalWire) {
	var pending []pendingBroadcast
	p.mu.Lock()
	old := p.terms
	p.terms = next
	for id, list := range next {
		if !slices.Equal(old[id], list) {
			pending = append(pending, pendingBroadcast{id, list})
		}
	}
	for id := range old {
		if _, still := next[id]; !still {
			pending = append(pending, pendingBroadcast{id, []terminalWire{}})
		}
	}
	for _, b := range pending {
		p.rev++
		p.revs[b.sessionID] = p.rev
	}
	p.mu.Unlock()

	for _, b := range pending {
		p.broadcast(b.sessionID, b.terminals)
	}
	for id, oldList := range old {
		for _, t := range oldList {
			if !slices.ContainsFunc(next[id], func(w terminalWire) bool { return w.N == t.N }) {
				p.names.forget(id, t.N)
			}
		}
	}
}
