package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/selfupdate"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

// UpdateConfig groups auto-update's checker/apply config. BaseURL empty means no
// updateManager is constructed at all (mirrors UsageConfig's
// nil-when-disabled shape) — a zero-value Config must never reach github.com.
type UpdateConfig struct {
	// BaseURL is the GitHub Releases base URL; "" disables checking and apply entirely.
	BaseURL string
	// CheckInterval is how often the daemon re-checks for a newer release.
	CheckInterval time.Duration
	// PublicKey is the minisign public key file's raw bytes verification trusts
	// (overrides the embedded selfupdate.PublicKey() — a test seam; production always
	// passes the embedded key).
	PublicKey []byte
	// Install is the startup install classification (selfupdate.Classify), computed
	// once in cmd/musterd from the resolved executable path. installer/unmanaged are
	// re-derived at the start of every check by the Reclassify closure below, from
	// exePath/home/the write probe, not from this field; Install only decides whether
	// that re-derivation runs (dev/homebrew stay fixed for the daemon's life).
	Install selfupdate.Install
	// ExePath is the resolved (os.Executable + filepath.EvalSymlinks) real path of the
	// running binary — where an apply installs the new one and what swap detection stats.
	ExePath string
	// Reclassify re-derives installer/unmanaged (kb:adr/update-install-rechecked-on-every-check),
	// built in cmd/musterd from the same exePath/home/access inputs that produced Install.
	// Nil (every test daemon that doesn't exercise reclassification) means installer/
	// unmanaged never change after startup.
	Reclassify func() selfupdate.Install
}

// updateFeature owns auto-update's two endpoints and the snapshot's update object. It is
// always registered, even when updates are disabled — internally um is nil and every
// method answers exactly as a disabled daemon does today (the same nil-when-disabled
// shape as usageFeature, applied at the feature boundary this time).
type updateFeature struct {
	install       selfupdate.Install
	daemonVersion string
	um            *updateManager // nil when UpdateConfig.BaseURL == ""
	sessions      *session.Manager
	log           zerolog.Logger
}

// newUpdateFeature builds the feature. httpClient is the daemon's one shared HTTP client
// (New defaults it once, since usage/issue/update all need the same default). store is
// read once, here, for the persisted prefs.updateCheck value at daemon startup — update's
// own concern, not New's: prefsFeature takes this feature as its checkEnabledSetter (see
// prefs.go's doc comment), never the reverse, so there is no cycle to sequence around.
func newUpdateFeature(cfg UpdateConfig, httpClient *http.Client, daemonVersion string, store *store.Store, sessions *session.Manager, hub *wsHub, log zerolog.Logger) *updateFeature {
	f := &updateFeature{install: cfg.Install, daemonVersion: daemonVersion, sessions: sessions, log: log}
	if cfg.BaseURL != "" {
		pubKey := cfg.PublicKey
		if len(pubKey) == 0 {
			pubKey = selfupdate.PublicKey()
		}
		f.um = newUpdateManager(updateManagerConfig{
			Client:       httpClient,
			Base:         cfg.BaseURL,
			Interval:     cfg.CheckInterval,
			PubKey:       pubKey,
			Install:      cfg.Install,
			Running:      daemonVersion,
			ExePath:      cfg.ExePath,
			CheckEnabled: loadPrefs(context.Background(), store).UpdateCheck,
			Log:          log,
			OnChange: func(u UpdateInfo) {
				hub.broadcast(updateMessage{Type: "update", Update: u})
			},
			Reclassify: cfg.Reclassify,
		})
	}
	return f
}

func (f *updateFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/update/check", guard(http.HandlerFunc(f.handleCheckUpdate)))
	mux.Handle("POST /api/update/apply", guard(http.HandlerFunc(f.handleApplyUpdate)))
	mux.Handle("GET /api/update/restart-impact", guard(http.HandlerFunc(f.handleRestartImpact)))
}

func (f *updateFeature) Start() {
	if f.um != nil {
		f.um.Start()
	}
}

func (f *updateFeature) Stop(ctx context.Context) {
	if f.um != nil {
		f.um.Stop(ctx)
	}
}

// SetCheckEnabled satisfies prefsFeature's checkEnabledSetter. A no-op when updates are
// disabled entirely.
func (f *updateFeature) SetCheckEnabled(enabled bool) {
	if f.um != nil {
		f.um.SetCheckEnabled(enabled)
	}
}

// current returns the live `update` object (kb:anchor/ws.update): the manager's own
// state when updates are enabled, or a static shape reflecting the fixed install
// classification when they are not — either way it always names the true install kind.
func (f *updateFeature) current() UpdateInfo {
	if f.um != nil {
		return f.um.Current()
	}
	return buildUpdateInfo(f.install, f.daemonVersion, false, nil, nil, nil, UpdateApplyInfo{Phase: string(selfupdate.PhaseIdle)})
}

