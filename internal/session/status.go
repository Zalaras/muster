package session

import "github.com/Zalaras/muster/internal/claudecode"

// applyStatusUpdate mutates sess per §5.3's M3 value semantics: title, model, and
// context refresh from a routed status-line post, each adopted only when update carried
// it and only when it actually differs from the current value. Returns whether anything
// changed, so the caller only persists+broadcasts on a real change (REQ-4, INV-5's
// session-side twin) — status posts fire on every tool use, so a naive always-broadcast
// would spam sessionUpsert.
//
// This function's switch never reaches state/stateSince/attention/failure/alive/
// compactions/permissionMode/titleOverride (INV-1; plan ui-text-and-focus INV-2): there
// is no code path here that touches them — Title always means Claude's last-known name,
// never the user's override, and callers needing the display-title (wire "title")
// distinction compare Session.DisplayTitle() themselves (Manager.ApplyStatus's REQ-12
// persist-vs-broadcast split). Attention/Failure/Model/Context are treated as immutable
// snapshots elsewhere (Session.Clone's doc comment), so a changed field is always
// replaced with a fresh pointer, never mutated in place.
func applyStatusUpdate(sess *Session, update claudecode.StatusUpdate) bool {
	changed := false

	if update.Title != nil && (sess.Title == nil || *sess.Title != *update.Title) {
		title := *update.Title
		sess.Title = &title
		changed = true
	}

	if update.Model != nil && (sess.Model == nil || sess.Model.ID != update.Model.ID || sess.Model.DisplayName != update.Model.DisplayName) {
		sess.Model = &Model{ID: update.Model.ID, DisplayName: update.Model.DisplayName}
		changed = true
	}

	if update.Context != nil {
		next := Context{
			UsedPct:          update.Context.UsedPct,
			TotalInputTokens: update.Context.TotalInputTokens,
			WindowSize:       update.Context.WindowSize,
		}
		if sess.Context == nil || *sess.Context != next {
			sess.Context = &next
			changed = true
		}
	}

	return changed
}
