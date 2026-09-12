package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// --- generic test helpers ---

func p[T any](v T) *T { return &v }

// issueTestToken is a sentinel bearer token used across issue-capture tests: any test
// that asserts INV-3 ("the token never escapes") looks for this exact string in a
// response body or log line.
const issueTestToken = "issue-capture-sentinel-token-should-never-leak"

// newIssueTestServer builds a full Server with issue capture enabled against a fake
// GitHub endpoint and a scratch token file (REQ-14's test seams) — mirrors
// newUsageRefreshTestServer's shape in usage_test.go for the equivalent feature.
func newIssueTestServer(t *testing.T, ghURL, repo, token string) *testServer {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	logBuf := &syncBuffer{}
	logger := zerolog.New(logBuf)

	tokenFile := filepath.Join(t.TempDir(), "token.txt")
	require.NoError(t, os.WriteFile(tokenFile, []byte(token), 0o600))

	srv := New(Config{
		Store: st, Logger: logger, UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		Issue: IssueConfig{Repo: repo, APIURL: ghURL, TokenFile: tokenFile},
	})
	return &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st}
}

func postCaptureRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/issue/captures", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func postIssueRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func decodeCaptureResponse(t *testing.T, rec *httptest.ResponseRecorder) createCaptureResponse {
	t.Helper()
	var resp createCaptureResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	return resp
}

func decodeCaptureID(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	return decodeCaptureResponse(t, rec).CaptureID
}

func decodeIssueResponse(t *testing.T, rec *httptest.ResponseRecorder) createIssueResponse {
	t.Helper()
	var resp createIssueResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	return resp
}

// decodeLastLogEvent decodes the last non-empty newline-delimited JSON line zerolog
// wrote to srv.logs into a map, so tests can assert on a decoded field's value rather
// than substring-matching the raw byte stream — a raw-JSON logger writes one object per
// line, and a duplicate key within an object collapses to the last value once parsed
// (review cycle 2 Major 1: `assert.Contains` on the raw bytes matched a colliding
// "message" key that no JSON parser, and no production writer, could actually see).
func decodeLastLogEvent(t *testing.T, srv *testServer) map[string]any {
	t.Helper()
	lines := strings.Split(strings.TrimRight(srv.logs.String(), "\n"), "\n")
	require.NotEmpty(t, lines, "expected at least one log line")
	last := lines[len(lines)-1]
	require.NotEmpty(t, last, "expected a non-empty last log line")
	var event map[string]any
	require.NoError(t, json.Unmarshal([]byte(last), &event), "last log line is not valid JSON: %s", last)
	return event
}

// insertEvents inserts len(types) events for sessionID, one per type in order, so
// EventSummary sees firstSeq 1, lastSeq len(types), count len(types), and recentTypes
// exactly types (oldest-first, since len(types) <= 10 here).
func insertEvents(t *testing.T, srv *testServer, sessionID int64, types []string) {
	t.Helper()
	ctx := context.Background()
	claudeID := fmt.Sprintf("claude-session-for-muster-%d", sessionID)
	sid := sessionID
	for _, typ := range types {
		require.NoError(t, srv.store.InsertEvent(ctx, store.Event{
			ClaudeSessionID: claudeID,
			Type:            typ,
			Payload:         []byte(`{}`),
			SessionID:       &sid,
		}))
	}
}

// --- fake GitHub Issues API ---

type capturedGHRequest struct {
	method  string
	path    string
	headers http.Header
	body    string
}

// fakeGitHubAPI is a controllable fake for the GitHub Issues endpoint: every request is
// recorded (so a test can assert exactly one request reached GitHub, or none at all),
// and the response is swappable mid-test (setResponse) so a failure-then-retry sequence
// can be driven from one server. block, if set, is closed by request 0's handler after
// recording the request but before responding — used to hold one request in flight for
// the D10/Edge-Case-12 concurrency test.
type fakeGitHubAPI struct {
	mu       sync.Mutex
	status   int
	body     string
	block    chan struct{}
	requests []capturedGHRequest
}

func newFakeGitHubAPI(status int, body string) *fakeGitHubAPI {
	return &fakeGitHubAPI{status: status, body: body}
}

func (f *fakeGitHubAPI) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)

		f.mu.Lock()
		status, body, block := f.status, f.body, f.block
		f.requests = append(f.requests, capturedGHRequest{method: r.Method, path: r.URL.Path, headers: r.Header.Clone(), body: string(raw)})
		f.mu.Unlock()

		if block != nil {
			<-block
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (f *fakeGitHubAPI) setResponse(status int, body string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.status, f.body = status, body
}

func (f *fakeGitHubAPI) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.requests)
}

func (f *fakeGitHubAPI) requestAt(i int) capturedGHRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.requests[i]
}

// ===========================================================================
// captureStore (white-box: REQ-15, D10, Edge Case 12)
// ===========================================================================

func TestCaptureStore_PutAndReserve_RoundTrip(t *testing.T) {
	cs := newCaptureStore()
	now := time.Now().UTC()
	cs.put(&issueCapture{id: "a", capturedAt: now})

	got := cs.reserve("a", now)

	require.NotNil(t, got)
	assert.Equal(t, "a", got.id)
}

func TestCaptureStore_Reserve_UnknownIDReturnsNil(t *testing.T) {
	cs := newCaptureStore()

	assert.Nil(t, cs.reserve("does-not-exist", time.Now().UTC()))
}

func TestCaptureStore_Reserve_ConsumedReturnsNil(t *testing.T) {
	cs := newCaptureStore()
	now := time.Now().UTC()
	cs.put(&issueCapture{id: "a", capturedAt: now})
	cs.consume("a")

	assert.Nil(t, cs.reserve("a", now), "a consumed capture can never be reused (D10)")
}

func TestCaptureStore_Reserve_InFlightReturnsNil(t *testing.T) {
	cs := newCaptureStore()
	now := time.Now().UTC()
	cs.put(&issueCapture{id: "a", capturedAt: now})
	require.NotNil(t, cs.reserve("a", now), "first reservation must succeed")

	assert.Nil(t, cs.reserve("a", now), "a second concurrent reservation must fail (Edge Case 12)")
}

func TestCaptureStore_Reserve_ExpiredReturnsNil(t *testing.T) {
	cs := newCaptureStore()
	capturedAt := time.Now().UTC().Add(-captureTTL - time.Second)
	cs.put(&issueCapture{id: "a", capturedAt: capturedAt})

	assert.Nil(t, cs.reserve("a", time.Now().UTC()), "a capture older than the 15-minute TTL must be rejected")
}

func TestCaptureStore_Reserve_JustUnderTTLStillUsable(t *testing.T) {
	cs := newCaptureStore()
	now := time.Now().UTC()
	capturedAt := now.Add(-captureTTL + time.Second)
	cs.put(&issueCapture{id: "a", capturedAt: capturedAt})

	assert.NotNil(t, cs.reserve("a", now), "a capture just inside the TTL must still be usable")
}

func TestCaptureStore_Release_AllowsReReserveAfterFailure(t *testing.T) {
	cs := newCaptureStore()
	now := time.Now().UTC()
	cs.put(&issueCapture{id: "a", capturedAt: now})
	require.NotNil(t, cs.reserve("a", now))

	cs.release("a")

	assert.NotNil(t, cs.reserve("a", now), "release must allow a retry without re-capturing (REQ-10)")
}

func TestCaptureStore_Consume_ClearsInFlightAndPermanentlyBlocksReuse(t *testing.T) {
	cs := newCaptureStore()
	now := time.Now().UTC()
	cs.put(&issueCapture{id: "a", capturedAt: now})
	require.NotNil(t, cs.reserve("a", now))

	cs.consume("a")

	assert.Nil(t, cs.reserve("a", now))
}

