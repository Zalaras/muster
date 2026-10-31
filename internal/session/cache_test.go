package session

import (
	"context"
	"fmt"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

var cacheExpiry = time.Unix(1790840879, 0).UTC()

func statusCache(expires time.Time, ttlSeconds int64) claudecode.StatusUpdate {
	return claudecode.StatusUpdate{Cache: &claudecode.StatusCache{ExpiresAt: expires, TTLSeconds: ttlSeconds}}
}

// TestApplyStatusUpdate_CacheAdoption checks at the pure level: the cache
// is adopted when carried and different, an equal one (same instant, same lifetime) is no
// change even when its time value differs in zone, and a post without one leaves the
// last-known value untouched.
func TestApplyStatusUpdate_CacheAdoption(t *testing.T) {
	held := func() *Cache { return &Cache{ExpiresAt: cacheExpiry, TTLSeconds: 3600} }
	tests := []struct {
		name        string
		start       *Cache
		update      claudecode.StatusUpdate
		wantChanged bool
		want        *Cache
	}{
		{"first cache on a session with none", nil, statusCache(cacheExpiry, 3600), true, held()},
		{"no cache in the post leaves nothing", nil, claudecode.StatusUpdate{}, false, nil},
		{"no cache in the post keeps the last-known value", held(), claudecode.StatusUpdate{}, false, held()},
		{"identical cache is no change", held(), statusCache(cacheExpiry, 3600), false, held()},
		{"same instant in another zone is no change", held(), statusCache(cacheExpiry.In(time.FixedZone("x", 7200)), 3600), false, held()},
		{"later expiry replaces", held(), statusCache(cacheExpiry.Add(time.Minute), 3600), true, &Cache{ExpiresAt: cacheExpiry.Add(time.Minute), TTLSeconds: 3600}},
		{"lifetime alone differing replaces", held(), statusCache(cacheExpiry, 300), true, &Cache{ExpiresAt: cacheExpiry, TTLSeconds: 300}},
		{"an earlier expiry still replaces", held(), statusCache(cacheExpiry.Add(-time.Hour), 3600), true, &Cache{ExpiresAt: cacheExpiry.Add(-time.Hour), TTLSeconds: 3600}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sess := newTestSession()
			sess.Cache = tt.start
			startPtr := sess.Cache

			changed := applyStatusUpdate(sess, tt.update)

			assert.Equal(t, tt.wantChanged, changed)
			if tt.want == nil {
				assert.Nil(t, sess.Cache)
				return
			}
			require.NotNil(t, sess.Cache)
			assert.True(t, tt.want.ExpiresAt.Equal(sess.Cache.ExpiresAt))
			assert.Equal(t, tt.want.TTLSeconds, sess.Cache.TTLSeconds)
			if tt.wantChanged && startPtr != nil {
				assert.NotSame(t, startPtr, sess.Cache, "a changed cache is a fresh pointer, never written through the old one")
			}
			if !tt.wantChanged {
				assert.Same(t, startPtr, sess.Cache, "an unchanged cache keeps its pointer (the broadcast check compares pointers)")
			}
		})
	}
}

// TestApplyStatusUpdate_CacheDoesNotDisturbStateFromEverySource crosses a cache-bearing
// post with every card source state: the machine-owned fields stay bit-identical and the
// cache is adopted, from every state and the dead flag (the adoption side).
func TestApplyStatusUpdate_CacheDoesNotDisturbStateFromEverySource(t *testing.T) {
	for _, src := range cardSources {
		for _, alive := range []bool{true, false} {
			t.Run(src.name+"/alive="+strconv.FormatBool(alive), func(t *testing.T) {
				sess := cardSession(src)
				sess.Alive = alive
				before := *sess

				changed := applyStatusUpdate(sess, statusCache(cacheExpiry, 300))

				assert.True(t, changed)
				require.NotNil(t, sess.Cache)
				assert.Equal(t, int64(300), sess.Cache.TTLSeconds)
				sess.Cache = nil
				assert.Equal(t, before, *sess, "adopting a cache changes nothing else on the session")
			})
		}
	}
}

