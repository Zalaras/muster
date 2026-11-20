package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/Zalaras/muster/internal/session"
)

const (
	maxDiffReviewBodyBytes = 1 << 20
	maxDiffQuoteEntries    = 500
	maxDiffTickKeyLen      = 256
)

var diffCommentIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type diffPosRequest struct {
	Side *string `json:"side"`
	Line *int    `json:"line"`
}

type diffCommentRequest struct {
	Path     *string         `json:"path"`
	Start    *diffPosRequest `json:"start"`
	End      *diffPosRequest `json:"end"`
	Quote    *[]string       `json:"quote"`
	Body     *string         `json:"body"`
	Resolved *bool           `json:"resolved"`
}

type diffTicksRequest struct {
	Add    *[]string `json:"add"`
	Remove *[]string `json:"remove"`
}

func (f *diffFeature) handleReview(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	review, err := f.manager.DiffReview(id)
	if err != nil {
		f.writeReviewError(w, id, err)
		return
	}
	writeJSON(w, http.StatusOK, review)
}

func (f *diffFeature) handlePutComment(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	var req diffCommentRequest
	if !decodeReviewBody(w, r, &req, "comment is too large to save") {
		return
	}
	comment, msg := buildDiffComment(r.PathValue("commentId"), req)
	if msg != "" {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", msg)
		return
	}
	if err := f.manager.PutDiffComment(context.WithoutCancel(r.Context()), id, comment); err != nil {
		f.writeReviewError(w, id, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (f *diffFeature) handleDeleteComment(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	if err := f.manager.DeleteDiffComment(context.WithoutCancel(r.Context()), id, r.PathValue("commentId")); err != nil {
		f.writeReviewError(w, id, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (f *diffFeature) handleTicks(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	var req diffTicksRequest
	if !decodeReviewBody(w, r, &req, "ticks are too large to save") {
		return
	}
	add, remove, msg := validateTicks(req)
	if msg != "" {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", msg)
		return
	}
	if err := f.manager.UpdateDiffTicks(context.WithoutCancel(r.Context()), id, add, remove); err != nil {
		f.writeReviewError(w, id, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (f *diffFeature) writeReviewError(w http.ResponseWriter, id int64, err error) {
	if errors.Is(err, session.ErrUnknownSession) {
		writeUnknownSession(w)
		return
	}
	f.log.Error().Err(err).Int64("session_id", id).Msg("diff review write failed")
	writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
}

func decodeReviewBody(w http.ResponseWriter, r *http.Request, into any, tooLargeMessage string) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxDiffReviewBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(into); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "request_too_large", tooLargeMessage)
			return false
		}
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "request body is not valid")
		return false
	}
	return true
}

func buildDiffComment(commentID string, req diffCommentRequest) (session.DiffComment, string) {
	if !diffCommentIDPattern.MatchString(commentID) {
		return session.DiffComment{}, "comment id must be 1 to 64 letters, digits, _ or -"
	}
	if req.Path == nil || *req.Path == "" || req.Start == nil || req.End == nil ||
		req.Quote == nil || req.Body == nil || req.Resolved == nil {
		return session.DiffComment{}, "every key is required"
	}
	start, ok := buildDiffPos(req.Start)
	if !ok {
		return session.DiffComment{}, "start must be a side of old or new and a line of 1 or more"
	}
	end, ok := buildDiffPos(req.End)
	if !ok {
		return session.DiffComment{}, "end must be a side of old or new and a line of 1 or more"
	}
	if n := len(*req.Quote); n < 1 || n > maxDiffQuoteEntries {
		return session.DiffComment{}, "quote must hold 1 to 500 entries"
	}
	if strings.TrimSpace(*req.Body) == "" {
		return session.DiffComment{}, "body must not be blank"
	}
	return session.DiffComment{
		ID: commentID, Path: *req.Path, Start: start, End: end,
		Quote: *req.Quote, Body: *req.Body, Resolved: *req.Resolved,
	}, ""
}

func buildDiffPos(p *diffPosRequest) (session.DiffPos, bool) {
	if p.Side == nil || p.Line == nil || (*p.Side != "old" && *p.Side != "new") || *p.Line < 1 {
		return session.DiffPos{}, false
	}
	return session.DiffPos{Side: *p.Side, Line: *p.Line}, true
}

func validateTicks(req diffTicksRequest) (add, remove []string, msg string) {
	if req.Add == nil || req.Remove == nil {
		return nil, nil, "add and remove are both required"
	}
	for _, key := range append(append([]string{}, *req.Add...), *req.Remove...) {
		if n := utf8.RuneCountInString(key); n < 1 || n > maxDiffTickKeyLen {
			return nil, nil, "each key must be 1 to 256 characters"
		}
	}
	removing := make(map[string]bool, len(*req.Remove))
	for _, key := range *req.Remove {
		removing[key] = true
	}
	for _, key := range *req.Add {
		if removing[key] {
			return nil, nil, "a key cannot be both added and removed"
		}
	}
	return *req.Add, *req.Remove, ""
}