// TestCaptureStore_Put_EvictsOldestByCapturedAtWhenOverCapacity covers REQ-15's "at most
// 8 captures are held; taking a 9th evicts the oldest by capturedAt" — deliberately
// inserted out of chronological order so the eviction can't be passing by coincidence of
// insertion order.
func TestCaptureStore_Put_EvictsOldestByCapturedAtWhenOverCapacity(t *testing.T) {
	cs := newCaptureStore()
	base := time.Now().UTC()

	// Insert 8 captures with ids "0".."7", ages descending (id "0" is oldest).
	for i := range maxCaptures {
		cs.put(&issueCapture{id: fmt.Sprintf("%d", i), capturedAt: base.Add(time.Duration(i) * time.Minute)})
	}
	require.NotNil(t, cs.reserve("0", base), "sanity: the oldest is present before the 9th arrives")

	cs.put(&issueCapture{id: "8", capturedAt: base.Add(9 * time.Minute)})

	assert.Nil(t, cs.reserve("0", base), "the oldest-by-capturedAt entry must be evicted")
	for i := 1; i <= 8; i++ {
		id := fmt.Sprintf("%d", i)
		assert.NotNil(t, cs.reserve(id, base), "capture %s must survive the eviction", id)
		cs.release(id)
	}
}

func TestRandomCaptureID_Produces32HexCharsAndIsNotConstant(t *testing.T) {
	a, err := randomCaptureID()
	require.NoError(t, err)
	b, err := randomCaptureID()
	require.NoError(t, err)

	assert.Len(t, a, 32)
	assert.Regexp(t, "^[0-9a-f]{32}$", a)
	assert.NotEqual(t, a, b)
}

// ===========================================================================
// noteSection / composeIssueBody (daemon's half of the "one composer, two callers" rule)
// ===========================================================================

func TestNoteSection_EmptyAndWhitespaceOnlyReturnEmptyString(t *testing.T) {
	for _, note := range []string{"", "   ", "\n\n\t  \n"} {
		assert.Empty(t, noteSection(note))
	}
}

func TestNoteSection_TrimsAndWrapsInHeading(t *testing.T) {
	assert.Equal(t, "## What happened\n\nsomething broke\n\n", noteSection("  something broke  "))
}

func TestNoteSection_NormalizesCRLFToLF(t *testing.T) {
	got := noteSection("line one\r\nline two\r\n")
	assert.Equal(t, "## What happened\n\nline one\nline two\n\n", got)
	assert.NotContains(t, got, "\r")
}

func TestComposeIssueBody_EmptyNoteOmitsHeadingEntirely(t *testing.T) {
	got := composeIssueBody("   ", "## Snapshot\n\n...")
	assert.Equal(t, "## Snapshot\n\n...", got)
}

func TestComposeIssueBody_NoteThenSnapshotMarkdown_NoTrailingNewline(t *testing.T) {
	got := composeIssueBody("it broke", "## Snapshot\n\n| field | value |")
	assert.Equal(t, "## What happened\n\nit broke\n\n## Snapshot\n\n| field | value |", got)
	assert.False(t, strings.HasSuffix(got, "\n"), "the composed body must carry no trailing newline")
}

// ===========================================================================
// renderSnapshotMarkdown row construction (plan "## The issue body")
// ===========================================================================

func minimalDashboardSnapshot() issueSnapshot {
	snap := issueSnapshot{CapturedAt: "2026-08-31T09:15:00Z", Scope: "dashboard"}
	snap.Musterd.Version = "0.3.1"
	snap.ClaudeCode = issueSnapshotClaudeCode{Installed: p("2.1.267"), Floor: "2.1.246", Verified: "2.1.267", Status: "verified"}
	snap.Host = issueSnapshotHost{OS: "darwin", Arch: "arm64"}
	snap.Dashboard = issueSnapshotDashboard{SessionsTotal: 4, SessionsAlive: 3, View: "tiles", Density: "3x2", RailSort: "manual"}
	return snap
}

func TestRenderSnapshotMarkdown_DashboardScope_OnlyFirstFourRowsNoSessionKey(t *testing.T) {
	got := renderSnapshotMarkdown(minimalDashboardSnapshot())

	assert.Contains(t, got, "| musterd | 0.3.1 |")
	assert.Contains(t, got, "| dashboard | 4 sessions, 3 alive · view tiles 3x2 · rail manual |")
	assert.NotContains(t, got, "| state |")
	assert.NotContains(t, got, "\"session\"", "dashboard scope must carry no session key in the JSON block")
}

func TestRenderSnapshotMarkdown_FooterIsConstantString(t *testing.T) {
	got := renderSnapshotMarkdown(minimalDashboardSnapshot())
	assert.True(t, strings.HasSuffix(got, issueFooter))
}

func TestRenderSnapshotMarkdown_JSONFenceIsFourBackticks(t *testing.T) {
	got := renderSnapshotMarkdown(minimalDashboardSnapshot())
	assert.Contains(t, got, "````json\n")
	assert.Contains(t, got, "\n````\n")
	// Never a bare triple-backtick fence line (which a note's own fence could close).
	assert.NotContains(t, got, "\n```json")
}

func sessionSnapshotFixture() issueSnapshot {
	snap := minimalDashboardSnapshot()
	snap.Scope = "session"
	// The protocol's own worked example (kb:anchor/issue.captures): installed past the
	// verified ceiling.
	installed := "2.1.270"
	snap.ClaudeCode.Installed = &installed
	snap.ClaudeCode.Status = "above"
	firstSeq, lastSeq := int64(1), int64(4)
	lastReceivedAt := "2026-08-31T09:14:58Z"
	snap.Session = &issueSnapshotSession{
		State:                "working",
		StateSince:           "2026-08-31T09:11:02Z",
		Alive:                true,
		Attention:            &issueSnapshotAttention{Reason: "permission", Since: "2026-08-31T09:14:50Z"},
		Failure:              &issueSnapshotFailure{Error: "server_error"},
		Model:                &issueSnapshotModel{ID: "claude-opus-5"},
		PermissionMode:       issueSnapshotPermission{Value: "plan", Source: "hook"},
		Context:              &issueSnapshotContext{UsedPct: 42, TotalInputTokens: 84211, WindowSize: 200000},
		Compactions:          2,
		TmuxTarget:           "muster-7:@4",
		CreatedAt:            "2026-08-31T09:04:00Z",
		ClaudeSessionIDBound: true,
		Events: issueSnapshotEvents{
			FirstSeq: &firstSeq, LastSeq: &lastSeq, Count: 4, LastReceivedAt: &lastReceivedAt,
			RecentTypes: []string{"PreToolUse", "PostToolUse", "PreToolUse", "Stop"},
		},
	}
	return snap
}

// TestRenderSnapshotMarkdown_SessionScope_RowOrderAndAllConditionalRowsPresent covers
// the plan's "Row order is exactly as above" rule with every conditional row (attention,
// failure) present at once.
func TestRenderSnapshotMarkdown_SessionScope_RowOrderAndAllConditionalRowsPresent(t *testing.T) {
	got := renderSnapshotMarkdown(sessionSnapshotFixture())

	wantOrder := []string{
		"| musterd | 0.3.1 |",
		"| Claude Code | 2.1.270 installed · verified 2.1.246–2.1.267 · above |",
		"| host | darwin/arm64 |",
		"| dashboard | 4 sessions, 3 alive · view tiles 3x2 · rail manual |",
		"| state | working since 2026-08-31T09:11:02Z |",
		"| alive | true |",
		"| attention | permission since 2026-08-31T09:14:50Z |",
		"| failure | server_error |",
		"| model | claude-opus-5 |",
		"| permission mode | plan (last known, source hook) |",
		"| context | 42% · 84211 / 200000 tokens |",
		"| compactions | 2 |",
		"| tmux | muster-7:@4 |",
		"| session | created 2026-08-31T09:04:00Z · claude session bound |",
		"| events | seq 1-4, 4 routed · last 2026-08-31T09:14:58Z |",
		"| recent events | PreToolUse, PostToolUse, PreToolUse, Stop |",
	}
	var idx []int
	for _, line := range wantOrder {
		i := strings.Index(got, line)
		require.NotEqual(t, -1, i, "expected line not found: %q", line)
		idx = append(idx, i)
	}
	assert.True(t, sort.IntsAreSorted(idx), "rows must appear in exactly the pinned order")
}

func TestRenderSnapshotMarkdown_AttentionRowAbsentWhenNil(t *testing.T) {
	snap := sessionSnapshotFixture()
	snap.Session.Attention = nil
	got := renderSnapshotMarkdown(snap)
	assert.NotContains(t, got, "| attention |")
}

func TestRenderSnapshotMarkdown_FailureRowAbsentWhenNil(t *testing.T) {
	snap := sessionSnapshotFixture()
	snap.Session.Failure = nil
	got := renderSnapshotMarkdown(snap)
	assert.NotContains(t, got, "| failure |")
}

