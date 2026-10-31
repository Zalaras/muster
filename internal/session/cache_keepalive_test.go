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

// kaPost is one status post's prompt_cache block, read through the real interpreter. at is
// expires_at in seconds after cacheExpiry; requests 0 omits the key; warm is "", "true" or "false".
type kaPost struct {
	ttl      string
	at       int64
	requests int
	warm     string
}

func (p kaPost) update() claudecode.StatusUpdate {
	body := fmt.Sprintf(`"ttl":%q,"expires_at":%d,"caching_observed":true`, p.ttl, cacheExpiry.Unix()+p.at)
	if p.requests != 0 {
		body += fmt.Sprintf(`,"requests":%d`, p.requests)
	}
	if p.warm != "" {
		body += `,"warm":` + p.warm
	}
	return claudecode.InterpretStatus([]byte(`{"prompt_cache":{` + body + `}}`))
}

func kaAt(seconds int64) time.Time { return cacheExpiry.Add(time.Duration(seconds) * time.Second) }

type kaStep struct {
	post        kaPost
	wantChanged bool
	wantExpires int64
	wantTTL     int64
}

// TestCacheKeepAlive_Sequences drives the lifetime rules (edge cases 5 to 7)
// through applyStatusUpdate with real status-line JSON. An unchanged step keeps the cache pointer
// (the broadcast check compares pointers) and its value.
func TestCacheKeepAlive_Sequences(t *testing.T) {
	anchor := kaStep{kaPost{"5m", 300, 3, "true"}, true, 3900, 3900}
	tests := []struct {
		name  string
		steps []kaStep
	}{
		{"5m post with requests anchors an hour of keep-alives ahead", []kaStep{anchor}},
		{"warm absent reads like warm true", []kaStep{{kaPost{"5m", 300, 3, ""}, true, 3900, 3900}}},
		{"keep-alives with the same count change nothing, whatever their expires_at", []kaStep{
			anchor,
			{kaPost{"5m", 330, 3, "true"}, false, 3900, 3900},
			{kaPost{"5m", 360, 3, "true"}, false, 3900, 3900},
			{kaPost{"5m", 100, 3, "true"}, false, 3900, 3900},
		}},
		{"edge 6: the second post of a render pair is a same-count post", []kaStep{
			anchor,
			{kaPost{"5m", 300, 3, "true"}, false, 3900, 3900},
		}},
		{"a changed count re-anchors on the new request", []kaStep{
			anchor,
			{kaPost{"5m", 330, 3, "true"}, false, 3900, 3900},
			{kaPost{"5m", 700, 4, "true"}, true, 4300, 3900},
		}},
		{"edge 7: a keep-alive ahead of the post showing the new request changes nothing, then the request anchors", []kaStep{
			anchor,
			{kaPost{"5m", 630, 3, "true"}, false, 3900, 3900},
			{kaPost{"5m", 940, 4, "true"}, true, 4540, 3900},
		}},
		{"edge 2: a resumed process restarts the count at 1 and re-anchors", []kaStep{
			{kaPost{"5m", 300, 7, "true"}, true, 3900, 3900},
			{kaPost{"5m", 9000, 1, "true"}, true, 12600, 3900},
		}},
		{"warm false drops to the post's expiry and keeps the lifetime", []kaStep{
			anchor,
			{kaPost{"5m", 330, 3, "true"}, false, 3900, 3900},
			{kaPost{"5m", 330, 3, "false"}, true, 330, 3900},
		}},
		{"warm false repeated, or a same-count warm post after it, keeps it there", []kaStep{
			anchor,
			{kaPost{"5m", 330, 3, "false"}, true, 330, 3900},
			{kaPost{"5m", 330, 3, "false"}, false, 330, 3900},
			{kaPost{"5m", 360, 3, "true"}, false, 330, 3900},
		}},
		{"the next count after warm false re-anchors", []kaStep{
			anchor,
			{kaPost{"5m", 330, 3, "false"}, true, 330, 3900},
			{kaPost{"5m", 900, 4, "true"}, true, 4500, 3900},
		}},
		{"warm false as a session's first post", []kaStep{{kaPost{"5m", 330, 3, "false"}, true, 330, 3900}}},
		{"one-hour ttl with requests is adopted as reported", []kaStep{
			{kaPost{"1h", 3600, 3, "true"}, true, 3600, 3600},
			{kaPost{"1h", 3600, 4, "true"}, false, 3600, 3600},
			{kaPost{"1h", 3700, 5, "true"}, true, 3700, 3600},
			{kaPost{"1h", 3700, 5, "true"}, false, 3700, 3600},
		}},
		{"one-hour ttl, warm false still applies", []kaStep{
			{kaPost{"1h", 3600, 3, "true"}, true, 3600, 3600},
			{kaPost{"1h", 1800, 3, "false"}, true, 1800, 3600},
		}},
		{"two hours is as reported", []kaStep{{kaPost{"2h", 7200, 3, "true"}, true, 7200, 7200}}},
		{"59m is inside the regime, 60m is not", []kaStep{{kaPost{"59m", 3540, 3, "true"}, true, 7140, 7140}}},
		{"60m is as reported", []kaStep{{kaPost{"60m", 3600, 3, "true"}, true, 3600, 3600}}},
		{"edge 5: no requests is adopted as reported, each moved expiry replaces", []kaStep{
			{kaPost{"5m", 300, 0, "true"}, true, 300, 300},
			{kaPost{"5m", 300, 0, "true"}, false, 300, 300},
			{kaPost{"5m", 330, 0, "true"}, true, 330, 300},
		}},
		{"no requests, warm false: the post's expiry as reported", []kaStep{{kaPost{"5m", 300, 0, "false"}, true, 300, 300}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sess := newTestSession()
			for i, step := range tt.steps {
				before := sess.Cache

				changed := applyStatusUpdate(sess, step.post.update())

				require.NotNil(t, sess.Cache, "step %d", i)
				assert.Equal(t, step.wantChanged, changed, "step %d: changed", i)
				assert.True(t, kaAt(step.wantExpires).Equal(sess.Cache.ExpiresAt), "step %d: expiresAt want +%ds got %s", i, step.wantExpires, sess.Cache.ExpiresAt)
				assert.Equal(t, step.wantTTL, sess.Cache.TTLSeconds, "step %d: ttl", i)
				if !step.wantChanged && before != nil {
					assert.Same(t, before, sess.Cache, "step %d: an unchanged cache keeps its pointer", i)
				}
			}
		})
	}
}

