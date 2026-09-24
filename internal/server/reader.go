package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/gitutil"
	"github.com/Zalaras/muster/internal/reader"
	"github.com/Zalaras/muster/internal/session"
)

// maxReaderFileBytes is the reader's serving cap (kb:spec/reader): 10 MiB, exactly.
const maxReaderFileBytes = 10 * 1024 * 1024

// readerManager is readerFeature's view of *session.Manager — narrowed to what this
// feature calls, so tests can fake it without the whole manager.
type readerManager interface {
	Get(id int64) (*session.Session, bool)
	SetTranscript(ctx context.Context, id int64, claudeSessionID, path string) (bool, error)
	MarkPlanWritten(ctx context.Context, id int64, claudeSessionID, expectedPath string) (*session.Session, bool, error)
	ApplyPlanScan(ctx context.Context, id int64, claudeSessionID, foundPath string) (*session.Session, bool, error)
}

// readerFeature owns the reader's two GETs and the docChanged/plan-scan side effects.
// No route here ever mutates a file — the reader is read-only by construction
// (kb:spec/reader).
type readerFeature struct {
	manager  readerManager
	hub      *wsHub
	log      zerolog.Logger
	gitFiles reader.ListFilesFunc
	home     string
	writes   *reader.WriteLog
}

func newReaderFeature(manager readerManager, hub *wsHub, log zerolog.Logger) *readerFeature {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Warn().Err(err).Msg("reader: could not determine home directory; slug-only plans will not resolve")
	}
	return &readerFeature{
		manager:  manager,
		hub:      hub,
		log:      log,
		gitFiles: gitutil.ListFiles,
		home:     home,
		writes:   reader.NewWriteLog(),
	}
}

func (f *readerFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/sessions/{id}/reader", guard(http.HandlerFunc(f.handleReaderList)))
	mux.Handle("GET /api/sessions/{id}/reader/file", guard(http.HandlerFunc(f.handleReaderFile)))
}

// forgetSession drops id's write log — called once from sessions.go's Remove path.
func (f *readerFeature) forgetSession(id int64) {
	f.writes.Forget(id)
}

// Observe feeds one routed hook's neutral claudecode.FileSignal into the reader: a
// transcript path refreshes SetTranscript, a written path records the write log and
// fires docChanged when in scope (kb:adr/reader-change-signal-is-the-write-hook), and
// PlanMaybeReady re-scans the transcript. Called from the single ingest worker, after
// Apply — so SetTranscript/SetPlan's claudeSessionID comparison sees the post-rebind
// binding: a hook whose Claude session id the session has already left never moves the
// transcript or the plan (kb:spec/reader) — and never blocks on the hub (docChanged goes
// through wsHub.broadcast, already non-blocking).
func (f *readerFeature) Observe(ctx context.Context, sessionID int64, claudeSessionID string, sig claudecode.FileSignal) {
	if sig.TranscriptPath != "" {
		if _, err := f.manager.SetTranscript(ctx, sessionID, claudeSessionID, sig.TranscriptPath); err != nil && !errors.Is(err, session.ErrUnknownSession) {
			f.log.Warn().Err(err).Int64("session_id", sessionID).Msg("reader: persisting transcript path failed")
		}
	}

	if sig.WrittenPath != "" {
		f.observeWrite(ctx, sessionID, claudeSessionID, sig.WrittenPath)
	}

	if sig.PlanMaybeReady {
		f.scanPlan(ctx, sessionID, claudeSessionID, sig.TranscriptPath)
	}
}

// observeWrite records a routed write and fires docChanged when it names a `.md` under
// the session's directory or its plan path (kb:adr/reader-change-signal-is-the-write-hook)
// — never logged together with any payload text; the path alone is fine (it is what the
// wire carries).
func (f *readerFeature) observeWrite(ctx context.Context, sessionID int64, claudeSessionID, writtenPath string) {
	sess, ok := f.manager.Get(sessionID)
	if !ok {
		return
	}
	clean := filepath.Clean(writtenPath)
	scope := reader.Scope{Dir: sess.Directory, PlanPath: sess.PlanPath}
	if !scope.PathQualifies(clean) {
		return
	}

	now := time.Now().UTC()
	f.writes.Record(sessionID, clean, now)

	if clean == sess.PlanPath && !sess.PlanExists {
		// The sessionUpsert carrying exists:true must precede docChanged (Protocol
		// Contract) — this call broadcasts it (via MarkPlanWritten) before the broadcast
		// below. MarkPlanWritten re-checks PlanPath against the manager's current,
		// lock-held value rather than the sess read above: this Get() happened outside the
		// lock, so by the time we get here a concurrent ApplyPlanScan may already have moved
		// PlanPath on, and a plain SetPlan(sess.PlanPath, true) would blindly write that
		// stale path back over it.
		if _, _, err := f.manager.MarkPlanWritten(ctx, sessionID, claudeSessionID, sess.PlanPath); err != nil && !errors.Is(err, session.ErrUnknownSession) {
			f.log.Warn().Err(err).Int64("session_id", sessionID).Msg("reader: flipping plan exists failed")
		}
	}

	f.hub.broadcast(docChangedMessage{Type: "docChanged", ID: sessionID, Path: clean, At: now.Format(time.RFC3339)})
}

