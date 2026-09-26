package server

import (
	"context"
	"errors"
	"net/http"
	"os"
	"sync"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
)

// modelCatalogMaxEntries bounds one binary identity's verdict cache: a dialog open plus
// one custom model is at most 5 entries, so 64 is generous headroom — clearing the whole
// map once it's full (no LRU) is enough, since normal use never gets close.
const modelCatalogMaxEntries = 64

// modelsMaxRequested is GET /api/models' `model` parameter cap (Protocol Contract).
const modelsMaxRequested = 8

// modelVerdict is modelsFeature's own tri-state result: claudecode.ModelVerdict's two
// definite outcomes plus "unchecked" for a run that errored, timed out, or couldn't
// resolve the binary's identity — a state claudecode.ModelVerdict, being binary, cannot
// represent, and that both GET /api/models and Launch's pre-check need. Kept beside
// claudecode.ModelVerdict rather than adding "unchecked" to it, because that type is the
// package-boundary hard rule's neutral result (claudecode's own callers never see the
// catalog sentence); "unchecked" is this cache's own fail-open bookkeeping, not another
// outcome of the Claude Code check itself.
type modelVerdict int

const (
	catalogUnchecked modelVerdict = iota
	catalogRecognized
	catalogUnrecognized
)

// modelCatalogCall collapses concurrent lookups of one (identity, model) into one check
// run: whichever caller finds no entry starts the run and stores this; every other
// caller for the same key waits on done instead of starting a second one.
type modelCatalogCall struct {
	done    chan struct{}
	verdict modelVerdict
}

// modelsFeature owns GET /api/models and is the one model-catalog verdict cache both it
// and Launch's pre-check read (kb:adr/launch-model-check-cached-per-binary-identity):
// there is exactly one cache owner. Verdicts are valid only against one binary identity
// at a time: a lookup under a new identity drops every entry from the old one before
// anything is read or written, so a stale verdict can never survive a Claude Code
// update.
//
// mu guards haveIdentity, identity, generation, cached and inflight — the only fields
// any goroutine but the constructor touches.
type modelsFeature struct {
	claudeBin string
	// checkDir is the daemon-chosen directory every check runs in (Protocol Contract:
	// "not a launch directory"; kb:fact/model-catalog-precheck-zero-token — the catalog
	// is built into the binary, so the directory never feeds the verdict).
	checkDir string
	// check is CheckModel's injectable seam (docs/conventions.md § Testing, the same
	// constructor-default shape claudecode's own modelChecker.run uses) — production
	// always claudecode.CheckModel; same-package tests overwrite the field.
	check func(ctx context.Context, bin, dir, model string) (claudecode.ModelVerdict, error)
	// identify resolves claudeBin's current identity — production always
	// claudecode.ResolveBinaryIdentity; same-package tests overwrite the field to drive
	// an identity change without touching the real filesystem or $PATH.
	identify func() (claudecode.BinaryIdentity, error)
	log      zerolog.Logger

	mu           sync.Mutex
	haveIdentity bool
	identity     claudecode.BinaryIdentity
	// generation increments every time the identity changes, so a check started under a
	// now-superseded identity can tell its own result is stale and must not cache it,
	// even though the subprocess it started is already running and can't be recalled.
	generation uint64
	cached     map[string]modelVerdict
	inflight   map[string]*modelCatalogCall
}

func newModelsFeature(claudeBin string, log zerolog.Logger) *modelsFeature {
	return &modelsFeature{
		claudeBin: claudeBin,
		checkDir:  os.TempDir(),
		check:     claudecode.CheckModel,
		identify:  func() (claudecode.BinaryIdentity, error) { return claudecode.ResolveBinaryIdentity(claudeBin) },
		log:       log,
	}
}

func (f *modelsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/models", guard(http.HandlerFunc(f.handleModels)))
}

// modelVerdictWire is one entry in GET /api/models' response (kb:anchor/models.check).
type modelVerdictWire struct {
	Model   string `json:"model"`
	Verdict string `json:"verdict"`
	Message string `json:"message,omitempty"`
}

type modelsResponse struct {
	Models []modelVerdictWire `json:"models"`
}

var errModelsInvalid = errors.New("model must be given 1 to 8 times, each non-empty")

// handleModels is GET /api/models (kb:anchor/models.check): decode the query, delegate
// to the cache, encode the verdicts.
func (f *modelsFeature) handleModels(w http.ResponseWriter, r *http.Request) {
	models, err := parseModelsQuery(r.URL.Query()["model"])
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, modelsResponse{Models: f.verdicts(r.Context(), models)})
}