// TestCacheKeepAlive_HeldFieldsFollowEveryPost: the held count and last reported expiry are updated
// in place by a keep-alive (no new pointer, so no broadcast) and are what the ended-session expiry cap and the restart restore read.
func TestCacheKeepAlive_HeldFieldsFollowEveryPost(t *testing.T) {
	sess := newTestSession()
	applyStatusUpdate(sess, kaPost{"5m", 300, 3, "true"}.update())
	anchored := sess.Cache
	require.NotNil(t, anchored.Requests)
	assert.Equal(t, int64(3), *anchored.Requests)
	assert.True(t, kaAt(300).Equal(anchored.ReportedExpiresAt))

	applyStatusUpdate(sess, kaPost{"5m", 630, 3, "true"}.update())

	assert.Same(t, anchored, sess.Cache)
	assert.True(t, kaAt(630).Equal(sess.Cache.ReportedExpiresAt), "a keep-alive records its expires_at in place, got %s", sess.Cache.ReportedExpiresAt)
	assert.True(t, kaAt(3900).Equal(sess.Cache.ExpiresAt), "while the predicted lifetime stays put")

	t.Run("a count change under an unchanged lifetime updates the held count in place", func(t *testing.T) {
		sess := newTestSession()
		applyStatusUpdate(sess, kaPost{"1h", 3600, 3, "true"}.update())
		held := sess.Cache

		changed := applyStatusUpdate(sess, kaPost{"1h", 3600, 4, "true"}.update())

		assert.False(t, changed)
		assert.Same(t, held, sess.Cache)
		require.NotNil(t, sess.Cache.Requests)
		assert.Equal(t, int64(4), *sess.Cache.Requests)
	})

	t.Run("a post without requests keeps the held count", func(t *testing.T) {
		sess := newTestSession()
		applyStatusUpdate(sess, kaPost{"5m", 300, 3, "true"}.update())

		applyStatusUpdate(sess, kaPost{"5m", 330, 0, ""}.update())

		require.NotNil(t, sess.Cache.Requests)
		assert.Equal(t, int64(3), *sess.Cache.Requests)
	})

	t.Run("a post without prompt_cache changes nothing held", func(t *testing.T) {
		sess := newTestSession()
		applyStatusUpdate(sess, kaPost{"5m", 300, 3, "true"}.update())
		held := sess.Cache

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{})

		assert.False(t, changed)
		assert.Same(t, held, sess.Cache)
		assert.True(t, kaAt(300).Equal(sess.Cache.ReportedExpiresAt))
	})
}