// scanPlan runs the transcript scan for a locatable plan file and hands its result to
// Manager.ApplyPlanScan, which is the sole place the sticky-once-named retention rule
// (kb:adr/reader-plan-sticky-once-named) is decided — the retain-or-find choice, the
// exists stat and the write all happen inside one Manager.mu critical section there, so
// this function only ever reports what the scan found, never what the session currently
// holds. ApplyPlanScan itself enforces the claudeSessionID gate: a hook whose Claude
// session id the session has already left never moves the transcript or the plan
// (kb:spec/reader). transcriptPath == "" is a no-op (nothing to scan yet); a scan whose
// transcript is missing or names no plan also passes foundPath == "" — LocatePlanFile's
// ErrNotExist branch returns a zero PlanFile, not an error.
func (f *readerFeature) scanPlan(ctx context.Context, sessionID int64, claudeSessionID, transcriptPath string) {
	if transcriptPath == "" {
		return
	}
	pf, err := claudecode.LocatePlanFile(transcriptPath, f.home)
	if err != nil {
		f.log.Debug().Err(err).Int64("session_id", sessionID).Msg("reader: scanning transcript for plan failed")
		return
	}

	if _, _, err := f.manager.ApplyPlanScan(ctx, sessionID, claudeSessionID, pf.Path); err != nil && !errors.Is(err, session.ErrUnknownSession) {
		f.log.Warn().Err(err).Int64("session_id", sessionID).Msg("reader: persisting plan failed")
	}
}

// handleReaderList is GET /api/sessions/{id}/reader (kb:anchor/sessions.reader): runs the
// transcript scan as a side effect (the reader opening is one of the scan's bounded
// triggers, kb:spec/reader — served, dead sessions included), then lists the session's
// readable markdown.
func (f *readerFeature) handleReaderList(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	sess, ok := sessionOr404(w, f.manager, id)
	if !ok {
		return
	}

	info, err := os.Stat(sess.Directory)
	if err != nil || !info.IsDir() {
		writeDirectoryMissing(w, sess.Directory)
		return
	}

	if sess.TranscriptPath != "" {
		f.scanPlan(r.Context(), id, sess.ClaudeSessionID, sess.TranscriptPath)
		if refreshed, ok := f.manager.Get(id); ok {
			sess = refreshed
		}
	}

	paths, listing, truncated := f.listMarkdown(r.Context(), sess.Directory)
	files := make([]readerFileWire, 0, len(paths))
	for _, p := range paths {
		abs := filepath.Join(sess.Directory, filepath.FromSlash(p))
		files = append(files, readerFileWire{Path: p, WrittenAt: f.writtenAtWire(id, abs)})
	}

	var plan *readerPlanWire
	if sess.PlanPath != "" {
		plan = &readerPlanWire{Path: sess.PlanPath, Exists: sess.PlanExists, WrittenAt: f.writtenAtWire(id, sess.PlanPath)}
	}

	writeJSON(w, http.StatusOK, readerListingWire{
		Directory: sess.Directory,
		Plan:      plan,
		Files:     files,
		Listing:   listing,
		Truncated: truncated,
	})
}

func (f *readerFeature) writtenAtWire(sessionID int64, path string) *string {
	at, ok := f.writes.Get(sessionID, path)
	if !ok {
		return nil
	}
	s := wireTime(at)
	return &s
}

// handleReaderFile is GET /api/sessions/{id}/reader/file (kb:anchor/sessions.reader-file):
// serves raw bytes for a path confine allows, 404 for everything else, 413 over 10 MiB.
func (f *readerFeature) handleReaderFile(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	sess, ok := sessionOr404(w, f.manager, id)
	if !ok {
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" || !filepath.IsAbs(path) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "path must be an absolute file path")
		return
	}

	scope := reader.Scope{Dir: sess.Directory, PlanPath: sess.PlanPath}
	resolved, ok := scope.Confine(path)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "not_found", "no such document")
		return
	}

	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		writeJSONError(w, http.StatusNotFound, "not_found", "no such document")
		return
	}
	if info.Size() > maxReaderFileBytes {
		mb := float64(info.Size()) / (1024 * 1024)
		writeJSONError(w, http.StatusRequestEntityTooLarge, "too_large",
			fmt.Sprintf("%s is %.1f MB; the reader serves files up to 10 MB", resolved, mb))
		return
	}

	body, err := os.ReadFile(resolved)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found", "no such document")
		return
	}

	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// listMarkdown lists every `.md` (case-insensitive) file under dir (kb:spec/reader),
// delegating the scope rules to internal/reader; a git-query failure is not itself an
// error — reader.ListMarkdown already falls back to the walk — so this only logs it at
// debug.
func (f *readerFeature) listMarkdown(ctx context.Context, dir string) (paths []string, listing string, truncated bool) {
	paths, listing, truncated, err := reader.ListMarkdown(ctx, dir, f.gitFiles)
	if err != nil {
		f.log.Debug().Err(err).Str("directory", dir).Msg("reader: git ls-files failed; falling back to walk listing")
	}
	return paths, listing, truncated
}
