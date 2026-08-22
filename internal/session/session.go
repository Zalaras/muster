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
// verbatim (M1 value semantics — DisplayName never changes until M3).
type Model struct {
	ID          string
	DisplayName string
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
	Compactions          int
	Attention            *Attention
	Failure              *Failure
	LastActivity         *string
	Alive                bool
	EndedAt              *time.Time
	FirstLaunchHere      bool
	CreatedAt            time.Time

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
