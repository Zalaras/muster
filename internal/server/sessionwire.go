package server

import (
	"path/filepath"

	"github.com/Zalaras/muster/internal/session"
)

// sessionWire is the Session object's wire shape (kb:anchor/ws.session). It is
// server-package-local: the only Claude-Code-format-free translation from
// internal/session's domain type to what crosses the wire.
type sessionWire struct {
	ID              int64                     `json:"id"`
	Title           *string                   `json:"title"`
	TitleOverride   *string                   `json:"titleOverride"`
	State           string                    `json:"state"`
	StateSince      string                    `json:"stateSince"`
	Alive           bool                      `json:"alive"`
	EndedAt         *string                   `json:"endedAt"`
	Attention       *sessionWireAttention     `json:"attention"`
	Failure         *sessionWireFailure       `json:"failure"`
	Directory       string                    `json:"directory"`
	Repo            *sessionWireRepo          `json:"repo"`
	Model           *sessionWireModel         `json:"model"`
	PermissionMode  sessionWirePermissionMode `json:"permissionMode"`
	Context         sessionWireContext        `json:"context"`
	LastActivity    *string                   `json:"lastActivity"`
	ClaudeSessionID *string                   `json:"claudeSessionId"`
	TmuxTarget      string                    `json:"tmuxTarget"`
	FirstLaunchHere bool                      `json:"firstLaunchHere"`
	CreatedAt       string                    `json:"createdAt"`
	Pinned          bool                      `json:"pinned"`
	RailPos         int64                     `json:"railPos"`
	// Plan (kb:anchor/ws.session): the session's derived plan file, null until a
	// transcript has named a plan; once set, a planless scan keeps it
	// (kb:adr/reader-plan-sticky-once-named). Required key on every Session object.
	Plan *sessionWirePlan `json:"plan"`
	// Unread/LastPrompt (kb:anchor/ws.session, kb:adr/rail-unread-inferred-from-live-terminal-client,
	// kb:adr/rail-activity-line-turn-aware-default-with-pref): required keys on every
	// Session object.
	Unread     bool    `json:"unread"`
	LastPrompt *string `json:"lastPrompt"`
}

type sessionWireAttention struct {
	Reason string `json:"reason"`
	Since  string `json:"since"`
}

type sessionWireFailure struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

type sessionWireRepo struct {
	Name       string  `json:"name"`
	Branch     *string `json:"branch"`
	IsWorktree bool    `json:"isWorktree"`
}

type sessionWireModel struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

type sessionWirePermissionMode struct {
	Value  string `json:"value"`
	Source string `json:"source"`
}

// sessionWireContext is the kb:anchor/ws.session context gauge: the three numeric fields are
// always all-null (unknown) or all-non-null, populated only once a routed status-line post
// has carried a non-null used-percentage; compactions is always live.
type sessionWireContext struct {
	UsedPct          *float64 `json:"usedPct"`
	TotalInputTokens *int64   `json:"totalInputTokens"`
	WindowSize       *int64   `json:"windowSize"`
	Compactions      int      `json:"compactions"`
}

// sessionUpsertMessage is the WS `sessionUpsert` envelope (kb:anchor/ws.session-upsert).
type sessionUpsertMessage struct {
	Type    string      `json:"type"`
	Session sessionWire `json:"session"`
}

// sessionRemovedMessage is the WS `sessionRemoved` envelope (kb:anchor/ws.session-removed)
// — sent once per DELETE /api/sessions/{id}.
type sessionRemovedMessage struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

// sessionUpsertWire and sessionRemovedWire build the two envelopes session.Manager's
// OnUpsert/OnRemoved callbacks broadcast (New wires them, server.go) — the wire mapping
// lives here, beside the types it builds, not in the composition root.
func sessionUpsertWire(sess *session.Session) sessionUpsertMessage {
	return sessionUpsertMessage{Type: "sessionUpsert", Session: toWireSession(sess)}
}

func sessionRemovedWire(id int64) sessionRemovedMessage {
	return sessionRemovedMessage{Type: "sessionRemoved", ID: id}
}

// paneSnapshotWire is GET /api/sessions/{id}/pane's response shape (kb:anchor/sessions.pane).
type paneSnapshotWire struct {
	Text       string `json:"text"`
	CapturedAt string `json:"capturedAt"`
}

// toWireSession converts a session.Session to its wire shape. repo is null "when
// directory isn't a git checkout" (kb:anchor/ws.session) — session.Branch is authoritatively
// nil in exactly that case, so that's the single source of truth here; no separate is-git
// flag is needed.
func toWireSession(s *session.Session) sessionWire {
	w := sessionWire{
		ID:              s.ID,
		Title:           s.DisplayTitle(), // kb:adr/rename-muster-owned-title-override-wins: the display title, not the raw Title column
		TitleOverride:   s.TitleOverride,
		State:           string(s.State),
		StateSince:      wireTime(s.StateSince),
		Alive:           s.Alive,
		Directory:       s.Directory,
		PermissionMode:  sessionWirePermissionMode{Value: string(s.PermissionMode), Source: s.PermissionModeSource},
		Context:         sessionWireContext{Compactions: s.Compactions},
		LastActivity:    s.LastActivity,
		TmuxTarget:      s.TmuxTarget,
		FirstLaunchHere: s.FirstLaunchHere,
		CreatedAt:       wireTime(s.CreatedAt),
		Pinned:          s.Pinned,
		RailPos:         s.RailPos,
		Plan:            toWireSessionPlan(s),
		Unread:          s.Unread,
		LastPrompt:      s.LastPrompt,
		EndedAt:         wireTimePtr(s.EndedAt),
	}

	if s.Attention != nil {
		w.Attention = &sessionWireAttention{Reason: s.Attention.Reason, Since: wireTime(s.Attention.Since)}
	}
	if s.Failure != nil {
		w.Failure = &sessionWireFailure{Error: s.Failure.Error, Message: s.Failure.Message}
	}
	if s.Branch != nil {
		w.Repo = &sessionWireRepo{Name: filepath.Base(s.Directory), Branch: s.Branch, IsWorktree: s.IsWorktree}
	}
	if s.Model != nil {
		w.Model = &sessionWireModel{ID: s.Model.ID, DisplayName: s.Model.DisplayName}
	}
	if s.Context != nil {
		usedPct := s.Context.UsedPct
		totalInputTokens := s.Context.TotalInputTokens
		windowSize := s.Context.WindowSize
		w.Context.UsedPct = &usedPct
		w.Context.TotalInputTokens = &totalInputTokens
		w.Context.WindowSize = &windowSize
	}
	if s.ClaudeSessionID != "" {
		v := s.ClaudeSessionID
		w.ClaudeSessionID = &v
	}
	return w
}
