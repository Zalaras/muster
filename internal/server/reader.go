package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
)

// maxWriteLogPaths caps writeLog's per-session memory (Implementation Notes: "when a
// session's map exceeds 512 entries drop the oldest").
const maxWriteLogPaths = 512

// maxReaderFileBytes is REQ-6's serving cap: 10 MiB, exactly.
const maxReaderFileBytes = 10 * 1024 * 1024

// maxWalkFiles is REQ-25's non-git listing cap.
const maxWalkFiles = 20000

// readerExecFunc runs `git` for listMarkdown — an injectable seam like usage.go's
// TokenReader/execFunc pattern; no test executes the real git binary through it.
type readerExecFunc func(ctx context.Context, dir string, args ...string) ([]byte, error)

// runGit is the production readerExecFunc: `git -C dir <args>`, output only (stderr
// discarded — a failure here is a fallback signal, not something to surface to the UI).
func readerRunGit(ctx context.Context, dir string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
	// WaitDelay bounds the wait for a descendant that inherited the stdout pipe to
	// close it (docs/conventions.md § Go).
	cmd.WaitDelay = 2 * time.Second
	return cmd.Output()
}

// writeLog is the daemon's in-memory record of routed writes, per session — forgotten
// on daemon restart, like shells (Schema Changes: "the write log is not persisted").
type writeLog struct {
	mu        sync.Mutex
	bySession map[int64]map[string]time.Time
}

func newWriteLog() *writeLog {
	return &writeLog{bySession: make(map[int64]map[string]time.Time)}
}

// record notes that path was written at at, capping each session at maxWriteLogPaths
// entries by dropping the single oldest once the cap is exceeded.
func (l *writeLog) record(sessionID int64, path string, at time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	m, ok := l.bySession[sessionID]
	if !ok {
		m = make(map[string]time.Time)
		l.bySession[sessionID] = m
	}
	m[path] = at
	if len(m) <= maxWriteLogPaths {
		return
	}
	var oldestPath string
	var oldestAt time.Time
	first := true
	for p, t := range m {
		if first || t.Before(oldestAt) {
			oldestPath, oldestAt, first = p, t, false
		}
	}
	delete(m, oldestPath)
}

func (l *writeLog) get(sessionID int64, path string) (time.Time, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	m, ok := l.bySession[sessionID]
	if !ok {
		return time.Time{}, false
	}
	at, ok := m[path]
	return at, ok
}

// forget drops sessionID's whole write log — Remove's cleanup (edge case 28).
func (l *writeLog) forget(sessionID int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.bySession, sessionID)
}

// readerManager is readerFeature's view of *session.Manager — narrowed to what this
// feature calls, so tests can fake it without the whole manager.
type readerManager interface {
	Get(id int64) (*session.Session, bool)
	SetTranscript(ctx context.Context, id int64, claudeSessionID, path string) (bool, error)
	MarkPlanWritten(ctx context.Context, id int64, claudeSessionID, expectedPath string) (*session.Session, bool, error)
	ApplyPlanScan(ctx context.Context, id int64, claudeSessionID, foundPath string) (*session.Session, bool, error)
}

// readerFeature owns the reader's two GETs and the docChanged/plan-scan side effects
// (plan markdown-viewing). No route here ever mutates a file (INV-7) — the reader is
// read-only by construction.
type readerFeature struct {
	manager readerManager
	hub     *wsHub
	log     zerolog.Logger
	runGit  readerExecFunc
	home    string
	writes  *writeLog
}

func newReaderFeature(manager readerManager, hub *wsHub, log zerolog.Logger) *readerFeature {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Warn().Err(err).Msg("reader: could not determine home directory; slug-only plans will not resolve")
	}
	return &readerFeature{
		manager: manager,
		hub:     hub,
		log:     log,
		runGit:  readerRunGit,
		home:    home,
		writes:  newWriteLog(),
	}
}

func (f *readerFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/sessions/{id}/reader", guard(http.HandlerFunc(f.handleReaderList)))
	mux.Handle("GET /api/sessions/{id}/reader/file", guard(http.HandlerFunc(f.handleReaderFile)))
}

// forgetSession drops id's write log — called once from sessions.go's Remove path
// (edge case 28).
func (f *readerFeature) forgetSession(id int64) {
	f.writes.forget(id)
}

