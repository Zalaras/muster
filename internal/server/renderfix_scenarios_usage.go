//go:build renderfix

package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// The usage feature's scenarios (web/render/usage.spec.ts), re-levelled from
// web/e2e/{cache-warmth,gauges,masthead-indicators,masthead-layout,usage-model}.spec.ts on
// 2026-10-20 (plans/_audit/relevel/usage.md): the card timer's prompt-cache warmth in every
// state and host, the group header's extra timer, the context and masthead gauges at and
// under the warn threshold, and the per-model window the subscription poll records.
//
// Time in a fixture: the normaliser renumbers every wire timestamp — a cache's `expiresAt`
// among them — to the fixture epoch plus one minute per distinct instant, in walk order
// (sessions by id, keys sorted), while `ttlSeconds` is kept as the daemon derived it. A
// cache's remaining lifetime at the epoch is therefore its position in that walk, in
// minutes, which the render spec reads back from the fixture rather than assuming. Two
// consequences shape the scenarios below: the first timestamp walked becomes the epoch
// itself, so a cache whose `expires_at` is that very second is cold at load (the "cold
// trick", coldExpiresAt); and a session's warmth position grows with its id, so the
// cache-less sessions a spec needs come first and the warm ones later, giving the latter
// enough minutes for the 15% boundary and the minute-boundary checks.
func init() {
	renderScenarios = append(renderScenarios,
		// Every state twice — a never-replied twin and a known-cache twin, the ended ones
		// included — then the three cards the lifetime tests read: a cold cache, a 5m-ttl cache
		// under the keep-alive regime (a 3900 s lifetime) and a one-hour cache.
		renderScenario{"cache-warmth", driveCacheWarmth},
		// Five idle one-hour caches under the Tiles view at 2×2: four live tiles and one strip
		// card whose timer carries the same warmth (`withPrefs`, since the dashboard adopts
		// `view` only from the prefs broadcast).
		renderScenario{"cache-warmth-strip", withPrefs(driveCacheWarmthStrip, map[string]any{"view": "tiles"})},
		// Group `alpha` with a waiting member in each warmth, a working one and an ended one,
		// beside group `lonely` whose only member is working; the variant collapses both
		// through the real PUT, for the "collapsed keeps its timer" half.
		renderScenario{"cache-warmth-groups", driveCacheWarmthGroups(false)},
		renderScenario{"cache-warmth-groups-collapsed", driveCacheWarmthGroups(true)},
		// Groups whose waiting members are all unknown, all cold or all warm, plus the
		// `Popover` group whose rows show warm, cooling and two unknown timers.
		renderScenario{"cache-warmth-hover", driveCacheWarmthHover},
		// `usage-known` under the Tiles view: the tile header's context info.
		renderScenario{"usage-known-tiles", withPrefs(driveUsageKnown, map[string]any{"view": "tiles"})},
		// A context at the 60% threshold beside a five-hour bucket at it and a seven-day one
		// under it: the hot track and the warn bar, and the bar that earned neither.
		renderScenario{"usage-hot", driveUsageHot},
		// The per-model window: two weekly-scoped windows recorded through the real poller's
		// fetch and decode against a local stand-in for the subscription API, with the
		// five-hour bucket at its widest number for the masthead's width tiers. The variant
		// points `usageModel` at a model the list lacks.
		renderScenario{"usage-model", driveUsageModel},
		renderScenario{"usage-model-absent", withPrefs(driveUsageModel, map[string]any{"usageModel": "Sonnet"})},
	)
}

// errUsageModelNotRecorded names a tick that recorded nothing — a stand-in server or token
// file the poller could not use, which would otherwise leave the fixture silently unknown.
var errUsageModelNotRecorded = errors.New("usage-model: the poller tick recorded no model-scoped windows")

// Distinct far-future `expires_at` values for warm caches: the normaliser renumbers them, so
// only their distinctness from every other wire instant matters — including the instant a
// 5m-ttl post is predicted to (its `expires_at` plus an hour), hence a stride that is not a
// multiple of 3600.
const renderCacheBase int64 = 1_900_000_000

func renderCacheAt(i int) int64 { return renderCacheBase + int64(i)*5000 }

