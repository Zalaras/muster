package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/boundedwait"
	"github.com/Zalaras/muster/internal/selfupdate"
)

// Sentinel errors updateManager.RequestApply returns — handleApplyUpdate maps each to
// its wire error code (kb:anchor/update.apply). errCheckFailed is checkAvailability's
// own sentinel, wrapping the release host's own error text — handleCheckUpdate maps it
// to 502 (kb:anchor/update.check); errShuttingDown is reused by both.
var (
	errUpdateUnsupported = errors.New("update unsupported for this install")
	errNothingToApply    = errors.New("no newer release is known")
	errShuttingDown      = errors.New("musterd is shutting down")
	errCheckFailed       = errors.New("update check failed")
)

// updateExecFunc runs a subprocess and returns its stdout — the ProbeVersion seam
// (selfupdate.RunVersionProbe in production).
type updateExecFunc func(ctx context.Context, name string, args ...string) (string, error)

// updateManagerConfig configures a newUpdateManager call. Constructed only when
// -update-base-url is non-empty (Server.New); a nil *updateManager on Server means
// updates are disabled entirely (mirrors usagePoller's nil-when-disabled shape).
type updateManagerConfig struct {
	Client       *http.Client
	Base         string
	Interval     time.Duration
	PubKey       []byte
	Install      selfupdate.Install
	Running      string
	ExePath      string
	ExeRun       updateExecFunc
	CheckEnabled bool
	Log          zerolog.Logger
	OnChange     func(UpdateInfo)
}

// updateManager owns the whole auto-update state machine: the periodic release check
// (kb:adr/update-check-runs-in-daemon-daily), checkSwap's out-of-band-swap detection
// below, and apply serialisation (kb:adr/update-install-kinds-decide-who-may-apply) both
// within this daemon (mutex + inFlight) and across processes (selfupdate.AcquireLock).
type updateManager struct {
	client   *http.Client
	base     string
	interval time.Duration
	pubKey   []byte
	install  selfupdate.Install
	running  string
	exePath  string
	exeRun   updateExecFunc
	log      zerolog.Logger
	onChange func(UpdateInfo)

	startInfo os.FileInfo // stat at construction — checkSwap's reference point for detecting an out-of-band binary swap

	mu            sync.Mutex
	checkEnabled  bool
	available     *string
	checkedAt     *string
	installed     *string
	swappedByUs   bool
	applyPhase    selfupdate.Phase
	applyVersion  *string
	applyError    *string
	applyInFlight bool
	// applyCancel cancels the context the in-flight apply's goroutine runs under; nil when
	// no apply is in flight. Guarded by mu like every other apply-state field above.
	applyCancel  context.CancelFunc
	shuttingDown bool

	refresh         chan struct{}
	restartRequests chan struct{}
	bg              bgLoop
	// applyWG tracks the apply goroutine RequestApply starts — separate from bg's own wg,
	// which only tracks the tick loop: Stop cancels and bounded-waits for both.
	applyWG sync.WaitGroup
}

// newUpdateManager builds a manager. checkEnabled is the persisted prefs.updateCheck
// value at daemon startup — construction never itself performs I/O beyond one os.Stat.
func newUpdateManager(cfg updateManagerConfig) *updateManager {
	client := cfg.Client
	if client == nil {
		client = http.DefaultClient
	}
	m := &updateManager{
		client:          client,
		base:            cfg.Base,
		interval:        cfg.Interval,
		pubKey:          cfg.PubKey,
		install:         cfg.Install,
		running:         cfg.Running,
		exePath:         cfg.ExePath,
		exeRun:          cfg.ExeRun,
		log:             cfg.Log,
		onChange:        cfg.OnChange,
		checkEnabled:    cfg.CheckEnabled && cfg.Install.Kind != selfupdate.KindDev,
		applyPhase:      selfupdate.PhaseIdle,
		refresh:         make(chan struct{}, 1),
		restartRequests: make(chan struct{}, 1),
	}
	if info, err := os.Stat(cfg.ExePath); err == nil {
		m.startInfo = info
	}
	return m
}

// Start begins the tick loop with an immediate first tick
// (kb:adr/update-check-runs-in-daemon-daily), on its own goroutine so it never delays the
// caller (Server.Start, ahead of accepting connections). A dev install never ticks at
// all — checking is never enabled for it, structurally, not as a per-tick guard
// (kb:adr/update-install-kinds-decide-who-may-apply).
func (m *updateManager) Start() {
	if m.install.Kind == selfupdate.KindDev {
		return
	}
	m.bg.start(func(ctx context.Context) { runTicked(ctx, m.interval, m.refresh, m.tick) })
}

