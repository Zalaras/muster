package server

import (
	"path/filepath"
	"time"

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

// sessionWireContext is the kb:anchor/ws.session M3 context gauge: the three numeric fields are always
// all-null (unknown, INV-2) or all-non-null, populated only once a routed status-line
// post has carried a non-null used-percentage (REQ-2); compactions is live since M1.
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

// sessionRemovedMessage is the WS `sessionRemoved` envelope (m4-reconcile REQ-6, docs/
// kb:anchor/ws.session-removed) — sent once per DELETE /api/sessions/{id}.
type sessionRemovedMessage struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

// paneSnapshotWire is GET /api/sessions/{id}/pane's response shape (m4-reconcile REQ-4,
// kb:anchor/sessions.pane).
type paneSnapshotWire struct {
	Text       string `json:"text"`
	CapturedAt string `json:"capturedAt"`
}

// toWireSession converts a session.Session to its wire shape. repo is null "when
// directory isn't a git checkout" (kb:anchor/ws.session) — session.Branch is authoritatively nil in
// exactly that case (Schema Changes: "branch ... null when not git"), so that's the
// single source of truth here; no separate is-git flag is needed.
func toWireSession(s *session.Session) sessionWire {
	w := sessionWire{
		ID:              s.ID,
		Title:           s.DisplayTitle(), // REQ-11: the display title, not the raw Title column
		TitleOverride:   s.TitleOverride,
		State:           string(s.State),
		StateSince:      s.StateSince.UTC().Format(time.RFC3339),
		Alive:           s.Alive,
		Directory:       s.Directory,
		PermissionMode:  sessionWirePermissionMode{Value: string(s.PermissionMode), Source: s.PermissionModeSource},
		Context:         sessionWireContext{Compactions: s.Compactions},
		LastActivity:    s.LastActivity,
		TmuxTarget:      s.TmuxTarget,
		FirstLaunchHere: s.FirstLaunchHere,
		CreatedAt:       s.CreatedAt.UTC().Format(time.RFC3339),
		Pinned:          s.Pinned,
		RailPos:         s.RailPos,
	}

	if s.EndedAt != nil {
		v := s.EndedAt.UTC().Format(time.RFC3339)
		w.EndedAt = &v
	}
	if s.Attention != nil {
		w.Attention = &sessionWireAttention{Reason: s.Attention.Reason, Since: s.Attention.Since.UTC().Format(time.RFC3339)}
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
