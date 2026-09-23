package session

import (
	"github.com/Zalaras/muster/internal/store"
)

// applyReaderRowFields copies the reader's optional TranscriptPath/PlanPath columns onto
// s — split out of rowToSession to keep it under the gocyclo ceiling (docs/conventions.md
// § Go): two more inline ifs there would have pushed it over 15.
func applyReaderRowFields(s *Session, row store.SessionRow) {
	if row.TranscriptPath != nil {
		s.TranscriptPath = *row.TranscriptPath
	}
	if row.PlanPath != nil {
		s.PlanPath = *row.PlanPath
	}
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
	}
	applyReaderRowFields(s, row)
	if row.TmuxPane != nil {
		s.TmuxPane = *row.TmuxPane
	}
	if row.ClaudeSessionID != nil {
		s.ClaudeSessionID = *row.ClaudeSessionID
	}
	if row.Model != nil {
		// model_display_name persists the real display name once a status-line post
		// has provided one, so a restart shows "Haiku 4.5" rather than re-deriving it
		// from the id. A row no status post has reached has a null column — fall back
		// to the id.
		displayName := *row.Model
		if row.ModelDisplayName != nil && *row.ModelDisplayName != "" {
			displayName = *row.ModelDisplayName
		}
		s.Model = &Model{ID: *row.Model, DisplayName: displayName}
	}
	if row.ContextUsedPct != nil && row.ContextTotalInputTokens != nil && row.ContextWindowSize != nil {
		s.Context = &Context{
			UsedPct:          *row.ContextUsedPct,
			TotalInputTokens: *row.ContextTotalInputTokens,
			WindowSize:       *row.ContextWindowSize,
		}
	}
	if row.AttentionReason != nil {
		a := &Attention{Reason: *row.AttentionReason}
		if row.AttentionSince != nil {
			a.Since = *row.AttentionSince
		}
		s.Attention = a
	}
	if row.FailureError != nil {
		f := &Failure{Error: *row.FailureError}
		if row.FailureMessage != nil {
			f.Message = *row.FailureMessage
		}
		s.Failure = f
	}
	if row.LastSnapshot != nil {
		s.LastSnapshot = *row.LastSnapshot
	}
	if row.LastSnapshotAt != nil {
		s.LastSnapshotAt = *row.LastSnapshotAt
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
	}
	if s.TranscriptPath != "" {
		transcriptPath := s.TranscriptPath
		row.TranscriptPath = &transcriptPath
	}
	if s.PlanPath != "" {
		planPath := s.PlanPath
		row.PlanPath = &planPath
	}
	if s.TmuxPane != "" {
		pane := s.TmuxPane
		row.TmuxPane = &pane
	}
	if s.ClaudeSessionID != "" {
		claudeID := s.ClaudeSessionID
		row.ClaudeSessionID = &claudeID
	}
	if s.Model != nil {
		id := s.Model.ID
		row.Model = &id
		displayName := s.Model.DisplayName
		row.ModelDisplayName = &displayName
	}
	if s.Context != nil {
		usedPct := s.Context.UsedPct
		totalInputTokens := s.Context.TotalInputTokens
		windowSize := s.Context.WindowSize
		row.ContextUsedPct = &usedPct
		row.ContextTotalInputTokens = &totalInputTokens
		row.ContextWindowSize = &windowSize
	}
	if s.Attention != nil {
		reason := s.Attention.Reason
		since := s.Attention.Since
		row.AttentionReason = &reason
		row.AttentionSince = &since
	}
	if s.Failure != nil {
		errTok := s.Failure.Error
		msg := s.Failure.Message
		row.FailureError = &errTok
		row.FailureMessage = &msg
	}
	if s.LastSnapshot != "" {
		text := s.LastSnapshot
		row.LastSnapshot = &text
	}
	if !s.LastSnapshotAt.IsZero() {
		at := s.LastSnapshotAt
		row.LastSnapshotAt = &at
	}
	return row
}