func TestRenderSnapshotMarkdown_EndedRowAbsentWhenEndedAtNil(t *testing.T) {
	snap := sessionSnapshotFixture()
	snap.Session.EndedAt = nil
	got := renderSnapshotMarkdown(snap)
	assert.NotContains(t, got, "| ended |")
}

func TestRenderSnapshotMarkdown_EndedRowPresentAfterAliveRowWhenEndedAtSet(t *testing.T) {
	snap := sessionSnapshotFixture()
	snap.Session.EndedAt = p("2026-08-31T09:20:00Z")
	got := renderSnapshotMarkdown(snap)

	aliveIdx := strings.Index(got, "| alive | true |")
	endedIdx := strings.Index(got, "| ended | 2026-08-31T09:20:00Z |")
	attentionIdx := strings.Index(got, "| attention |")
	require.NotEqual(t, -1, aliveIdx)
	require.NotEqual(t, -1, endedIdx)
	require.NotEqual(t, -1, attentionIdx)
	assert.True(t, aliveIdx < endedIdx && endedIdx < attentionIdx, "ended must sit between alive and attention")
}

// TestRenderSnapshotMarkdown_UnknownRendering covers REQ-12: unknown values render the
// literal word "unknown", never 0 or a blank cell, for each of the documented fields.
func TestRenderSnapshotMarkdown_UnknownRendering(t *testing.T) {
	t.Run("context nil", func(t *testing.T) {
		snap := sessionSnapshotFixture()
		snap.Session.Context = nil
		got := renderSnapshotMarkdown(snap)
		assert.Contains(t, got, "| context | unknown |")
	})

	t.Run("model nil", func(t *testing.T) {
		snap := sessionSnapshotFixture()
		snap.Session.Model = nil
		got := renderSnapshotMarkdown(snap)
		assert.Contains(t, got, "| model | unknown |")
	})

	t.Run("claudeCode installed nil renders installed unknown regardless of status", func(t *testing.T) {
		snap := sessionSnapshotFixture()
		snap.ClaudeCode.Installed = nil
		// Status is left "above" from the fixture; the rule is that claudeCodeCell
		// branches solely on Installed == nil, so the status word must never leak
		// into this cell once installed is unknown (INV-1's daemon-side counterpart).
		got := renderSnapshotMarkdown(snap)
		assert.Contains(t, got, "| Claude Code | installed unknown · verified 2.1.246–2.1.267 |")
		assert.NotContains(t, got, "| Claude Code | installed unknown · verified 2.1.246–2.1.267 · above |")
	})

	t.Run("events count zero: none routed, none recent", func(t *testing.T) {
		snap := sessionSnapshotFixture()
		snap.Session.Events = issueSnapshotEvents{Count: 0, RecentTypes: nil}
		got := renderSnapshotMarkdown(snap)
		assert.Contains(t, got, "| events | none routed |")
		assert.Contains(t, got, "| recent events | none |")
	})
}

// TestClaudeCodeCell is D14's direct unit coverage of the cell text
// (kb:anchor/issue.captures), independent of the full markdown row-order fixture above.
func TestClaudeCodeCell(t *testing.T) {
	tests := []struct {
		name string
		cc   issueSnapshotClaudeCode
		want string
	}{
		{
			name: "verified",
			cc:   issueSnapshotClaudeCode{Installed: p("2.1.250"), Floor: "2.1.246", Verified: "2.1.267", Status: "verified"},
			want: "2.1.250 installed · verified 2.1.246–2.1.267 · verified",
		},
		{
			name: "above",
			cc:   issueSnapshotClaudeCode{Installed: p("2.1.270"), Floor: "2.1.246", Verified: "2.1.267", Status: "above"},
			want: "2.1.270 installed · verified 2.1.246–2.1.267 · above",
		},
		{
			name: "below",
			cc:   issueSnapshotClaudeCode{Installed: p("2.0.0"), Floor: "2.1.246", Verified: "2.1.267", Status: "below"},
			want: "2.0.0 installed · verified 2.1.246–2.1.267 · below",
		},
		{
			name: "installed nil (unknown) ignores whatever status is set",
			cc:   issueSnapshotClaudeCode{Installed: nil, Floor: "2.1.246", Verified: "2.1.267", Status: "unknown"},
			want: "installed unknown · verified 2.1.246–2.1.267",
		},
		{
			name: "single-version range renders as one version, both branches",
			cc:   issueSnapshotClaudeCode{Installed: p("2.1.267"), Floor: "2.1.267", Verified: "2.1.267", Status: "verified"},
			want: "2.1.267 installed · verified 2.1.267 · verified",
		},
		{
			name: "single-version range, installed nil",
			cc:   issueSnapshotClaudeCode{Installed: nil, Floor: "2.1.267", Verified: "2.1.267", Status: "unknown"},
			want: "installed unknown · verified 2.1.267",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, claudeCodeCell(tt.cc))
		})
	}
}

// TestRenderSnapshotMarkdown_EscapesPipeAndNewlineInValueCells covers Edge Case 11: a
// literal `|` and a newline in a value cell must never break the table.
func TestRenderSnapshotMarkdown_EscapesPipeAndNewlineInValueCells(t *testing.T) {
	snap := sessionSnapshotFixture()
	snap.Session.Failure = &issueSnapshotFailure{Error: "weird|token\nwith a line break"}
	got := renderSnapshotMarkdown(snap)

	assert.Contains(t, got, `| failure | weird\|token with a line break |`)
	// The raw (unescaped) form must not appear as a table row.
	assert.NotContains(t, got, "| failure | weird|token")
}

func TestRenderSnapshotMarkdown_EscapesCRLFInValueCells(t *testing.T) {
	snap := sessionSnapshotFixture()
	snap.Session.Failure = &issueSnapshotFailure{Error: "line one\r\nline two"}
	got := renderSnapshotMarkdown(snap)
	assert.Contains(t, got, "| failure | line one line two |")
}

func TestRenderSnapshotMarkdown_JSONBlockIsTwoSpaceIndentedStructOrder(t *testing.T) {
	snap := minimalDashboardSnapshot()
	got := renderSnapshotMarkdown(snap)

	raw, err := json.MarshalIndent(snap, "", "  ")
	require.NoError(t, err)
	assert.Contains(t, got, string(raw))
}

// ===========================================================================
// buildIssueSnapshot: D4 (exact key set), INV-1 (hard exclusions), REQ-12 (unknown)
// ===========================================================================

// hardExclusionSentinels names every value fullyPopulatedSession sets on an excluded
// field, distinct enough that a substring match cannot occur by coincidence.
var hardExclusionSentinels = []string{
	"claude-id-sentinel-must-never-leak",
	"/sentinel/directory/must/never/leak",
	"sentinel-branch-must-never-leak",
	"sentinel title must never leak",
	"sentinel assistant failure message must never leak",
	"sentinel last activity must never leak",
	"sentinel pane capture must never leak",
	"sentinel model display name must never leak",
}

// fullyPopulatedSession builds a *session.Session with every field set, including all
// six hard-exclusion classes carrying distinct sentinel values (D4/INV-1) — deliberately
// combining Attention+Failure+EndedAt at once even though the real state machine would
// never produce that combination, because buildIssueSnapshot/renderSnapshotMarkdown
// operate on whatever fields are set, not on state-machine legality.
func fullyPopulatedSession(id int64) *session.Session {
	endedAt := time.Date(2026, 8, 31, 9, 20, 0, 0, time.UTC)
	return &session.Session{
		ID:                   id,
		TmuxTarget:           "muster-7:@4",
		TmuxPane:             "%12",
		ClaudeSessionID:      "claude-id-sentinel-must-never-leak",
		RepoID:               1,
		Directory:            "/sentinel/directory/must/never/leak",
		Branch:               p("sentinel-branch-must-never-leak"),
		IsWorktree:           true,
		Title:                p("sentinel title must never leak"),
		State:                session.StateFailed,
		StateSince:           time.Date(2026, 8, 31, 9, 11, 2, 0, time.UTC),
		PermissionMode:       session.PermissionPlan,
		PermissionModeSource: "hook",
		Model:                &session.Model{ID: "claude-opus-5", DisplayName: "sentinel model display name must never leak"},
		Context:              &session.Context{UsedPct: 42.4, TotalInputTokens: 84211, WindowSize: 200000},
		Compactions:          2,
		Attention:            &session.Attention{Reason: "permission", Since: time.Date(2026, 8, 31, 9, 14, 50, 0, time.UTC)},
		Failure:              &session.Failure{Error: "server_error", Message: "sentinel assistant failure message must never leak"},
		LastActivity:         p("sentinel last activity must never leak"),
		Alive:                false,
		EndedAt:              &endedAt,
		FirstLaunchHere:      true,
		CreatedAt:            time.Date(2026, 8, 31, 9, 4, 0, 0, time.UTC),
		LastSnapshot:         "sentinel pane capture must never leak",
		LastSnapshotAt:       time.Date(2026, 8, 31, 9, 19, 0, 0, time.UTC),
	}
}

