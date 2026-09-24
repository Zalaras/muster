// Package session holds the state machine (kb:anchor/state) and the in-memory
// session registry that feeds it. It operates purely on claudecode.StateInput values
// and its own neutral fields — no Claude Code payload key or event name appears here
// (CLAUDE.md hard rule; plan m1-sessions "The state machine — implementation shape").
package session

import (
	"time"
	"unicode/utf8"

	"github.com/Zalaras/muster/internal/claudecode"
)

// State is one of the six displayed states (kb:anchor/state.displayed).
type State string

const (
	StateStarted    State = "started"
	StatePlanning   State = "planning"
	StateWorking    State = "working"
	StateNeedsInput State = "needs_input"
	StateFailed     State = "failed"
	StateIdle       State = "idle"
)

// PermissionMode is the latched last-known permission mode (kb:anchor/state.tracked).
// The four values are Claude Code's own `--permission-mode` vocabulary
// (kb:fact/permission-mode-no-flag-follows-configured-default), owned by
// internal/claudecode (CLAUDE.md hard rule; maintainability-cleanup review Major
// 6/c-Minor 11) — this package's constants derive from that owner rather than
// re-declaring the literals, since session already imports claudecode (for StateInput),
// so this direction never cycles.
type PermissionMode string

const (
	PermissionDefault     PermissionMode = PermissionMode(claudecode.PermissionDefault)
	PermissionPlan        PermissionMode = PermissionMode(claudecode.PermissionPlan)
	PermissionAcceptEdits PermissionMode = PermissionMode(claudecode.PermissionAcceptEdits)
	// PermissionAuto is Claude Code's distinct "auto" mode, measured 2026-09-03 against
	// 2.1.259 (docs/history/spikes/canary-fields.md § Hook payloads, "Permission-mode probe"): reports
	// permission_mode "auto" on hooks; model-gated (falls back to "default" on haiku).
	PermissionAuto PermissionMode = PermissionMode(claudecode.PermissionAuto)
)

// PermissionModes lists every mode as this package's own typed enum — internal/server
// validates incoming requests against it rather than re-spelling the four literals
// itself (maintainability-cleanup review, Major 6).
var PermissionModes = []PermissionMode{PermissionDefault, PermissionPlan, PermissionAcceptEdits, PermissionAuto}

// ValidPermissionMode reports whether s is one of PermissionModes. Delegates to
// claudecode.ValidPermissionMode, the one owner of the underlying set, rather than
// walking PermissionModes itself — one validation, not two.
func ValidPermissionMode(s string) bool {
	return claudecode.ValidPermissionMode(s)
}

// Attention is non-nil iff State == StateNeedsInput.
type Attention struct {
	Reason string // "permission" | "idle"
	Since  time.Time
}

// Failure is non-nil iff State == StateFailed.
type Failure struct {
	Error   string // raw token, displayed verbatim, never switched on
	Message string
}

// Model is the session's model readout (kb:anchor/ws.session value semantics); both
// fields start at the launch value verbatim, and a routed status-line post refreshes both
// whenever its model object is present.
type Model struct {
	ID          string
	DisplayName string
}

// Context is the session's live context-window gauge (kb:anchor/ws.session value
// semantics): UsedPct/TotalInputTokens/WindowSize are always all present together — a nil
// *Context means unknown, never a zero value. Populated only by a routed status-line post
// whose payload carries a non-null used-percentage; reset to nil by `/clear`.
type Context struct {
	UsedPct          float64
	TotalInputTokens int64
	WindowSize       int64
}