// Stop cancels the tick loop and waits for it to exit, giving up when ctx is done
// (mirrors usagePoller.Stop). Marks the manager as shutting down first, so any apply
// already in flight — and any new POST /api/update/apply racing shutdown — observes
// errShuttingDown.
//
// It also cancels an in-flight apply and bounded-waits for it: before this, RequestApply's
// goroutine ran under context.WithoutCancel and outlived Stop entirely, so a SIGTERM
// mid-download could exit the process in the middle of selfupdate.Apply, leaving its temp
// file behind. Cancellation aborts the download/verify in progress; runApply/
// finishApplyFailed's existing error path (an apply reads an error from a canceled
// ctx.Err() exactly as it would any other download failure) records it as a failed apply
// rather than a successful one.
func (m *updateManager) Stop(ctx context.Context) {
	m.mu.Lock()
	m.shuttingDown = true
	cancelApply := m.applyCancel
	m.mu.Unlock()

	if cancelApply != nil {
		cancelApply()
	}
	boundedwait.Wait(ctx, &m.applyWG, m.log, "update apply did not stop before shutdown deadline")

	m.bg.stop(ctx, m.log, "update manager did not stop before shutdown deadline")
}

// tick runs checkSwap's out-of-band swap detection unconditionally (a local stat, never
// a network request) and, only while checking is enabled, the periodic availability
// check (kb:adr/update-check-runs-in-daemon-daily).
func (m *updateManager) tick(ctx context.Context) {
	m.checkSwap(ctx)

	m.mu.Lock()
	enabled := m.checkEnabled
	m.mu.Unlock()
	if !enabled {
		return
	}
	// The tick loop discards the error; it is already logged at debug inside
	// checkAvailability, and a failed automatic check deliberately keeps the wire
	// untouched (kb:adr/update-check-runs-in-daemon-daily).
	_ = m.checkAvailability(ctx, false)
}

// checkAvailability is one release-check poll attempt, run by both the tick loop
// (manual false, the daily schedule's silent-on-failure path,
// kb:adr/update-check-runs-in-daemon-daily) and POST /api/update/check (manual true,
// kb:adr/update-manual-check-is-a-synchronous-post): a failure is logged at debug and,
// for a manual caller, returned so handleCheckUpdate can map it onto a wire error code
// (kb:anchor/update.check). A success updates available/checkedAt and always broadcasts
// (checkedAt changes on every successful check, regardless of whether available itself
// did) — unless this is the automatic path and the pref was turned off while the check
// was in flight, in which case the result is discarded and nothing is broadcast. A
// manual check keeps its result even then: prefs.updateCheck governs only the daemon's
// own schedule (kb:adr/update-check-pref-governs-automatic-checking-only).
func (m *updateManager) checkAvailability(ctx context.Context, manual bool) error {
	if manual {
		m.mu.Lock()
		shuttingDown := m.shuttingDown
		m.mu.Unlock()
		if shuttingDown {
			return errShuttingDown
		}
	}

	latest, newer, err := selfupdate.CheckNewer(ctx, m.client, m.base, m.running)
	if err != nil {
		m.log.Debug().Err(err).Msg("update check failed")
		return fmt.Errorf("%w: %w", errCheckFailed, err)
	}

	var available *string
	if newer {
		v := latest.String()
		available = &v
	}
	at := wireTime(time.Now())

	m.mu.Lock()
	if !manual && !m.checkEnabled {
		m.mu.Unlock()
		return nil
	}
	m.available = available
	m.checkedAt = &at
	m.mu.Unlock()

	m.emit()
	return nil
}

// checkSwap detects an out-of-band binary swap: at each tick, stat the running
// executable; if size/mtime differ from the startup stat and this daemon did not
// perform the swap itself, probe the swapped file's own -version output and, on
// success, set `installed`. A failed or hanging probe leaves `installed` null and is
// retried next tick — no different from never having detected a change at all.
func (m *updateManager) checkSwap(ctx context.Context) {
	if m.exePath == "" || m.exeRun == nil {
		return
	}
	info, err := os.Stat(m.exePath)
	if err != nil {
		return
	}

	m.mu.Lock()
	skip := m.swappedByUs || m.installed != nil
	prev := m.startInfo
	m.mu.Unlock()
	if skip {
		return
	}
	if prev != nil && info.Size() == prev.Size() && info.ModTime().Equal(prev.ModTime()) {
		return
	}

	probeCtx, cancel := context.WithTimeout(ctx, selfupdate.ProbeVersionTimeout)
	version, err := selfupdate.ProbeVersion(probeCtx, m.exeRun, m.exePath)
	cancel()
	if err != nil {
		m.log.Debug().Err(err).Msg("probing swapped binary version failed")
		return
	}

	m.mu.Lock()
	m.installed = &version
	m.mu.Unlock()
	m.emit()
}

// SetCheckEnabled applies a pref change
// (kb:adr/update-check-pref-governs-automatic-checking-only): disabling clears
// available/checkedAt and broadcasts once; enabling wakes an immediate check rather
// than waiting for the next tick. A dev install ignores this entirely — checking is
// never enabled for it regardless of the persisted pref
// (kb:adr/update-install-kinds-decide-who-may-apply).
func (m *updateManager) SetCheckEnabled(enabled bool) {
	if m.install.Kind == selfupdate.KindDev {
		return
	}

	m.mu.Lock()
	m.checkEnabled = enabled
	if !enabled {
		m.available = nil
		m.checkedAt = nil
	}
	m.mu.Unlock()

	if !enabled {
		m.emit()
		return
	}
	m.Refresh()
}

