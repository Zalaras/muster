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
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/usage"
)

// ingestJob is a raw, not-yet-parsed ingest post. Parsing happens in the worker, not the
// handler, so the handler can enqueue-and-200 with no DB or Claude-Code-format work on
// the request path (REQ-10).
type ingestJob struct {
	kind claudecode.Kind
	body []byte
}

// ingestQueue is the bounded, best-effort ingest pipeline. A single worker goroutine
// processes jobs in arrival order, so seq assignment (done inside Store.InsertEvent)
// never races with itself.
type ingestQueue struct {
	ch      chan ingestJob
	store   *store.Store
	log     zerolog.Logger
	dropped atomic.Int64
	wg      sync.WaitGroup

	// manager routes an event to its bound Muster session and feeds the §7 state
	// machine. Nil in tests that only exercise raw persistence.
	manager *session.Manager

	// usage receives a routed status post's account sample, when present. Nil in tests
	// that only exercise raw persistence or the state machine.
	usage *usage.Aggregator
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

// Stop closes the queue and waits for the worker to drain it, giving up once ctx is
// done. Draining itself always runs against a background context: a job that made it
// into the channel deserves to be persisted even after the shutdown deadline starts
// ticking.
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

// process parses, routes and persists one job, then feeds the routed event into the §7
// state machine ("parse → persist (with routing) → feed the manager, sequentially, so
// seq order and apply order are the same thing by construction"). Never logs job.body —
// hook/status payloads carry prompt text and must never reach a log.
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

	sessionID := q.resolveSessionID(job.kind, ev)

	ctx := context.Background()
	if err := q.store.InsertEvent(ctx, store.Event{
		ClaudeSessionID: ev.SessionID,
		Type:            ev.Type,
		PromptID:        ev.PromptID,
		ToolUseID:       ev.ToolUseID,
		MusterSession:   ev.MusterSession,
		TmuxPane:        ev.TmuxPane,
		Payload:         ev.Payload,
		SessionID:       sessionID,
	}); err != nil {
		q.log.Error().Err(err).Str("kind", string(job.kind)).Msg("failed to persist ingest event")
		return
	}

	if sessionID == nil || q.manager == nil {
		return
	}

	// status_line never reaches Interpret/manager.Apply — it takes the ApplyStatus +
	// aggregator.Record path instead, so a status post's title/model/context refresh is
	// broadcast only on real change, never as a no-op sessionUpsert on every tool use.
	if ev.Type == "status_line" {
		q.processStatus(ctx, *sessionID, ev.Payload)
		return
	}

	input := claudecode.Interpret(ev.Type, ev.Payload)
	// enveloped is authoritative for binding (docs/protocol.md §4.2): every event
	// Muster's command wrapper posts carries the envelope, so ev.MusterSession != nil is
	// exactly "this arrived through the wrapper, trust its session_id for binding" — a
	// raw (non-enveloped) post, still accepted for the canary/legacy path, never binds.
	enveloped := ev.MusterSession != nil
	if _, err := q.manager.Apply(ctx, *sessionID, ev.SessionID, ev.PromptID, input, enveloped); err != nil {
		q.log.Warn().Err(err).Str("kind", string(job.kind)).Msg("applying ingest event to session state failed")
	}
}

