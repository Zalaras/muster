package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/ghissue"
	"github.com/Zalaras/muster/internal/session"
)

// issueSnapshot is the strict allowlisted payload behind the file-an-issue button (plan
// issue-capture §"The allowlist"). Every field here is copied explicitly from its
// source — never produced by marshalling a whole-object shape and removing keys
// (Implementation Notes: "Assemble by copy, never by subtraction").
type issueSnapshot struct {
	CapturedAt string                  `json:"capturedAt"`
	Scope      string                  `json:"scope"`
	Musterd    issueSnapshotMusterd    `json:"musterd"`
	ClaudeCode issueSnapshotClaudeCode `json:"claudeCode"`
	Host       issueSnapshotHost       `json:"host"`
	Dashboard  issueSnapshotDashboard  `json:"dashboard"`
	// Session is present only for scope == "session"; the key is absent (not null) for
	// dashboard scope (plan allowlist table).
	Session *issueSnapshotSession `json:"session,omitempty"`
}

type issueSnapshotMusterd struct {
	Version string `json:"version"`
}

type issueSnapshotClaudeCode struct {
	Installed *string `json:"installed"`
	Floor     string  `json:"floor"`
	Verified  string  `json:"verified"`
	Status    string  `json:"status"`
}

type issueSnapshotHost struct {
	OS   string `json:"os"`
	Arch string `json:"arch"`
}

type issueSnapshotDashboard struct {
	SessionsTotal int    `json:"sessionsTotal"`
	SessionsAlive int    `json:"sessionsAlive"`
	View          string `json:"view"`
	Density       string `json:"density"`
	RailSort      string `json:"railSort"`
}

type issueSnapshotSession struct {
	State      string  `json:"state"`
	StateSince string  `json:"stateSince"`
	Alive      bool    `json:"alive"`
	EndedAt    *string `json:"endedAt"`
	// Attention/Failure: the whole object is absent (never null) when there is none —
	// plan allowlist table.
	Attention            *issueSnapshotAttention `json:"attention,omitempty"`
	Failure              *issueSnapshotFailure   `json:"failure,omitempty"`
	Model                *issueSnapshotModel     `json:"model"`
	PermissionMode       issueSnapshotPermission `json:"permissionMode"`
	Context              *issueSnapshotContext   `json:"context"`
	Compactions          int                     `json:"compactions"`
	TmuxTarget           string                  `json:"tmuxTarget"`
	CreatedAt            string                  `json:"createdAt"`
	ClaudeSessionIDBound bool                    `json:"claudeSessionIdBound"`
	Events               issueSnapshotEvents     `json:"events"`
}

type issueSnapshotAttention struct {
	Reason string `json:"reason"`
	Since  string `json:"since"`
}

// issueSnapshotFailure carries only the raw error token — never the assistant-generated
// failure message (plan hard exclusion 5).
type issueSnapshotFailure struct {
	Error string `json:"error"`
}

type issueSnapshotModel struct {
	ID string `json:"id"`
}

type issueSnapshotPermission struct {
	Value  string `json:"value"`
	Source string `json:"source"`
}

type issueSnapshotContext struct {
	UsedPct          float64 `json:"usedPct"`
	TotalInputTokens int64   `json:"totalInputTokens"`
	WindowSize       int64   `json:"windowSize"`
}

type issueSnapshotEvents struct {
	FirstSeq       *int64   `json:"firstSeq"`
	LastSeq        *int64   `json:"lastSeq"`
	Count          int      `json:"count"`
	LastReceivedAt *string  `json:"lastReceivedAt"`
	RecentTypes    []string `json:"recentTypes"`
}