// parseModelsQuery validates and dedupes raw's `model` values, keeping first-seen order
// (Protocol Contract).
func parseModelsQuery(raw []string) ([]string, error) {
	seen := make(map[string]bool, len(raw))
	models := make([]string, 0, len(raw))
	for _, m := range raw {
		if m == "" {
			return nil, errModelsInvalid
		}
		if seen[m] {
			continue
		}
		seen[m] = true
		models = append(models, m)
	}
	if len(models) == 0 || len(models) > modelsMaxRequested {
		return nil, errModelsInvalid
	}
	return models, nil
}

// verdicts answers every model in models, one goroutine each so uncached checks run
// concurrently — four cold checks cost about one check's wall time, not four.
func (f *modelsFeature) verdicts(ctx context.Context, models []string) []modelVerdictWire {
	out := make([]modelVerdictWire, len(models))
	var wg sync.WaitGroup
	wg.Add(len(models))
	for i, model := range models {
		go func(i int, model string) {
			defer wg.Done()
			out[i] = wireVerdict(model, f.verdict(ctx, model))
		}(i, model)
	}
	wg.Wait()
	return out
}

func wireVerdict(model string, v modelVerdict) modelVerdictWire {
	w := modelVerdictWire{Model: model}
	switch v {
	case catalogRecognized:
		w.Verdict = "recognized"
	case catalogUnrecognized:
		w.Verdict = "unrecognized"
		w.Message = modelUnrecognizedMessage(model)
	default:
		w.Verdict = "unchecked"
	}
	return w
}

// verdict answers one model, sharing the run with any other concurrent caller for the
// same (identity, model) and caching a definite result against the resolved binary's
// identity. An identity that can't be resolved, or a check that errors or times out,
// answers catalogUnchecked without ever touching the cache — Launch's own pre-check then
// fails open exactly as before.
//
// A joiner never lets the leader's ctx decide its own answer: the shared run itself is
// started on context.WithoutCancel(ctx) (bounded by CheckModel's own timeout regardless),
// so a leader whose request goes away — a page reload during the dialog's cold check —
// can't cut a run other live callers are waiting on. A joiner still respects its own ctx
// while it waits: cancelling that ctx answers catalogUnchecked instead of hanging until
// the leader's run completes, rather than adopting an answer that outlives the caller
// that asked for it.
func (f *modelsFeature) verdict(ctx context.Context, model string) modelVerdict {
	id, err := f.identify()
	if err != nil {
		f.log.Warn().Err(err).Str("bin", f.claudeBin).Msg("resolving claude binary identity failed; model check unchecked")
		return catalogUnchecked
	}

	f.mu.Lock()
	if !f.haveIdentity || f.identity != id {
		f.identity = id
		f.haveIdentity = true
		f.generation++
		f.cached = make(map[string]modelVerdict)
		f.inflight = make(map[string]*modelCatalogCall)
	}
	generation := f.generation
	if v, ok := f.cached[model]; ok {
		f.mu.Unlock()
		return v
	}
	if call, ok := f.inflight[model]; ok {
		f.mu.Unlock()
		select {
		case <-call.done:
			return call.verdict
		case <-ctx.Done():
			return catalogUnchecked
		}
	}
	call := &modelCatalogCall{done: make(chan struct{})}
	f.inflight[model] = call
	f.mu.Unlock()

	verdict, runErr := f.runCheck(context.WithoutCancel(ctx), model)
	call.verdict = verdict

	f.mu.Lock()
	// Only remove this call's own entry: by the time this run finishes, a later
	// lookup may already have reset the maps under a new generation (a Claude Code
	// update mid-check) and registered its own inflight call for the same model — this
	// generation's call is no longer the one f.inflight[model] names, so it must leave
	// that newer call alone rather than delete it out from under its own waiters.
	if f.inflight[model] == call {
		delete(f.inflight, model)
	}
	if runErr == nil && f.generation == generation {
		if len(f.cached) >= modelCatalogMaxEntries {
			f.cached = make(map[string]modelVerdict)
		}
		f.cached[model] = verdict
	}
	f.mu.Unlock()
	close(call.done)
	return verdict
}

// runCheck runs the zero-token pre-check for model in f.checkDir, translating
// claudecode's neutral verdict/error into modelVerdict. A run error is logged at warn
// without the stderr body — that sentence stays inside internal/claudecode.
func (f *modelsFeature) runCheck(ctx context.Context, model string) (modelVerdict, error) {
	v, err := f.check(ctx, f.claudeBin, f.checkDir, model)
	if err != nil {
		f.log.Warn().Err(err).Str("model", model).Msg("model-catalog check failed; unchecked")
		return catalogUnchecked, err
	}
	if v == claudecode.ModelUnrecognised {
		return catalogUnrecognized, nil
	}
	return catalogRecognized, nil
}
