package server

import (
	"context"
	"errors"
	"io"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/boundedwait"
	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/usage"
)

// ingestJob is a raw, not-yet-parsed ingest post. Parsing happens in the worker, not the
// handler, so the handler can enqueue-and-200 with no DB or Claude-Code-format work on
// the request path (kb:adr/ingest-seq-assigned-at-ingest).
type ingestJob struct {
	kind claudecode.Kind
	body []byte

	// drainAck, when non-nil, marks this job as a Drain marker rather than a real post:
	// the worker closes it in place of calling process, in FIFO order behind every job
	// enqueued before Drain was called.
	drainAck chan<- struct{}
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

	// manager routes an event to its bound Muster session and feeds the kb:anchor/state state
	// machine. Nil in tests that only exercise raw persistence.
	manager *session.Manager

	// usage receives a routed status post's account sample, when present. Nil in tests
	// that only exercise raw persistence or the state machine.
	usage *usage.Aggregator

	// files receives every routed hook event's neutral claudecode.FileSignal
	// (kb:spec/reader) — never called for status posts. Nil in tests that don't
	// exercise the reader.
	files filesObserver
}

// filesObserver is ingestQueue's view of *readerFeature — narrowed to the one method
// this file calls, so tests can fake it without the whole feature.
type filesObserver interface {
	Observe(ctx context.Context, sessionID int64, claudeSessionID string, sig claudecode.FileSignal)
}

// defaultIngestQueueSize is Config.IngestQueueSize's default, applied here rather than in
// the composition root: this is the one constructor that consumes the value.
const defaultIngestQueueSize = 1024

func newIngestQueue(st *store.Store, log zerolog.Logger, size int, manager *session.Manager, files filesObserver, usageAgg *usage.Aggregator) *ingestQueue {
	if size <= 0 {
		size = defaultIngestQueueSize
	}
	return &ingestQueue{
		ch:      make(chan ingestJob, size),
		store:   st,
		log:     log,
		manager: manager,
		files:   files,
		usage:   usageAgg,
	}
}

// enqueue never blocks: a full queue drops the job, counts it, and logs — hooks are
// lossy by design (kb:fact/hook-delivery-best-effort), and Muster must never add
// backpressure onto Claude Code.
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
			if job.drainAck != nil {
				close(job.drainAck)
				continue
			}
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
	boundedwait.Wait(ctx, &q.wg, q.log, "ingest queue drain did not finish before shutdown deadline")
}

// process parses, routes and persists one job, then feeds the routed event into the kb:anchor/state
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

	// A status post never reaches Interpret/manager.Apply — it takes the ApplyStatus +
	// aggregator.Record path instead, so a status post's title/model/context refresh is
	// broadcast only on real change, never as a no-op sessionUpsert on every tool use.
	// job.kind is already the typed value ParseIngestBody classified the post as
	// (claudecode.KindStatus mints ev.Type "status_line"); comparing job.kind here instead
	// of ev.Type keeps that event-type string inside internal/claudecode (CLAUDE.md hard
	// rule).
	if job.kind == claudecode.KindStatus {
		q.processStatus(ctx, *sessionID, ev.Payload)
		return
	}

	input := claudecode.Interpret(ev.Type, ev.Payload)
	// enveloped is authoritative for binding (kb:anchor/ingest.envelope): every event
	// Muster's command wrapper posts carries the envelope, so ev.MusterSession != nil is
	// exactly "this arrived through the wrapper, trust its session_id for binding" — a
	// raw (non-enveloped) post, still accepted for the canary/legacy path, never binds.
	enveloped := ev.MusterSession != nil
	if _, err := q.manager.Apply(ctx, *sessionID, ev.SessionID, ev.PromptID, input, enveloped); err != nil {
		// session_id logged explicitly: Apply's own error (ErrUnknownSession, on the
		// common "already removed" path) carries no id of its own to print.
		q.log.Warn().Err(err).Int64("session_id", *sessionID).Str("kind", string(job.kind)).Msg("applying ingest event to session state failed")
	}

	// Runs after Apply, on this same single worker, so Observe's claudeSessionID
	// comparison sees the post-rebind binding (kb:spec/reader; see also reader.go's own
	// doc comments).
	if q.files != nil {
		q.files.Observe(ctx, *sessionID, ev.SessionID, claudecode.InterpretFiles(ev.Type, ev.Payload))
	}
}

