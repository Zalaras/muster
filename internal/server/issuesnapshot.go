package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
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
func (f *issueFeature) buildIssueSnapshot(ctx context.Context, now time.Time, sess *session.Session) issueSnapshot {
	sessions := f.manager.List()
	alive := 0
	for _, one := range sessions {
		if one.Alive {
			alive++
		}
	}
	prefs := loadPrefs(ctx, f.store)

	snap := issueSnapshot{
		CapturedAt: wireTime(now),
		Scope:      "dashboard",
	}
	snap.Musterd.Version = f.daemonVersion
	snap.ClaudeCode.Installed = f.claudeCode.Installed
	snap.ClaudeCode.Floor = f.claudeCode.Floor
	snap.ClaudeCode.Verified = f.claudeCode.Verified
	snap.ClaudeCode.Status = f.claudeCode.Status
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
		StateSince:           wireTime(sess.StateSince),
		Alive:                sess.Alive,
		PermissionMode:       issueSnapshotPermission{Value: string(sess.PermissionMode), Source: sess.PermissionModeSource},
		Compactions:          sess.Compactions,
		TmuxTarget:           sess.TmuxTarget,
		CreatedAt:            wireTime(sess.CreatedAt),
		ClaudeSessionIDBound: sess.ClaudeSessionID != "",
		EndedAt:              wireTimePtr(sess.EndedAt),
	}
	if sess.Attention != nil {
		ss.Attention = &issueSnapshotAttention{Reason: sess.Attention.Reason, Since: wireTime(sess.Attention.Since)}
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

	summary, err := f.store.EventSummary(ctx, sess.ID)
	if err != nil {
		f.log.Warn().Err(err).Int64("session_id", sess.ID).Msg("reading event summary for issue capture failed")
	}
	ss.Events = issueSnapshotEvents{
		FirstSeq:       summary.FirstSeq,
		LastSeq:        summary.LastSeq,
		Count:          summary.Count,
		RecentTypes:    summary.RecentTypes,
		LastReceivedAt: wireTimePtr(summary.LastReceivedAt),
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

// claudeCodeCell renders the issue snapshot's Claude Code row (kb:anchor/issue.captures):
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
// dashboard's features/issue.ts implements the identical rule for the live preview, and
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