// postCache posts one full status line for a bound session carrying a `prompt_cache` that
// expires at `expiresAt` with the given ttl (kb:fact/prompt-cache-status-shape).
func (r *renderRig) postCache(ctx context.Context, s renderSession, claudeID string, expiresAt int64, ttl string) error {
	return r.status(ctx, claudecodetest.EnvelopedStatusLineFull(claudeID, claudecodetest.StatusLineFullOpts{
		MusterSession: int(s.id),
		TmuxPane:      s.pane,
		PromptCache:   &claudecodetest.PromptCacheOpts{ExpiresAt: expiresAt, TTL: ttl},
	}))
}

// coldExpiresAt is the wire second of the first timestamp the normaliser walks — the
// created-at of the lowest-id session when it carries neither attention nor a cache (the
// scenarios keep that so) — which the normaliser maps onto the epoch itself. A cache that
// expires at exactly that second reads as cold the moment the page clock starts.
func (r *renderRig) coldExpiresAt(ctx context.Context, anchor renderSession) (int64, error) {
	row, err := r.st.GetSession(ctx, anchor.id)
	if err != nil {
		return 0, err
	}
	return row.CreatedAt.Unix(), nil
}

// bindPlanning launches a titled session in plan mode and opens a turn, so it reads
// `planning` rather than `working`.
func (r *renderRig) bindPlanning(ctx context.Context, title string) (renderSession, error) {
	dir, err := r.dir(ctx, title, "main")
	if err != nil {
		return renderSession{}, err
	}
	s, err := r.bind(ctx, dir, "cs-"+title, renderModelSonnet, launchOpts{title: title, permissionMode: claudecode.PermissionPlan})
	if err != nil {
		return s, err
	}
	return s, r.promptSubmit(ctx, s, "cs-"+title)
}

// driveStateTwins binds one session per state under `prefix-<state>`, in this order:
// started, planning, working, needs, failed, idle, ended. `expiresAt` non-nil posts a
// one-hour cache to each (distinct instants from `from`), before the ended one is ended.
func (r *renderRig) driveStateTwins(ctx context.Context, prefix string, cacheFrom int) ([]renderSession, error) {
	states := []struct{ name, state string }{
		{"started", "started"}, {"planning", "planning"}, {"working", "working"},
		{"needs", "needs_input"}, {"failed", "failed"}, {"idle", "idle"}, {"ended", "idle"},
	}
	sessions := make([]renderSession, 0, len(states))
	for i, st := range states {
		title := prefix + "-" + st.name
		var s renderSession
		var err error
		if st.state == "planning" {
			s, err = r.bindPlanning(ctx, title)
		} else {
			s, err = r.bindTitled(ctx, title)
			if err == nil {
				err = r.driveToState(ctx, s, title, st.state)
			}
		}
		if err != nil {
			return nil, err
		}
		if cacheFrom >= 0 {
			if err = r.postCache(ctx, s, "cs-"+title, renderCacheAt(cacheFrom+i), "1h"); err != nil {
				return nil, err
			}
		}
		sessions = append(sessions, s)
	}
	return sessions, r.markDead(ctx, sessions[len(sessions)-1].id)
}

func driveCacheWarmth(ctx context.Context, r *renderRig) error {
	unknown, err := r.driveStateTwins(ctx, "unknown", -1)
	if err != nil {
		return err
	}
	if _, err = r.driveStateTwins(ctx, "known", 0); err != nil {
		return err
	}
	cold, err := r.coldExpiresAt(ctx, unknown[0])
	if err != nil {
		return err
	}
	for _, c := range []struct {
		title     string
		expiresAt int64
		ttl       string
	}{
		{"fade-cold", cold, "1h"},
		{"bound-short", renderCacheAt(20), "5m"},
		{"bound-hour", renderCacheAt(21), "1h"},
	} {
		s, err := r.bindTitled(ctx, c.title)
		if err != nil {
			return err
		}
		if err = r.driveToState(ctx, s, c.title, "idle"); err != nil {
			return err
		}
		if err = r.postCache(ctx, s, "cs-"+c.title, c.expiresAt, c.ttl); err != nil {
			return err
		}
	}
	return nil
}

