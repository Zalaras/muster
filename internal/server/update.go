package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/selfupdate"
	"github.com/Zalaras/muster/internal/tmux"
)

// updateMessage is the WS `update` broadcast (docs/protocol.md §5.7).
type updateMessage struct {
	Type   string     `json:"type"`
	Update UpdateInfo `json:"update"`
}

// UpdateApplyInfo is the `update.apply` object (docs/protocol.md §5.7). INV-4: Error is
// non-nil iff Phase is "failed"; Version is nil iff Phase is "idle".
type UpdateApplyInfo struct {
	Phase   string  `json:"phase"`
	Version *string `json:"version"`
	Error   *string `json:"error"`
}

// UpdateInfo is the `update` object, shared verbatim by the WS `update` broadcast and
// snapshot.update (docs/protocol.md §5.7) — always present, even on a daemon with
// updates disabled entirely (-update-base-url "").
type UpdateInfo struct {
	Running   string          `json:"running"`
	Install   string          `json:"install"`
	Remedy    *string         `json:"remedy"`
	Available *string         `json:"available"`
	CheckedAt *string         `json:"checkedAt"`
	Installed *string         `json:"installed"`
	Apply     UpdateApplyInfo `json:"apply"`
}

// Sentinel errors updateManager.RequestApply returns — handleApplyUpdate maps each to
// its wire error code (docs/protocol.md §3.17).
var (
	errUpdateUnsupported = errors.New("update unsupported for this install")
	errNothingToApply    = errors.New("no newer release is known")
	errShuttingDown      = errors.New("musterd is shutting down")
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

// updateManager owns the whole auto-update state machine: the periodic check
// (REQ-1..7), REQ-26's out-of-band-swap detection, and apply serialisation (REQ-20)
// both within this daemon (mutex + inFlight) and across processes (selfupdate.AcquireLock).
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

	startInfo os.FileInfo // stat at construction — REQ-26's "startup stat" reference point

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
	shuttingDown  bool

	refresh         chan struct{}
	restartRequests chan struct{}
	cancel          context.CancelFunc
	wg              sync.WaitGroup
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

// Start begins the tick loop with an immediate first tick (REQ-4), on its own goroutine
// so it never delays the caller (Server.Start, ahead of accepting connections). A dev
// install never ticks at all — REQ-8's "never checks" is structural, not a per-tick guard.
func (m *updateManager) Start() {
	if m.install.Kind == selfupdate.KindDev {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		m.loop(ctx)
	}()
}

// Stop cancels the tick loop and waits for it to exit, giving up when ctx is done
// (mirrors usagePoller.Stop). Marks the manager as shutting down first, so any apply
// already in flight — and any new POST /api/update/apply racing shutdown — observes
// errShuttingDown (Edge Case 25).
func (m *updateManager) Stop(ctx context.Context) {
	m.mu.Lock()
	m.shuttingDown = true
	m.mu.Unlock()

	if m.cancel != nil {
		m.cancel()
	}
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		m.log.Warn().Msg("update manager did not stop before shutdown deadline")
	}
}

func (m *updateManager) loop(ctx context.Context) {
	m.tick(ctx)
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.tick(ctx)
		case <-m.refresh:
			m.tick(ctx)
		}
	}
}

// tick runs REQ-26's swap detection unconditionally (a local stat, never a network
// request) and, only while checking is enabled, the availability check (REQ-1..7).
func (m *updateManager) tick(ctx context.Context) {
	m.checkSwap(ctx)

	m.mu.Lock()
	enabled := m.checkEnabled
	m.mu.Unlock()
	if !enabled {
		return
	}
	m.checkAvailability(ctx)
}

// checkAvailability is one REQ-1..7 poll attempt: a failure changes nothing on the wire
// (D17) and is logged at debug only; a success updates available/checkedAt and always
// broadcasts (checkedAt changes on every successful check, regardless of whether
// available itself did) — unless the pref was turned off while this check was in flight
// (D16), in which case the result is discarded and nothing is broadcast.
func (m *updateManager) checkAvailability(ctx context.Context) {
	tag, err := selfupdate.LatestTag(ctx, m.client, m.base)
	if err != nil {
		m.log.Debug().Err(err).Msg("update check failed")
		return
	}
	latest, ok := selfupdate.ParseRelease(tag)
	if !ok {
		m.log.Debug().Str("tag", tag).Msg("update check: latest tag is not a release version")
		return
	}

	var available *string
	if running, ok := selfupdate.ParseRelease(m.running); ok && latest.Compare(running) > 0 {
		v := latest.String()
		available = &v
	}
	at := time.Now().UTC().Format(time.RFC3339)

	m.mu.Lock()
	if !m.checkEnabled {
		m.mu.Unlock()
		return
	}
	m.available = available
	m.checkedAt = &at
	m.mu.Unlock()

	m.emit()
}

// checkSwap is REQ-26: at each tick, stat the running executable; if size/mtime differ
// from the startup stat and this daemon did not perform the swap itself, probe the
// swapped file's own -version output and, on success, set `installed`. A failed or
// hanging probe (D24) leaves `installed` null and is retried next tick — no different
// from never having detected a change at all.
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

