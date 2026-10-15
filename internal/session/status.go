package session

import (
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
)

// applyStatusUpdate mutates sess per kb:anchor/ws.session's value semantics: title, model,
// context and prompt-cache warmth refresh from a routed status-line post, plus the directory Claude reports
// (ClaudeDir), each adopted only when update carried it and only when it actually differs
// from the current value. Returns whether
// anything changed, so the caller only persists+broadcasts on a real change — status
// posts fire on every tool use, so a naive always-broadcast would spam sessionUpsert.
//
// This function's switch never reaches state/stateSince/attention/failure/alive/
// compactions/permissionMode/titleOverride: there is no code path here that touches them
// — Title always means Claude's last-known name, never the user's override, and callers
// needing the display-title (wire "title") distinction compare Session.DisplayTitle()
// themselves (Manager.ApplyStatus's persist-vs-broadcast split). Attention/Failure/Model/Context are treated as immutable
// snapshots elsewhere (Session.Clone's doc comment), so a changed field is always
// replaced with a fresh pointer, never mutated in place. Cache is replaced the same way
// when its wire lifetime changes, but a keep-alive post writes its held Requests and
// ReportedExpiresAt in place: the broadcast check compares the pointer, and those two
// fields are off the wire.
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

	if adoptCache(sess, update.Cache) {
		changed = true
	}

	if adoptClaudeDir(sess, update.Cwd) {
		changed = true
	}

	return changed
}

func adoptCache(sess *Session, reading *claudecode.StatusCache) bool {
	if reading == nil {
		return false
	}
	var lastRequests *int64
	if sess.Cache != nil {
		lastRequests = sess.Cache.Requests
	}
	requests := lastRequests
	if reading.Requests != nil && (lastRequests == nil || *lastRequests != *reading.Requests) {
		count := *reading.Requests
		requests = &count
	}

	lifetime, adopt := reading.Lifetime(lastRequests)
	if adopt && !cacheHasLifetime(sess.Cache, lifetime.ExpiresAt, lifetime.TTLSeconds) {
		sess.Cache = &Cache{ExpiresAt: lifetime.ExpiresAt, TTLSeconds: lifetime.TTLSeconds, Requests: requests, ReportedExpiresAt: reading.ExpiresAt}
		return true
	}
	if sess.Cache != nil {
		sess.Cache.Requests = requests
		sess.Cache.ReportedExpiresAt = reading.ExpiresAt
	}
	return false
}

func forgetHeldRequests(sess *Session) {
	if sess.Cache == nil || sess.Cache.Requests == nil {
		return
	}
	next := *sess.Cache
	next.Requests = nil
	sess.Cache = &next
}

func capCacheAtExit(sess *Session) {
	held := sess.Cache
	if held == nil || held.ReportedExpiresAt.IsZero() {
		return
	}
	capped := claudecode.CacheAtExit(held.ExpiresAt, held.ReportedExpiresAt)
	if cacheHasLifetime(held, capped, held.TTLSeconds) {
		return
	}
	next := *held
	next.ExpiresAt = capped
	sess.Cache = &next
}

func cacheHasLifetime(c *Cache, expiresAt time.Time, ttlSeconds int64) bool {
	return c != nil && c.ExpiresAt.Equal(expiresAt) && c.TTLSeconds == ttlSeconds
}