// processStatus applies one routed status-line post: title/model/context to the session
// manager, then (only when the payload carried a complete account sample) the reading to
// the usage aggregator — sequentially, on this single ingest worker goroutine, so seq
// order and apply order stay the same thing by construction.
func (q *ingestQueue) processStatus(ctx context.Context, sessionID int64, payload []byte) {
	update := claudecode.InterpretStatus(payload)

	if _, err := q.manager.ApplyStatus(ctx, sessionID, update); err != nil {
		q.log.Warn().Err(err).Msg("applying status update to session failed")
	}

	if update.Account == nil || q.usage == nil {
		return
	}
	// The adapter's neutral StatusAccount maps into the aggregator's Sample here — this
	// keeps internal/claudecode dependency-free of internal/usage (and transitively the
	// store).
	acct := update.Account
	sample := usage.Sample{
		FiveHour: usage.Bucket{UsedPct: acct.FiveHour.UsedPct, ResetsAt: acct.FiveHour.ResetsAt},
		SevenDay: usage.Bucket{UsedPct: acct.SevenDay.UsedPct, ResetsAt: acct.SevenDay.ResetsAt},
		Model:    usage.Model{ID: acct.Model.ID, DisplayName: acct.Model.DisplayName},
		Source:   acct.Source,
	}
	if err := q.usage.Record(ctx, sample); err != nil {
		q.log.Warn().Err(err).Msg("recording usage sample failed")
	}
}

// resolveSessionID determines which Muster session (if any) ev routes to. An envelope's
// musterSession field is authoritative when present and known (a stale/unknown value is
// never trusted); otherwise it falls back to the existing claude-session-id binding. An
// unresolved event is logged (never the payload) and persists with a NULL
// event.session_id.
func (q *ingestQueue) resolveSessionID(kind claudecode.Kind, ev claudecode.Event) *int64 {
	if q.manager == nil {
		return nil
	}
	if ev.MusterSession != nil {
		if q.manager.Exists(*ev.MusterSession) {
			id := *ev.MusterSession
			return &id
		}
		q.log.Info().Str("kind", string(kind)).Int64("muster_session", *ev.MusterSession).
			Msg("ingest envelope named an unknown muster session; persisting unrouted")
		return nil
	}
	if id, ok := q.manager.Resolve(ev.SessionID); ok {
		return &id
	}
	q.log.Info().Str("kind", string(kind)).Msg("ingest event has no bound muster session; persisting unrouted")
	return nil
}

// ingestFeature owns the two token-path ingest endpoints (plan code-breakup REQ-6). Its
// routes are mounted unguarded — the ingest token, not the UI cookie, is the auth
// boundary here (docs/protocol.md §4).
type ingestFeature struct {
	queue *ingestQueue
	token string
	log   zerolog.Logger
}

func newIngestFeature(st *store.Store, log zerolog.Logger, size int, token string) *ingestFeature {
	return &ingestFeature{queue: newIngestQueue(st, log, size), token: token, log: log}
}

func (f *ingestFeature) mount(mux *http.ServeMux, _ func(http.Handler) http.Handler) {
	mux.HandleFunc("POST /ingest/{token}/hook", f.handleIngestHook)
	mux.HandleFunc("POST /ingest/{token}/status", f.handleIngestStatus)
}

func (f *ingestFeature) Start() { f.queue.Start() }

func (f *ingestFeature) Stop(ctx context.Context) { f.queue.Stop(ctx) }

func (f *ingestFeature) handleIngestHook(w http.ResponseWriter, r *http.Request) {
	f.handleIngest(w, r, claudecode.KindHook)
}

func (f *ingestFeature) handleIngestStatus(w http.ResponseWriter, r *http.Request) {
	f.handleIngest(w, r, claudecode.KindStatus)
}

// handleIngest is shared by both ingest endpoints (REQ-10, REQ-11): check the token
// (404 on mismatch — no oracle for guessing), enqueue the raw body, return 200
// immediately. No DB work happens on this path.
func (f *ingestFeature) handleIngest(w http.ResponseWriter, r *http.Request, kind claudecode.Kind) {
	token := r.PathValue("token")
	if !tokensEqual(token, f.token) {
		f.log.Info().Str("kind", string(kind)).Msg("rejecting ingest post with wrong token")
		w.WriteHeader(http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		// Nothing usable arrived; still ack per protocol §4 (never make Claude Code retry).
		w.WriteHeader(http.StatusOK)
		return
	}

	f.queue.enqueue(ingestJob{kind: kind, body: body})
	w.WriteHeader(http.StatusOK)
}
