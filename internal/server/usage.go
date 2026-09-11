package server

import (
	"context"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/usage"
)

// UsageConfig groups the per-model usage poller's config (plan code-breakup REQ-7). Poll
// <= 0 means the poller is never constructed at all — a zero-value Config never reaches
// api.anthropic.com or the Keychain (Edge Case 14, REQ-10).
type UsageConfig struct {
	// Poll is the poll interval. <= 0 disables polling entirely: POST /api/usage/refresh
	// then 404s (kb:anchor/usage.refresh).
	Poll time.Duration
	// APIURL is the per-model usage endpoint's base URL. main always passes the flag's
	// non-empty default, so this is the *only* place that URL is defined — there is
	// deliberately no fallback constant here duplicating it. Empty disables the poller
	// entirely (same fail-safe shape as Poll <= 0).
	APIURL string
	// TokenFile, when non-empty, reads the Claude Code OAuth token from this file
	// instead of the macOS Keychain — a test seam that makes it structurally impossible
	// for a test using it to fall through to the real Keychain.
	TokenFile string
	// KeychainUser is the account name `security` looks the Keychain item up under
	// (main passes os/user.Current()'s value) — used only when TokenFile is empty.
	KeychainUser string
}

// usageFeature owns both usage sources — the status-line Aggregator (fed by the ingest
// worker) and the per-model poller — plus POST /api/usage/refresh and the snapshot's
// usage object (plan code-breakup REQ-6).
type usageFeature struct {
	aggregator  *usage.Aggregator
	modelScoped *usage.ModelScoped
	poller      *usagePoller // nil when UsageConfig.Poll <= 0 (Edge Case 14)
}

func newUsageFeature(cfg UsageConfig, httpClient *http.Client, st *store.Store, hub *wsHub, log zerolog.Logger) *usageFeature {
	f := &usageFeature{}

	f.aggregator = usage.NewAggregator(usage.Config{
		Store:  st,
		Logger: log,
		OnChange: func(snap usage.Snapshot) {
			hub.broadcast(usageMessage{Type: "usage", Usage: toWireUsage(snap, f.modelScoped.Current())})
		},
	})

	// ModelScoped is always constructed, independent of whether the poller runs
	// (Edge Case 14): Poll <= 0 still needs a holder so the wire's modelScoped* fields
	// render their honest null/"subscription-api" shape.
	f.modelScoped = usage.NewModelScoped(usage.ModelScopedConfig{
		Store:  st,
		Logger: log,
		OnChange: func(msnap usage.ModelSnapshot) {
			hub.broadcast(usageMessage{Type: "usage", Usage: toWireUsage(f.aggregator.Current(), msnap)})
		},
	})

	switch {
	case cfg.Poll > 0 && cfg.APIURL != "":
		client := httpClient
		if client == nil {
			client = http.DefaultClient
		}
		var tokenReader claudecode.TokenReader
		if cfg.TokenFile != "" {
			tokenReader = claudecode.FileTokenReader(cfg.TokenFile)
		} else {
			tokenReader = claudecode.KeychainTokenReader(cfg.KeychainUser, claudecode.RunCommand)
		}
		f.poller = newUsagePoller(client, cfg.APIURL, tokenReader, cfg.Poll, f.modelScoped, log)
	case cfg.Poll > 0:
		// Misconfiguration, not a code path main.go can ever hit (it always passes the
		// flag's non-empty default): fail toward no polling rather than toward a silent
		// default that would reach the real api.anthropic.com/Keychain.
		log.Warn().Msg("usage polling requested (-usage-poll > 0) but UsageAPIURL is empty; usage polling disabled")
	}

	return f
}

func (f *usageFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/usage/refresh", guard(http.HandlerFunc(f.handleUsageRefresh)))
}

func (f *usageFeature) Start() {
	if f.poller != nil {
		f.poller.Start()
	}
}

func (f *usageFeature) Stop(ctx context.Context) {
	if f.poller != nil {
		f.poller.Stop(ctx)
	}
}

func (f *usageFeature) contribute(_ context.Context, snap *Snapshot) {
	snap.Usage = toWireUsage(f.aggregator.Current(), f.modelScoped.Current())
}

// handleUsageRefresh is POST /api/usage/refresh (kb:anchor/usage.refresh): wakes the
// per-model usage poller for an immediate fetch, coalesced server-side by usagePoller
// itself. 404 not_found when polling is disabled (Poll <= 0 — the poller was never
// constructed, Edge Case 14).
func (f *usageFeature) handleUsageRefresh(w http.ResponseWriter, _ *http.Request) {
	if f.poller == nil {
		writeJSONError(w, http.StatusNotFound, "not_found", "usage polling is disabled")
		return
	}
	f.poller.Refresh()
	w.WriteHeader(http.StatusAccepted)
}