// assertNoHardExclusionLeak checks the snapshot JSON, the rendered markdown, and the
// full composed body (as if posted) for every hard-exclusion sentinel that is still set
// on sess — a row test may have nilled one field out deliberately, in which case that
// sentinel is trivially absent and the rest are still checked.
func assertNoHardExclusionLeak(t *testing.T, srv *testServer, sess *session.Session) issueSnapshot {
	t.Helper()
	snap := srv.buildIssueSnapshot(context.Background(), time.Now(), sess)
	rawJSON, err := json.Marshal(snap)
	require.NoError(t, err)
	markdown := renderSnapshotMarkdown(snap)
	body := composeIssueBody("an unrelated note", markdown)

	for _, sentinel := range hardExclusionSentinels {
		assert.NotContains(t, string(rawJSON), sentinel, "snapshot JSON must not contain %q", sentinel)
		assert.NotContains(t, markdown, sentinel, "snapshotMarkdown must not contain %q", sentinel)
		assert.NotContains(t, body, sentinel, "composed body must not contain %q", sentinel)
	}
	// The claude session id's own VALUE is excluded even when non-empty; only the
	// derived boolean may appear. (An empty ClaudeSessionID — the unbound case — is
	// skipped here: every string trivially "contains" the empty string.)
	if sess.ClaudeSessionID != "" {
		assert.NotContains(t, string(rawJSON), sess.ClaudeSessionID)
	}
	return snap
}

// TestBuildIssueSnapshot_HardExclusionsNeverLeak_AcrossEveryReachableState is INV-1's
// core cross-state assertion (m1-sessions lesson: assert an "iff"/"never" rule from
// every reachable source state, not the convenient one) — all six displayed states, with
// Attention/Failure present only where the real state machine would set them.
func TestBuildIssueSnapshot_HardExclusionsNeverLeak_AcrossEveryReachableState(t *testing.T) {
	states := []session.State{
		session.StateStarted, session.StatePlanning, session.StateWorking,
		session.StateNeedsInput, session.StateFailed, session.StateIdle,
	}
	for _, st := range states {
		t.Run(string(st), func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			sess := fullyPopulatedSession(1)
			sess.State = st
			if st != session.StateNeedsInput {
				sess.Attention = nil
			}
			if st != session.StateFailed {
				sess.Failure = nil
			}
			snap := assertNoHardExclusionLeak(t, srv, sess)
			assert.Equal(t, string(st), snap.Session.State)
		})
	}
}

func TestBuildIssueSnapshot_HardExclusionsNeverLeak_AliveWithNoEndedAt(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := fullyPopulatedSession(1)
	sess.Alive = true
	sess.EndedAt = nil
	snap := assertNoHardExclusionLeak(t, srv, sess)
	assert.True(t, snap.Session.Alive)
	assert.Nil(t, snap.Session.EndedAt)
}

func TestBuildIssueSnapshot_HardExclusionsNeverLeak_DeadSessionWithEndedAt(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := fullyPopulatedSession(1)
	snap := assertNoHardExclusionLeak(t, srv, sess) // fullyPopulatedSession is already dead
	assert.False(t, snap.Session.Alive)
	require.NotNil(t, snap.Session.EndedAt)
}

func TestBuildIssueSnapshot_HardExclusionsNeverLeak_ClaudeSessionUnbound(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := fullyPopulatedSession(1)
	sess.ClaudeSessionID = ""
	snap := assertNoHardExclusionLeak(t, srv, sess)
	assert.False(t, snap.Session.ClaudeSessionIDBound)
}

func TestBuildIssueSnapshot_HardExclusionsNeverLeak_ContextNil(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := fullyPopulatedSession(1)
	sess.Context = nil
	snap := assertNoHardExclusionLeak(t, srv, sess)
	assert.Nil(t, snap.Session.Context)
	assert.Contains(t, renderSnapshotMarkdown(snap), "| context | unknown |")
}

func TestBuildIssueSnapshot_HardExclusionsNeverLeak_TitleAndLastActivityNil(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := fullyPopulatedSession(1)
	sess.Title = nil
	sess.LastActivity = nil
	assertNoHardExclusionLeak(t, srv, sess)
}

// TestBuildIssueSnapshot_UnboundSession_EventsAllZeroNullEmpty covers Edge Case 17
// exactly: a session that never bound reports firstSeq/lastSeq null, count 0, recentTypes
// an empty array (never null, and never omitted).
func TestBuildIssueSnapshot_UnboundSession_EventsAllZeroNullEmpty(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	sess := fullyPopulatedSession(999) // no events inserted for this id

	snap := srv.buildIssueSnapshot(context.Background(), time.Now(), sess)

	require.NotNil(t, snap.Session)
	assert.Nil(t, snap.Session.Events.FirstSeq)
	assert.Nil(t, snap.Session.Events.LastSeq)
	assert.Equal(t, 0, snap.Session.Events.Count)
	assert.Nil(t, snap.Session.Events.LastReceivedAt)
	assert.Equal(t, []string{}, snap.Session.Events.RecentTypes, "recentTypes must be [] not null when unbound")

	raw, err := json.Marshal(snap.Session.Events)
	require.NoError(t, err)
	assert.JSONEq(t, `{"firstSeq":null,"lastSeq":null,"count":0,"lastReceivedAt":null,"recentTypes":[]}`, string(raw))
}

// TestBuildIssueSnapshot_EventsSummaryReflectsLast10RoutedEvents covers the allowlist's
// "last 10 event.type values, oldest-first" clause with more than 10 events routed, so
// the 10-cap and the ordering are both exercised (not just a small fixture).
func TestBuildIssueSnapshot_EventsSummaryReflectsLast10RoutedEvents(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	types := make([]string, 0, 14)
	for i := 1; i <= 14; i++ {
		types = append(types, fmt.Sprintf("Event%d", i))
	}
	insertEvents(t, srv, 1, types)
	sess := fullyPopulatedSession(1)

	snap := srv.buildIssueSnapshot(context.Background(), time.Now(), sess)

	require.NotNil(t, snap.Session)
	require.NotNil(t, snap.Session.Events.FirstSeq)
	require.NotNil(t, snap.Session.Events.LastSeq)
	assert.Equal(t, int64(1), *snap.Session.Events.FirstSeq)
	assert.Equal(t, int64(14), *snap.Session.Events.LastSeq)
	assert.Equal(t, 14, snap.Session.Events.Count)
	assert.Equal(t, []string{"Event5", "Event6", "Event7", "Event8", "Event9", "Event10", "Event11", "Event12", "Event13", "Event14"}, snap.Session.Events.RecentTypes)
}

// TestBuildIssueSnapshot_LastReceivedAtIsPlainRFC3339NoFraction covers the daemon-impl
// log's documented decision: event.received_at is stored RFC3339Nano but the snapshot
// reformats it to plain RFC3339 (no fractional seconds) to match the allowlist's stated
// type.
func TestBuildIssueSnapshot_LastReceivedAtIsPlainRFC3339NoFraction(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	insertEvents(t, srv, 1, []string{"Stop"})
	sess := fullyPopulatedSession(1)

	snap := srv.buildIssueSnapshot(context.Background(), time.Now(), sess)

	require.NotNil(t, snap.Session.Events.LastReceivedAt)
	_, err := time.Parse(time.RFC3339, *snap.Session.Events.LastReceivedAt)
	assert.NoError(t, err, "lastReceivedAt must parse as plain RFC3339")
	assert.NotContains(t, *snap.Session.Events.LastReceivedAt, ".", "no fractional-second component")
}