// Refresh wakes the tick loop for an immediate check (mirrors usagePoller.Refresh):
// coalesced — a refresh already pending in the buffered channel makes this a no-op, so
// any number of concurrent calls collapse into at most one extra tick. Safe to call
// while checking is disabled: the resulting tick's own checkEnabled guard makes it a
// no-op that touches no network.
func (m *updateManager) Refresh() {
	select {
	case m.refresh <- struct{}{}:
	default:
	}
}

// installKind reports the fixed install classification (immutable after construction —
// no lock needed).
func (m *updateManager) installKind() selfupdate.Kind {
	return m.install.Kind
}

// Remedy returns the install's remedy sentence (empty for "installer").
func (m *updateManager) Remedy() string {
	return m.install.Remedy
}

// RequestApply starts (or joins) one apply — applies are serialised
// (kb:adr/update-install-kinds-decide-who-may-apply). A nil error means the apply is
// under way — either just started, or already in flight; RequestApply's own restart
// argument is ignored by a join (the first request's restart value wins, per
// kb:anchor/update.apply). ctx should already have its cancellation detached from the
// HTTP request that triggered this (context.WithoutCancel) — the apply outlives the
// request/response that started it.
func (m *updateManager) RequestApply(ctx context.Context, restart bool) error {
	m.mu.Lock()
	if m.shuttingDown {
		m.mu.Unlock()
		return errShuttingDown
	}
	if !m.install.MayApply() {
		m.mu.Unlock()
		return errUpdateUnsupported
	}
	if m.applyInFlight {
		m.mu.Unlock()
		return nil
	}
	available := m.available
	installed := m.installed
	if available == nil && installed == nil {
		m.mu.Unlock()
		return errNothingToApply
	}
	// kb:anchor/update.apply: the download is skipped when installed already equals
	// available (already on disk, nothing newer to fetch) or when available is null and
	// installed is set (a restart-only apply, with nothing new to fetch).
	skipDownload := (installed != nil && available != nil && *installed == *available) ||
		(available == nil && installed != nil)
	version := available
	if version == nil {
		version = installed
	}
	// applyCtx is Stop's handle on this apply: ctx is already context.WithoutCancel of the
	// HTTP request that triggered it (the apply must outlive that request/response), but it
	// must not outlive the daemon itself.
	applyCtx, cancel := context.WithCancel(ctx)
	m.applyInFlight = true
	m.applyCancel = cancel
	m.mu.Unlock()

	m.applyWG.Add(1)
	go m.runApply(applyCtx, *version, restart, skipDownload)
	return nil
}

func (m *updateManager) runApply(ctx context.Context, version string, restart, skipDownload bool) {
	defer func() {
		m.mu.Lock()
		cancel := m.applyCancel
		m.applyInFlight = false
		m.applyCancel = nil
		m.mu.Unlock()
		// Releases applyCtx's resources once this apply is done either way; a no-op if
		// Stop already called it first (context.CancelFunc is safe to call more than once).
		if cancel != nil {
			cancel()
		}
		m.applyWG.Done()
	}()

	if !skipDownload {
		release, err := selfupdate.AcquireLock(filepath.Dir(m.exePath))
		if err != nil {
			m.finishApplyFailed(version, err)
			return
		}
		defer release()

		err = selfupdate.Apply(ctx, selfupdate.Options{
			Client:  m.client,
			Base:    m.base,
			Tag:     selfupdate.ReleaseTag(version),
			ExePath: m.exePath,
			PubKey:  m.pubKey,
			Progress: func(p selfupdate.Phase) {
				m.setApplyPhase(p, version, nil)
			},
		})
		if err != nil {
			m.finishApplyFailed(version, err)
			return
		}
	}

	m.mu.Lock()
	v := version
	m.installed = &v
	m.swappedByUs = true
	m.applyPhase = selfupdate.PhaseDone
	m.applyVersion = &v
	m.applyError = nil
	m.mu.Unlock()
	m.emit()

	if !restart {
		return
	}
	m.setApplyPhase(selfupdate.PhaseRestarting, version, nil)
	select {
	case m.restartRequests <- struct{}{}:
	default:
	}
}

func (m *updateManager) setApplyPhase(phase selfupdate.Phase, version string, applyErr error) {
	m.mu.Lock()
	m.applyPhase = phase
	v := version
	m.applyVersion = &v
	if applyErr != nil {
		msg := applyErr.Error()
		m.applyError = &msg
	} else {
		m.applyError = nil
	}
	m.mu.Unlock()
	m.emit()
}

func (m *updateManager) finishApplyFailed(version string, err error) {
	m.setApplyPhase(selfupdate.PhaseFailed, version, err)
}

// Current returns a snapshot of the manager's state for the WS `update`/snapshot.update
// wire object.
func (m *updateManager) Current() UpdateInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	return buildUpdateInfo(m.install, m.running, m.install.Kind != selfupdate.KindDev, m.available, m.checkedAt, m.installed, UpdateApplyInfo{
		Phase:   string(m.applyPhase),
		Version: m.applyVersion,
		Error:   m.applyError,
	})
}

func (m *updateManager) emit() {
	m.onChange(m.Current())
}