// processStatus applies one routed status-line post: title/model/context to the session
// manager, then (only when the payload carried a complete account sample) the reading to
// the usage aggregator — sequentially, on this single ingest worker goroutine, so seq
// order and apply order stay the same thing by construction.
func (q *ingestQueue) processStatus(ctx context.Context, sessionID int64, payload []byte) {
	update := claudecode.InterpretStatus(payload)

	if _, err := q.manager.ApplyStatus(ctx, sessionID, update); err != nil {
		q.log.Warn().Err(err).Int64("session_id", sessionID).Msg("applying status update to session failed")
	}

	if update.Account == nil || q.usage == nil {
		return
	}
	// The adapter's neutral StatusAccount maps into the aggregator's Sample here — this
	// keeps internal/claudecode dependency-free of internal/usage (and transitively the
	// store). Source is left unset: the status line carries no source of its own, and
	// Aggregator.Record is the one place that fills the default — the adapter must not
	// invent Muster's own source label.
	acct := update.Account
	sample := usage.Sample{
		FiveHour: usage.Bucket{UsedPct: acct.FiveHour.UsedPct, ResetsAt: acct.FiveHour.ResetsAt},
		SevenDay: usage.Bucket{UsedPct: acct.SevenDay.UsedPct, ResetsAt: acct.SevenDay.ResetsAt},
		Model:    usage.Model{ID: acct.Model.ID, DisplayName: acct.Model.DisplayName},
	}
	if err := q.usage.Record(ctx, sample); err != nil {
		q.log.Warn().Err(err).Msg("recording usage sample failed")
	}
}

// resolveSessionID determines which Muster session (if any) ev routes to. An envelope's
// musterSession field is authoritative when present, known, and its tmuxPane
// corroborates the session's recorded pane (kb:adr/ingest-envelope-pane-must-corroborate):
// route iff the session exists && (stored pane == "" — the spawn-to-record window, "cannot
// corroborate" — || (ev.TmuxPane present && *ev.TmuxPane == stored)). Otherwise it falls
// back to the existing claude-session-id binding. An unresolved event is logged (never
// the payload) and persists with a NULL event.session_id.
func (q *ingestQueue) resolveSessionID(kind claudecode.Kind, ev claudecode.Event) *int64 {
	if q.manager == nil {
		return nil
	}
	if ev.MusterSession != nil {
		id := *ev.MusterSession
		stored, ok := q.manager.PaneOf(id)
		if !ok {
			q.log.Info().Str("kind", string(kind)).Int64("muster_session", id).
				Msg("ingest envelope named an unknown muster session; persisting unrouted")
			return nil
		}
		if stored == "" {
			return &id
		}
		envPane := ""
		if ev.TmuxPane != nil {
			envPane = *ev.TmuxPane
		}
		if envPane != "" && envPane == stored {
			return &id
		}
		q.log.Info().Str("kind", string(kind)).Int64("muster_session", id).
			Str("stored_pane", stored).Str("envelope_pane", envPane).
			Msg("ingest envelope's pane did not corroborate the session's recorded pane; persisting unrouted")
		return nil
	}
	if id, ok := q.manager.Resolve(ev.SessionID); ok {
		return &id
	}
	q.log.Info().Str("kind", string(kind)).Msg("ingest event has no bound muster session; persisting unrouted")
	return nil
}

// ingestFeature owns the two token-path ingest endpoints. Its routes are mounted
// unguarded — the ingest token, not the UI cookie, is the auth boundary here
// (kb:anchor/ingest).
type ingestFeature struct {
	queue *ingestQueue
	token string
	log   zerolog.Logger
}

func newIngestFeature(st *store.Store, size int, token string, manager *session.Manager, files filesObserver, usageAgg *usage.Aggregator, log zerolog.Logger) *ingestFeature {
	return &ingestFeature{queue: newIngestQueue(st, log, size, manager, files, usageAgg), token: token, log: log}
}

func (f *ingestFeature) mount(mux *http.ServeMux, _ func(http.Handler) http.Handler) {
	// Registered from claudecode.IngestHookPath/IngestStatusPath — the same declaration
	// WriteWrapperScripts builds the generated wrapper scripts' URLs from and
	// musterIngestPath's legacy-entry regexp matches against, so the route pattern and
	// the URL a script actually POSTs to can never drift apart.
	mux.HandleFunc("POST "+claudecode.IngestHookPath("{token}"), f.handleIngestHook)
	mux.HandleFunc("POST "+claudecode.IngestStatusPath("{token}"), f.handleIngestStatus)
}

func (f *ingestFeature) Start() { f.queue.Start() }

func (f *ingestFeature) Stop(ctx context.Context) { f.queue.Stop(ctx) }

func (f *ingestFeature) handleIngestHook(w http.ResponseWriter, r *http.Request) {
	f.handleIngest(w, r, claudecode.KindHook)
}

func (f *ingestFeature) handleIngestStatus(w http.ResponseWriter, r *http.Request) {
	f.handleIngest(w, r, claudecode.KindStatus)
}

// handleIngest is shared by both ingest endpoints (kb:adr/ingest-seq-assigned-at-ingest):
// check the token (404 on mismatch — no oracle for guessing), enqueue the raw body,
// return 200 immediately. No DB work happens on this path.
func (f *ingestFeature) handleIngest(w http.ResponseWriter, r *http.Request, kind claudecode.Kind) {
	token := r.PathValue("token")
	if !tokensEqual(token, f.token) {
		f.log.Info().Str("kind", string(kind)).Msg("rejecting ingest post with wrong token")
		w.WriteHeader(http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		// Nothing usable arrived; still ack per kb:anchor/ingest (never make Claude Code retry).
		w.WriteHeader(http.StatusOK)
		return
	}

	f.queue.enqueue(ingestJob{kind: kind, body: body})
	w.WriteHeader(http.StatusOK)
}
