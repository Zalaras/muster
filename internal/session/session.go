// Package session holds the §7 state machine (docs/protocol.md) and the in-memory
// session registry that feeds it. It operates purely on claudecode.StateInput values
// and its own neutral fields — no Claude Code payload key or event name appears here
// (CLAUDE.md hard rule; plan m1-sessions "The state machine — implementation shape").
package session

import "time"

// State is one of the six displayed states (protocol §7.1).
type State string

const (
	StateStarted    State = "started"
	StatePlanning   State = "planning"
	StateWorking    State = "working"
	StateNeedsInput State = "needs_input"
	StateFailed     State = "failed"
	StateIdle       State = "idle"
)

// PermissionMode is the latched last-known permission mode (protocol §7.2).
type PermissionMode string

const (
	PermissionDefault     PermissionMode = "default"
	PermissionPlan        PermissionMode = "plan"
	PermissionAcceptEdits PermissionMode = "acceptEdits"
	// PermissionAuto is Claude Code's distinct "auto" mode, measured 2026-09-03 against
	// 2.1.259 (spikes/canary-fields.md § Hook payloads, "Permission-mode probe"): reports
	// permission_mode "auto" on hooks; model-gated (falls back to "default" on haiku).
	PermissionAuto PermissionMode = "auto"
)

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

// Model is the session's model readout; both fields start at the launch value
// verbatim (M1 value semantics). From M3 on, a routed status-line post refreshes both
// fields whenever its model object is present (§5.3 M3 value semantics).
type Model struct {
	ID          string
	DisplayName string
}

// Context is the session's live context-window gauge (§5.3 M3 value semantics):
// UsedPct/TotalInputTokens/WindowSize are always all present together — a nil *Context
// means unknown (INV-2), never a zero value. Populated only by a routed status-line
// post whose payload carries a non-null used-percentage (REQ-2); reset to nil by
// `/clear` (REQ-9).
type Context struct {
	UsedPct          float64
	TotalInputTokens int64
	WindowSize       int64
}

// Session is one row of the §7 state machine, held in memory and persisted on every
// mutation. Guard fields (currentPromptID/closedPromptIDs) are in-memory only — a
// daemon restart resets them (accepted M1 edge, plan Schema Changes note).
type Session struct {
	ID                   int64
	TmuxTarget           string
	TmuxPane             string
	ClaudeSessionID      string // "" until bound
	RepoID               int64
	Directory            string
	Branch               *string // nil iff Directory isn't a git checkout
	IsWorktree           bool
	Title                *string
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
func (s *Session) setState(next State, now time.Time) {
	if s.State == next {
		return
	}
	s.State = next
	s.StateSince = now
}

// activeState is "planning" if the permission-mode latch reads "plan", else "working"
// (protocol §7.3's ACTIVE definition).
func (s *Session) activeState() State {
	if s.PermissionMode == PermissionPlan {
		return StatePlanning
	}
	return StateWorking
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