// TestCacheKeepAlive_BroadcastsOnlyAnAnchor checks through the Manager that only an anchor broadcasts: an anchor is one
// sessionUpsert carrying the predicted lifetime; keep-alives, the repeated post of a render pair
// and a keep-alive reordered ahead of the next request's post send nothing and write no row; the
// request's own post is one upsert again.
func TestCacheKeepAlive_BroadcastsOnlyAnAnchor(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	sess := launchedSession(t, mgr, "muster:@1")
	apply := func(p kaPost) {
		t.Helper()
		_, err := mgr.ApplyStatus(ctx, sess.ID, p.update())
		require.NoError(t, err)
	}
	before := len(rec.all())

	apply(kaPost{"5m", 300, 3, "true"})
	require.Len(t, rec.all(), before+1, "the anchor is one upsert")
	carried := rec.all()[before].Cache
	require.NotNil(t, carried)
	assert.True(t, kaAt(3900).Equal(carried.ExpiresAt))
	assert.Equal(t, int64(3900), carried.TTLSeconds)
	rowAtAnchor, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)

	apply(kaPost{"5m", 300, 3, "true"})
	apply(kaPost{"5m", 330, 3, "true"})
	apply(kaPost{"5m", 630, 3, "true"})
	assert.Len(t, rec.all(), before+1, "edge 6 and REQ-2: same-count posts never broadcast")
	rowAfterKeepAlives, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	assert.Equal(t, rowAtAnchor, rowAfterKeepAlives, "REQ-2: a keep-alive post writes no row")

	apply(kaPost{"5m", 940, 4, "true"})
	require.Len(t, rec.all(), before+2, "edge 7: the new request's post anchors")
	assert.True(t, kaAt(4540).Equal(rec.all()[before+1].Cache.ExpiresAt))
}

// TestCacheKeepAlive_IsPerSession: a keep-alive on one session and a re-anchor on another never
// move each other's cache or held count.
func TestCacheKeepAlive_IsPerSession(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	a := launchedSession(t, mgr, "muster:@1")
	b := launchedSession(t, mgr, "muster:@2")
	for _, id := range []int64{a.ID, b.ID} {
		_, err := mgr.ApplyStatus(ctx, id, kaPost{"5m", 300, 3, "true"}.update())
		require.NoError(t, err)
	}
	before := len(rec.all())

	_, err := mgr.ApplyStatus(ctx, a.ID, kaPost{"5m", 700, 4, "true"}.update())
	require.NoError(t, err)
	_, err = mgr.ApplyStatus(ctx, b.ID, kaPost{"5m", 330, 3, "true"}.update())
	require.NoError(t, err)

	gotA, _ := mgr.Get(a.ID)
	gotB, _ := mgr.Get(b.ID)
	assert.True(t, kaAt(4300).Equal(gotA.Cache.ExpiresAt))
	assert.True(t, kaAt(3900).Equal(gotB.Cache.ExpiresAt), "the keep-alive on b is a keep-alive whatever a's count became")
	assert.Equal(t, int64(3), *gotB.Cache.Requests)
	assert.Equal(t, int64(4), *gotA.Cache.Requests)
	require.Len(t, rec.all(), before+1)
	assert.Equal(t, a.ID, rec.all()[before].ID)
}