func launchedSession(t *testing.T, mgr *Manager, target string) *Session {
	t.Helper()
	ctx := context.Background()
	params := createParams(t.TempDir())
	params.RepoID = seedRepo(t, mgr.store, params.Directory)
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)
	return sess
}

// TestApplyStatus_CacheBroadcasts checks through the Manager: a changed
// cache is exactly one sessionUpsert carrying it; an unchanged one, and a post without one,
// broadcast nothing.
func TestApplyStatus_CacheBroadcasts(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	sess := launchedSession(t, mgr, "muster:@1")
	before := len(rec.all())

	first, err := mgr.ApplyStatus(ctx, sess.ID, statusCache(cacheExpiry, 3600))
	require.NoError(t, err)
	require.NotNil(t, first.Cache)
	require.Len(t, rec.all(), before+1, "D4: a first cache is exactly one upsert")
	carried := rec.all()[before]
	require.NotNil(t, carried.Cache, "D4: the upsert carries the cache")
	assert.True(t, cacheExpiry.Equal(carried.Cache.ExpiresAt))
	assert.Equal(t, int64(3600), carried.Cache.TTLSeconds)

	_, err = mgr.ApplyStatus(ctx, sess.ID, statusCache(cacheExpiry, 3600))
	require.NoError(t, err)
	assert.Len(t, rec.all(), before+1, "D3: an equal cache is no upsert")

	_, err = mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{})
	require.NoError(t, err)
	assert.Len(t, rec.all(), before+1, "D2: a post without a cache broadcasts nothing")
	kept, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.NotNil(t, kept.Cache, "D2: the last-known cache is untouched")
	assert.True(t, cacheExpiry.Equal(kept.Cache.ExpiresAt))

	later := cacheExpiry.Add(30 * time.Minute)
	_, err = mgr.ApplyStatus(ctx, sess.ID, statusCache(later, 3600))
	require.NoError(t, err)
	require.Len(t, rec.all(), before+2, "D4: an expiry moving on alone is one upsert")
	last := rec.all()[before+1]
	require.NotNil(t, last.Cache)
	assert.True(t, later.Equal(last.Cache.ExpiresAt))

	title := "Renamed"
	_, err = mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: &title, Cache: &claudecode.StatusCache{ExpiresAt: later, TTLSeconds: 3600}})
	require.NoError(t, err)
	assert.Len(t, rec.all(), before+3, "a title change beside an unchanged cache is still one upsert, not two")
}

// TestApplyStatus_CacheIsPerSession: a post for one session moves nobody else's cache,
// and only that session broadcasts.
func TestApplyStatus_CacheIsPerSession(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	a := launchedSession(t, mgr, "muster:@1")
	b := launchedSession(t, mgr, "muster:@2")
	_, err := mgr.ApplyStatus(ctx, b.ID, statusCache(cacheExpiry, 300))
	require.NoError(t, err)
	before := len(rec.all())

	_, err = mgr.ApplyStatus(ctx, a.ID, statusCache(cacheExpiry.Add(time.Hour), 3600))
	require.NoError(t, err)

	gotA, _ := mgr.Get(a.ID)
	gotB, _ := mgr.Get(b.ID)
	require.NotNil(t, gotA.Cache)
	require.NotNil(t, gotB.Cache)
	assert.Equal(t, int64(3600), gotA.Cache.TTLSeconds)
	assert.Equal(t, int64(300), gotB.Cache.TTLSeconds, "the other session's cache is untouched")
	require.Len(t, rec.all(), before+1)
	assert.Equal(t, a.ID, rec.all()[before].ID)
}

// cacheClearInputs are the inputs that are a /clear rebind: the explicit one, and a plain
// bind or resume bind or any enveloped-style rebind naming a claude session id the session
// does not hold (applyBind escalates them).
func cacheClearInputs() map[string]struct {
	id string
	in claudecode.StateInput
} {
	return map[string]struct {
		id string
		in claudecode.StateInput
	}{
		"clear_rebind_new_id":             {"c2", claudecode.StateInput{Kind: claudecode.KindClearRebind}},
		"clear_rebind_same_id":            {"c1", claudecode.StateInput{Kind: claudecode.KindClearRebind}},
		"bind_escalated_by_new_id":        {"c2", claudecode.StateInput{Kind: claudecode.KindBind}},
		"resume_bind_escalated_by_new_id": {"c2", claudecode.StateInput{Kind: claudecode.KindResumeBind}},
	}
}