// TestBuildIssueSnapshot_DashboardScope_KeySetExactly covers D4 for scope == "dashboard":
// exactly the 13 always-present keys, and no "session" key at all.
func TestBuildIssueSnapshot_DashboardScope_KeySetExactly(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{Floor: "2.1.246", Verified: "2.1.267", Status: "verified"})

	snap := srv.buildIssueSnapshot(context.Background(), time.Now(), nil)
	raw, err := json.Marshal(snap)
	require.NoError(t, err)

	want := []string{
		"capturedAt", "scope",
		"musterd.version",
		"claudeCode.installed", "claudeCode.floor", "claudeCode.verified", "claudeCode.status",
		"host.os", "host.arch",
		"dashboard.sessionsTotal", "dashboard.sessionsAlive", "dashboard.view", "dashboard.density", "dashboard.railSort",
	}
	sort.Strings(want)
	assert.Equal(t, want, collectJSONPaths(t, raw))
	assert.Equal(t, "dashboard", snap.Scope)
}

// TestBuildIssueSnapshot_SessionScope_KeySetMatchesAllowlistExactly is D4: a session
// populated in every field (fullyPopulatedSession, including all six excluded classes)
// must marshal to exactly the key set pinned in the plan's "The allowlist" — nothing
// more, nothing less, at every level.
func TestBuildIssueSnapshot_SessionScope_KeySetMatchesAllowlistExactly(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{Installed: p("2.1.270"), Floor: "2.1.246", Verified: "2.1.267", Status: "above"})
	insertEvents(t, srv, 1, []string{"PreToolUse", "PostToolUse", "PreToolUse", "Stop"})
	sess := fullyPopulatedSession(1)

	snap := srv.buildIssueSnapshot(context.Background(), time.Now(), sess)
	raw, err := json.Marshal(snap)
	require.NoError(t, err)

	want := []string{
		"capturedAt", "scope",
		"musterd.version",
		"claudeCode.installed", "claudeCode.floor", "claudeCode.verified", "claudeCode.status",
		"host.os", "host.arch",
		"dashboard.sessionsTotal", "dashboard.sessionsAlive", "dashboard.view", "dashboard.density", "dashboard.railSort",
		"session.state", "session.stateSince", "session.alive", "session.endedAt",
		"session.attention.reason", "session.attention.since",
		"session.failure.error",
		"session.model.id",
		"session.permissionMode.value", "session.permissionMode.source",
		"session.context.usedPct", "session.context.totalInputTokens", "session.context.windowSize",
		"session.compactions", "session.tmuxTarget", "session.createdAt", "session.claudeSessionIdBound",
		"session.events.firstSeq", "session.events.lastSeq", "session.events.count", "session.events.lastReceivedAt", "session.events.recentTypes",
	}
	sort.Strings(want)
	got := collectJSONPaths(t, raw)
	assert.Equal(t, want, got)

	// The negative half of D4/INV-1: none of the excluded field NAMES ever appear as the
	// final path component of any leaf key, even though some are lexically close to
	// allowed ones (claudeSessionIdBound vs. the excluded claudeSessionId value). This is
	// deliberately a leaf-name check, not slice-element containment against the dotted
	// paths in `got` (review cycle 1 Minor 2): `assert.NotContains(got, "title")` tests
	// whether "title" is itself an element of `got`, so a leaked "session.title" entry
	// would never trip it. The exact-set `assert.Equal` above is what actually proves no
	// leak occurs today; this loop exists as an independent, correctly-targeted guard
	// against a future weakening of that equality (e.g. a switch to a subset check).
	for _, excludedKey := range []string{"title", "directory", "branch", "isWorktree", "lastActivity", "lastSnapshot", "message", "claudeSessionId", "usageModel", "fiveHour", "sevenDay", "modelScoped"} {
		for _, path := range got {
			parts := strings.Split(path, ".")
			leaf := parts[len(parts)-1]
			assert.NotEqual(t, excludedKey, leaf, "leaked excluded field %q as the leaf of path %q", excludedKey, path)
		}
	}
}

// collectJSONPaths walks raw's JSON structure and returns every leaf field's dotted key
// path, sorted — used to assert an object's exact key set regardless of Go struct/map
// ordering. An array value (e.g. recentTypes) is treated as a leaf: its own path is
// recorded once, its elements are not descended into.
func collectJSONPaths(t *testing.T, raw []byte) []string {
	t.Helper()
	var v interface{}
	require.NoError(t, json.Unmarshal(raw, &v))

	var out []string
	var walk func(prefix string, node interface{})
	walk = func(prefix string, node interface{}) {
		m, ok := node.(map[string]interface{})
		if !ok {
			if prefix != "" {
				out = append(out, prefix)
			}
			return
		}
		for k, val := range m {
			next := k
			if prefix != "" {
				next = prefix + "." + k
			}
			walk(next, val)
		}
	}
	walk("", v)
	sort.Strings(out)
	return out
}

// TestRenderSnapshotMarkdown_SessionScope_FullyPopulated_MatchesExpectedFormat is a
// byte-exact test of renderSnapshotMarkdown's full output, self-consistent (unlike the
// plan's illustrative pinned example, whose count=47/recentTypes-of-4 combination the
// real algorithm could never produce) — it hardcodes every row's expected text and joins
// them with the same json.MarshalIndent output renderSnapshotMarkdown itself produces,
// so the test exercises row order/content/escaping/fencing precisely without re-deriving
// its own expectations from the code under test.
func TestRenderSnapshotMarkdown_SessionScope_FullyPopulated_MatchesExpectedFormat(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{Installed: p("2.1.270"), Floor: "2.1.246", Verified: "2.1.267", Status: "above"})
	sess := &session.Session{
		ID:                   7,
		TmuxTarget:           "muster-7:@4",
		ClaudeSessionID:      "real-claude-id-not-in-output",
		State:                session.StateWorking,
		StateSince:           time.Date(2026, 8, 31, 9, 11, 2, 0, time.UTC),
		PermissionMode:       session.PermissionPlan,
		PermissionModeSource: "hook",
		Model:                &session.Model{ID: "claude-opus-5"},
		Context:              &session.Context{UsedPct: 42.4, TotalInputTokens: 84211, WindowSize: 200000},
		Compactions:          2,
		Attention:            &session.Attention{Reason: "permission", Since: time.Date(2026, 8, 31, 9, 14, 50, 0, time.UTC)},
		Failure:              &session.Failure{Error: "server_error"},
		Alive:                true,
		CreatedAt:            time.Date(2026, 8, 31, 9, 4, 0, 0, time.UTC),
	}
	insertEvents(t, srv, 7, []string{"PreToolUse", "PostToolUse", "PreToolUse", "Stop"})

	snap := srv.buildIssueSnapshot(context.Background(), time.Now(), sess)
	got := renderSnapshotMarkdown(snap)

	require.NotNil(t, snap.Session)
	require.NotNil(t, snap.Session.Events.LastReceivedAt)
	lastReceivedAt := *snap.Session.Events.LastReceivedAt

	rawJSON, err := json.MarshalIndent(snap, "", "  ")
	require.NoError(t, err)

	want := strings.Join([]string{
		"## Snapshot",
		"",
		"| field | value |",
		"| --- | --- |",
		"| musterd | test-version |",
		"| Claude Code | 2.1.270 installed · verified 2.1.246–2.1.267 · above |",
		fmt.Sprintf("| host | %s/%s |", runtime.GOOS, runtime.GOARCH),
		"| dashboard | 0 sessions, 0 alive · view focus 2x2 · rail manual |",
		"| state | working since 2026-08-31T09:11:02Z |",
		"| alive | true |",
		"| attention | permission since 2026-08-31T09:14:50Z |",
		"| failure | server_error |",
		"| model | claude-opus-5 |",
		"| permission mode | plan (last known, source hook) |",
		"| context | 42% · 84211 / 200000 tokens |",
		"| compactions | 2 |",
		"| tmux | muster-7:@4 |",
		"| session | created 2026-08-31T09:04:00Z · claude session bound |",
		fmt.Sprintf("| events | seq 1-4, 4 routed · last %s |", lastReceivedAt),
		"| recent events | PreToolUse, PostToolUse, PreToolUse, Stop |",
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
	}, "\n")

	assert.Equal(t, want, got)
}