// TestCacheKeepAlive_SurvivesARestartAndClearsOnClear: the count and last reported expiry
// are on the row; a Manager restarted from the database still takes a keep-alive post as no
// change (no upsert, same pointer); a request after the restart still anchors; and a /clear rebind
// nulls them on the row with the cache, so the new conversation's identical count anchors fresh.
func TestCacheKeepAlive_SurvivesARestartAndClearsOnClear(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	sess := launchedSession(t, mgr, "muster:@1")
	_, err := mgr.Apply(ctx, sess.ID, "c1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = mgr.ApplyStatus(ctx, sess.ID, kaPost{"5m", 300, 3, "true"}.update())
	require.NoError(t, err)
	row, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	require.NotNil(t, row.CacheRequests, "the count is on the row")
	assert.Equal(t, int64(3), *row.CacheRequests)
	require.NotNil(t, row.CacheReportedExpiresAt, "the last reported expiry is on the row")
	assert.True(t, kaAt(300).Equal(*row.CacheReportedExpiresAt))
	require.NotNil(t, row.CacheExpiresAt)
	assert.True(t, kaAt(3900).Equal(*row.CacheExpiresAt))

	rec := &upsertsRecorder{}
	restarted := newTestManager(t, st, nil, rec.record)
	require.NoError(t, restarted.LoadAll(ctx))
	loaded, _ := restarted.Get(sess.ID)
	require.NotNil(t, loaded.Cache)
	require.NotNil(t, loaded.Cache.Requests, "the count survives the restart")
	assert.Equal(t, int64(3), *loaded.Cache.Requests)
	assert.True(t, kaAt(300).Equal(loaded.Cache.ReportedExpiresAt))

	_, err = restarted.ApplyStatus(ctx, sess.ID, kaPost{"5m", 330, 3, "true"}.update())
	require.NoError(t, err)
	assert.Empty(t, rec.all(), "after a restart a keep-alive post still changes nothing (edge 1)")
	after, _ := restarted.Get(sess.ID)
	assert.True(t, kaAt(3900).Equal(after.Cache.ExpiresAt))

	_, err = restarted.ApplyStatus(ctx, sess.ID, kaPost{"5m", 640, 4, "true"}.update())
	require.NoError(t, err)
	require.Len(t, rec.all(), 1, "a request after the restart still anchors")
	assert.True(t, kaAt(4240).Equal(rec.all()[0].Cache.ExpiresAt))

	_, err = restarted.Apply(ctx, sess.ID, "c2", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
	require.NoError(t, err)
	cleared, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.CacheExpiresAt, "edge 3: /clear nulls the cache")
	assert.Nil(t, cleared.CacheTTLSeconds)
	assert.Nil(t, cleared.CacheRequests, "and the held count")
	assert.Nil(t, cleared.CacheReportedExpiresAt, "and the held reported expiry")

	_, err = restarted.ApplyStatus(ctx, sess.ID, kaPost{"5m", 20000, 4, "true"}.update())
	require.NoError(t, err)
	fresh, _ := restarted.Get(sess.ID)
	require.NotNil(t, fresh.Cache, "the new conversation anchors fresh even on the count the old one held")
	assert.True(t, kaAt(23600).Equal(fresh.Cache.ExpiresAt))
}

// TestCapCacheAtExit is the rule on a bare session: the earlier of the predicted and the last
// reported expiry, lifetime untouched; unknown stays unknown; a row from before migration 0015
// (no reported expiry) cannot be capped.
func TestCapCacheAtExit(t *testing.T) {
	tests := []struct {
		name        string
		cache       *Cache
		wantExpires time.Time
		wantNil     bool
	}{
		{"5m regime drops to the reported expiry", &Cache{ExpiresAt: kaAt(3900), TTLSeconds: 3900, ReportedExpiresAt: kaAt(630)}, kaAt(630), false},
		{"one-hour regime is unchanged", &Cache{ExpiresAt: kaAt(3600), TTLSeconds: 3600, ReportedExpiresAt: kaAt(3600)}, kaAt(3600), false},
		{"reported later than predicted is unchanged", &Cache{ExpiresAt: kaAt(100), TTLSeconds: 300, ReportedExpiresAt: kaAt(500)}, kaAt(100), false},
		{"cold session is unchanged", &Cache{ExpiresAt: kaAt(330), TTLSeconds: 3900, ReportedExpiresAt: kaAt(330)}, kaAt(330), false},
		{"no reported expiry cannot be capped", &Cache{ExpiresAt: kaAt(3900), TTLSeconds: 3900}, kaAt(3900), false},
		{"null stays null", nil, time.Time{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sess := newTestSession()
			sess.Cache = tt.cache
			var ttl int64
			if tt.cache != nil {
				ttl = tt.cache.TTLSeconds
			}

			capCacheAtExit(sess)

			if tt.wantNil {
				assert.Nil(t, sess.Cache)
				return
			}
			require.NotNil(t, sess.Cache)
			assert.True(t, tt.wantExpires.Equal(sess.Cache.ExpiresAt), "want %s got %s", tt.wantExpires, sess.Cache.ExpiresAt)
			assert.Equal(t, ttl, sess.Cache.TTLSeconds, "ttlSeconds is never capped")
		})
	}

	t.Run("a cap replaces the pointer, never writes through it", func(t *testing.T) {
		sess := newTestSession()
		held := &Cache{ExpiresAt: kaAt(3900), TTLSeconds: 3900, ReportedExpiresAt: kaAt(630)}
		sess.Cache = held

		capCacheAtExit(sess)

		assert.NotSame(t, held, sess.Cache)
		assert.True(t, kaAt(3900).Equal(held.ExpiresAt), "a snapshot sharing the old pointer is unchanged")
	})

	t.Run("an unchanged cap keeps the pointer", func(t *testing.T) {
		sess := newTestSession()
		held := &Cache{ExpiresAt: kaAt(330), TTLSeconds: 3900, ReportedExpiresAt: kaAt(330)}
		sess.Cache = held

		capCacheAtExit(sess)

		assert.Same(t, held, sess.Cache)
	})
}

type kaEnd struct {
	name string
	run  func(ctx context.Context, mgr *Manager, pc *fakePaneChecker, target string, id int64) error
}

func kaEnds() []kaEnd {
	return []kaEnd{
		{"liveness death", func(ctx context.Context, mgr *Manager, pc *fakePaneChecker, target string, _ int64) error {
			pc.setExists(target, false)
			mgr.checkLiveness(ctx)
			return nil
		}},
		{"End", func(ctx context.Context, mgr *Manager, pc *fakePaneChecker, target string, id int64) error {
			pc.setExists(target, false)
			_, err := mgr.End(ctx, id)
			return err
		}},
	}
}

func ownTarget(id int64) string { return "muster-" + strconv.FormatInt(id, 10) + ":@1" }

// launchedOwnTarget launches a session whose tmux target is the one Reconcile and End derive
// from its id (muster-<id>).
func launchedOwnTarget(t *testing.T, mgr *Manager) *Session {
	t.Helper()
	ctx := context.Background()
	params := createParams(t.TempDir())
	params.RepoID = seedRepo(t, mgr.store, params.Directory)
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(ctx, sess.ID, ownTarget(sess.ID), "%1")
	require.NoError(t, err)
	return sess
}

// TestCacheKeepAlive_EndedSessionDropsToTheLastReportedExpiry checks through the Manager, from
// both ways a live row ends, with a second live session beside it: the target's expiry becomes the
// last reported one (in memory, on the row and in the ended upsert), its lifetime stays, a
// one-hour-regime or cold session is unchanged, a null cache stays null, and the bystander's cache
// is untouched.
func TestCacheKeepAlive_EndedSessionDropsToTheLastReportedExpiry(t *testing.T) {
	tests := []struct {
		name        string
		posts       []kaPost
		wantExpires int64
		wantTTL     int64
		wantNull    bool
	}{
		{"5m regime after keep-alives", []kaPost{{"5m", 300, 3, "true"}, {"5m", 330, 3, "true"}, {"5m", 630, 3, "true"}}, 630, 3900, false},
		{"5m regime, no keep-alive seen after the request", []kaPost{{"5m", 300, 3, "true"}}, 300, 3900, false},
		{"one-hour regime is unchanged", []kaPost{{"1h", 3600, 3, "true"}, {"1h", 3500, 4, "true"}}, 3500, 3600, false},
		{"cold session is unchanged", []kaPost{{"5m", 300, 3, "true"}, {"5m", 330, 3, "false"}}, 330, 3900, false},
		{"no requests is unchanged", []kaPost{{"5m", 300, 0, "true"}}, 300, 300, false},
		{"null stays null", nil, 0, 0, true},
	}
	for _, end := range kaEnds() {
		for _, tt := range tests {
			t.Run(end.name+"/"+tt.name, func(t *testing.T) {
				ctx := context.Background()
				st := openTestStore(t)
				pc := newFakePaneChecker()
				rec := &upsertsRecorder{}
				mgr := newTestManager(t, st, pc, rec.record, withTmuxSessions(newFakeTmuxSessions()))
				target := launchedOwnTarget(t, mgr)
				other := launchedOwnTarget(t, mgr)
				pc.setExists(ownTarget(target.ID), true)
				pc.setExists(ownTarget(other.ID), true)
				for _, p := range tt.posts {
					_, err := mgr.ApplyStatus(ctx, target.ID, p.update())
					require.NoError(t, err)
				}
				_, err := mgr.ApplyStatus(ctx, other.ID, kaPost{"5m", 300, 3, "true"}.update())
				require.NoError(t, err)

				require.NoError(t, end.run(ctx, mgr, pc, ownTarget(target.ID), target.ID))

				got, ok := mgr.Get(target.ID)
				require.True(t, ok)
				require.False(t, got.Alive)
				row, err := st.GetSession(ctx, target.ID)
				require.NoError(t, err)
				var upserted *Session
				for _, s := range rec.all() {
					if s.ID == target.ID && !s.Alive {
						upserted = s
					}
				}
				require.NotNil(t, upserted, "the ended row is broadcast")
				if tt.wantNull {
					assert.Nil(t, got.Cache)
					assert.Nil(t, row.CacheExpiresAt)
					assert.Nil(t, upserted.Cache)
				} else {
					for where, expires := range map[string]time.Time{"memory": got.Cache.ExpiresAt, "row": *row.CacheExpiresAt, "upsert": upserted.Cache.ExpiresAt} {
						assert.True(t, kaAt(tt.wantExpires).Equal(expires), "%s: expiresAt want +%ds got %s", where, tt.wantExpires, expires)
					}
					assert.Equal(t, tt.wantTTL, got.Cache.TTLSeconds)
					assert.Equal(t, tt.wantTTL, *row.CacheTTLSeconds)
					assert.Equal(t, tt.wantTTL, upserted.Cache.TTLSeconds)
				}

				survivor, _ := mgr.Get(other.ID)
				assert.True(t, survivor.Alive, "the bystander stays alive")
				require.NotNil(t, survivor.Cache)
				assert.True(t, kaAt(3900).Equal(survivor.Cache.ExpiresAt), "the bystander's cache is untouched")
			})
		}
	}
}

// TestCacheKeepAlive_ReconcileEndsAtTheLastPersistedReportedExpiry is the third way in, with
// A daemon restarted over a row whose tmux session is gone marks it ended at the reported
// expiry the row carries, while a row whose session is still there keeps its predicted lifetime.
// A keep-alive in memory is not persisted, so the cap reads the expiry of the last write.
func TestCacheKeepAlive_ReconcileEndsAtTheLastPersistedReportedExpiry(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	seed := newTestManager(t, st, nil, nil)
	gone := launchedOwnTarget(t, seed)
	kept := launchedOwnTarget(t, seed)
	for _, id := range []int64{gone.ID, kept.ID} {
		_, err := seed.ApplyStatus(ctx, id, kaPost{"5m", 300, 3, "true"}.update())
		require.NoError(t, err)
		_, err = seed.ApplyStatus(ctx, id, kaPost{"5m", 630, 3, "true"}.update())
		require.NoError(t, err)
	}

	pc := newFakePaneChecker()
	pc.setExists(ownTarget(kept.ID), true)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record, withTmuxSessions(newFakeTmuxSessions("muster-"+strconv.FormatInt(kept.ID, 10))))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, 1, report.MarkedEnded)
	endedSess, _ := mgr.Get(gone.ID)
	require.False(t, endedSess.Alive)
	require.NotNil(t, endedSess.Cache)
	assert.True(t, kaAt(300).Equal(endedSess.Cache.ExpiresAt), "capped to the persisted reported expiry, got %s", endedSess.Cache.ExpiresAt)
	assert.Equal(t, int64(3900), endedSess.Cache.TTLSeconds)
	row, err := st.GetSession(ctx, gone.ID)
	require.NoError(t, err)
	require.NotNil(t, row.CacheExpiresAt)
	assert.True(t, kaAt(300).Equal(*row.CacheExpiresAt), "persisted with the ended row")
	var carried *Session
	for _, s := range rec.all() {
		if s.ID == gone.ID && !s.Alive {
			carried = s
		}
	}
	require.NotNil(t, carried, "the ended upsert is sent")
	assert.True(t, kaAt(300).Equal(carried.Cache.ExpiresAt))

	survivor, _ := mgr.Get(kept.ID)
	assert.True(t, survivor.Alive)
	require.NotNil(t, survivor.Cache)
	assert.True(t, kaAt(3900).Equal(survivor.Cache.ExpiresAt), "a session reconcile keeps alive keeps its predicted lifetime")
}

