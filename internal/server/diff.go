package server

import (
	"context"
	"errors"
	"net/http"
	"os"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/gitdiff"
	"github.com/Zalaras/muster/internal/session"
)

type diffReader interface {
	Summary(ctx context.Context, dir string) (gitdiff.Summary, error)
	Read(ctx context.Context, dir string, scope gitdiff.Scope) (gitdiff.Diff, error)
}

type diffFeature struct {
	manager *session.Manager
	reader  diffReader
	log     zerolog.Logger
}

func newDiffFeature(manager *session.Manager, reader diffReader, log zerolog.Logger) *diffFeature {
	return &diffFeature{manager: manager, reader: reader, log: log}
}

func (f *diffFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/sessions/{id}/diff/summary", guard(http.HandlerFunc(f.handleSummary)))
	mux.Handle("GET /api/sessions/{id}/diff", guard(http.HandlerFunc(f.handleRead)))
	mux.Handle("GET /api/sessions/{id}/diff/review", guard(http.HandlerFunc(f.handleReview)))
	mux.Handle("PUT /api/sessions/{id}/diff/comments/{commentId}", guard(http.HandlerFunc(f.handlePutComment)))
	mux.Handle("DELETE /api/sessions/{id}/diff/comments/{commentId}", guard(http.HandlerFunc(f.handleDeleteComment)))
	mux.Handle("POST /api/sessions/{id}/diff/ticks", guard(http.HandlerFunc(f.handleTicks)))
}

type diffSummaryResponse struct {
	gitdiff.Summary
	OpenComments int `json:"openComments"`
}

const msgDiffFailed = "could not read the diff"

func (f *diffFeature) checkoutDir(w http.ResponseWriter, r *http.Request) (int64, string, bool) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return 0, "", false
	}
	sess, ok := sessionOr404(w, f.manager, id)
	if !ok {
		return 0, "", false
	}
	info, err := os.Stat(sess.Directory)
	if err != nil || !info.IsDir() {
		writeDirectoryMissing(w, sess.Directory)
		return 0, "", false
	}
	return id, sess.Directory, true
}

func (f *diffFeature) handleSummary(w http.ResponseWriter, r *http.Request) {
	id, dir, ok := f.checkoutDir(w, r)
	if !ok {
		return
	}
	summary, err := f.reader.Summary(r.Context(), dir)
	if err != nil {
		f.writeDiffFailed(w, id, err)
		return
	}
	review, err := f.manager.DiffReview(id)
	if err != nil {
		f.writeReviewError(w, id, err)
		return
	}
	writeJSON(w, http.StatusOK, diffSummaryResponse{Summary: summary, OpenComments: review.OpenComments()})
}

func (f *diffFeature) handleRead(w http.ResponseWriter, r *http.Request) {
	scope := gitdiff.Scope(r.URL.Query().Get("scope"))
	switch scope {
	case "":
		scope = gitdiff.ScopeUncommitted
	case gitdiff.ScopeUncommitted, gitdiff.ScopeBranch:
	default:
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "scope must be uncommitted or branch")
		return
	}
	id, dir, ok := f.checkoutDir(w, r)
	if !ok {
		return
	}
	diff, err := f.reader.Read(r.Context(), dir, scope)
	if errors.Is(err, gitdiff.ErrNotRepo) {
		writeJSONError(w, http.StatusConflict, "not_a_repo", "not a git repository")
		return
	}
	if err != nil {
		f.writeDiffFailed(w, id, err)
		return
	}
	writeJSON(w, http.StatusOK, diff)
}

func (f *diffFeature) writeDiffFailed(w http.ResponseWriter, id int64, err error) {
	f.log.Error().Err(err).Int64("session_id", id).Msg("reading the diff failed")
	writeJSONError(w, http.StatusInternalServerError, "diff_failed", msgDiffFailed)
}