// buildIssueSnapshot assembles the allowlisted snapshot by explicit field copy. sess is
// nil for dashboard scope. Named "sess" deliberately — the D6 automated check greps this
// file for a handful of excluded field accesses by that receiver name.
func (s *Server) buildIssueSnapshot(ctx context.Context, now time.Time, sess *session.Session) issueSnapshot {
	sessions := s.manager.List()
	alive := 0
	for _, one := range sessions {
		if one.Alive {
			alive++
		}
	}
	prefs := s.loadPrefs(ctx)

	snap := issueSnapshot{
		CapturedAt: now.UTC().Format(time.RFC3339),
		Scope:      "dashboard",
	}
	snap.Musterd.Version = s.daemonVersion
	snap.ClaudeCode.Installed = s.claudeCode.Installed
	snap.ClaudeCode.Floor = s.claudeCode.Floor
	snap.ClaudeCode.Verified = s.claudeCode.Verified
	snap.ClaudeCode.Status = s.claudeCode.Status
	snap.Host.OS = runtime.GOOS
	snap.Host.Arch = runtime.GOARCH
	snap.Dashboard.SessionsTotal = len(sessions)
	snap.Dashboard.SessionsAlive = alive
	snap.Dashboard.View = prefs.View
	snap.Dashboard.Density = prefs.Density
	snap.Dashboard.RailSort = prefs.RailSort

	if sess == nil {
		return snap
	}
	snap.Scope = "session"

	ss := &issueSnapshotSession{
		State:                string(sess.State),
		StateSince:           sess.StateSince.UTC().Format(time.RFC3339),
		Alive:                sess.Alive,
		PermissionMode:       issueSnapshotPermission{Value: string(sess.PermissionMode), Source: sess.PermissionModeSource},
		Compactions:          sess.Compactions,
		TmuxTarget:           sess.TmuxTarget,
		CreatedAt:            sess.CreatedAt.UTC().Format(time.RFC3339),
		ClaudeSessionIDBound: sess.ClaudeSessionID != "",
	}
	if sess.EndedAt != nil {
		v := sess.EndedAt.UTC().Format(time.RFC3339)
		ss.EndedAt = &v
	}
	if sess.Attention != nil {
		ss.Attention = &issueSnapshotAttention{Reason: sess.Attention.Reason, Since: sess.Attention.Since.UTC().Format(time.RFC3339)}
	}
	if sess.Failure != nil {
		ss.Failure = &issueSnapshotFailure{Error: sess.Failure.Error}
	}
	if sess.Model != nil {
		ss.Model = &issueSnapshotModel{ID: sess.Model.ID}
	}
	if sess.Context != nil {
		ss.Context = &issueSnapshotContext{
			UsedPct:          sess.Context.UsedPct,
			TotalInputTokens: sess.Context.TotalInputTokens,
			WindowSize:       sess.Context.WindowSize,
		}
	}

	summary, err := s.store.EventSummary(ctx, sess.ID)
	if err != nil {
		s.log.Warn().Err(err).Int64("session_id", sess.ID).Msg("reading event summary for issue capture failed")
	}
	ss.Events = issueSnapshotEvents{
		FirstSeq:    summary.FirstSeq,
		LastSeq:     summary.LastSeq,
		Count:       summary.Count,
		RecentTypes: summary.RecentTypes,
	}
	if summary.LastReceivedAt != nil {
		v := summary.LastReceivedAt.UTC().Format(time.RFC3339)
		ss.Events.LastReceivedAt = &v
	}
	if ss.Events.RecentTypes == nil {
		ss.Events.RecentTypes = []string{}
	}

	snap.Session = ss
	return snap
}

// issueFooter is the markdown body's provenance line — a constant string, byte-for-byte
// (plan "## The issue body": "The `<sub>` footer is a constant string").
const issueFooter = "<sub>Filed from the Muster dashboard. Allowlisted snapshot only — no prompt text, hook payload bodies, status-line JSON, pane captures, directory paths, repository names or account usage.</sub>"

