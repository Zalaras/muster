package server

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"sync"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

// restartFeature restarts live sessions onto the installed Claude Code: the batch endpoint
// (kb:anchor/sessions.restart-many) and the queue that restarts a confirmed busy session the
// moment it is free. A restart is the Stop path then the Resume path on one row under one
// per-session lock; the two halves are the manager's EndLocked and the launcher's ResumeLocked.
type restartFeature struct {
	manager   *session.Manager
	launcher  *sessionLauncher
	terminals *terminalRegistry
	log       zerolog.Logger

	// queued and wake carry session ids from enqueue (any goroutine: the manager's upsert
	// callback, installedKnown's sweep) to run, the one consumer. queued is guarded by mu;
	// wake has capacity 1 so a signal is never lost and never blocks a producer.
	mu     sync.Mutex
	queued []int64
	wake   chan struct{}

	bg bgLoop
}

func newRestartFeature(manager *session.Manager, launcher *sessionLauncher, terminals *terminalRegistry, log zerolog.Logger) *restartFeature {
	return &restartFeature{manager: manager, launcher: launcher, terminals: terminals, log: log, wake: make(chan struct{}, 1)}
}

func (f *restartFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions/restart", guard(http.HandlerFunc(f.handleRestartSessions)))
}

func (f *restartFeature) Start() {
	f.bg.start(f.run)
}

func (f *restartFeature) Stop(ctx context.Context) {
	f.bg.stop(ctx, f.log, "restart queue did not stop before shutdown deadline")
}

func (f *restartFeature) installedKnown(ctx context.Context, installed *string) {
	f.manager.SetInstalledClaude(ctx, installed)
	for _, id := range f.manager.RestartDue() {
		f.enqueue(id)
	}
}

func (f *restartFeature) enqueue(id int64) {
	f.mu.Lock()
	if !slices.Contains(f.queued, id) {
		f.queued = append(f.queued, id)
	}
	f.mu.Unlock()
	select {
	case f.wake <- struct{}{}:
	default:
	}
}

func (f *restartFeature) next() (int64, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.queued) == 0 {
		return 0, false
	}
	id := f.queued[0]
	f.queued = f.queued[1:]
	return id, true
}

func (f *restartFeature) run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-f.wake:
		}
		for id, ok := f.next(); ok && ctx.Err() == nil; id, ok = f.next() {
			f.fire(context.WithoutCancel(ctx), id)
		}
	}
}

func (f *restartFeature) fire(ctx context.Context, id int64) {
	unlock := f.manager.LockSession(id)
	defer unlock()
	if !f.manager.IsRestartDue(id) {
		return
	}
	if err := f.restartLocked(ctx, id); err != nil {
		f.log.Warn().Err(err).Int64("session_id", id).Msg("queued restart failed")
	}
}

func (f *restartFeature) restartLocked(ctx context.Context, id int64) error {
	if _, err := f.manager.EndLocked(ctx, id); err != nil {
		if _, clearErr := f.manager.SetRestartPending(ctx, id, false); clearErr != nil && !errors.Is(clearErr, session.ErrUnknownSession) {
			f.log.Warn().Err(clearErr).Int64("session_id", id).Msg("clearing restart mark failed")
		}
		return err
	}
	f.terminals.closeSession(id)
	if _, lerr := f.launcher.ResumeLocked(ctx, id); lerr != nil {
		return lerr
	}
	return nil
}

func (f *restartFeature) handleRestartSessions(w http.ResponseWriter, r *http.Request) {
	ids, ok := decodeBatchRequest(w, r)
	if !ok {
		return
	}
	ctx := context.WithoutCancel(r.Context())
	result, err := f.manager.RunBatch(ids, "restarting", func(id int64) (session.BatchOutcome, error) {
		return f.restartOne(ctx, id)
	})
	if err != nil {
		writeBatchError(w, f.log, err)
		return
	}
	writeJSON(w, http.StatusOK, toWireRestartBatch(result))
}

func (f *restartFeature) restartOne(ctx context.Context, id int64) (session.BatchOutcome, error) {
	switch f.manager.ClassifyRestart(id) {
	case session.RestartQueue:
		return f.queueOne(ctx, id)
	case session.RestartNow:
		return session.BatchDone, f.restartLocked(ctx, id)
	default:
		return session.BatchSkipped, nil
	}
}

func (f *restartFeature) queueOne(ctx context.Context, id int64) (session.BatchOutcome, error) {
	_, err := f.manager.SetRestartPending(ctx, id, true)
	if errors.Is(err, session.ErrNotBehind) {
		return session.BatchSkipped, nil
	}
	return session.BatchQueued, err
}