// Session is one row of the kb:anchor/state state machine, held in memory and persisted on every
// mutation. Guard fields (currentPromptID/closedPromptIDs) are in-memory only — a
// daemon restart resets them.
type Session struct {
	ID                   int64
	TmuxTarget           string
	TmuxPane             string
	ClaudeSessionID      string // "" until bound
	RepoID               int64
	Directory            string
	Branch               *string // nil iff Directory isn't a git checkout
	IsWorktree           bool
	Title                *string // Claude's last-known name (status-line session_name, or launch --name until then)
	State                State
	StateSince           time.Time
	PermissionMode       PermissionMode
	PermissionModeSource string // "seed" | "hook"
	Model                *Model
	Context              *Context
	Compactions          int
	Attention            *Attention
	Failure              *Failure
	LastActivity         *string
	Alive                bool
	EndedAt              *time.Time
	FirstLaunchHere      bool
	CreatedAt            time.Time

	// LastSnapshot/LastSnapshotAt (m4-reconcile REQ-4): the last capture-pane text and
	// when it was captured. "" / zero means "never captured yet" — display source only,
	// never read by the state machine, never logged (may hold prompt text).
	LastSnapshot   string
	LastSnapshotAt time.Time

	// Pinned/RailPos (plan order-sidebar): user-owned rail order. Display-only —
	// never read by the state machine (D17); mutated only by railorder.go's pure
	// applyPin/applyOrder, via Manager.SetPinned/SetOrder.
	Pinned  bool
	RailPos int64

	// TitleOverride (plan ui-text-and-focus REQ-9/REQ-11): the user's rename via PUT
	// .../title, nil = none. Display-only, wins over Title in DisplayTitle() — never
	// read by the state machine or the status path (INV-2); mutated only by
	// Manager.SetTitle.
	TitleOverride *string

	// TranscriptPath/PlanPath/PlanExists (plan markdown-viewing REQ-16/REQ-17): the
	// latest transcript path a routed hook named, and the plan derived from it via
	// claudecode.LocatePlanFile. Display-only, never read by machine.go. PlanPath ""
	// (the wire plan:null) means no transcript has ever named a plan; once a plan has
	// been named, a planless scan keeps it rather than clearing it back to ""
	// (kb:adr/reader-plan-sticky-once-named). Mutated only by
	// Manager.SetTranscript/SetPlan/ApplyPlanScan.
	TranscriptPath string
	PlanPath       string
	PlanExists     bool

	// Unread (plan rail-card-improvements REQ-7): true iff the turn closed with no
	// terminal client attached to this session, since cleared. INV: Unread ⇒ State ==
	// idle, enforced by setState — the one place every applyInput arm routes through.
	// Set by Manager.Apply after a turn_closed input per the watcher's answer; cleared by
	// Manager.MarkSeen (attach on either surface). Display-only, independent of Alive,
	// survives a restart.
	Unread bool

	// LastPrompt (plan rail-card-improvements REQ-12): the user's most recent prompt,
	// truncated to 200 chars, nil until a first prompt or after /clear. Set by
	// KindTurnActivity when the adapter supplied one; display-only, never read by the
	// state machine.
	LastPrompt *string

	currentPromptID string
	closedPromptIDs []string // bounded ring, most recent last, capped at maxClosedPrompts
}

const maxClosedPrompts = 8

// Clone returns a value copy safe to hand outside the manager's lock (Attention,
// Failure and Model are pointers to otherwise-immutable snapshots — callers must treat
// them as read-only).
func (s *Session) Clone() *Session {
	c := *s
	return &c
}

// DisplayTitle returns the wire "title" (plan ui-text-and-focus REQ-11): TitleOverride
// when non-nil, else Claude's last-known name (Title), else nil. The daemon owns this
// precedence; no client computes it (kb:anchor/ws.session).
func (s *Session) DisplayTitle() *string {
	if s.TitleOverride != nil {
		return s.TitleOverride
	}
	return s.Title
}

func (s *Session) promptClosed(id string) bool {
	for _, closed := range s.closedPromptIDs {
		if closed == id {
			return true
		}
	}
	return false
}

func (s *Session) closePrompt(id string) {
	if s.promptClosed(id) {
		return
	}
	s.closedPromptIDs = append(s.closedPromptIDs, id)
	if len(s.closedPromptIDs) > maxClosedPrompts {
		s.closedPromptIDs = s.closedPromptIDs[len(s.closedPromptIDs)-maxClosedPrompts:]
	}
	if s.currentPromptID == id {
		s.currentPromptID = ""
	}
}

// setState transitions to next, updating stateSince only when the state actually
// changes (Edge Case 3: reapplying an event to the same state is a no-op transition).
// Every transition to a non-idle state clears Unread (kb:anchor/state.tracked's Unread ⇒
// idle invariant) — enforced here, the one place every applyInput arm routes through, so
// no arm can strand it. Manager.Apply is the only place that ever sets Unread true, after
// applyInput returns.
func (s *Session) setState(next State, now time.Time) {
	if next != StateIdle {
		s.Unread = false
	}
	if s.State == next {
		return
	}
	s.State = next
	s.StateSince = now
}

// activeState is "planning" if the permission-mode latch reads "plan", else "working"
// (kb:anchor/state.transitions's ACTIVE definition).
func (s *Session) activeState() State {
	if s.PermissionMode == PermissionPlan {
		return StatePlanning
	}
	return StateWorking
}

// stringPtrEqual reports whether two nullable strings hold the same value — nil equals
// only nil (plan ui-text-and-focus: SetTitle/applyStatusUpdate's "did the wire title
// change" checks).
func stringPtrEqual(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// truncate cuts s to at most n bytes without splitting a multi-byte UTF-8 rune:
// LastPrompt/LastActivity are hook-supplied text, and a byte-count cut that lands mid-rune
// would persist and broadcast invalid UTF-8.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}