// renderSnapshotMarkdown renders the `## Snapshot` section, the raw-JSON `<details>`
// block and the provenance footer (plan "## The issue body"). Row order is fixed, never
// map order; dashboard scope emits only the first four rows and the JSON has no session
// key (snap.Session == nil already omits it from the marshalled JSON).
func renderSnapshotMarkdown(snap issueSnapshot) string {
	lines := []string{
		"## Snapshot",
		"",
		"| field | value |",
		"| --- | --- |",
		row("musterd", snap.Musterd.Version),
		row("Claude Code", claudeCodeCell(snap.ClaudeCode)),
		row("host", fmt.Sprintf("%s/%s", snap.Host.OS, snap.Host.Arch)),
		row("dashboard", dashboardCell(snap.Dashboard)),
	}

	if snap.Session != nil {
		sess := snap.Session
		lines = append(lines, row("state", fmt.Sprintf("%s since %s", sess.State, sess.StateSince)))
		lines = append(lines, row("alive", strconv.FormatBool(sess.Alive)))
		if sess.EndedAt != nil {
			lines = append(lines, row("ended", *sess.EndedAt))
		}
		if sess.Attention != nil {
			lines = append(lines, row("attention", fmt.Sprintf("%s since %s", sess.Attention.Reason, sess.Attention.Since)))
		}
		if sess.Failure != nil {
			lines = append(lines, row("failure", sess.Failure.Error))
		}
		lines = append(lines, row("model", modelCell(sess.Model)))
		lines = append(lines, row("permission mode", fmt.Sprintf("%s (last known, source %s)", sess.PermissionMode.Value, sess.PermissionMode.Source)))
		lines = append(lines, row("context", contextCell(sess.Context)))
		lines = append(lines, row("compactions", strconv.Itoa(sess.Compactions)))
		lines = append(lines, row("tmux", sess.TmuxTarget))
		lines = append(lines, row("session", sessionRowCell(sess)))
		lines = append(lines, row("events", eventsCell(sess.Events)))
		lines = append(lines, row("recent events", recentEventsCell(sess.Events)))
	}

	rawJSON, _ := json.MarshalIndent(snap, "", "  ")

	lines = append(lines,
		"",
		"<details>",
		"<summary>raw snapshot</summary>",
		"",
		"````json",
		string(rawJSON),
		"````",
		"",
		"</details>",
		"",
		issueFooter,
	)
	return strings.Join(lines, "\n")
}

func row(field, value string) string {
	return "| " + field + " | " + escapeCell(value) + " |"
}

// escapeCell applies the plan's table-value escaping (Edge Case 11): a literal `|`
// would otherwise close the table cell early, and a newline would break the row.
func escapeCell(v string) string {
	v = strings.ReplaceAll(v, "\r\n", " ")
	v = strings.ReplaceAll(v, "\n", " ")
	v = strings.ReplaceAll(v, "|", "\\|")
	return v
}

// claudeCodeCell renders the issue snapshot's Claude Code row (docs/protocol.md §3.12):
// "<installed> installed · verified <floor>–<verified> · <status>", or
// "installed unknown · verified <floor>–<verified>" when status is unknown — exactly the
// hello semantics, never a drift/pin word.
func claudeCodeCell(cc issueSnapshotClaudeCode) string {
	rangeStr := claudecode.FormatRange(cc.Floor, cc.Verified)
	if cc.Installed == nil {
		return fmt.Sprintf("installed unknown · verified %s", rangeStr)
	}
	return fmt.Sprintf("%s installed · verified %s · %s", *cc.Installed, rangeStr, cc.Status)
}

func dashboardCell(d issueSnapshotDashboard) string {
	return fmt.Sprintf("%d sessions, %d alive · view %s %s · rail %s", d.SessionsTotal, d.SessionsAlive, d.View, d.Density, d.RailSort)
}

func modelCell(m *issueSnapshotModel) string {
	if m == nil {
		return "unknown"
	}
	return m.ID
}

func contextCell(c *issueSnapshotContext) string {
	if c == nil {
		return "unknown"
	}
	return fmt.Sprintf("%d%% · %d / %d tokens", int(math.Round(c.UsedPct)), c.TotalInputTokens, c.WindowSize)
}

func sessionRowCell(sess *issueSnapshotSession) string {
	bound := "not bound"
	if sess.ClaudeSessionIDBound {
		bound = "bound"
	}
	return fmt.Sprintf("created %s · claude session %s", sess.CreatedAt, bound)
}

func eventsCell(ev issueSnapshotEvents) string {
	if ev.Count == 0 {
		return "none routed"
	}
	first, last := "?", "?"
	if ev.FirstSeq != nil {
		first = strconv.FormatInt(*ev.FirstSeq, 10)
	}
	if ev.LastSeq != nil {
		last = strconv.FormatInt(*ev.LastSeq, 10)
	}
	lastReceived := "unknown"
	if ev.LastReceivedAt != nil {
		lastReceived = *ev.LastReceivedAt
	}
	return fmt.Sprintf("seq %s-%s, %d routed · last %s", first, last, ev.Count, lastReceived)
}