// TestApplyInput_ClearRebindClearsCacheFromEverySource is the clearing half: every
// /clear-shaped input empties the cache from every source state, alive or dead, and a
// status post of the new conversation refills it (Edge Cases 1 and 2).
func TestApplyInput_ClearRebindClearsCacheFromEverySource(t *testing.T) {
	for _, src := range cardSources {
		for _, alive := range []bool{true, false} {
			for name, c := range cacheClearInputs() {
				t.Run(src.name+"/alive="+strconv.FormatBool(alive)+"/"+name, func(t *testing.T) {
					sess := cardSession(src)
					sess.Alive = alive
					sess.Cache = &Cache{ExpiresAt: cacheExpiry, TTLSeconds: 3600}

					applyInput(sess, c.id, nil, c.in, laterNow())

					assert.Nil(t, sess.Cache, "D5: a /clear rebind leaves the cache unknown")
					assert.Equal(t, alive, sess.Alive, "the rebind does not write alive")

					changed := applyStatusUpdate(sess, statusCache(cacheExpiry, 3600))
					assert.True(t, changed, "the next post of the new conversation refills it")
					require.NotNil(t, sess.Cache)
				})
			}
		}
	}
}

// TestApplyInput_NonClearInputsKeepCacheFromEverySource is the keeping half: every
// other input kind, crossed with every source state and the dead flag, leaves the cache
// pointer exactly as it was.
func TestApplyInput_NonClearInputsKeepCacheFromEverySource(t *testing.T) {
	mode := "plan"
	inputs := []struct {
		name   string
		in     claudecode.StateInput
		prompt *string
	}{
		{"bind_same_id", claudecode.StateInput{Kind: claudecode.KindBind}, nil},
		{"resume_bind_same_id", claudecode.StateInput{Kind: claudecode.KindResumeBind}, nil},
		{"turn_activity_open_prompt", mainActivity(), strp("p1")},
		{"turn_activity_new_prompt", mainActivity(), strp("p7")},
		{"turn_activity_closed_prompt", mainActivity(), strp("p0")},
		{"turn_activity_with_mode", claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}, strp("p1")},
		{"subagent_activity", subagentActivity(&mode), strp("p1")},
		{"needs_input_permission", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, strp("p1")},
		{"idle_notice_open", idleNotice(), strp("p1")},
		{"idle_notice_closed", idleNotice(), strp("p0")},
		{"turn_closed", claudecode.StateInput{Kind: claudecode.KindTurnClosed, LastActivity: strp("done")}, strp("p1")},
		{"turn_closed_closed_prompt", claudecode.StateInput{Kind: claudecode.KindTurnClosed}, strp("p0")},
		{"turn_interrupted", claudecode.StateInput{Kind: claudecode.KindTurnInterrupted}, strp("p1")},
		{"turn_failed", claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: strp("server_error")}, strp("p1")},
		{"subagent_stop_failure", subagentStopFailure(), strp("p1")},
		{"compaction_began", compactionBegan(), strp(compactionPrompt)},
		{"compaction_ended_other_prompt", compactionEnded(), strp("p1")},
		{"compaction_ended_own_prompt", compactionEnded(), strp(compactionPrompt)},
		{"death_hint", claudecode.StateInput{Kind: claudecode.KindDeathHint}, nil},
		{"clear_death_hint", claudecode.StateInput{Kind: claudecode.KindClearDeathHint}, nil},
		{"inert", claudecode.StateInput{Kind: claudecode.KindInert}, nil},
	}
	for _, src := range cardSources {
		for _, alive := range []bool{true, false} {
			for _, tt := range inputs {
				t.Run(src.name+"/alive="+strconv.FormatBool(alive)+"/"+tt.name, func(t *testing.T) {
					sess := cardSession(src)
					sess.Alive = alive
					if tt.name == "compaction_ended_own_prompt" {
						sess.currentPromptID, sess.compactionPromptID = compactionPrompt, compactionPrompt
					}
					held := &Cache{ExpiresAt: cacheExpiry, TTLSeconds: 3600}
					sess.Cache = held

					applyInput(sess, "c1", tt.prompt, tt.in, laterNow())

					assert.Same(t, held, sess.Cache, "D6/INV-5: only a /clear rebind clears the cache")
					assert.True(t, cacheExpiry.Equal(sess.Cache.ExpiresAt))
					assert.Equal(t, int64(3600), sess.Cache.TTLSeconds)
				})
			}
		}
	}

	t.Run("first bind of a never-bound session", func(t *testing.T) {
		sess := newTestSession()
		sess.State = StateStarted
		held := &Cache{ExpiresAt: cacheExpiry, TTLSeconds: 3600}
		sess.Cache = held

		applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, laterNow())

		assert.Same(t, held, sess.Cache, "a first bind is not a /clear")
	})
}

