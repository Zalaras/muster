package server

import (
	"context"
	"errors"
	"io"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

// ingestJob is a raw, not-yet-parsed ingest post. Parsing happens in the worker, not the
// handler, so the handler can enqueue-and-200 with no DB or Claude-Code-format work on
// the request path (REQ-10).
type ingestJob struct {
	kind claudecode.Kind
	body []byte
}

// ingestQueue is the bounded, best-effort ingest pipeline (Implementation Notes: "Async
// ingest shape"). A single worker goroutine processes jobs in arrival order, so seq
// assignment (done inside Store.InsertEvent) never races with itself.
type ingestQueue struct {
	ch      chan ingestJob
	store   *store.Store
	log     zerolog.Logger
	dropped atomic.Int64
	wg      sync.WaitGroup
}

func newIngestQueue(st *store.Store, log zerolog.Logger, size int) *ingestQueue {
	return &ingestQueue{
		ch:    make(chan ingestJob, size),
		store: st,
		log:   log,
	}
}

// enqueue never blocks: a full queue drops the job, counts it, and logs — hooks are
// lossy by design, and Muster must never add backpressure onto Claude Code (REQ-23).
func (q *ingestQueue) enqueue(job ingestJob) {
	select {
	case q.ch <- job:
	default:
		n := q.dropped.Add(1)
		q.log.Warn().Int64("dropped_total", n).Str("kind", string(job.kind)).Msg("ingest queue full; dropping event")
	}
}

func (q *ingestQueue) Start() {
	q.wg.Add(1)
	go func() {
		defer q.wg.Done()
		for job := range q.ch {
			q.process(job)
		}
	}()
}

// Stop closes the queue and waits for the worker to drain it (REQ-20), giving up once
// ctx is done. Draining itself always runs against a background context: a job that
// made it into the channel deserves to be persisted even after the shutdown deadline
// starts ticking.
func (q *ingestQueue) Stop(ctx context.Context) {
	close(q.ch)
	done := make(chan struct{})
	go func() {
		q.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		q.log.Warn().Msg("ingest queue drain did not finish before shutdown deadline")
	}
}

// process parses and persists one job. Never logs job.body — hook/status payloads carry
// prompt text and must never reach a log (REQ-13, D11).
func (q *ingestQueue) process(job ingestJob) {
	ev, err := claudecode.ParseIngestBody(job.body, job.kind)
	if err != nil {
		if errors.Is(err, claudecode.ErrNoSessionID) {
			q.log.Info().Str("kind", string(job.kind)).Msg("dropping ingest post with no usable session_id")
		} else {
			q.log.Info().Str("kind", string(job.kind)).Msg("dropping unparseable ingest post")
		}
		return
	}

	if err := q.store.InsertEvent(context.Background(), store.Event{
		ClaudeSessionID: ev.SessionID,
		Type:            ev.Type,
		PromptID:        ev.PromptID,
		ToolUseID:       ev.ToolUseID,
		MusterSession:   ev.MusterSession,
		TmuxPane:        ev.TmuxPane,
		Payload:         ev.Payload,
	}); err != nil {
		q.log.Error().Err(err).Str("kind", string(job.kind)).Msg("failed to persist ingest event")
	}
}

func (s *Server) handleIngestHook(w http.ResponseWriter, r *http.Request) {
	s.handleIngest(w, r, claudecode.KindHook)
}

func (s *Server) handleIngestStatus(w http.ResponseWriter, r *http.Request) {
	s.handleIngest(w, r, claudecode.KindStatus)
}

// handleIngest is shared by both ingest endpoints (REQ-10, REQ-11): check the token
// (404 on mismatch — no oracle for guessing, REQ-13/Edge Case 8), enqueue the raw body,
// return 200 immediately. No DB work happens on this path.
func (s *Server) handleIngest(w http.ResponseWriter, r *http.Request, kind claudecode.Kind) {
	token := r.PathValue("token")
	if !tokensEqual(token, s.ingestToken) {
		s.log.Info().Str("kind", string(kind)).Msg("rejecting ingest post with wrong token")
		w.WriteHeader(http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		// Nothing usable arrived; still ack per protocol §4 (never make Claude Code retry).
		w.WriteHeader(http.StatusOK)
		return
	}

	s.ingest.enqueue(ingestJob{kind: kind, body: body})
	w.WriteHeader(http.StatusOK)
}
