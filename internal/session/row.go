package session

import (
	"time"

	"github.com/Zalaras/muster/internal/store"
)

// derefOrZero returns *p, or T's zero value when p is nil — rowToSession's shared answer
// for every nullable-column-to-value field.
func derefOrZero[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}

// ptrOrNil returns nil for v's zero value, else a pointer to v — sessionToRow's mirror of
// derefOrZero for the same nullable-column fields.
func ptrOrNil[T comparable](v T) *T {
	var zero T
	if v == zero {
		return nil
	}
	return &v
}

// modelFromRow builds *Model from the row's model id/display-name columns, or nil when no
// status-line post has ever set one. model_display_name falls back to the id itself so a
// restart shows "Haiku 4.5" rather than re-deriving it, once a display name has actually
// been recorded; a row no status post has reached has a null display-name column.
func modelFromRow(row store.SessionRow) *Model {
	if row.Model == nil {
		return nil
	}
	displayName := *row.Model
	if row.ModelDisplayName != nil && *row.ModelDisplayName != "" {
		displayName = *row.ModelDisplayName
	}
	return &Model{ID: *row.Model, DisplayName: displayName}
}

// modelToRow is modelFromRow's mirror: nil model columns when m is nil, both columns set
// together otherwise (Model's own fields are never independently optional).
func modelToRow(m *Model) (id, displayName *string) {
	if m == nil {
		return nil, nil
	}
	return &m.ID, &m.DisplayName
}

// contextFromRow builds *Context from the row's three gauge columns, or nil unless all
// three are present together — kb:anchor/ws.session's "always all present together, a nil
// window means no gauge at all" value semantics.
func contextFromRow(row store.SessionRow) *Context {
	if row.ContextUsedPct == nil || row.ContextTotalInputTokens == nil || row.ContextWindowSize == nil {
		return nil
	}
	return &Context{
		UsedPct:          *row.ContextUsedPct,
		TotalInputTokens: *row.ContextTotalInputTokens,
		WindowSize:       *row.ContextWindowSize,
	}
}

// contextToRow is contextFromRow's mirror.
func contextToRow(c *Context) (usedPct *float64, totalInputTokens, windowSize *int64) {
	if c == nil {
		return nil, nil, nil
	}
	return &c.UsedPct, &c.TotalInputTokens, &c.WindowSize
}

// attentionFromRow builds *Attention from the row's reason/since columns, or nil when
// reason is absent — Since defaults to the zero time when the row predates that column
// ever being written for this reason.
func attentionFromRow(row store.SessionRow) *Attention {
	if row.AttentionReason == nil {
		return nil
	}
	a := &Attention{Reason: *row.AttentionReason}
	if row.AttentionSince != nil {
		a.Since = *row.AttentionSince
	}
	return a
}

// attentionToRow is attentionFromRow's mirror: both columns set together, since Attention's
// own fields are never independently optional once Attention itself is non-nil.
func attentionToRow(a *Attention) (reason *string, since *time.Time) {
	if a == nil {
		return nil, nil
	}
	return &a.Reason, &a.Since
}

// failureFromRow builds *Failure from the row's error/message columns, or nil when error
// is absent.
func failureFromRow(row store.SessionRow) *Failure {
	if row.FailureError == nil {
		return nil
	}
	f := &Failure{Error: *row.FailureError}
	if row.FailureMessage != nil {
		f.Message = *row.FailureMessage
	}
	return f
}

// failureToRow is failureFromRow's mirror.
func failureToRow(f *Failure) (errTok, message *string) {
	if f == nil {
		return nil, nil
	}
	return &f.Error, &f.Message
}

func rowToSession(row store.SessionRow) *Session {
	s := &Session{
		ID:                   row.ID,
		TmuxTarget:           row.TmuxTarget,
		RepoID:               row.RepoID,
		Directory:            row.Directory,
		Branch:               row.Branch,
		IsWorktree:           row.IsWorktree,
		Title:                row.Title,
		State:                State(row.State),
		StateSince:           row.StateSince,
		PermissionMode:       PermissionMode(row.PermissionMode),
		PermissionModeSource: row.PermissionModeSource,
		Compactions:          row.Compactions,
		LastActivity:         row.LastActivity,
		Alive:                row.Alive,
		EndedAt:              row.EndedAt,
		FirstLaunchHere:      row.FirstLaunchHere,
		CreatedAt:            row.CreatedAt,
		Pinned:               row.Pinned,
		RailPos:              row.RailPos,
		TitleOverride:        row.TitleOverride,
		PlanExists:           row.PlanExists,
		Unread:               row.Unread,
		LastPrompt:           row.LastPrompt,
		TranscriptPath:       derefOrZero(row.TranscriptPath),
		PlanPath:             derefOrZero(row.PlanPath),
		TmuxPane:             derefOrZero(row.TmuxPane),
		ClaudeSessionID:      derefOrZero(row.ClaudeSessionID),
		LastSnapshot:         derefOrZero(row.LastSnapshot),
		LastSnapshotAt:       derefOrZero(row.LastSnapshotAt),
		Model:                modelFromRow(row),
		Context:              contextFromRow(row),
		Attention:            attentionFromRow(row),
		Failure:              failureFromRow(row),
	}
	return s
}

func sessionToRow(s *Session) store.SessionRow {
	row := store.SessionRow{
		ID:                   s.ID,
		TmuxTarget:           s.TmuxTarget,
		RepoID:               s.RepoID,
		Directory:            s.Directory,
		Branch:               s.Branch,
		IsWorktree:           s.IsWorktree,
		Title:                s.Title,
		State:                string(s.State),
		StateSince:           s.StateSince,
		PermissionMode:       string(s.PermissionMode),
		PermissionModeSource: s.PermissionModeSource,
		Compactions:          s.Compactions,
		LastActivity:         s.LastActivity,
		Alive:                s.Alive,
		EndedAt:              s.EndedAt,
		FirstLaunchHere:      s.FirstLaunchHere,
		CreatedAt:            s.CreatedAt,
		Pinned:               s.Pinned,
		RailPos:              s.RailPos,
		TitleOverride:        s.TitleOverride,
		PlanExists:           s.PlanExists,
		Unread:               s.Unread,
		LastPrompt:           s.LastPrompt,
		TranscriptPath:       ptrOrNil(s.TranscriptPath),
		PlanPath:             ptrOrNil(s.PlanPath),
		TmuxPane:             ptrOrNil(s.TmuxPane),
		ClaudeSessionID:      ptrOrNil(s.ClaudeSessionID),
		LastSnapshot:         ptrOrNil(s.LastSnapshot),
	}
	// LastSnapshotAt keeps its own IsZero() check rather than ptrOrNil's == comparison —
	// time.Time's docs warn == is not the right way to ask "is this the zero instant" in
	// general, and IsZero() is the one already in use everywhere else in this package.
	if !s.LastSnapshotAt.IsZero() {
		at := s.LastSnapshotAt
		row.LastSnapshotAt = &at
	}
	row.Model, row.ModelDisplayName = modelToRow(s.Model)
	row.ContextUsedPct, row.ContextTotalInputTokens, row.ContextWindowSize = contextToRow(s.Context)
	row.AttentionReason, row.AttentionSince = attentionToRow(s.Attention)
	row.FailureError, row.FailureMessage = failureToRow(s.Failure)
	return row
}