// TestManager_CacheLifecycleWithABystander checks at the Manager level, over two
// coexisting sessions: Stop, liveness death, Resume and a compaction keep the target's cache
// (in memory and in the row) and never touch the bystander's; a /clear rebind clears only
// the target's; and a restart reads both back.
func TestManager_CacheLifecycleWithABystander(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	pc := newFakePaneChecker()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record, withTmuxSessions(newFakeTmuxSessions()))
	target := launchedSession(t, mgr, "muster-t:@1")
	other := launchedSession(t, mgr, "muster-o:@1")
	pc.setExists("muster-t:@1", true)
	pc.setExists("muster-o:@1", true)
	_, err := mgr.ApplyStatus(ctx, target.ID, statusCache(cacheExpiry, 3600))
	require.NoError(t, err)
	otherExpiry := cacheExpiry.Add(time.Hour)
	_, err = mgr.ApplyStatus(ctx, other.ID, statusCache(otherExpiry, 300))
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, target.ID, "c1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, other.ID, "o1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	assertCaches := func(step string, wantTarget *time.Time, wantTargetTTL int64) {
		t.Helper()
		gotT, ok := mgr.Get(target.ID)
		require.True(t, ok, step)
		gotO, ok := mgr.Get(other.ID)
		require.True(t, ok, step)
		rowT, errT := st.GetSession(ctx, target.ID)
		require.NoError(t, errT, step)
		rowO, errO := st.GetSession(ctx, other.ID)
		require.NoError(t, errO, step)
		if wantTarget == nil {
			assert.Nil(t, gotT.Cache, step)
			assert.Nil(t, rowT.CacheExpiresAt, step)
			assert.Nil(t, rowT.CacheTTLSeconds, step)
		} else {
			require.NotNil(t, gotT.Cache, step)
			assert.True(t, wantTarget.Equal(gotT.Cache.ExpiresAt), step)
			assert.Equal(t, wantTargetTTL, gotT.Cache.TTLSeconds, step)
			require.NotNil(t, rowT.CacheExpiresAt, step)
			assert.True(t, wantTarget.Equal(*rowT.CacheExpiresAt), step)
			require.NotNil(t, rowT.CacheTTLSeconds, step)
			assert.Equal(t, wantTargetTTL, *rowT.CacheTTLSeconds, step)
		}
		require.NotNil(t, gotO.Cache, step+": bystander")
		assert.True(t, otherExpiry.Equal(gotO.Cache.ExpiresAt), step+": bystander")
		assert.Equal(t, int64(300), gotO.Cache.TTLSeconds, step+": bystander")
		require.NotNil(t, rowO.CacheExpiresAt, step+": bystander row")
		assert.True(t, otherExpiry.Equal(*rowO.CacheExpiresAt), step+": bystander row")
	}
	assertCaches("after binds", &cacheExpiry, 3600)

	pc.setExists("muster-t:@1", false)
	_, err = mgr.End(ctx, target.ID)
	require.NoError(t, err)
	ended, _ := mgr.Get(target.ID)
	require.False(t, ended.Alive)
	assertCaches("after Stop", &cacheExpiry, 3600)

	pc.setExists("muster-o:@1", false)
	mgr.checkLiveness(ctx)
	died, _ := mgr.Get(other.ID)
	require.False(t, died.Alive)
	assertCaches("after the bystander's liveness death", &cacheExpiry, 3600)
	pc.setExists("muster-o:@1", true)
	_, err = mgr.RecordResume(ctx, other.ID, "muster-o:@2", "%2")
	require.NoError(t, err)
	assertCaches("after the bystander's Resume", &cacheExpiry, 3600)

	_, err = mgr.RecordResume(ctx, target.ID, "muster-t:@2", "%2")
	require.NoError(t, err)
	assertCaches("after Resume", &cacheExpiry, 3600)
	_, err = mgr.Apply(ctx, target.ID, "c1", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, true)
	require.NoError(t, err)
	assertCaches("after the resume SessionStart", &cacheExpiry, 3600)

	prompt := compactionPrompt
	_, err = mgr.Apply(ctx, target.ID, "c1", &prompt, compactionBegan(), true)
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, target.ID, "c1", &prompt, compactionEnded(), true)
	require.NoError(t, err)
	assertCaches("after a compaction", &cacheExpiry, 3600)

	restarted := newTestManager(t, st, pc, nil)
	require.NoError(t, restarted.LoadAll(ctx))
	for id, want := range map[int64]struct {
		expires time.Time
		ttl     int64
	}{target.ID: {cacheExpiry, 3600}, other.ID: {otherExpiry, 300}} {
		got, ok := restarted.Get(id)
		require.True(t, ok)
		require.NotNil(t, got.Cache, "D7: the cache survives a manager restart")
		assert.True(t, want.expires.Equal(got.Cache.ExpiresAt))
		assert.Equal(t, want.ttl, got.Cache.TTLSeconds)
	}

	_, err = mgr.Apply(ctx, target.ID, "c2", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
	require.NoError(t, err)
	assertCaches("after /clear", nil, 0)

	_, err = mgr.ApplyStatus(ctx, target.ID, statusCache(cacheExpiry.Add(2*time.Hour), 3600))
	require.NoError(t, err)
	refilled, _ := mgr.Get(target.ID)
	require.NotNil(t, refilled.Cache, "the next status post of the new conversation refills it")
}