func driveCacheWarmthStrip(ctx context.Context, r *renderRig) error {
	for i := range 5 {
		title := "strip-warm-" + string(rune('0'+i))
		s, err := r.bindTitled(ctx, title)
		if err != nil {
			return err
		}
		if err = r.driveToState(ctx, s, title, "idle"); err != nil {
			return err
		}
		if err = r.postCache(ctx, s, "cs-"+title, renderCacheAt(i), "1h"); err != nil {
			return err
		}
	}
	return nil
}

// bindWarm binds a titled session, walks it to `state` and, when ttl is non-empty, posts a
// cache expiring at `expiresAt`.
func (r *renderRig) bindWarm(ctx context.Context, title, state string, expiresAt int64, ttl string) (renderSession, error) {
	s, err := r.bindTitled(ctx, title)
	if err != nil {
		return s, err
	}
	if err = r.driveToState(ctx, s, title, state); err != nil {
		return s, err
	}
	if ttl == "" {
		return s, nil
	}
	return s, r.postCache(ctx, s, "cs-"+title, expiresAt, ttl)
}

func driveCacheWarmthGroups(collapse bool) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		// `anchor` is the cache-less, attention-less first session the cold trick keys on; it
		// stays ungrouped. In `alpha` the waiting members are n1 (unknown), i2 (warm) and i1
		// (cold) — i1 launched last among them, so it is the one that entered its state last.
		anchor, err := r.bindWarm(ctx, "head-anchor", "idle", 0, "")
		if err != nil {
			return err
		}
		cold, err := r.coldExpiresAt(ctx, anchor)
		if err != nil {
			return err
		}
		n1, err := r.bindWarm(ctx, "head-n1", "needs_input", 0, "")
		if err != nil {
			return err
		}
		i2, err := r.bindWarm(ctx, "head-i2", "idle", renderCacheAt(0), "1h")
		if err != nil {
			return err
		}
		i1, err := r.bindWarm(ctx, "head-i1", "idle", cold, "1h")
		if err != nil {
			return err
		}
		w1, err := r.bindWarm(ctx, "head-w1", "working", renderCacheAt(1), "1h")
		if err != nil {
			return err
		}
		e1, err := r.bindWarm(ctx, "head-e1", "idle", renderCacheAt(2), "1h")
		if err != nil {
			return err
		}
		if err = r.markDead(ctx, e1.id); err != nil {
			return err
		}
		solo, err := r.bindWarm(ctx, "head-solo", "working", renderCacheAt(3), "1h")
		if err != nil {
			return err
		}
		alpha, err := r.createGroup(ctx, "alpha", []renderSession{i2, n1, i1, w1, e1})
		if err != nil {
			return err
		}
		lonely, err := r.createGroup(ctx, "lonely", []renderSession{solo})
		if err != nil {
			return err
		}
		if !collapse {
			return nil
		}
		for _, id := range []int64{alpha, lonely} {
			if _, err = r.api(ctx, http.MethodPut, "/api/groups/"+strconv.FormatInt(id, 10), map[string]any{"collapsed": true}); err != nil {
				return err
			}
		}
		return nil
	}
}