// SetCheckEnabled applies a pref change (REQ-3): disabling clears available/checkedAt
// and broadcasts once (D15); enabling wakes an immediate check rather than waiting for
// the next tick. A dev install ignores this entirely — checking is never enabled for it
// regardless of the persisted pref (REQ-8).
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
// no-op that touches no network (D14).
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

// RequestApply starts (or joins) one apply (REQ-20). A nil error means the apply is
// under way — either just started, or already in flight; RequestApply's own restart
// argument is ignored by a join (the first request's restart value wins, per
// docs/protocol.md §3.17). ctx should already have its cancellation detached from the
// HTTP request that triggered this (context.WithoutCancel) — the apply outlives the
// request/response that started it.
func (m *updateManager) RequestApply(ctx context.Context, restart bool) error {
	m.mu.Lock()
	if m.shuttingDown {
		m.mu.Unlock()
		return errShuttingDown
	}
	if m.install.Kind != selfupdate.KindInstaller {
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
	// docs/protocol.md §3.17: the download is skipped when installed already equals
	// available (already on disk, nothing newer to fetch) or when available is null and
	// installed is set (REQ-25's restart-only case).
	skipDownload := (installed != nil && available != nil && *installed == *available) ||
		(available == nil && installed != nil)
	version := available
	if version == nil {
		version = installed
	}
	m.applyInFlight = true
	m.mu.Unlock()

	go m.runApply(ctx, *version, restart, skipDownload)
	return nil
}

func (m *updateManager) runApply(ctx context.Context, version string, restart, skipDownload bool) {
	defer func() {
		m.mu.Lock()
		m.applyInFlight = false
		m.mu.Unlock()
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
			Tag:     "v" + version,
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

	var remedy *string
	if m.install.Remedy != "" {
		r := m.install.Remedy
		remedy = &r
	}
	return UpdateInfo{
		Running:   m.running,
		Install:   string(m.install.Kind),
		Remedy:    remedy,
		Available: m.available,
		CheckedAt: m.checkedAt,
		Installed: m.installed,
		Apply: UpdateApplyInfo{
			Phase:   string(m.applyPhase),
			Version: m.applyVersion,
			Error:   m.applyError,
		},
	}
}

func (m *updateManager) emit() {
	m.onChange(m.Current())
}

// applyUpdateRequest is POST /api/update/apply's request body (docs/protocol.md §3.17).
// The body itself is optional — an absent/empty body means restart:false.
type applyUpdateRequest struct {
	Restart bool `json:"restart"`
}

// handleApplyUpdate is POST /api/update/apply (docs/protocol.md §3.17).
func (s *Server) handleApplyUpdate(w http.ResponseWriter, r *http.Request) {
	if s.updates == nil || s.updates.installKind() == selfupdate.KindDev {
		writeJSONError(w, http.StatusNotFound, "not_found", "updates are disabled for this daemon")
		return
	}

	var req applyUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}

	// The apply outlives this request/response — a client that navigates away or hits
	// Escape must not cancel an in-flight download/verify/install (mirrors
	// handleCreateIssue's context.WithoutCancel for the same reason).
	applyCtx := context.WithoutCancel(r.Context())
	switch err := s.updates.RequestApply(applyCtx, req.Restart); {
	case err == nil:
		w.WriteHeader(http.StatusAccepted)
	case errors.Is(err, errUpdateUnsupported):
		writeJSONError(w, http.StatusConflict, "update_unsupported", s.updates.Remedy())
	case errors.Is(err, errNothingToApply):
		writeJSONError(w, http.StatusConflict, "nothing_to_apply", "no newer release is known")
	case errors.Is(err, errShuttingDown):
		writeJSONError(w, http.StatusConflict, "shutting_down", "musterd is shutting down")
	default:
		s.log.Warn().Err(err).Msg("starting update apply failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "starting update apply failed")
	}
}

// restartImpactShell is one entry of GET /api/update/restart-impact's `shells` array
// (docs/protocol.md §3.18).
type restartImpactShell struct {
	SessionID int64   `json:"sessionId"`
	Title     *string `json:"title"`
}

type restartImpactResponse struct {
	Shells []restartImpactShell `json:"shells"`
}

// handleRestartImpact is GET /api/update/restart-impact (docs/protocol.md §3.18): every
// "muster-<n>-shell" tmux session currently alive on the daemon's socket, with the
// owning session's title (null when that session is unknown). Computed fresh from tmux
// on every request — shells have no wire representation elsewhere to cache. Independent
// of whether updates are enabled at all (the confirm dialog that calls this only appears
// when apply is possible, but the endpoint itself carries no such restriction —
// docs/protocol.md §3.18 "Errors: none beyond auth").
func (s *Server) handleRestartImpact(w http.ResponseWriter, r *http.Request) {
	names, err := s.tmuxLister.ListSessions(r.Context())
	if err != nil {
		s.log.Warn().Err(err).Msg("listing tmux sessions for restart-impact failed")
		names = nil
	}

	shells := make([]restartImpactShell, 0, len(names))
	for _, name := range names {
		id, ok := tmux.IsShellSessionName(name)
		if !ok {
			continue
		}
		var title *string
		if sess, ok := s.manager.Get(id); ok {
			title = sess.DisplayTitle()
		}
		shells = append(shells, restartImpactShell{SessionID: id, Title: title})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(restartImpactResponse{Shells: shells})
}