// TestApply_EnvelopedEventWithANewClaudeSessionIDClearsCache: a rebind that arrives on a
// non-bind event (the SessionStart was lost) is still a /clear rebind
// (kb:adr/ingest-envelope-authoritative-binding) and clears the cache; an event for the
// id already held does not.
func TestApply_EnvelopedEventWithANewClaudeSessionIDClearsCache(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	sess := launchedSession(t, mgr, "muster:@1")
	_, err := mgr.Apply(ctx, sess.ID, "c1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = mgr.ApplyStatus(ctx, sess.ID, statusCache(cacheExpiry, 3600))
	require.NoError(t, err)
	p := "p1"

	got, err := mgr.Apply(ctx, sess.ID, "c1", &p, mainActivity(), true)
	require.NoError(t, err)
	require.NotNil(t, got.Cache, "an event on the bound id keeps the cache")

	got, err = mgr.Apply(ctx, sess.ID, "c2", &p, mainActivity(), true)
	require.NoError(t, err)
	assert.Nil(t, got.Cache, "an event naming a new claude session id is a rebind and clears it")
}

// TestCacheRowMapping checks the row boundary: a row with both columns is a cache,
// a row with either missing is unknown, never half a cache, and a cache maps back to both
// columns together.
func TestCacheRowMapping(t *testing.T) {
	ttl := int64(3600)
	tests := []struct {
		name    string
		expires *time.Time
		ttl     *int64
		want    *Cache
	}{
		{"both", &cacheExpiry, &ttl, &Cache{ExpiresAt: cacheExpiry, TTLSeconds: 3600}},
		{"expiry only", &cacheExpiry, nil, nil},
		{"lifetime only", nil, &ttl, nil},
		{"neither", nil, nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := cacheFromRow(store.SessionRow{CacheExpiresAt: tt.expires, CacheTTLSeconds: tt.ttl})

			assert.Equal(t, tt.want, got)
		})
	}

	t.Run("a cache maps to both columns, none to neither", func(t *testing.T) {
		expires, secs := cacheToRow(&Cache{ExpiresAt: cacheExpiry, TTLSeconds: 300})
		require.NotNil(t, expires)
		require.NotNil(t, secs)
		assert.True(t, cacheExpiry.Equal(*expires))
		assert.Equal(t, int64(300), *secs)

		expires, secs = cacheToRow(nil)
		assert.Nil(t, expires)
		assert.Nil(t, secs)
	})
}