// Observe feeds one routed hook's neutral claudecode.FileSignal into the reader
// (REQ-16/REQ-18): a transcript path refreshes SetTranscript, a written path records
// the write log and fires docChanged when in scope, and PlanMaybeReady re-scans the
// transcript. Called from the single ingest worker, after Apply — so
// SetTranscript/SetPlan's claudeSessionID comparison sees the post-rebind binding
// (REQ-26/INV-8) — and never blocks on the hub (docChanged goes through wsHub.broadcast,
// already non-blocking).
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
// the session's directory or its plan path (REQ-18) — never logged together with any
// payload text; the path alone is fine (it is what the wire carries).
func (f *readerFeature) observeWrite(ctx context.Context, sessionID int64, claudeSessionID, writtenPath string) {
	sess, ok := f.manager.Get(sessionID)
	if !ok {
		return
	}
	clean := filepath.Clean(writtenPath)
	if !readerPathQualifies(sess.Directory, sess.PlanPath, clean) {
		return
	}

	now := time.Now().UTC()
	f.writes.record(sessionID, clean, now)

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

// readerPathQualifies is REQ-18's scope test: after filepath.Clean, path sits lexically
// under dir and ends in `.md` (case-insensitive), or equals planPath — no symlink
// resolution (that confinement belongs to serving, in confine, not to the change
// signal).
func readerPathQualifies(dir, planPath, path string) bool {
	if planPath != "" && path == planPath {
		return true
	}
	if !strings.EqualFold(filepath.Ext(path), ".md") {
		return false
	}
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// scanPlan runs REQ-16's transcript scan and hands its result to
// Manager.ApplyPlanScan, which is the sole place REQ-8/D7's sticky-once-named
// retention rule (kb:adr/reader-plan-sticky-once-named) is decided — the retain-or-find
// choice, the exists stat and the write all happen inside one Manager.mu critical
// section there, so this function only ever reports what the scan found, never what the
// session currently holds. ApplyPlanScan itself enforces REQ-26/INV-8's
// claudeSessionID gate. transcriptPath == "" is a no-op (nothing to scan yet); a scan
// whose transcript is missing or names no plan also passes foundPath == "" — LocatePlanFile's
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
// transcript scan as a side effect (REQ-16's "reader open" trigger — served, dead
// sessions included), then lists the session's readable markdown.
func (f *readerFeature) handleReaderList(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	sess, ok := f.manager.Get(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return
	}

	info, err := os.Stat(sess.Directory)
	if err != nil || !info.IsDir() {
		writeJSONError(w, http.StatusConflict, "directory_missing", fmt.Sprintf("%s no longer exists", sess.Directory))
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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(readerListingWire{
		Directory: sess.Directory,
		Plan:      plan,
		Files:     files,
		Listing:   listing,
		Truncated: truncated,
	})
}

func (f *readerFeature) writtenAtWire(sessionID int64, path string) *string {
	at, ok := f.writes.get(sessionID, path)
	if !ok {
		return nil
	}
	s := at.UTC().Format(time.RFC3339)
	return &s
}

// handleReaderFile is GET /api/sessions/{id}/reader/file (kb:anchor/sessions.reader-file):
// serves raw bytes for a path confine allows, 404 for everything else, 413 over 10 MiB.
func (f *readerFeature) handleReaderFile(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	sess, ok := f.manager.Get(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" || !filepath.IsAbs(path) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "path must be an absolute file path")
		return
	}

	resolved, ok := confine(sess.Directory, sess.PlanPath, path)
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

// confine reports whether requested may be served for a session rooted at dir with
// derived plan path planPath (""  = none), and its symlink-resolved form when so
// (REQ-20/INV-2): after filepath.EvalSymlinks of both dir and requested, requested must
// sit under dir and end in `.md` (case-insensitive), or equal the resolved planPath.
// Existence/directory-ness beyond symlink resolution is the caller's job (a Stat after
// confine, distinguishing 404 from 413 — Implementation Notes).
func confine(dir, planPath, requested string) (string, bool) {
	resolvedDir, err := filepath.EvalSymlinks(filepath.Clean(dir))
	if err != nil {
		return "", false
	}
	resolvedRequested, err := filepath.EvalSymlinks(filepath.Clean(requested))
	if err != nil {
		return "", false
	}

	if planPath != "" {
		if resolvedPlan, err := filepath.EvalSymlinks(filepath.Clean(planPath)); err == nil && resolvedRequested == resolvedPlan {
			return resolvedRequested, true
		}
	}

	if !strings.HasPrefix(resolvedRequested, resolvedDir+string(os.PathSeparator)) {
		return "", false
	}
	if !strings.EqualFold(filepath.Ext(resolvedRequested), ".md") {
		return "", false
	}
	return resolvedRequested, true
}

// listMarkdown lists every `.md` (case-insensitive) file under dir: `git ls-files -co
// --exclude-standard` when dir is a git checkout, a bounded dot-directory-skipping walk
// otherwise (REQ-10/REQ-25). A git failure (not a checkout, or a real error) is not
// itself an error — it falls back to the walk, logged at debug.
func (f *readerFeature) listMarkdown(ctx context.Context, dir string) (paths []string, listing string, truncated bool) {
	out, err := f.runGit(ctx, dir, "ls-files", "-co", "--exclude-standard", "-z")
	if err != nil {
		f.log.Debug().Err(err).Str("directory", dir).Msg("reader: git ls-files failed; falling back to walk listing")
		return walkMarkdown(dir)
	}

	var md []string
	for _, p := range bytes.Split(bytes.TrimRight(out, "\x00"), []byte{0}) {
		if len(p) == 0 {
			continue
		}
		rel := string(p)
		if strings.EqualFold(filepath.Ext(rel), ".md") {
			md = append(md, filepath.ToSlash(rel))
		}
	}
	sort.Strings(md)
	return md, "git", false
}

// errWalkCap stops walkMarkdown's WalkDir early once REQ-25's cap is reached; never
// surfaced past this function.
var errWalkCap = errors.New("reader: walk file cap reached")

func walkMarkdown(dir string) (paths []string, listing string, truncated bool) {
	var md []string
	walkErr := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil //nolint:nilerr // deliberately continue past one unreadable entry rather than failing the whole listing
		}
		if path == dir {
			return nil
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.EqualFold(filepath.Ext(d.Name()), ".md") {
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return nil //nolint:nilerr // an unrelatable path is skipped, not fatal to the listing
		}
		md = append(md, filepath.ToSlash(rel))
		if len(md) >= maxWalkFiles {
			return errWalkCap
		}
		return nil
	})
	if walkErr != nil && !errors.Is(walkErr, errWalkCap) {
		// Not logged here: walkMarkdown has no logger (kept pure per Implementation
		// Notes); the caller (listMarkdown) already logs the git-fallback path, and a
		// walk error beyond the cap sentinel means a root that vanished mid-walk —
		// rare enough that surfacing an empty/partial listing is an adequate answer.
		_ = walkErr
	}
	truncated = len(md) >= maxWalkFiles
	sort.Strings(md)
	return md, "walk", truncated
}