// TestCacheKeepAlive_ResumeReanchorsOnTheFirstPost is edge case 2 through the Manager: an ended
// session's cache survives Resume at its capped value until the resumed process's first request,
// and that request re-anchors whatever count the old process had reached. The resumed counter
// restarts at 1 (kb:fact/resume-reads-prior-prompt-cache), so a held count of 1 is the case a
// "count differs" rule is most likely to miss.
func TestCacheKeepAlive_ResumeReanchorsOnTheFirstPost(t *testing.T) {
	for _, held := range []int{7, 2, 1} {
		t.Run("held count "+strconv.Itoa(held), func(t *testing.T) {
			ctx := context.Background()
			st := openTestStore(t)
			pc := newFakePaneChecker()
			mgr := newTestManager(t, st, pc, nil, withTmuxSessions(newFakeTmuxSessions()))
			sess := launchedOwnTarget(t, mgr)
			pc.setExists(ownTarget(sess.ID), true)
			_, err := mgr.ApplyStatus(ctx, sess.ID, kaPost{"5m", 300, held, "true"}.update())
			require.NoError(t, err)
			pc.setExists(ownTarget(sess.ID), false)
			_, err = mgr.End(ctx, sess.ID)
			require.NoError(t, err)

			_, err = mgr.RecordResume(ctx, sess.ID, "muster-resumed:@2", "%2")
			require.NoError(t, err)
			resumed, _ := mgr.Get(sess.ID)
			require.NotNil(t, resumed.Cache, "Resume keeps the cache")
			assert.True(t, kaAt(300).Equal(resumed.Cache.ExpiresAt), "at its capped value until the first request")

			_, err = mgr.ApplyStatus(ctx, sess.ID, kaPost{"5m", 9000, 1, "true"}.update())
			require.NoError(t, err)

			got, _ := mgr.Get(sess.ID)
			require.NotNil(t, got.Cache)
			assert.True(t, kaAt(12600).Equal(got.Cache.ExpiresAt), "the resumed process's first request re-anchors: want +12600 got %s", got.Cache.ExpiresAt)
			assert.Equal(t, int64(3900), got.Cache.TTLSeconds)
		})
	}
}