// ===========================================================================
// HTTP: POST /api/issue/captures
// ===========================================================================

func TestHandleCreateCapture_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	req := httptest.NewRequest(http.MethodPost, "/api/issue/captures", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleCreateCapture_DisabledWhenIssueAPIURLEmpty covers REQ-14/Edge Case 14: the
// default newTestServer leaves IssueAPIURL at its zero value, so the endpoint 404s.
func TestHandleCreateCapture_DisabledWhenIssueAPIURLEmpty(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postCaptureRequest(t, srv, `{}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "not_found", decodeErrorCode(t, rec))
}

func TestHandleCreateCapture_InvalidJSONBodyIs400(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec := postCaptureRequest(t, srv, `not valid json`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

func TestHandleCreateCapture_AbsentBodyDefaultsToDashboardScope(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	req := httptest.NewRequest(http.MethodPost, "/api/issue/captures", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusCreated, rec.Code)
	resp := decodeCaptureResponse(t, rec)
	assert.Equal(t, "dashboard", resp.Snapshot.Scope)
}

func TestHandleCreateCapture_UnknownSessionIdIs404(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec := postCaptureRequest(t, srv, `{"sessionId":999999}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

func TestHandleCreateCapture_DashboardScope_Returns201WithSnapshotAndMarkdown(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec := postCaptureRequest(t, srv, `{}`)

	require.Equal(t, http.StatusCreated, rec.Code)
	resp := decodeCaptureResponse(t, rec)
	assert.NotEmpty(t, resp.CaptureID)
	assert.NotEmpty(t, resp.CapturedAt)
	assert.Nil(t, resp.Snapshot.Session)
	assert.Contains(t, resp.SnapshotMarkdown, "## Snapshot")
}

func TestHandleCreateCapture_SessionScope_Returns201WithSnapshotAndMarkdown(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	sessID := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.TmuxTarget = "muster-1:@1"
		row.State = "working"
	})

	rec := postCaptureRequest(t, srv, fmt.Sprintf(`{"sessionId":%d}`, sessID))

	require.Equal(t, http.StatusCreated, rec.Code)
	resp := decodeCaptureResponse(t, rec)
	require.NotNil(t, resp.Snapshot.Session)
	assert.Equal(t, "working", resp.Snapshot.Session.State)
	assert.Equal(t, "muster-1:@1", resp.Snapshot.Session.TmuxTarget)
	assert.Contains(t, resp.SnapshotMarkdown, "| tmux | muster-1:@1 |")
}

func TestHandleCreateCapture_EachCallReturnsDistinctCaptureId(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec1 := postCaptureRequest(t, srv, `{}`)
	rec2 := postCaptureRequest(t, srv, `{}`)

	require.Equal(t, http.StatusCreated, rec1.Code)
	require.Equal(t, http.StatusCreated, rec2.Code)
	assert.NotEqual(t, decodeCaptureID(t, rec1), decodeCaptureID(t, rec2))
}

// TestHandleCreateCapture_D12_WithThreeSessionsPresent_ScopedCaptureLeaksNoBystanderData
// is D12/INV-1's "with other sessions present" clause: a session-scoped capture taken
// while 3+ sessions exist must contain nothing from the bystanders — no other session's
// tmuxTarget, state, or context — and the dashboard counts are the only trace they leave.
func TestHandleCreateCapture_D12_WithThreeSessionsPresent_ScopedCaptureLeaksNoBystanderData(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	aID := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.TmuxTarget = "muster-A:@1"
		row.State = "working"
		row.ContextUsedPct, row.ContextTotalInputTokens, row.ContextWindowSize = p(42.0), p(int64(1000)), p(int64(200000))
	})
	seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.TmuxTarget = "muster-B:@2"
		row.State = "needs_input"
		row.ContextUsedPct, row.ContextTotalInputTokens, row.ContextWindowSize = p(77.0), p(int64(2000)), p(int64(200000))
	})
	seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.TmuxTarget = "muster-C:@3"
		row.State = "idle"
		row.ContextUsedPct, row.ContextTotalInputTokens, row.ContextWindowSize = p(88.0), p(int64(3000)), p(int64(200000))
	})

	rec := postCaptureRequest(t, srv, fmt.Sprintf(`{"sessionId":%d}`, aID))

	require.Equal(t, http.StatusCreated, rec.Code)
	respBody := rec.Body.String()
	assert.Contains(t, respBody, "muster-A:@1")
	assert.NotContains(t, respBody, "muster-B:@2")
	assert.NotContains(t, respBody, "muster-C:@3")
	assert.NotContains(t, respBody, "needs_input")

	resp := decodeCaptureResponse(t, rec)
	require.NotNil(t, resp.Snapshot.Session)
	assert.Equal(t, "working", resp.Snapshot.Session.State)
	require.NotNil(t, resp.Snapshot.Session.Context)
	assert.Equal(t, float64(42), resp.Snapshot.Session.Context.UsedPct, "the captured session's own context must not be a bystander's")
	assert.Equal(t, 3, resp.Snapshot.Dashboard.SessionsTotal, "dashboard counts are the only trace bystanders may leave")
}

// ===========================================================================
// HTTP: POST /api/issues
// ===========================================================================

