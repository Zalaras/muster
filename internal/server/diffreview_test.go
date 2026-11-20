package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (r *diffRig) review(t *testing.T, id int64) (comments []map[string]any, ticks []string) {
	t.Helper()
	rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff/review", id), "")
	require.Equal(t, http.StatusOK, rec.Code)
	var got struct {
		Comments []map[string]any `json:"comments"`
		Ticks    []string         `json:"ticks"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.NotNil(t, got.Comments, "comments is [] not null")
	require.NotNil(t, got.Ticks, "ticks is [] not null")
	return got.Comments, got.Ticks
}

func commentWith(t *testing.T, key string, value any) string {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal([]byte(validComment), &m))
	if value == nil {
		delete(m, key)
	} else {
		m[key] = value
	}
	b, err := json.Marshal(m)
	require.NoError(t, err)
	return string(b)
}

func TestHandleDiffReview_EmptyThenRoundTrip(t *testing.T) {
	r := newDiffRig(t)
	id := r.seed(t)
	comments, ticks := r.review(t, id)
	assert.Empty(t, comments)
	assert.Empty(t, ticks)

	rec := r.do(http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/c-1_X", id), validComment)
	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())

	comments, _ = r.review(t, id)
	require.Len(t, comments, 1)
	c := comments[0]
	assert.Equal(t, "c-1_X", c["id"])
	assert.Equal(t, "a.go", c["path"])
	assert.Equal(t, "fix this", c["body"])
	assert.Equal(t, false, c["resolved"])
	assert.Equal(t, map[string]any{"side": "new", "line": 3.0}, c["start"])
	assert.Equal(t, []any{"x", "y"}, c["quote"])
	assert.Regexp(t, `^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$`, c["createdAt"])
}

func TestHandlePutDiffComment_BodyIsKeptExactlyAndIdAndCreatedAtAreIgnored(t *testing.T) {
	r := newDiffRig(t)
	id := r.seed(t)
	body := commentWith(t, "body", "  keep\n  spacing \n")
	body = strings.Replace(body, "{", `{"id":"evil","createdAt":"1999-01-01T00:00:00Z",`, 1)

	require.Equal(t, http.StatusNoContent, r.do(http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/real", id), body).Code)

	comments, _ := r.review(t, id)
	require.Len(t, comments, 1)
	assert.Equal(t, "real", comments[0]["id"])
	assert.Equal(t, "  keep\n  spacing \n", comments[0]["body"])
	assert.NotEqual(t, "1999-01-01T00:00:00Z", comments[0]["createdAt"])
}

func TestHandlePutDiffComment_Validation(t *testing.T) {
	long := make([]string, 501)
	for i := range long {
		long[i] = "q"
	}
	maxQuote := long[:500]
	tests := []struct {
		name      string
		commentID string
		body      string
		wantOK    bool
		wantMsg   string
	}{
		{"valid", "c1", validComment, true, ""},
		{"id of 64 chars", strings.Repeat("a", 64), validComment, true, ""},
		{"id of 65 chars", strings.Repeat("a", 65), validComment, false, "comment id must be 1 to 64 letters, digits, _ or -"},
		{"id with a dot", "a.b", validComment, false, "comment id must be 1 to 64 letters, digits, _ or -"},
		{"id with a space", "a%20b", validComment, false, "comment id must be 1 to 64 letters, digits, _ or -"},
		{"not json", "c1", `{nope`, false, "request body is not valid"},
		{"json null", "c1", `null`, false, "every key is required"},
		{"missing path", "c1", commentWith(t, "path", nil), false, "every key is required"},
		{"empty path", "c1", commentWith(t, "path", ""), false, "every key is required"},
		{"missing start", "c1", commentWith(t, "start", nil), false, "every key is required"},
		{"missing end", "c1", commentWith(t, "end", nil), false, "every key is required"},
		{"missing quote", "c1", commentWith(t, "quote", nil), false, "every key is required"},
		{"missing body", "c1", commentWith(t, "body", nil), false, "every key is required"},
		{"missing resolved", "c1", commentWith(t, "resolved", nil), false, "every key is required"},
		{"wrong type for resolved", "c1", commentWith(t, "resolved", "yes"), false, "request body is not valid"},
		{"bad side", "c1", commentWith(t, "start", map[string]any{"side": "left", "line": 1}), false, "start must be a side of old or new and a line of 1 or more"},
		{"line zero", "c1", commentWith(t, "end", map[string]any{"side": "new", "line": 0}), false, "end must be a side of old or new and a line of 1 or more"},
		{"line missing", "c1", commentWith(t, "end", map[string]any{"side": "old"}), false, "end must be a side of old or new and a line of 1 or more"},
		{"old side is fine", "c1", commentWith(t, "start", map[string]any{"side": "old", "line": 9}), true, ""},
		{"empty quote", "c1", commentWith(t, "quote", []string{}), false, "quote must hold 1 to 500 entries"},
		{"501 quote entries", "c1", commentWith(t, "quote", long), false, "quote must hold 1 to 500 entries"},
		{"500 quote entries", "c1", commentWith(t, "quote", maxQuote), true, ""},
		{"blank body", "c1", commentWith(t, "body", " \n\t"), false, "body must not be blank"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newDiffRig(t)
			id := r.seed(t)

			rec := r.do(http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/%s", id, tt.commentID), tt.body)

			comments, _ := r.review(t, id)
			if tt.wantOK {
				assert.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
				assert.Len(t, comments, 1)
				return
			}
			assert.Equal(t, http.StatusBadRequest, rec.Code)
			code, msg := errorEnvelope(t, rec)
			assert.Equal(t, "invalid_request", code)
			assert.Equal(t, tt.wantMsg, msg)
			assert.Empty(t, comments, "a refused write stores nothing")
		})
	}
}

func TestHandleDiffWrites_OversizeBodyIs413(t *testing.T) {
	huge := strings.Repeat("x", maxDiffReviewBodyBytes+10)
	tests := []struct {
		name, method, path, body, msg string
	}{
		{"comment", http.MethodPut, "/diff/comments/c1", commentWith(t, "body", huge), "comment is too large to save"},
		{"ticks", http.MethodPost, "/diff/ticks", `{"add":["` + huge + `"],"remove":[]}`, "ticks are too large to save"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newDiffRig(t)
			id := r.seed(t)

			rec := r.do(tt.method, fmt.Sprintf("/api/sessions/%d%s", id, tt.path), tt.body)

			assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
			code, msg := errorEnvelope(t, rec)
			assert.Equal(t, "request_too_large", code)
			assert.Equal(t, tt.msg, msg)
			comments, ticks := r.review(t, id)
			assert.Empty(t, comments)
			assert.Empty(t, ticks)
		})
	}
}

func TestHandleDeleteDiffComment(t *testing.T) {
	r := newDiffRig(t)
	id := r.seed(t)
	for _, c := range []string{"a", "b"} {
		require.Equal(t, http.StatusNoContent, r.do(http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/%s", id, c), validComment).Code)
	}

	rec := r.do(http.MethodDelete, fmt.Sprintf("/api/sessions/%d/diff/comments/a", id), "")
	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	assert.Equal(t, http.StatusNoContent, r.do(http.MethodDelete, fmt.Sprintf("/api/sessions/%d/diff/comments/a", id), "").Code, "deleting an absent comment still answers 204")

	comments, _ := r.review(t, id)
	require.Len(t, comments, 1)
	assert.Equal(t, "b", comments[0]["id"])
}

func TestHandleDiffTicks(t *testing.T) {
	long := strings.Repeat("é", 256)
	tests := []struct {
		name    string
		body    string
		wantOK  bool
		wantMsg string
	}{
		{"add and remove", `{"add":["a"],"remove":["z"]}`, true, ""},
		{"both empty", `{"add":[],"remove":[]}`, true, ""},
		{"256 characters counted as runes", `{"add":["` + long + `"],"remove":[]}`, true, ""},
		{"257 characters", `{"add":["` + long + `x"],"remove":[]}`, false, "each key must be 1 to 256 characters"},
		{"empty key", `{"add":[""],"remove":[]}`, false, "each key must be 1 to 256 characters"},
		{"empty key in remove", `{"add":[],"remove":[""]}`, false, "each key must be 1 to 256 characters"},
		{"missing add", `{"remove":[]}`, false, "add and remove are both required"},
		{"missing remove", `{"add":[]}`, false, "add and remove are both required"},
		{"null add", `{"add":null,"remove":[]}`, false, "add and remove are both required"},
		{"one key in both", `{"add":["a"],"remove":["a"]}`, false, "a key cannot be both added and removed"},
		{"entry not a string", `{"add":[1],"remove":[]}`, false, "request body is not valid"},
		{"not json", `[`, false, "request body is not valid"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newDiffRig(t)
			id := r.seed(t)

			rec := r.do(http.MethodPost, fmt.Sprintf("/api/sessions/%d/diff/ticks", id), tt.body)

			_, ticks := r.review(t, id)
			if tt.wantOK {
				assert.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
				assert.Empty(t, rec.Body.Bytes())
				return
			}
			assert.Equal(t, http.StatusBadRequest, rec.Code)
			code, msg := errorEnvelope(t, rec)
			assert.Equal(t, "invalid_request", code)
			assert.Equal(t, tt.wantMsg, msg)
			assert.Empty(t, ticks, "a refused write stores nothing")
		})
	}

	t.Run("effects: add, dedupe, remove", func(t *testing.T) {
		r := newDiffRig(t)
		id := r.seed(t)
		post := func(body string) {
			require.Equal(t, http.StatusNoContent, r.do(http.MethodPost, fmt.Sprintf("/api/sessions/%d/diff/ticks", id), body).Code)
		}
		post(`{"add":["a","b"],"remove":[]}`)
		post(`{"add":["b","c"],"remove":["nope"]}`)
		post(`{"add":[],"remove":["a"]}`)

		_, ticks := r.review(t, id)
		assert.Equal(t, []string{"b", "c"}, ticks)
	})
}

func TestDiffReview_NeverBroadcastAndNeverInTheSessionObject(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)
	read, none := dialNoteSocket(t, srv)
	_ = read

	for _, rt := range []struct{ method, path, body string }{
		{http.MethodPut, "/diff/comments/c1", validComment},
		{http.MethodPost, "/diff/ticks", `{"add":["k"],"remove":[]}`},
		{http.MethodDelete, "/diff/comments/c1", ""},
	} {
		req := httptest.NewRequest(rt.method, fmt.Sprintf("/api/sessions/%d%s", id, rt.path), strings.NewReader(rt.body))
		req.AddCookie(&http.Cookie{Name: cookieBaseName, Value: testUIToken})
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)
		require.Equal(t, http.StatusNoContent, rec.Code)
	}

	none()
	sess, ok := srv.manager.Get(id)
	require.True(t, ok)
	wire, err := json.Marshal(toWireSession(sess))
	require.NoError(t, err)
	assert.NotContains(t, string(wire), "diff", "the review is never on the Session object")
	assert.NotContains(t, string(wire), "comment")
}

// TestBuildIssueSnapshot_CarriesNoReviewText (D10): a session with a stored review (a comment
// body, its quoted lines and a tick) yields a snapshot with none of that text and no review key.
func TestBuildIssueSnapshot_CarriesNoReviewText(t *testing.T) {
	r := newDiffRig(t)
	id := r.seed(t)
	body := commentWith(t, "body", "sentinel-comment-body-must-never-leak")
	body = strings.Replace(body, `"x","y"`, `"sentinel-quoted-line-must-never-leak","y"`, 1)
	require.Equal(t, http.StatusNoContent, r.do(http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/c1", id), body).Code)
	require.Equal(t, http.StatusNoContent, r.do(http.MethodPost, fmt.Sprintf("/api/sessions/%d/diff/ticks", id), `{"add":["sentinel-tick-must-never-leak"],"remove":[]}`).Code)
	sess, ok := r.srv.manager.Get(id)
	require.True(t, ok)
	require.NotNil(t, sess.DiffReview, "the session under test carries a stored review")

	snap := r.srv.issue.buildIssueSnapshot(context.Background(), time.Now(), sess)
	raw, err := json.Marshal(snap)
	require.NoError(t, err)

	for _, text := range []string{"sentinel-comment-body-must-never-leak", "sentinel-quoted-line-must-never-leak", "sentinel-tick-must-never-leak", "a.go"} {
		assert.NotContains(t, string(raw), text)
		assert.NotContains(t, renderSnapshotMarkdown(snap), text)
	}
	for _, path := range collectJSONPaths(t, raw) {
		assert.NotContains(t, strings.ToLower(path), "review")
		assert.NotContains(t, path, "comments")
		assert.NotContains(t, path, "ticks")
	}
}