// TestCacheKeepAlive_AdoptingAPaneForgetsTheCountOnlyForAnEndedRow is edge case 2 through the two
// repair paths that give a row a pane without RecordResume (a resume spawn whose persist was lost):
// RepairOwnedSession and Reconcile's reviveOwnedSession. A row that was not alive adopts a new
// process, so its first post with the very count the old process held re-anchors; a row that was
// alive is the same process, so the same-count post stays a keep-alive. A bystander beside it is
// untouched either way.
func TestCacheKeepAlive_AdoptingAPaneForgetsTheCountOnlyForAnEndedRow(t *testing.T) {
	adopts := []struct {
		name string
		run  func(ctx context.Context, mgr *Manager, id int64) error
	}{
		{"RepairOwnedSession", func(ctx context.Context, mgr *Manager, id int64) error {
			_, err := mgr.RepairOwnedSession(ctx, id)
			return err
		}},
		{"Reconcile", func(ctx context.Context, mgr *Manager, _ int64) error {
			mgr.Reconcile(ctx)
			return nil
		}},
	}
	rows := []struct {
		name        string
		ended       bool
		wantUpserts int
		wantExpires int64
		wantHeld    bool
	}{
		{"an ended row forgets the held count and re-anchors on the first post", true, 1, 12600, false},
		{"an alive row keeps the held count and the post stays a keep-alive", false, 0, 3900, true},
	}
	for _, adopt := range adopts {
		for _, row := range rows {
			t.Run(adopt.name+"/"+row.name, func(t *testing.T) {
				ctx := context.Background()
				st := openTestStore(t)
				pc := newFakePaneChecker()
				// Both muster-<id> sessions are live on the socket, so Reconcile adopts each.
				tmuxSessions := &fakeResolvingTmuxSessions{fakeTmuxSessions: newFakeTmuxSessions(), target: "muster-adopted:@2", pane: "%2"}
				rec := &upsertsRecorder{}
				mgr := newTestManager(t, st, pc, rec.record, withTmuxSessions(tmuxSessions))
				sess := launchedOwnTarget(t, mgr)
				bystander := launchedOwnTarget(t, mgr)
				for _, s := range []*Session{sess, bystander} {
					pc.setExists(ownTarget(s.ID), true)
					tmuxSessions.sessions = append(tmuxSessions.sessions, "muster-"+strconv.FormatInt(s.ID, 10))
					_, err := mgr.ApplyStatus(ctx, s.ID, kaPost{"5m", 300, 3, "true"}.update())
					require.NoError(t, err)
				}
				if row.ended {
					pc.setExists(ownTarget(sess.ID), false)
					_, err := mgr.End(ctx, sess.ID)
					require.NoError(t, err)
				}

				require.NoError(t, adopt.run(ctx, mgr, sess.ID))

				adopted, _ := mgr.Get(sess.ID)
				require.True(t, adopted.Alive)
				require.NotNil(t, adopted.Cache, "the prediction survives the adoption")
				assert.Equal(t, row.wantHeld, adopted.Cache.Requests != nil, "the held count after adopting")
				wantBefore := int64(3900)
				if row.ended {
					wantBefore = 300
				}
				assert.True(t, kaAt(wantBefore).Equal(adopted.Cache.ExpiresAt), "the prediction is as it was, got %s", adopted.Cache.ExpiresAt)

				before := len(rec.all())

				_, err := mgr.ApplyStatus(ctx, sess.ID, kaPost{"5m", 9000, 3, "true"}.update())
				require.NoError(t, err)

				got, _ := mgr.Get(sess.ID)
				require.NotNil(t, got.Cache)
				assert.True(t, kaAt(row.wantExpires).Equal(got.Cache.ExpiresAt), "want +%ds got %s", row.wantExpires, got.Cache.ExpiresAt)
				assert.Len(t, rec.all(), before+row.wantUpserts, "an anchor broadcasts, a keep-alive does not")
				other, _ := mgr.Get(bystander.ID)
				require.NotNil(t, other.Cache)
				require.NotNil(t, other.Cache.Requests, "the bystander keeps its held count")
				assert.Equal(t, int64(3), *other.Cache.Requests)
				assert.True(t, kaAt(3900).Equal(other.Cache.ExpiresAt))
			})
		}
	}
}