func TestHandleCreateIssue_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	req := httptest.NewRequest(http.MethodPost, "/api/issues", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleCreateIssue_DisabledWhenIssueAPIURLEmpty(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postIssueRequest(t, srv, `{"captureId":"x","title":"t"}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "not_found", decodeErrorCode(t, rec))
}

func TestHandleCreateIssue_InvalidJSONBodyIs400(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec := postIssueRequest(t, srv, `not valid json`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

func TestHandleCreateIssue_MissingCaptureIdIs400(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec := postIssueRequest(t, srv, `{"title":"t"}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestHandleCreateIssue_TitleValidation covers the Protocol Contract's title clause:
// missing, empty after trimming (including whitespace-only, Edge Case 20), and over 200
// chars.
func TestHandleCreateIssue_TitleValidation(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"missing title", `{"captureId":"x"}`},
		{"empty title", `{"captureId":"x","title":""}`},
		{"whitespace-only title", `{"captureId":"x","title":"   "}`},
		{"201 chars, one over the limit", `{"captureId":"x","title":"` + strings.Repeat("a", 201) + `"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
			srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

			rec := postIssueRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
			assert.Zero(t, gh.count(), "an invalid request must never reach GitHub")
		})
	}
}

func TestHandleCreateIssue_TitleExactly200CharsIsAccepted(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":1,"html_url":"https://x/1"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":%q}`, capID, strings.Repeat("a", 200)))

	assert.Equal(t, http.StatusCreated, rec.Code)
}

// TestHandleCreateIssue_TitleExactly200MultibyteRunesIsAccepted covers review cycle 1
// Minor 1: the limits are rune counts, not byte counts. "é" is one rune but two bytes in
// UTF-8, so a 200-rune title built from it is exactly at the limit by REQ-6's ("chars")
// and the client's UTF-16-code-unit maxlength gate, yet its byte length (400) sails past
// what a naive len(title) > 200 byte check would reject.
func TestHandleCreateIssue_TitleExactly200MultibyteRunesIsAccepted(t *testing.T) {
	title := strings.Repeat("é", 200)
	require.Len(t, []rune(title), 200, "fixture sanity: exactly 200 runes")
	require.Greater(t, len(title), 200, "fixture sanity: byte length must exceed the limit for this test to exercise the rune-vs-byte fix")

	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":1,"html_url":"https://x/1"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":%q}`, capID, title))

	assert.Equal(t, http.StatusCreated, rec.Code)
}

// TestHandleCreateIssue_TitleOver200MultibyteRunesIsRejected is the negative half: 201
// multibyte runes must still 400, proving the fix counts runes rather than removing the
// limit altogether.
func TestHandleCreateIssue_TitleOver200MultibyteRunesIsRejected(t *testing.T) {
	title := strings.Repeat("é", 201)
	require.Len(t, []rune(title), 201, "fixture sanity: exactly 201 runes")

	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":%q}`, capID, title))

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
	assert.Zero(t, gh.count())
}

func TestHandleCreateIssue_NoteOver8000CharsIs400(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	body, err := json.Marshal(map[string]string{"captureId": capID, "title": "t", "note": strings.Repeat("a", 8001)})
	require.NoError(t, err)
	rec := postIssueRequest(t, srv, string(body))

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestHandleCreateIssue_NoteExactly8000MultibyteRunesIsAccepted is Minor 1's fix applied
// to the note field: 8000 multi-byte runes (16000 bytes) is exactly at the limit and
// must be accepted, not rejected by a byte-length check.
func TestHandleCreateIssue_NoteExactly8000MultibyteRunesIsAccepted(t *testing.T) {
	note := strings.Repeat("é", 8000)
	require.Len(t, []rune(note), 8000, "fixture sanity: exactly 8000 runes")
	require.Greater(t, len(note), 8000, "fixture sanity: byte length must exceed the limit for this test to exercise the rune-vs-byte fix")

	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":1,"html_url":"https://x/1"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	body, err := json.Marshal(map[string]string{"captureId": capID, "title": "t", "note": note})
	require.NoError(t, err)
	rec := postIssueRequest(t, srv, string(body))

	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestHandleCreateIssue_UnknownCaptureIdIs409CaptureExpired(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec := postIssueRequest(t, srv, `{"captureId":"does-not-exist","title":"t"}`)

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "capture_expired", decodeErrorCode(t, rec))
	assert.Zero(t, gh.count())
}

// TestHandleCreateIssue_ExpiredCaptureIs409CaptureExpired covers REQ-15/Edge Case 2 via
// white-box manipulation of the held capture's capturedAt (this package's own type) —
// the alternative, actually sleeping 15 minutes, isn't practical for a unit test.
func TestHandleCreateIssue_ExpiredCaptureIs409CaptureExpired(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	srv.issue.captures.mu.Lock()
	srv.issue.captures.captures[capID].capturedAt = time.Now().UTC().Add(-captureTTL - time.Minute)
	srv.issue.captures.mu.Unlock()

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "capture_expired", decodeErrorCode(t, rec))
	assert.Zero(t, gh.count())
}

// TestHandleCreateIssue_CaptureExpired_MessageNamesTheRemedy covers review cycle 1 Minor
// 3: the pinned UI summary is always "Could not file the issue.", so Edge Case 2's remedy
// sentence ("this snapshot expired — reopen the dialog to take a fresh one") has to reach
// the user through the error.message field instead, which web-impl's showError routes
// into the detail <pre>.
func TestHandleCreateIssue_CaptureExpired_MessageNamesTheRemedy(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)

	rec := postIssueRequest(t, srv, `{"captureId":"does-not-exist","title":"t"}`)

	require.Equal(t, http.StatusConflict, rec.Code)
	require.Equal(t, "capture_expired", decodeErrorCode(t, rec))
	var envelope struct {
		Error struct{ Message string } `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Contains(t, envelope.Error.Message, "reopen the dialog to take a fresh snapshot")
}

// TestHandleCreateIssue_D10_ConsumedCaptureIsRejectedOnSecondPost is D10: a second POST
// with an already-consumed captureId is 409 capture_expired and posts nothing upstream.
func TestHandleCreateIssue_D10_ConsumedCaptureIsRejectedOnSecondPost(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":5,"html_url":"https://x/5"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	first := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))
	require.Equal(t, http.StatusCreated, first.Code)
	require.Equal(t, 1, gh.count())

	second := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t again"}`, capID))

	assert.Equal(t, http.StatusConflict, second.Code)
	assert.Equal(t, "capture_expired", decodeErrorCode(t, second))
	assert.Equal(t, 1, gh.count(), "the second POST must never reach GitHub")
}

// TestHandleCreateIssue_ConcurrentDoublePost_SecondIsRejected covers Edge Case 12's
// server-side "belt to braces" clause: a genuine double-click racing the network (not
// just the client-side Submit-disable) must not file two issues. The fake GitHub blocks
// the first request in flight so the second's reserve() call is guaranteed to observe
// the first as still in-flight.
func TestHandleCreateIssue_ConcurrentDoublePost_SecondIsRejected(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":1,"html_url":"https://x/1"}`)
	release := make(chan struct{})
	gh.block = release
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	var wg sync.WaitGroup
	var rec1 *httptest.ResponseRecorder
	wg.Add(1)
	go func() {
		defer wg.Done()
		rec1 = postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t1"}`, capID))
	}()

	require.Eventually(t, func() bool { return gh.count() >= 1 }, time.Second, 2*time.Millisecond, "the first request must reach the fake GitHub (and block there) before the second fires")

	rec2 := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t2"}`, capID))
	close(release)
	wg.Wait()

	require.NotNil(t, rec1)
	assert.Equal(t, http.StatusCreated, rec1.Code)
	assert.Equal(t, http.StatusConflict, rec2.Code)
	assert.Equal(t, "capture_expired", decodeErrorCode(t, rec2))
	assert.Equal(t, 1, gh.count(), "only one request must ever reach GitHub")
}

// TestHandleCreateIssue_CaptureNotConsumedOnFailure_RetryWorksWithoutRecapture covers
// REQ-10: a failed filing attempt does not consume the capture, so a retry with the same
// captureId works without taking a fresh snapshot.
func TestHandleCreateIssue_CaptureNotConsumedOnFailure_RetryWorksWithoutRecapture(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusForbidden, `{"message":"Forbidden"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	first := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))
	require.Equal(t, http.StatusBadGateway, first.Code)
	require.Equal(t, "issue_post_failed", decodeErrorCode(t, first))

	gh.setResponse(http.StatusCreated, `{"number":9,"html_url":"https://x/9"}`)
	second := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusCreated, second.Code)
	assert.Equal(t, 2, gh.count())
}

func TestHandleCreateIssue_Success_PostsComposedBodyAndReturnsNumberUrlRepo(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":14,"html_url":"https://github.com/acme/widgets/issues/14"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capRec := postCaptureRequest(t, srv, `{}`)
	capResp := decodeCaptureResponse(t, capRec)

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"a title","note":"it broke"}`, capResp.CaptureID))

	require.Equal(t, http.StatusCreated, rec.Code)
	resp := decodeIssueResponse(t, rec)
	assert.Equal(t, 14, resp.Number)
	assert.Equal(t, "https://github.com/acme/widgets/issues/14", resp.URL)
	assert.Equal(t, "acme/widgets", resp.Repo)

	require.Equal(t, 1, gh.count())
	var posted struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	require.NoError(t, json.Unmarshal([]byte(gh.requestAt(0).body), &posted))
	assert.Equal(t, "a title", posted.Title)
	assert.Equal(t, composeIssueBody("it broke", capResp.SnapshotMarkdown), posted.Body)
	assert.Equal(t, "Bearer "+issueTestToken, gh.requestAt(0).headers.Get("Authorization"))
}

func TestHandleCreateIssue_NoteCRLFIsNormalizedInPostedBody(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":1,"html_url":"https://x/1"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	body, err := json.Marshal(map[string]string{"captureId": capID, "title": "t", "note": "line one\r\nline two\r\n"})
	require.NoError(t, err)
	rec := postIssueRequest(t, srv, string(body))
	require.Equal(t, http.StatusCreated, rec.Code)

	var posted struct {
		Body string `json:"body"`
	}
	require.NoError(t, json.Unmarshal([]byte(gh.requestAt(0).body), &posted))
	assert.Contains(t, posted.Body, "line one\nline two\n")
	assert.NotContains(t, posted.Body, "\r")
}

// TestHandleCreateIssue_Success_LogsNumberUrlScopeAndLengthsNeverTitleOrNoteText covers
// REQ-16: info log carries number/url/scope/title-and-note lengths, never their text.
func TestHandleCreateIssue_Success_LogsNumberUrlScopeAndLengthsNeverTitleOrNoteText(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":21,"html_url":"https://github.com/acme/widgets/issues/21"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	const secretTitle = "sentinel title text must never be logged"
	const secretNote = "sentinel note text must never be logged"
	body, err := json.Marshal(map[string]string{"captureId": capID, "title": secretTitle, "note": secretNote})
	require.NoError(t, err)
	rec := postIssueRequest(t, srv, string(body))
	require.Equal(t, http.StatusCreated, rec.Code)

	logs := srv.logs.String()
	assert.Contains(t, logs, "\"number\":21")
	assert.Contains(t, logs, "github.com/acme/widgets/issues/21")
	assert.Contains(t, logs, "\"scope\":\"dashboard\"")
	assert.NotContains(t, logs, secretTitle)
	assert.NotContains(t, logs, secretNote)
}