// TestPersistFailure_RollsBackCacheChanges: a status post that moves the cache, and a /clear
// rebind that clears it, both roll the in-memory cache back when the row cannot be written,
// and neither broadcasts (restoreChangedFields covers Cache like Context).
func TestPersistFailure_RollsBackCacheChanges(t *testing.T) {
	tests := []struct {
		name string
		call func(ctx context.Context, mgr *Manager, id int64) error
	}{
		{"status post moves the cache", func(ctx context.Context, mgr *Manager, id int64) error {
			_, err := mgr.ApplyStatus(ctx, id, statusCache(cacheExpiry.Add(time.Hour), 300))
			return err
		}},
		{"clear rebind clears the cache", func(ctx context.Context, mgr *Manager, id int64) error {
			_, err := mgr.Apply(ctx, id, "c2", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
			return err
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			mgr := newTestManager(t, st, nil, rec.record)
			sess := launchedSession(t, mgr, "muster:@1")
			_, err := mgr.Apply(ctx, sess.ID, "c1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
			require.NoError(t, err)
			_, err = mgr.ApplyStatus(ctx, sess.ID, statusCache(cacheExpiry, 3600))
			require.NoError(t, err)
			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			require.NotNil(t, before.Cache)
			broadcasts := len(rec.all())
			require.NoError(t, st.Close())

			require.Error(t, tt.call(ctx, mgr, sess.ID))

			after, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			require.NotNil(t, after.Cache, "the failed write must leave the cache as it was")
			assert.True(t, cacheExpiry.Equal(after.Cache.ExpiresAt))
			assert.Equal(t, int64(3600), after.Cache.TTLSeconds)
			assert.Len(t, rec.all(), broadcasts, "a failed persist never broadcasts")
		})
	}
}

func promptCachePost(expiresAt time.Time, requests int, warm bool) claudecode.StatusUpdate {
	payload := fmt.Sprintf(`{"prompt_cache":{"warm":%t,"ttl":"5m","expires_at":%d,"caching_observed":true,"requests":%d,"hit_ratio":0.966,"misses":0}}`,
		warm, expiresAt.Unix(), requests)
	return claudecode.InterpretStatus([]byte(payload))
}

// TestCacheKeepAlive drives status adoption through the real status-line JSON: a 5m post
// carrying a request count is predicted to stay warm an hour of keep-alives longer, a
// keep-alive post (same count) changes nothing, and warm false drops the expiry to the
// post's own reported time.
func TestCacheKeepAlive(t *testing.T) {
	sess := newTestSession()
	request := time.Unix(1790840879, 0).UTC()

	changed := applyStatusUpdate(sess, promptCachePost(request.Add(300*time.Second), 3, true))

	assert.True(t, changed)
	require.NotNil(t, sess.Cache)
	assert.True(t, request.Add(3900*time.Second).Equal(sess.Cache.ExpiresAt), "expiresAt = request + 1h + ttl, got %s", sess.Cache.ExpiresAt)
	assert.Equal(t, int64(3900), sess.Cache.TTLSeconds)
	anchored := sess.Cache

	changed = applyStatusUpdate(sess, promptCachePost(request.Add(330*time.Second), 3, true))

	assert.False(t, changed, "a keep-alive post (same requests, warm) changes nothing")
	assert.Same(t, anchored, sess.Cache)

	changed = applyStatusUpdate(sess, promptCachePost(request.Add(330*time.Second), 3, false))

	assert.True(t, changed)
	require.NotNil(t, sess.Cache)
	assert.True(t, request.Add(330*time.Second).Equal(sess.Cache.ExpiresAt), "warm false sets expiresAt to the post's expires_at, got %s", sess.Cache.ExpiresAt)
	assert.Equal(t, int64(3900), sess.Cache.TTLSeconds)
}