func recentEventsCell(ev issueSnapshotEvents) string {
	if ev.Count == 0 || len(ev.RecentTypes) == 0 {
		return "none"
	}
	return strings.Join(ev.RecentTypes, ", ")
}

// noteSection composes the `## What happened` section from a raw note — the daemon's
// half of the "one composer, two callers" duplication (Implementation Notes); the
// dashboard's render/issue.ts implements the identical rule for the live preview, and
// INV-2's E2E turns that duplication into a tested equality. CRLF is normalised to LF,
// the whole string trimmed, and the empty case yields "".
func noteSection(note string) string {
	normalized := strings.ReplaceAll(note, "\r\n", "\n")
	trimmed := strings.TrimSpace(normalized)
	if trimmed == "" {
		return ""
	}
	return "## What happened\n\n" + trimmed + "\n\n"
}

// composeIssueBody is the full posted/previewed body: the note section followed by the
// capture's snapshotMarkdown, no trailing newline (plan "## The issue body").
func composeIssueBody(note, snapshotMarkdown string) string {
	return noteSection(note) + snapshotMarkdown
}

// maxCaptures/captureTTL bound the in-memory capture store (REQ-15).
const maxCaptures = 8
const captureTTL = 15 * time.Minute

// issueCapture is one held, immutable snapshot (REQ-15/INV-4): its snapshot and
// snapshotMarkdown are fixed at capture time and never recomputed, so filing later
// posts exactly what was previewed regardless of any state change in between.
type issueCapture struct {
	id               string
	capturedAt       time.Time
	snapshot         issueSnapshot
	snapshotMarkdown string
	consumed         bool
	inFlight         bool
}

// captureStore is the daemon-memory-only holder for captures (Schema Changes: "not
// persisted — a snapshot that outlives the daemon that took it would describe a world
// that no longer exists").
type captureStore struct {
	mu       sync.Mutex
	captures map[string]*issueCapture
}

func newCaptureStore() *captureStore {
	return &captureStore{captures: make(map[string]*issueCapture)}
}

// put stores c, evicting the oldest-by-capturedAt entry once the store holds more than
// maxCaptures (REQ-15: "taking a 9th evicts the oldest").
func (cs *captureStore) put(c *issueCapture) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.captures[c.id] = c
	if len(cs.captures) <= maxCaptures {
		return
	}
	var oldestID string
	var oldestAt time.Time
	first := true
	for id, entry := range cs.captures {
		if first || entry.capturedAt.Before(oldestAt) {
			oldestID, oldestAt, first = id, entry.capturedAt, false
		}
	}
	delete(cs.captures, oldestID)
}

// reserve returns the capture for id if it is usable — known, not expired, not already
// consumed, and not already being filed by a concurrent request — and marks it
// in-flight so a duplicate concurrent POST (Edge Case 12's "belt to braces" alongside
// the client-side Submit-disable) cannot also file it. Returns nil otherwise, which the
// caller reports as 409 capture_expired.
func (cs *captureStore) reserve(id string, now time.Time) *issueCapture {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	c, ok := cs.captures[id]
	if !ok || c.consumed || c.inFlight || now.Sub(c.capturedAt) > captureTTL {
		return nil
	}
	c.inFlight = true
	return c
}

// consume marks id filed successfully — permanent; a captureId can never be reused
// again (D10).
func (cs *captureStore) consume(id string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if c, ok := cs.captures[id]; ok {
		c.consumed = true
		c.inFlight = false
	}
}

// release clears an id's in-flight reservation without consuming it — a failed filing
// attempt does not consume the capture, so a retry needs no re-capture (REQ-10).
func (cs *captureStore) release(id string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if c, ok := cs.captures[id]; ok {
		c.inFlight = false
	}
}

func randomCaptureID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating capture id: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// createCaptureRequest is POST /api/issue/captures' request body (docs/protocol.md
// §3.12). The body itself is optional; an absent or null sessionId means dashboard
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
// -issue-api-url is empty (Edge Case 14, mirrors §3.9's disabled-poller shape).
const issueCaptureDisabledMessage = "issue capture is disabled on this daemon"