func (f *updateFeature) contribute(_ context.Context, snap *Snapshot) {
	snap.Update = f.current()
}

// restartRequestsChan backs Server.RestartRequests: a nil channel when updates are
// disabled, which a select simply never fires on.
func (f *updateFeature) restartRequestsChan() <-chan struct{} {
	if f.um == nil {
		return nil
	}
	return f.um.restartRequests
}

// handleCheckUpdate is POST /api/update/check (kb:anchor/update.check): performs one
// release check synchronously, on the same code path as the periodic tick, and returns
// the resulting update object. Runs regardless of prefs.updateCheck, which governs only
// the daemon's own automatic schedule
// (kb:adr/update-check-pref-governs-automatic-checking-only) — canCheck false is the
// only reason this 404s.
func (f *updateFeature) handleCheckUpdate(w http.ResponseWriter, r *http.Request) {
	if f.um == nil || f.um.installKind() == selfupdate.KindDev {
		writeJSONError(w, http.StatusNotFound, "not_found", "update checking is not available for this install")
		return
	}

	switch err := f.um.checkAvailability(r.Context(), true); {
	case err == nil:
		writeJSON(w, http.StatusOK, f.um.Current())
	case errors.Is(err, errShuttingDown):
		writeJSONError(w, http.StatusConflict, "shutting_down", "musterd is shutting down")
	default:
		writeJSONError(w, http.StatusBadGateway, "check_failed", selfupdate.DescribeCheckFailure(err))
	}
}

// applyUpdateRequest is POST /api/update/apply's request body (kb:anchor/update.apply).
// The body itself is optional — an absent/empty body means restart:false.
type applyUpdateRequest struct {
	Restart bool `json:"restart"`
}

// handleApplyUpdate is POST /api/update/apply (kb:anchor/update.apply).
func (f *updateFeature) handleApplyUpdate(w http.ResponseWriter, r *http.Request) {
	if f.um == nil || f.um.installKind() == selfupdate.KindDev {
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
	switch err := f.um.RequestApply(applyCtx, req.Restart); {
	case err == nil:
		w.WriteHeader(http.StatusAccepted)
	case errors.Is(err, errUpdateUnsupported):
		writeJSONError(w, http.StatusConflict, "update_unsupported", f.um.Remedy())
	case errors.Is(err, errNothingToApply):
		writeJSONError(w, http.StatusConflict, "nothing_to_apply", "no newer release is known")
	case errors.Is(err, errShuttingDown):
		writeJSONError(w, http.StatusConflict, "shutting_down", "musterd is shutting down")
	default:
		f.log.Warn().Err(err).Msg("starting update apply failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
	}
}

// restartImpactShell is one entry of GET /api/update/restart-impact's `shells` array
// (kb:anchor/update.restart-impact).
type restartImpactShell struct {
	SessionID int64   `json:"sessionId"`
	Title     *string `json:"title"`
}

type restartImpactResponse struct {
	Shells []restartImpactShell `json:"shells"`
}

// handleRestartImpact is GET /api/update/restart-impact (kb:anchor/update.restart-impact): every
// "muster-<n>-shell" tmux session currently alive on the daemon's socket, with the
// owning session's title (null when that session is unknown). Computed fresh from tmux
// on every request — shells have no wire representation elsewhere to cache. Independent
// of whether updates are enabled at all (the confirm dialog that calls this only appears
// when apply is possible, but the endpoint itself carries no such restriction —
// kb:anchor/update.restart-impact "Errors: none beyond auth").
func (f *updateFeature) handleRestartImpact(w http.ResponseWriter, r *http.Request) {
	shells, err := restartImpactShells(r.Context(), f.sessions)
	if err != nil {
		f.log.Warn().Err(err).Msg("listing tmux sessions for restart-impact failed")
		shells = []restartImpactShell{}
	}
	writeJSON(w, http.StatusOK, restartImpactResponse{Shells: shells})
}

// restartImpactShells is handleRestartImpact's domain call (docs/conventions.md § Go
// "handlers decode, delegate, encode"): every muster-<n>-shell tmux session on the
// socket, each paired with its owning session's title. session.Manager.ShellNames is the
// one place that lists shell sessions on the socket — ShellCount and KillAllShells
// already ask it, so restart-impact's dialog and the on-exit prompt can never disagree
// about which shells exist.
func restartImpactShells(ctx context.Context, sessions *session.Manager) ([]restartImpactShell, error) {
	names, err := sessions.ShellNames(ctx)
	if err != nil {
		return nil, err
	}
	shells := make([]restartImpactShell, 0, len(names))
	for _, name := range names {
		id, ok := tmux.IsShellSessionName(name)
		if !ok {
			continue
		}
		var title *string
		if sess, ok := sessions.Get(id); ok {
			title = sess.DisplayTitle()
		}
		shells = append(shells, restartImpactShell{SessionID: id, Title: title})
	}
	return shells, nil
}
