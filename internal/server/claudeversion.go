package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
)

// claudeVersionTimeout bounds one `claude --version` run: the first run of a newly written
// binary costs ~11 s on macOS (kb:fact/new-claude-binary-first-run-slow-on-macos).
const claudeVersionTimeout = 30 * time.Second

type ClaudeVersionConfig struct {
	Poll time.Duration
}

type ClaudeCodeInfo struct {
	Installed *string
	Floor     string
	Verified  string
	Status    string
}

func (c ClaudeCodeInfo) equal(o ClaudeCodeInfo) bool {
	if (c.Installed == nil) != (o.Installed == nil) {
		return false
	}
	if c.Installed != nil && *c.Installed != *o.Installed {
		return false
	}
	return c.Floor == o.Floor && c.Verified == o.Verified && c.Status == o.Status
}

func claudeCodeInfoOf(report claudecode.VersionReport) ClaudeCodeInfo {
	return ClaudeCodeInfo{
		Installed: report.Installed,
		Floor:     report.Floor,
		Verified:  report.Verified,
		Status:    string(report.Status),
	}
}

func notCheckedClaudeCode() ClaudeCodeInfo {
	floor, verified := claudecode.RangeOf(claudecode.ObservedVersions())
	return ClaudeCodeInfo{Floor: floor, Verified: verified, Status: string(claudecode.StatusUnknown)}
}

type claudeCodeMessage struct {
	Type       string         `json:"type"`
	ClaudeCode claudeCodeWire `json:"claudeCode"`
}

type claudeVersionFeature struct {
	interval  time.Duration
	identify  func() (claudecode.BinaryIdentity, error)
	check     func(ctx context.Context) claudecode.VersionReport
	broadcast func(ClaudeCodeInfo)
	log       zerolog.Logger

	mu      sync.RWMutex
	current ClaudeCodeInfo

	// seen and haveSeen belong to the loop goroutine alone.
	seen       claudecode.BinaryIdentity
	haveSeen   bool
	unresolved bool

	bg bgLoop
}

func newClaudeVersionFeature(cfg ClaudeVersionConfig, bin string, hub *wsHub, log zerolog.Logger) *claudeVersionFeature {
	return &claudeVersionFeature{
		interval: cfg.Poll,
		identify: func() (claudecode.BinaryIdentity, error) { return claudecode.ResolveBinaryIdentity(bin) },
		check:    func(ctx context.Context) claudecode.VersionReport { return claudecode.CheckVersion(ctx, bin) },
		broadcast: func(info ClaudeCodeInfo) {
			hub.broadcast(claudeCodeMessage{Type: "claudeCode", ClaudeCode: claudeCodeWire(info)})
		},
		log:     log,
		current: notCheckedClaudeCode(),
	}
}

func (f *claudeVersionFeature) mount(_ *http.ServeMux, _ func(http.Handler) http.Handler) {}

func (f *claudeVersionFeature) Start() {
	if f.interval <= 0 {
		return
	}
	f.bg.start(func(ctx context.Context) { runTicked(ctx, f.interval, nil, f.tick) })
}

func (f *claudeVersionFeature) Stop(ctx context.Context) {
	f.bg.stop(ctx, f.log, "claude version watch did not stop before shutdown deadline")
}

func (f *claudeVersionFeature) Current() ClaudeCodeInfo {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.current
}

// tick looks at the binary's identity and runs one check when it is not the one last
// checked. An identity that cannot be resolved (no claude on PATH, a bad -claude-bin, an
// update mid-swap) runs nothing and keeps the held value; it is logged once per
// unresolved stretch and the next tick looks again. The identity is recorded before the
// check so a binary that changes while it runs is seen again by the next tick.
func (f *claudeVersionFeature) tick(ctx context.Context) {
	id, err := f.identify()
	if err != nil {
		if !f.unresolved {
			f.unresolved = true
			logUnresolvedClaudeCode(f.log, f.Current(), err)
		}
		return
	}
	f.unresolved = false
	if f.haveSeen && id == f.seen {
		return
	}
	f.seen, f.haveSeen = id, true

	checkCtx, cancel := context.WithTimeout(ctx, claudeVersionTimeout)
	report := f.check(checkCtx)
	cancel()
	if ctx.Err() != nil {
		return
	}
	logClaudeCodeReport(f.log, report)

	info := claudeCodeInfoOf(report)
	f.mu.Lock()
	changed := !f.current.equal(info)
	if changed {
		f.current = info
	}
	f.mu.Unlock()
	if changed {
		f.broadcast(info)
	}
}

func logUnresolvedClaudeCode(log zerolog.Logger, held ClaudeCodeInfo, err error) {
	event := log.Warn().
		Str("floor", held.Floor).
		Str("verified", held.Verified).
		Str("status", held.Status).
		Err(err)
	if held.Installed != nil {
		event = event.Str("installed", *held.Installed)
	}
	event.Msg("could not resolve the claude binary; keeping the last claude code version result")
}

func logClaudeCodeReport(log zerolog.Logger, report claudecode.VersionReport) {
	event := log.Info()
	msg := "claude code version is within the verified range"
	switch report.Status {
	case claudecode.StatusVerified:
	case claudecode.StatusAbove:
		event = log.Warn()
		msg = "claude code version is newer than any version Muster has been tested with; behaviour past the verified range is best-effort (run make canary to verify it)"
	case claudecode.StatusBelow:
		event = log.Warn()
		msg = "claude code version is older than any version Muster has been tested with; behaviour is best-effort — update Claude Code"
	case claudecode.StatusUnknown:
		event = log.Warn()
		msg = "could not determine claude code version"
	}
	event = event.
		Str("floor", report.Floor).
		Str("verified", report.Verified).
		Str("status", string(report.Status)).
		Err(report.Err)
	if report.Installed != nil {
		event = event.Str("installed", *report.Installed)
	}
	event.Msg(msg)
}