// TestCacheHeldRowMapping: the held count and reported expiry map both ways between the session
// and its row; unknown on the row is unset on the session, and the held columns alone never make a
// cache.
func TestCacheHeldRowMapping(t *testing.T) {
	requests := int64(3)
	expires, reported, ttl := kaAt(3900), kaAt(330), int64(3900)

	t.Run("a row maps to a cache with its held fields", func(t *testing.T) {
		got := cacheFromRow(store.SessionRow{CacheExpiresAt: &expires, CacheTTLSeconds: &ttl, CacheRequests: &requests, CacheReportedExpiresAt: &reported})

		require.NotNil(t, got)
		require.NotNil(t, got.Requests)
		assert.Equal(t, int64(3), *got.Requests)
		assert.True(t, reported.Equal(got.ReportedExpiresAt))
	})
	t.Run("a pre-0015 row maps to a cache with none held", func(t *testing.T) {
		got := cacheFromRow(store.SessionRow{CacheExpiresAt: &expires, CacheTTLSeconds: &ttl})

		require.NotNil(t, got)
		assert.Nil(t, got.Requests)
		assert.True(t, got.ReportedExpiresAt.IsZero())
	})
	t.Run("held columns without a cache pair are no cache", func(t *testing.T) {
		got := cacheFromRow(store.SessionRow{CacheRequests: &requests, CacheReportedExpiresAt: &reported})

		assert.Nil(t, got)
	})
	t.Run("a cache maps to its held columns, an unset reported expiry to null, none to neither", func(t *testing.T) {
		gotRequests, gotReported := cacheHeldToRow(&Cache{ExpiresAt: expires, TTLSeconds: ttl, Requests: &requests, ReportedExpiresAt: reported})
		require.NotNil(t, gotRequests)
		assert.Equal(t, int64(3), *gotRequests)
		require.NotNil(t, gotReported)
		assert.True(t, reported.Equal(*gotReported))

		gotRequests, gotReported = cacheHeldToRow(&Cache{ExpiresAt: expires, TTLSeconds: ttl, Requests: &requests})
		assert.NotNil(t, gotRequests)
		assert.Nil(t, gotReported, "a zero reported expiry is stored as null")

		gotRequests, gotReported = cacheHeldToRow(nil)
		assert.Nil(t, gotRequests)
		assert.Nil(t, gotReported)
	})
	t.Run("sessionToRow writes them beside the pair", func(t *testing.T) {
		sess := newTestSession()
		sess.Cache = &Cache{ExpiresAt: expires, TTLSeconds: ttl, Requests: &requests, ReportedExpiresAt: reported}

		row := sessionToRow(sess)

		require.NotNil(t, row.CacheExpiresAt)
		require.NotNil(t, row.CacheRequests)
		assert.Equal(t, int64(3), *row.CacheRequests)
		require.NotNil(t, row.CacheReportedExpiresAt)
		assert.True(t, reported.Equal(*row.CacheReportedExpiresAt))
	})
}
