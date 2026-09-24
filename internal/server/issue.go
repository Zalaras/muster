package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/ghissue"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// IssueConfig groups the file-an-issue button's config (plan code-breakup REQ-7). Empty
// APIURL disables both endpoints entirely (mirrors UsageConfig.APIURL's shape): a
// zero-value Config must never reach the real GitHub API host or execute `gh`.
type IssueConfig struct {
	// Repo is the GitHub repo issues are filed against.
	Repo string
	// APIURL is the GitHub API's base URL. main always passes the flag's non-empty
	// default, so this is the only place that URL is defined — no fallback constant
	// duplicates it here. Empty disables both new endpoints entirely: they 404
	// not_found (kb:anchor/issue.captures / kb:anchor/issue.create).
	APIURL string
	// TokenFile, when non-empty, reads the bearer token from this file's trimmed
	// contents instead of running `gh auth token` — a test seam that makes it
	// structurally impossible for a test using it to execute the real gh.
	TokenFile string
}

// createCaptureRequest is POST /api/issue/captures' request body
// (kb:anchor/issue.captures). The body itself is optional; an absent or null sessionId means dashboard
// scope.
type createCaptureRequest struct {
	SessionID *int64 `json:"sessionId"`
}

type createCaptureResponse struct {
	CaptureID        string        `json:"captureId"`
	CapturedAt       string        `json:"capturedAt"`
	Snapshot         issueSnapshot `json:"snapshot"`
	SnapshotMarkdown string        `json:"snapshotMarkdown"`
}

// issueCaptureDisabledMessage is the shared 404 body for both endpoints when
// -issue-api-url is empty (Edge Case 14, mirrors kb:anchor/usage.refresh's disabled-poller shape).
const issueCaptureDisabledMessage = "issue capture is disabled on this daemon"

// issueFeature owns the file-an-issue button's two endpoints, its in-memory capture
// store, and the GitHub client (plan code-breakup REQ-6).
type issueFeature struct {
	repo     string
	apiURL   string
	captures *captureStore
	client   *ghissue.Client

	manager       *session.Manager
	store         *store.Store
	daemonVersion string
	claudeCode    ClaudeCodeInfo
	log           zerolog.Logger
}

// newIssueFeature builds the feature. client stays nil when APIURL == "" (mirrors
// usageFeature's nil-when-disabled poller, Minor 4): no token reader is built and no
// exec.LookPath/gh probe happens on a daemon with issue capture disabled — every handler
// already 404s on f.apiURL == "" before it would reach f.client.
func newIssueFeature(cfg IssueConfig, httpClient *http.Client, manager *session.Manager, st *store.Store, daemonVersion string, claudeCode ClaudeCodeInfo, log zerolog.Logger) *issueFeature {
	f := &issueFeature{
		repo:          cfg.Repo,
		apiURL:        cfg.APIURL,
		captures:      newCaptureStore(),
		manager:       manager,
		store:         st,
		daemonVersion: daemonVersion,
		claudeCode:    claudeCode,
		log:           log,
	}
	if cfg.APIURL != "" {
		var tokenReader ghissue.TokenReader
		if cfg.TokenFile != "" {
			tokenReader = ghissue.FileTokenReader(cfg.TokenFile)
		} else {
			tokenReader = ghissue.GhCLITokenReader(exec.LookPath, ghissue.RunCommand)
		}
		f.client = &ghissue.Client{HTTPClient: httpClient, BaseURL: cfg.APIURL, TokenReader: tokenReader}
	}
	return f
}

func (f *issueFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/issue/captures", guard(http.HandlerFunc(f.handleCreateCapture)))
	mux.Handle("POST /api/issues", guard(http.HandlerFunc(f.handleCreateIssue)))
}

// handleCreateCapture is POST /api/issue/captures (REQ-3, kb:anchor/issue.captures).
func (f *issueFeature) handleCreateCapture(w http.ResponseWriter, r *http.Request) {
	if f.apiURL == "" {
		writeJSONError(w, http.StatusNotFound, "not_found", issueCaptureDisabledMessage)
		return
	}

	var req createCaptureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}

	var sess *session.Session
	if req.SessionID != nil {
		got, ok := f.manager.Get(*req.SessionID)
		if !ok {
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
			return
		}
		sess = got
	}

	now := time.Now().UTC()
	snapshot := f.buildIssueSnapshot(r.Context(), now, sess)
	markdown := renderSnapshotMarkdown(snapshot)

	id, err := randomCaptureID()
	if err != nil {
		f.log.Error().Err(err).Msg("generating issue capture id failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "generating capture id")
		return
	}
	f.captures.put(&issueCapture{id: id, capturedAt: now, snapshot: snapshot, snapshotMarkdown: markdown})

	writeJSON(w, http.StatusCreated, createCaptureResponse{
		CaptureID:        id,
		CapturedAt:       now.Format(time.RFC3339),
		Snapshot:         snapshot,
		SnapshotMarkdown: markdown,
	})
}

// createIssueRequest is POST /api/issues' request body (kb:anchor/issue.create).
type createIssueRequest struct {
	CaptureID string `json:"captureId"`
	Title     string `json:"title"`
	Note      string `json:"note"`
}

type createIssueResponse struct {
	Number int    `json:"number"`
	URL    string `json:"url"`
	Repo   string `json:"repo"`
}