func TestHandleCreateIssue_AuthFailure_Returns502IssueAuthFailed(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", "   ") // whitespace-only token file
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Equal(t, "issue_auth_failed", decodeErrorCode(t, rec))
	assert.Zero(t, gh.count(), "GitHub must never be contacted when the token could not be obtained")
}

// TestHandleCreateIssue_AuthFailure_WarnLogCarriesStageAndMessage covers review cycle 1
// Major 1's token-step branch: the warn line must carry both the failing stage and
// authErr.Message (the upstream detail), not just the stage.
func TestHandleCreateIssue_AuthFailure_WarnLogCarriesStageAndMessage(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", "   ") // whitespace-only token file -> "issue token file is empty"
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))
	require.Equal(t, http.StatusBadGateway, rec.Code)

	event := decodeLastLogEvent(t, srv)
	assert.Equal(t, "token", event["stage"])
	assert.Equal(t, "issue token file is empty", event["upstream"])
}

func TestHandleCreateIssue_AuthFailure_CaptureIsNotConsumed(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", "")
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	first := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))
	require.Equal(t, http.StatusBadGateway, first.Code)

	srv.issue.captures.mu.Lock()
	consumed := srv.issue.captures.captures[capID].consumed
	srv.issue.captures.mu.Unlock()
	assert.False(t, consumed, "an auth failure must not consume the capture (REQ-10)")
}

func TestHandleCreateIssue_PostFailure_403WithMessage_Returns502WithGitHubMessage(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusForbidden, `{"message":"token lacks repo scope"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Equal(t, "issue_post_failed", decodeErrorCode(t, rec))
	var envelope struct {
		Error struct{ Message string } `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Contains(t, envelope.Error.Message, "403")
	assert.Contains(t, envelope.Error.Message, "token lacks repo scope")
}

// TestHandleCreateIssue_PostFailure_WarnLogCarriesStageAndMessage covers review cycle 1
// Major 1's post-step branch: the warn line must carry postErr.Message, which is already
// where GitHub's upstream status and message live (built by ghissue.CreateIssue as
// "github returned %d: %s") — one field closing both halves of REQ-16 for this branch.
func TestHandleCreateIssue_PostFailure_WarnLogCarriesStageAndMessage(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusForbidden, `{"message":"token lacks repo scope"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))
	require.Equal(t, http.StatusBadGateway, rec.Code)

	event := decodeLastLogEvent(t, srv)
	assert.Equal(t, "post", event["stage"])
	assert.Equal(t, "github returned 403: token lacks repo scope", event["upstream"])
	assert.Equal(t, false, event["maybe_created"])
}

func TestHandleCreateIssue_PostFailure_404NamesConfiguredRepo(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusNotFound, `{"message":"Not Found"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/typo-repo", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Equal(t, 1, gh.count())
	assert.Equal(t, "/repos/acme/typo-repo/issues", gh.requestAt(0).path)
}

// TestHandleCreateIssue_PostFailure_2xxUnparseableBody_Returns502MentioningMayHaveBeenCreated
// covers Edge Case 9: a 2xx GitHub could not parse must never be reported as a clean
// failure — the request succeeded upstream.
func TestHandleCreateIssue_PostFailure_2xxUnparseableBody_Returns502MentioningMayHaveBeenCreated(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `not json at all`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Equal(t, "issue_post_failed", decodeErrorCode(t, rec))
	var envelope struct {
		Error struct{ Message string } `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Contains(t, envelope.Error.Message, "may")
	assert.Contains(t, envelope.Error.Message, "created")
}

// TestHandleCreateIssue_PostFailure_2xxEmptyObjectBody_Returns502AndCaptureNotConsumed
// covers review cycle 1 Minor 4 at the handler level: a "{}" 2xx body from GitHub must
// not surface as a 201 "Filed <repo>#0" (an empty href the user could never follow), and
// must leave the capture usable for a retry exactly like every other post failure (REQ-10).
func TestHandleCreateIssue_PostFailure_2xxEmptyObjectBody_Returns502AndCaptureNotConsumed(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Equal(t, "issue_post_failed", decodeErrorCode(t, rec))
	var envelope struct {
		Error struct{ Message string } `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Contains(t, envelope.Error.Message, "may")
	assert.Contains(t, envelope.Error.Message, "created")

	srv.issue.captures.mu.Lock()
	consumed := srv.issue.captures.captures[capID].consumed
	srv.issue.captures.mu.Unlock()
	assert.False(t, consumed, "a post failure (including an unusable 2xx body) must not consume the capture (REQ-10)")
}

// TestHandleCreateIssue_TransportFailure_Returns502 covers Edge Case 8: GitHub
// unreachable entirely (not just a non-2xx).
func TestHandleCreateIssue_TransportFailure_Returns502(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{}`)
	deadServer := gh.server(t)
	badURL := deadServer.URL
	deadServer.Close() // closed before use: connecting now fails at the transport layer
	srv := newIssueTestServer(t, badURL, "acme/widgets", issueTestToken)
	capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

	rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Equal(t, "issue_post_failed", decodeErrorCode(t, rec))
}

// TestHandleCreateIssue_TokenNeverAppearsInResponseOrLogOnAnyFailurePath is INV-3
// exercised at the full HTTP-handler level (not just ghissue's own unit tests): across
// GitHub 401/403/404/500 and an unparseable 2xx, neither the response body nor any log
// line emitted may contain the bearer token.
func TestHandleCreateIssue_TokenNeverAppearsInResponseOrLogOnAnyFailurePath(t *testing.T) {
	const secretToken = "server-level-sentinel-token-inv3"
	cases := []struct {
		name   string
		status int
		body   string
	}{
		{"github 401", http.StatusUnauthorized, `{"message":"Bad credentials"}`},
		{"github 403", http.StatusForbidden, `{"message":"Forbidden"}`},
		{"github 404", http.StatusNotFound, `{"message":"Not Found"}`},
		{"github 500", http.StatusInternalServerError, ``},
		{"unparseable 2xx", http.StatusCreated, `not json`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gh := newFakeGitHubAPI(tc.status, tc.body)
			srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", secretToken)
			capID := decodeCaptureID(t, postCaptureRequest(t, srv, `{}`))

			rec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))

			assert.Equal(t, http.StatusBadGateway, rec.Code)
			assert.NotContains(t, rec.Body.String(), secretToken)
			assert.NotContains(t, srv.logs.String(), secretToken)
		})
	}
}

// TestHandleCreateIssue_D11_CaptureIsImmutable_FiledBodyReflectsPreTransitionState is
// D11/INV-4: the snapshot filed is the one previewed, regardless of a state transition
// that happens in between capture and filing.
func TestHandleCreateIssue_D11_CaptureIsImmutable_FiledBodyReflectsPreTransitionState(t *testing.T) {
	gh := newFakeGitHubAPI(http.StatusCreated, `{"number":1,"html_url":"https://x/1"}`)
	srv := newIssueTestServer(t, gh.server(t).URL, "acme/widgets", issueTestToken)
	sessID := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.TmuxTarget = "muster-1:@1"
		row.State = "working"
	})

	capRec := postCaptureRequest(t, srv, fmt.Sprintf(`{"sessionId":%d}`, sessID))
	require.Equal(t, http.StatusCreated, capRec.Code)
	capID := decodeCaptureID(t, capRec)

	ctx := context.Background()
	row, err := srv.store.GetSession(ctx, sessID)
	require.NoError(t, err)
	row.State = "failed"
	row.FailureError = p("server_error")
	require.NoError(t, srv.store.UpdateSession(ctx, row))
	require.NoError(t, srv.manager.LoadAll(ctx))

	issueRec := postIssueRequest(t, srv, fmt.Sprintf(`{"captureId":%q,"title":"t"}`, capID))
	require.Equal(t, http.StatusCreated, issueRec.Code)

	require.Equal(t, 1, gh.count())
	var posted struct {
		Body string `json:"body"`
	}
	require.NoError(t, json.Unmarshal([]byte(gh.requestAt(0).body), &posted))
	assert.Contains(t, posted.Body, "| state | working since")
	assert.NotContains(t, posted.Body, "| state | failed since")
	assert.NotContains(t, posted.Body, "| failure |", "the post-transition failure row must never appear")
}