// handleCreateCapture is POST /api/issue/captures (REQ-3, docs/protocol.md §3.12).
func (s *Server) handleCreateCapture(w http.ResponseWriter, r *http.Request) {
	if s.issueAPIURL == "" {
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
		got, ok := s.manager.Get(*req.SessionID)
		if !ok {
			writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
			return
		}
		sess = got
	}

	now := time.Now().UTC()
	snapshot := s.buildIssueSnapshot(r.Context(), now, sess)
	markdown := renderSnapshotMarkdown(snapshot)

	id, err := randomCaptureID()
	if err != nil {
		s.log.Error().Err(err).Msg("generating issue capture id failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "generating capture id")
		return
	}
	s.issueCaptures.put(&issueCapture{id: id, capturedAt: now, snapshot: snapshot, snapshotMarkdown: markdown})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(createCaptureResponse{
		CaptureID:        id,
		CapturedAt:       now.Format(time.RFC3339),
		Snapshot:         snapshot,
		SnapshotMarkdown: markdown,
	})
}

// createIssueRequest is POST /api/issues' request body (docs/protocol.md §3.13).
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

// handleCreateIssue is POST /api/issues (REQ-8/REQ-9/REQ-10, docs/protocol.md §3.13).
func (s *Server) handleCreateIssue(w http.ResponseWriter, r *http.Request) {
	if s.issueAPIURL == "" {
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
	// REQ-6/docs/protocol.md §3.13 both say "chars" — len() on a Go string is bytes, which
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

	capture := s.issueCaptures.reserve(req.CaptureID, time.Now().UTC())
	if capture == nil {
		// Edge Case 2's remedy sentence lives here: the pinned UI summary is always
		// "Could not file the issue.", so this message is the only place the user sees
		// what to actually do about it (review cycle 1 Minor 3).
		writeJSONError(w, http.StatusConflict, "capture_expired", "capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot")
		return
	}

	// context.WithoutCancel (mirrors sessionLauncher.Launch/Resume, Edge Case 13): once
	// the capture is reserved, a client that navigates away or hits Escape must not
	// cancel the in-flight GitHub POST — the daemon still files it and logs it.
	ctx := context.WithoutCancel(r.Context())
	body := composeIssueBody(req.Note, capture.snapshotMarkdown)

	number, htmlURL, err := s.issueClient.CreateIssue(ctx, s.issueRepo, title, body)
	if err != nil {
		s.issueCaptures.release(req.CaptureID)

		var authErr *ghissue.ErrAuthFailed
		var postErr *ghissue.ErrPostFailed
		switch {
		case errors.As(err, &authErr):
			// authErr.Message is proven token-free by D9/INV-3 — safe to log (review
			// cycle 1 Major: the warn line must carry the upstream status/message, not
			// just the stage). Field name must not be "message": that collides with
			// zerolog.MessageFieldName (the key Msg() itself writes), which silently
			// drops this field under ConsoleWriter and duplicates the JSON key
			// (review cycle 2 Critical 1).
			s.log.Warn().Str("stage", "token").Str("upstream", authErr.Message).Msg("filing issue: obtaining github token failed")
			writeJSONError(w, http.StatusBadGateway, "issue_auth_failed", authErr.Message)
		case errors.As(err, &postErr):
			// postErr.Message already carries GitHub's upstream status (e.g. "github
			// returned 404: ...") and message where GitHub provided one — proven
			// token-free by D9/INV-3. Field name "upstream", not "message" (review
			// cycle 2 Critical 1 — see comment above).
			s.log.Warn().Str("stage", "post").Bool("maybe_created", postErr.MaybeCreated).Str("upstream", postErr.Message).Msg("filing issue: posting to github failed")
			writeJSONError(w, http.StatusBadGateway, "issue_post_failed", postErr.Message)
		default:
			s.log.Warn().Err(err).Str("stage", "post").Msg("filing issue: unexpected failure")
			writeJSONError(w, http.StatusBadGateway, "issue_post_failed", "filing the issue failed")
		}
		return
	}

	s.issueCaptures.consume(req.CaptureID)

	s.log.Info().
		Int("number", number).
		Str("url", htmlURL).
		Str("scope", capture.snapshot.Scope).
		Int("title_len", utf8.RuneCountInString(title)).
		Int("note_len", utf8.RuneCountInString(req.Note)).
		Msg("filed github issue")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(createIssueResponse{Number: number, URL: htmlURL, Repo: s.issueRepo})
}
