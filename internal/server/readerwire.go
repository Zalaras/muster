package server

import "github.com/Zalaras/muster/internal/session"

// readerFileWire is one entry of GET .../reader's `files` array (kb:anchor/sessions.reader).
type readerFileWire struct {
	Path      string  `json:"path"`
	WrittenAt *string `json:"writtenAt"`
}

// readerPlanWire is GET .../reader's `plan` object — session.plan plus writtenAt
// (kb:anchor/sessions.reader). Null when the session has no derived plan.
type readerPlanWire struct {
	Path      string  `json:"path"`
	Exists    bool    `json:"exists"`
	WrittenAt *string `json:"writtenAt"`
}

// readerListingWire is GET /api/sessions/{id}/reader's 200 body (kb:anchor/sessions.reader).
type readerListingWire struct {
	Directory string           `json:"directory"`
	Plan      *readerPlanWire  `json:"plan"`
	Files     []readerFileWire `json:"files"`
	Listing   string           `json:"listing"`
	Truncated bool             `json:"truncated"`
}

// docChangedMessage is the WS `docChanged` (kb:anchor/ws.doc-changed).
type docChangedMessage struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
	Path string `json:"path"`
	At   string `json:"at"`
}

// sessionWirePlan is the Session object's `plan` field (kb:anchor/ws.session). Null when
// the session's latest known transcript names no plan.
type sessionWirePlan struct {
	Path   string `json:"path"`
	Exists bool   `json:"exists"`
}

// toWireSessionPlan returns s's wire plan object, nil when unresolved (PlanPath == "").
func toWireSessionPlan(s *session.Session) *sessionWirePlan {
	if s.PlanPath == "" {
		return nil
	}
	return &sessionWirePlan{Path: s.PlanPath, Exists: s.PlanExists}
}