func driveCacheWarmthHover(ctx context.Context, r *renderRig) error {
	// The cache-less sessions come first so the warm caches below sit far enough along the
	// walk to be warm, not cooling, at load (a one-hour cache cools from nine minutes out):
	// three unknown waiting members, the two cold ones, and the Popover group's two
	// never-replied members.
	unkA, err := r.bindWarm(ctx, "hover-unk-a", "idle", 0, "")
	if err != nil {
		return err
	}
	unkB, err := r.bindWarm(ctx, "hover-unk-b", "idle", 0, "")
	if err != nil {
		return err
	}
	unkC, err := r.bindWarm(ctx, "hover-unk-c", "failed", 0, "")
	if err != nil {
		return err
	}
	cold, err := r.coldExpiresAt(ctx, unkA)
	if err != nil {
		return err
	}
	cldA, err := r.bindWarm(ctx, "hover-cld-a", "idle", cold, "1h")
	if err != nil {
		return err
	}
	cldB, err := r.bindWarm(ctx, "hover-cld-b", "needs_input", cold, "1h")
	if err != nil {
		return err
	}
	popWorking, err := r.bindWarm(ctx, "pop-working", "working", 0, "")
	if err != nil {
		return err
	}
	popStarted, err := r.bindWarm(ctx, "pop-started", "started", 0, "")
	if err != nil {
		return err
	}
	wrmA, err := r.bindWarm(ctx, "hover-wrm-a", "idle", renderCacheAt(0), "1h")
	if err != nil {
		return err
	}
	// wrmB entered its state last, so its timer stands for the group.
	wrmB, err := r.bindWarm(ctx, "hover-wrm-b", "failed", renderCacheAt(1), "1h")
	if err != nil {
		return err
	}
	popWarm, err := r.bindWarm(ctx, "pop-warm", "idle", renderCacheAt(2), "1h")
	if err != nil {
		return err
	}
	// A day-long lifetime keeps this one inside its last 15% whatever minute the walk gives
	// it: cooling at load, as the 300 s cache of the journey it came from was.
	popCooling, err := r.bindWarm(ctx, "pop-cooling", "idle", renderCacheAt(3), "24h")
	if err != nil {
		return err
	}
	for _, g := range []struct {
		name    string
		members []renderSession
	}{
		{"unknown", []renderSession{unkA, unkB, unkC}},
		{"cold", []renderSession{cldA, cldB}},
		{"warm", []renderSession{wrmA, wrmB}},
		{"Popover", []renderSession{popWarm, popCooling, popWorking, popStarted}},
	} {
		if _, err = r.createGroup(ctx, g.name, g.members); err != nil {
			return err
		}
	}
	return nil
}

func driveUsageHot(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "theta", "main")
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-theta", renderModelSonnet, launchOpts{title: "gauge-hot"})
	if err != nil {
		return err
	}
	used := 61.0
	return r.status(ctx, claudecodetest.EnvelopedStatusLineFull("cs-theta", claudecodetest.StatusLineFullOpts{
		MusterSession:    int(s.id),
		TmuxPane:         s.pane,
		ModelID:          renderModelSonnet,
		ModelDisplayName: "Sonnet 4.5",
		UsedPct:          &used,
		TotalInputTokens: 122000,
		FiveHourPct:      61,
		SevenDayPct:      23,
	}))
}

// driveUsageModel records two weekly-scoped windows the way the running daemon does — one
// poller tick fetching and decoding a measured-shape body (claudecodetest.UsageAPIBody) from a
// local server, with the token read through the same file seam the E2E suite uses — and
// posts a status line whose five-hour bucket is at its widest number.
func driveUsageModel(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "iota", "main")
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-iota", renderModelSonnet, launchOpts{title: "model-week"})
	if err != nil {
		return err
	}
	if err = r.status(ctx, claudecodetest.EnvelopedStatusLineFull("cs-iota", claudecodetest.StatusLineFullOpts{
		MusterSession: int(s.id),
		TmuxPane:      s.pane,
		FiveHourPct:   100,
		SevenDayPct:   10,
	})); err != nil {
		return err
	}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(claudecodetest.UsageAPIBody(
			claudecodetest.UsageWindowOpt{DisplayName: "Fable", Percent: 15, ResetsAt: "2026-09-01T13:59:59.522599+00:00"},
			claudecodetest.UsageWindowOpt{DisplayName: "Opus", Percent: 20, ResetsAt: "2026-09-01T13:59:59.522599+00:00"},
		)))
	}))
	defer api.Close()
	tokenFile := filepath.Join(r.root, "credentials.json")
	if err = os.WriteFile(tokenFile, []byte(claudecodetest.OAuthCredentialsBody("renderfix-fake-oauth-token")), 0o600); err != nil {
		return err
	}
	r.freshSecond()
	defer r.stepDone()
	poller := newUsagePoller(api.Client(), api.URL, claudecode.FileTokenReader(tokenFile), time.Minute, r.srv.usage.modelScoped, r.srv.log)
	poller.tick(ctx)
	if r.srv.usage.modelScoped.Current().Windows == nil {
		return errUsageModelNotRecorded
	}
	return nil
}