const maxIssueTitleLen = 200
const maxIssueNoteLen = 8000

// errCaptureUnusable is fileIssue's sentinel for a reserve refusal — the capture id is
// unknown, expired, already consumed, or already being filed by a concurrent request.
// handleCreateIssue maps it to 409 capture_expired (kb:anchor/issue.create).
var errCaptureUnusable = errors.New("issue capture is unknown, expired, in flight, or already filed")

// fileIssue is POST /api/issues' whole capture-to-GitHub lifecycle: reserve the capture,
// post it, and consume or release depending on the outcome. handleCreateIssue delegates
// to this one call rather than running reserve/release/consume inline (Minor 4; conventions
// § Go, "handlers decode, delegate, encode"). err is errCaptureUnusable, or *ghissue.Client's
// own ErrAuthFailed/ErrPostFailed unchanged — the caller's error mapping is unaffected by
// this move.
func (f *issueFeature) fileIssue(ctx context.Context, captureID, title, note string) (number int, htmlURL, scope string, err error) {
	capture := f.captures.reserve(captureID, time.Now().UTC())
	if capture == nil {
		return 0, "", "", errCaptureUnusable
	}

	body := composeIssueBody(note, capture.snapshotMarkdown)
	number, htmlURL, err = f.client.CreateIssue(ctx, f.repo, title, body)
	if err != nil {
		f.captures.release(captureID)
		return 0, "", "", err
	}

	f.captures.consume(captureID)
	return number, htmlURL, capture.snapshot.Scope, nil
}

// handleCreateIssue is POST /api/issues (REQ-8/REQ-9/REQ-10, kb:anchor/issue.create).
func (f *issueFeature) handleCreateIssue(w http.ResponseWriter, r *http.Request) {
	if f.apiURL == "" {
		writeJSONError(w, http.StatusNotFound, "not_found", issueCaptureDisabledMessage)
		return
	}

	var req createIssueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	if req.CaptureID == "" {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "captureId is required")
		return
	}
	title := strings.TrimSpace(req.Title)
	// Counted in runes, not bytes: the client's maxlength counts UTF-16 code units and
	// REQ-6/kb:anchor/issue.create both say "chars" — len() on a Go string is bytes, which
	// would reject a 200-character title containing multi-byte runes (em dashes, accents,
	// emoji) that the client gate had already let through (review cycle 1 Minor 1).
	if title == "" || utf8.RuneCountInString(title) > maxIssueTitleLen {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "title must be 1-200 characters after trimming")
		return
	}
	if utf8.RuneCountInString(req.Note) > maxIssueNoteLen {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "note must be at most 8000 characters")
		return
	}

	// context.WithoutCancel (mirrors sessionLauncher.Launch/Resume, Edge Case 13): once
	// the capture is reserved, a client that navigates away or hits Escape must not
	// cancel the in-flight GitHub POST — the daemon still files it and logs it.
	ctx := context.WithoutCancel(r.Context())
	number, htmlURL, scope, err := f.fileIssue(ctx, req.CaptureID, title, req.Note)
	if err != nil {
		var authErr *ghissue.ErrAuthFailed
		var postErr *ghissue.ErrPostFailed
		switch {
		case errors.Is(err, errCaptureUnusable):
			// Edge Case 2's remedy sentence lives here: the pinned UI summary is always
			// "Could not file the issue.", so this message is the only place the user
			// sees what to actually do about it (review cycle 1 Minor 3).
			writeJSONError(w, http.StatusConflict, "capture_expired", "capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot")
		case errors.As(err, &authErr):
			// authErr.Message is proven token-free by D9/INV-3 — safe to log (review
			// cycle 1 Major: the warn line must carry the upstream status/message, not
			// just the stage). Field name must not be "message": that collides with
			// zerolog.MessageFieldName (the key Msg() itself writes), which silently
			// drops this field under ConsoleWriter and duplicates the JSON key
			// (review cycle 2 Critical 1).
			f.log.Warn().Str("stage", "token").Str("upstream", authErr.Message).Msg("filing issue: obtaining github token failed")
			writeJSONError(w, http.StatusBadGateway, "issue_auth_failed", authErr.Message)
		case errors.As(err, &postErr):
			// postErr.Message already carries GitHub's upstream status (e.g. "github
			// returned 404: ...") and message where GitHub provided one — proven
			// token-free by D9/INV-3. Field name "upstream", not "message" (review
			// cycle 2 Critical 1 — see comment above).
			f.log.Warn().Str("stage", "post").Bool("maybe_created", postErr.MaybeCreated).Str("upstream", postErr.Message).Msg("filing issue: posting to github failed")
			writeJSONError(w, http.StatusBadGateway, "issue_post_failed", postErr.Message)
		default:
			f.log.Warn().Err(err).Str("stage", "post").Msg("filing issue: unexpected failure")
			writeJSONError(w, http.StatusBadGateway, "issue_post_failed", "filing the issue failed")
		}
		return
	}

	f.log.Info().
		Int("number", number).
		Str("url", htmlURL).
		Str("scope", scope).
		Int("title_len", utf8.RuneCountInString(title)).
		Int("note_len", utf8.RuneCountInString(req.Note)).
		Msg("filed github issue")

	writeJSON(w, http.StatusCreated, createIssueResponse{Number: number, URL: htmlURL, Repo: f.repo})
}
