package session

import (
	"context"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

// effortModel is the model every status post in this file carries, so a warning's model
// name is checkable against a known display name.
var effortModel = &claudecode.StatusModel{ID: "claude-opus-4-5", DisplayName: "Opus 4.5"}

func lvl(s string) *string { return &s }

func effortPost(level *string) claudecode.StatusUpdate {
	var l *string
	if level != nil {
		v := *level
		l = &v
	}
	m := *effortModel
	return claudecode.StatusUpdate{Model: &m, Effort: &claudecode.StatusEffort{Level: l}}
}

// effortSnap is everything the effort plan owns on a session, flattened to comparable
// values: effort (known / level), the warning, and the in-memory pending check.
type effortSnap struct {
	Known      bool
	Level      string
	LevelNil   bool
	HasWarning bool
	WReq       string
	WActual    string
	WActualNil bool
	WModel     string
	WModelNil  bool
	Pending    string
}

func snapEffort(s *Session) effortSnap {
	out := effortSnap{Pending: s.effortRequested}
	if s.Effort != nil {
		out.Known = true
		out.LevelNil = s.Effort.Level == nil
		if s.Effort.Level != nil {
			out.Level = *s.Effort.Level
		}
	}
	if w := s.EffortWarning; w != nil {
		out.HasWarning = true
		out.WReq = w.Requested
		out.WActualNil = w.Actual == nil
		if w.Actual != nil {
			out.WActual = *w.Actual
		}
		out.WModelNil = w.Model == nil
		if w.Model != nil {
			out.WModel = *w.Model
		}
	}
	return out
}

// effortRig is one manager over one store, with a fake pane checker and resolver, so every
// input the effort plan crosses (status post, dismiss, both resumes, /clear, liveness
// death, restart) can be applied to any session and observed in memory and in the store.
type effortRig struct {
	t    *testing.T
	st   *store.Store
	mgr  *Manager
	pc   *fakePaneChecker
	rec  *upsertsRecorder
	tmux *fakeResolvingTmuxSessions
	ctx  context.Context
	dir  string
	repo int64
}

func newEffortRig(t *testing.T) *effortRig {
	t.Helper()
	st := openTestStore(t)
	r := &effortRig{
		t: t, st: st, pc: newFakePaneChecker(), rec: &upsertsRecorder{}, ctx: context.Background(), dir: t.TempDir(),
		tmux: &fakeResolvingTmuxSessions{fakeTmuxSessions: newFakeTmuxSessions(), target: "muster-resumed:@1", pane: "%9"},
	}
	r.repo = seedRepo(t, st, r.dir)
	r.mgr = r.newManager()
	return r
}

func (r *effortRig) newManager() *Manager {
	return newTestManager(r.t, r.st, r.pc, r.rec.record, withTmuxSessions(r.tmux))
}

// launch creates a launched, bound, alive session. requested is the launch's --effort
// ("" = default launch); seed is a Resume-tab seed ("" = none).
func (r *effortRig) launch(requested, seed string) int64 {
	r.t.Helper()
	p := createParams(r.dir)
	p.RepoID = r.repo
	p.EffortRequested = requested
	p.EffortSeed = seed
	sess, err := r.mgr.CreateSession(r.ctx, p)
	require.NoError(r.t, err)
	target := "muster-" + strconv.FormatInt(sess.ID, 10) + ":@1"
	_, err = r.mgr.RecordLaunch(r.ctx, sess.ID, target, "%"+strconv.FormatInt(sess.ID, 10))
	require.NoError(r.t, err)
	r.pc.setExists(target, true)
	_, err = r.mgr.Apply(r.ctx, sess.ID, "claude-"+strconv.FormatInt(sess.ID, 10), nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(r.t, err)
	return sess.ID
}

func (r *effortRig) post(id int64, level *string) {
	r.t.Helper()
	_, err := r.mgr.ApplyStatus(r.ctx, id, effortPost(level))
	require.NoError(r.t, err)
}

func (r *effortRig) dismiss(id int64) {
	r.t.Helper()
	require.NoError(r.t, r.mgr.ClearEffortWarning(r.ctx, id))
}

func (r *effortRig) get(id int64) *Session {
	r.t.Helper()
	s, ok := r.mgr.Get(id)
	require.True(r.t, ok)
	return s
}

// reloaded returns the session as a freshly started daemon would load it from the store.
func (r *effortRig) reloaded(id int64) *Session {
	r.t.Helper()
	fresh := r.newManager()
	require.NoError(r.t, fresh.LoadAll(r.ctx))
	s, ok := fresh.Get(id)
	require.True(r.t, ok)
	return s
}

// TestApplyStatus_EffortAdoption: a post carrying a level sets the effort
// to it verbatim, one carrying no level sets {"level": null}, a changed value is exactly
// one upsert and an unchanged one none, and the value survives a store round trip.
func TestApplyStatus_EffortAdoption(t *testing.T) {
	steps := []struct {
		name        string
		level       *string
		wantKnown   bool
		wantLevel   *string
		wantUpserts int
	}{
		{name: "first report with a level", level: lvl("high"), wantKnown: true, wantLevel: lvl("high"), wantUpserts: 1},
		{name: "the same level again", level: lvl("high"), wantKnown: true, wantLevel: lvl("high"), wantUpserts: 0},
		{name: "a different level", level: lvl("low"), wantKnown: true, wantLevel: lvl("low"), wantUpserts: 1},
		{name: "a level outside the five is kept verbatim", level: lvl("ultracode"), wantKnown: true, wantLevel: lvl("ultracode"), wantUpserts: 1},
		{name: "no effort key: reported with no level", level: nil, wantKnown: true, wantLevel: nil, wantUpserts: 1},
		{name: "no effort key again", level: nil, wantKnown: true, wantLevel: nil, wantUpserts: 0},
		{name: "a level after none", level: lvl("medium"), wantKnown: true, wantLevel: lvl("medium"), wantUpserts: 1},
	}

	r := newEffortRig(t)
	id := r.launch("", "")
	require.Nil(t, r.get(id).Effort, "a launched session starts with effort null")

	for _, s := range steps {
		before := len(r.rec.all())
		r.post(id, s.level)

		got := r.get(id)
		require.Equal(t, s.wantKnown, got.Effort != nil, s.name)
		assert.Equal(t, s.wantLevel, got.Effort.Level, s.name)
		assert.Len(t, r.rec.all(), before+s.wantUpserts, "%s: upserts", s.name)
		assert.Equal(t, snapEffort(got), snapEffort(r.reloaded(id)), "%s: the store holds what memory holds", s.name)
	}
}

// TestApplyStatus_EffortPostWithoutAnEffortReadingLeavesEffortAlone: a StatusUpdate whose
// Effort is nil (nothing interpreted it) is not a "no effort setting" report.
func TestApplyStatus_EffortPostWithoutAnEffortReadingLeavesEffortAlone(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("max", "")

	_, err := r.mgr.ApplyStatus(r.ctx, id, claudecode.StatusUpdate{Model: effortModel})
	require.NoError(t, err)

	got := r.get(id)
	assert.Nil(t, got.Effort)
	assert.Nil(t, got.EffortWarning)
	assert.Equal(t, "max", got.effortRequested, "a post that carries no reading does not consume the pending check")
}

// TestApplyStatus_FirstReportChecksTheLaunchedEffort covers edge cases 6-9 and 20:
// the first report after a launch with a level sets the warning iff the level differs
// (null differs), naming the model after that post; a default launch never warns, and no
// later report does.
func TestApplyStatus_FirstReportChecksTheLaunchedEffort(t *testing.T) {
	tests := []struct {
		name      string
		requested string
		reports   []*string
		wantWarn  *EffortWarning
		wantLevel *string
	}{
		{name: "clamped: asked max, started high", requested: "max", reports: []*string{lvl("high")},
			wantWarn: &EffortWarning{Requested: "max", Actual: lvl("high"), Model: lvl("Opus 4.5")}, wantLevel: lvl("high")},
		{name: "matching launch", requested: "high", reports: []*string{lvl("high")}, wantLevel: lvl("high")},
		{name: "model without effort: asked high, no key", requested: "high", reports: []*string{nil},
			wantWarn: &EffortWarning{Requested: "high", Actual: nil, Model: lvl("Opus 4.5")}, wantLevel: nil},
		{name: "a level outside the five is compared verbatim", requested: "xhigh", reports: []*string{lvl("ultracode")},
			wantWarn: &EffortWarning{Requested: "xhigh", Actual: lvl("ultracode"), Model: lvl("Opus 4.5")}, wantLevel: lvl("ultracode")},
		{name: "default launch, any first report: no warning", requested: "", reports: []*string{lvl("high")}, wantLevel: lvl("high")},
		{name: "default launch, no key: no warning", requested: "", reports: []*string{nil}, wantLevel: nil},
		{name: "match first, then a different level: the later report is never checked", requested: "high",
			reports: []*string{lvl("high"), lvl("low")}, wantLevel: lvl("low")},
		{name: "mismatch first, then the requested level: the warning stays", requested: "max",
			reports:  []*string{lvl("high"), lvl("max")},
			wantWarn: &EffortWarning{Requested: "max", Actual: lvl("high"), Model: lvl("Opus 4.5")}, wantLevel: lvl("max")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newEffortRig(t)
			id := r.launch(tt.requested, "")
			for _, rep := range tt.reports {
				r.post(id, rep)
			}

			got := r.get(id)
			require.NotNil(t, got.Effort)
			assert.Equal(t, tt.wantLevel, got.Effort.Level)
			assert.Equal(t, tt.wantWarn, got.EffortWarning)
			assert.Empty(t, got.effortRequested, "the check is consumed by the first report")
			assert.Equal(t, snapEffort(got), snapEffort(r.reloaded(id)))
		})
	}
}

// TestApplyStatus_FirstReportWarningModelFollowsTheSessionModel: the warning names the
// model as it stands after the first post, and is null only when the session has none.
func TestApplyStatus_FirstReportWarningModelFollowsTheSessionModel(t *testing.T) {
	t.Run("a post without a model names the launch model", func(t *testing.T) {
		r := newEffortRig(t)
		id := r.launch("max", "")

		_, err := r.mgr.ApplyStatus(r.ctx, id, claudecode.StatusUpdate{Effort: &claudecode.StatusEffort{Level: lvl("high")}})
		require.NoError(t, err)

		got := r.get(id)
		require.NotNil(t, got.EffortWarning)
		require.NotNil(t, got.EffortWarning.Model)
		assert.Equal(t, got.Model.DisplayName, *got.EffortWarning.Model)
	})

	t.Run("a session with no model has a null warning model", func(t *testing.T) {
		r := newEffortRig(t)
		p := createParams(r.dir)
		p.RepoID = r.repo
		p.Model = ""
		p.EffortRequested = "max"
		sess, err := r.mgr.CreateSession(r.ctx, p)
		require.NoError(t, err)
		require.Nil(t, sess.Model)

		_, err = r.mgr.ApplyStatus(r.ctx, sess.ID, claudecode.StatusUpdate{Effort: &claudecode.StatusEffort{Level: lvl("high")}})
		require.NoError(t, err)

		got := r.get(sess.ID)
		require.NotNil(t, got.EffortWarning)
		assert.Nil(t, got.EffortWarning.Model)
	})

	t.Run("the model arriving on the first post is the one named", func(t *testing.T) {
		r := newEffortRig(t)
		id := r.launch("max", "")

		r.post(id, lvl("high"))

		got := r.get(id)
		require.NotNil(t, got.EffortWarning)
		assert.Equal(t, lvl("Opus 4.5"), got.EffortWarning.Model)
	})
}

// TestApplyStatus_ResumeTabSeedShowsAtOnceWithNoCheck covers the session half: a
// seeded session has a known effort from creation, a later report is not checked, and an
// unseeded resume starts null.
func TestApplyStatus_ResumeTabSeedShowsAtOnceWithNoCheck(t *testing.T) {
	r := newEffortRig(t)
	seeded := r.launch("", "medium")
	unseeded := r.launch("", "")

	got := r.get(seeded)
	require.NotNil(t, got.Effort)
	assert.Equal(t, lvl("medium"), got.Effort.Level)
	assert.Nil(t, got.EffortWarning)
	assert.Empty(t, got.effortRequested)
	assert.Nil(t, r.get(unseeded).Effort)

	r.post(seeded, lvl("low"))

	got = r.get(seeded)
	assert.Equal(t, lvl("low"), got.Effort.Level)
	assert.Nil(t, got.EffortWarning, "a seed starts no check")
}

// TestClearEffortWarning checks at the manager: it clears and broadcasts once,
// a null warning is a silent success, an unknown id is ErrUnknownSession, and only that
// session is touched.
func TestClearEffortWarning(t *testing.T) {
	r := newEffortRig(t)
	warned := r.launch("max", "")
	r.post(warned, lvl("high"))
	other := r.launch("high", "")
	r.post(other, lvl("low"))
	require.NotNil(t, r.get(warned).EffortWarning)
	require.NotNil(t, r.get(other).EffortWarning)
	otherBefore := snapEffort(r.get(other))

	before := len(r.rec.all())
	r.dismiss(warned)

	seen := r.rec.all()
	require.Len(t, seen, before+1, "dismiss broadcasts one upsert")
	assert.Equal(t, warned, seen[before].ID)
	assert.Nil(t, seen[before].EffortWarning)
	got := r.get(warned)
	assert.Nil(t, got.EffortWarning)
	require.NotNil(t, got.Effort, "dismiss leaves effort alone")
	assert.Equal(t, lvl("high"), got.Effort.Level)
	assert.Equal(t, otherBefore, snapEffort(r.get(other)), "a bystander's warning is untouched")
	assert.Equal(t, snapEffort(got), snapEffort(r.reloaded(warned)), "the clear is persisted")

	r.dismiss(warned)
	assert.Len(t, r.rec.all(), before+1, "a second dismiss broadcasts nothing")

	assert.ErrorIs(t, r.mgr.ClearEffortWarning(r.ctx, 999999), ErrUnknownSession)
}

// TestEffortRowRoundTrip checks on the whole-row writers' shared mapping: every
// effort shape survives sessionToRow then rowToSession, including the two null-bearing
// ones (reported with no level, warning with no actual).
func TestEffortRowRoundTrip(t *testing.T) {
	tests := []struct {
		name string
		in   *Session
	}{
		{name: "never reported", in: &Session{}},
		{name: "pending check", in: &Session{effortRequested: "max"}},
		{name: "level", in: &Session{Effort: &Effort{Level: lvl("high")}}},
		{name: "reported with no level", in: &Session{Effort: &Effort{}}},
		{name: "warning with an actual", in: &Session{Effort: &Effort{Level: lvl("high")}, EffortWarning: &EffortWarning{Requested: "max", Actual: lvl("high"), Model: lvl("Opus 4.5")}}},
		{name: "warning with no actual and no model", in: &Session{Effort: &Effort{}, EffortWarning: &EffortWarning{Requested: "high"}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rowToSession(sessionToRow(tt.in))

			assert.Equal(t, snapEffort(tt.in), snapEffort(got))
			assert.Equal(t, tt.in.Effort == nil, got.Effort == nil, "null stays null, {level:null} stays an object")
		})
	}
}
