package session

import (
	"strconv"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

const (
	verOld = "2.1.317"
	verNew = "2.1.318"
)

// dueRecorder is the OnRestartDue sink: the ids the manager offered for a queued restart.
type dueRecorder struct {
	mu  sync.Mutex
	ids []int64
}

func (d *dueRecorder) record(id int64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.ids = append(d.ids, id)
}

func (d *dueRecorder) all() []int64 {
	d.mu.Lock()
	defer d.mu.Unlock()
	return append([]int64(nil), d.ids...)
}

func (d *dueRecorder) count(id int64) int {
	n := 0
	for _, got := range d.all() {
		if got == id {
			n++
		}
	}
	return n
}

func (d *dueRecorder) reset() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.ids = nil
}

func withOnRestartDue(f func(int64)) testManagerOpt {
	return func(c *Config) { c.OnRestartDue = f }
}

// restartRig is the effort rig with a manager that reports restart-due ids, so every input the
// restart plan crosses can be applied to any session and observed in memory, in the store and
// on the broadcast stream.
type restartRig struct {
	*effortRig
	due *dueRecorder
}

func newRestartRig(t *testing.T) *restartRig {
	t.Helper()
	r := &restartRig{effortRig: newEffortRig(t), due: &dueRecorder{}}
	r.mgr = r.manager()
	return r
}

func (r *restartRig) manager() *Manager {
	return newTestManager(r.t, r.st, r.pc, r.rec.record, withTmuxSessions(r.tmux), withOnRestartDue(r.due.record))
}

func (r *restartRig) postVersion(id int64, v string) {
	r.t.Helper()
	_, err := r.mgr.ApplyStatus(r.ctx, id, claudecode.StatusUpdate{Version: &v})
	require.NoError(r.t, err)
}

func (r *restartRig) postNoVersion(id int64) {
	r.t.Helper()
	_, err := r.mgr.ApplyStatus(r.ctx, id, effortPost(lvl("high")))
	require.NoError(r.t, err)
}

func (r *restartRig) installed(v string) {
	r.t.Helper()
	r.mgr.SetInstalledClaude(r.ctx, &v)
}

func (r *restartRig) installedUnknown() {
	r.t.Helper()
	r.mgr.SetInstalledClaude(r.ctx, nil)
}

func (r *restartRig) pend(id int64) {
	r.t.Helper()
	changed, err := r.mgr.SetRestartPending(r.ctx, id, true)
	require.NoError(r.t, err)
	require.True(r.t, changed)
}

func (r *restartRig) in(id int64, in claudecode.StateInput) {
	r.t.Helper()
	require.NoError(r.t, r.apply(id, r.get(id).ClaudeSessionID, in))
}

func (r *restartRig) upsertsFor(id int64) int {
	n := 0
	for _, s := range r.rec.all() {
		if s.ID == id {
			n++
		}
	}
	return n
}

// stored reads the row itself, so a mark a reload holds off the wire is still seen in the store.
func (r *restartRig) stored(id int64) store.SessionRow {
	r.t.Helper()
	row, err := r.st.GetSession(r.ctx, id)
	require.NoError(r.t, err)
	return row
}

func (r *restartRig) storedVersion(id int64) string {
	if v := r.stored(id).ClaudeVersion; v != nil {
		return *v
	}
	return ""
}

func (r *restartRig) freshManager() *Manager {
	fresh := r.manager()
	require.NoError(r.t, fresh.LoadAll(r.ctx))
	return fresh
}

// restartState is one of the display states a session can be in when a restart is asked for.
type restartState struct {
	name string
	free bool
	set  func(r *restartRig, id int64)
}

func restartStates() []restartState {
	turn := func(r *restartRig, id int64) { r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnActivity}) }
	return []restartState{
		{"started", false, func(*restartRig, int64) {}},
		{"planning", false, func(r *restartRig, id int64) {
			r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: lvl("plan")})
		}},
		{"working", false, turn},
		{"needs_input", false, func(r *restartRig, id int64) {
			turn(r, id)
			r.in(id, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission})
		}},
		{"idle with no background tasks", true, func(r *restartRig, id int64) {
			turn(r, id)
			r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(0)})
		}},
		{"idle with background tasks", false, func(r *restartRig, id int64) {
			turn(r, id)
			r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(2)})
		}},
		{"failed", true, func(r *restartRig, id int64) {
			turn(r, id)
			r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnFailed})
		}},
	}
}

// behindSession launches a bound session, puts it in st and makes it behind: running verOld
// under an installed verNew.
func (r *restartRig) behindSession(st restartState) int64 {
	r.t.Helper()
	id := r.launch("", "")
	st.set(r, id)
	r.installed(verNew)
	r.postVersion(id, verOld)
	require.True(r.t, r.get(id).ClaudeBehind, "fixture: behind")
	return id
}

// TestApplyStatus_ClaudeVersionAdoption: a post carrying a parseable version sets the running
// version and broadcasts once; a post without one, repeating the held one or arriving after the
// session died changes nothing and broadcasts nothing; the store holds what memory holds.
func TestApplyStatus_ClaudeVersionAdoption(t *testing.T) {
	steps := []struct {
		name        string
		run         func(r *restartRig, id int64)
		wantVersion string
		wantUpserts int
	}{
		{"a post with no version leaves it unreported", func(r *restartRig, id int64) { r.postNoVersion(id) }, "", 1},
		{"a post carrying nothing at all", func(r *restartRig, id int64) {
			_, err := r.mgr.ApplyStatus(r.ctx, id, claudecode.StatusUpdate{})
			require.NoError(r.t, err)
		}, "", 0},
		{"first version", func(r *restartRig, id int64) { r.postVersion(id, verOld) }, verOld, 1},
		{"the same version again", func(r *restartRig, id int64) { r.postVersion(id, verOld) }, verOld, 0},
		{"a post without a version keeps the held one", func(r *restartRig, id int64) { r.postNoVersion(id) }, verOld, 0},
		{"a different version", func(r *restartRig, id int64) { r.postVersion(id, verNew) }, verNew, 1},
		{"an older straggler sets it back", func(r *restartRig, id int64) { r.postVersion(id, verOld) }, verOld, 1},
	}
	r := newRestartRig(t)
	id := r.launch("", "")
	require.Empty(t, r.get(id).ClaudeVersion, "a launched session reports no version")

	for _, s := range steps {
		before := r.upsertsFor(id)
		s.run(r, id)
		assert.Equal(t, s.wantVersion, r.get(id).ClaudeVersion, s.name)
		assert.Equal(t, before+s.wantUpserts, r.upsertsFor(id), "%s: upserts", s.name)
		assert.Equal(t, s.wantVersion, r.storedVersion(id), "%s: the store holds what memory holds", s.name)
	}
}

// TestClaudeBehind_FromRunningAndInstalled: behind is exactly alive, both versions known and
// running older, over every ordering and the absences.
func TestClaudeBehind_FromRunningAndInstalled(t *testing.T) {
	unknown := ""
	cases := []struct {
		name              string
		running           string
		installed         *string
		kill              bool
		checkInstalledNil bool
		want              bool
	}{
		{"patch older", "2.1.317", lvl("2.1.318"), false, false, true},
		{"minor older", "2.1.999", lvl("2.2.0"), false, false, true},
		{"major older", "1.9.9", lvl("2.0.0"), false, false, true},
		{"equal", "2.1.318", lvl("2.1.318"), false, false, false},
		{"patch newer", "2.1.319", lvl("2.1.318"), false, false, false},
		{"minor newer", "2.2.0", lvl("2.1.999"), false, false, false},
		{"major newer", "3.0.0", lvl("2.9.9"), false, false, false},
		{"numeric not lexical", "2.1.9", lvl("2.1.10"), false, false, true},
		{"installed unknown (the check failed)", "2.1.317", &unknown, false, true, false},
		{"installed never checked", "2.1.317", nil, false, false, false},
		{"no running version", "", lvl("2.1.318"), false, false, false},
		{"older but dead", "2.1.317", lvl("2.1.318"), true, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := newRestartRig(t)
			id := r.launch("", "")
			if tc.installed != nil {
				if tc.checkInstalledNil {
					r.installedUnknown()
				} else {
					r.installed(*tc.installed)
				}
			}
			if tc.running != "" {
				r.postVersion(id, tc.running)
			}
			if tc.kill {
				r.die(id)
			}

			assert.Equal(t, tc.want, r.get(id).ClaudeBehind)
		})
	}
}

// TestClaudeBehind_AStragglerResettingAnOlderVersionIsBehindUntilTheNextPost: a post from the pre-restart process sets the old version back and the next post settles it.
func TestClaudeBehind_AStragglerResettingAnOlderVersionIsBehindUntilTheNextPost(t *testing.T) {
	r := newRestartRig(t)
	id := r.launch("", "")
	r.installed(verNew)
	r.postVersion(id, verNew)
	require.False(t, r.get(id).ClaudeBehind)

	r.postVersion(id, verOld)
	assert.True(t, r.get(id).ClaudeBehind, "the straggler's old version sets it behind")

	r.postVersion(id, verNew)
	assert.False(t, r.get(id).ClaudeBehind, "the new process's post settles it")
}

// TestSetInstalledClaude_BroadcastsOnlySessionsWhoseBehindFlipped: one upsert per session
// whose behind flipped, none for the rest, the pending mark cleared in the same upsert.
func TestSetInstalledClaude_BroadcastsOnlySessionsWhoseBehindFlipped(t *testing.T) {
	r := newRestartRig(t)
	old := r.launch("", "")
	current := r.launch("", "")
	silent := r.launch("", "")
	dead := r.launch("", "")
	r.postVersion(old, verOld)
	r.postVersion(current, verNew)
	r.postVersion(dead, verOld)
	r.die(dead)

	steps := []struct {
		name      string
		set       func()
		wantFlips []int64
		behind    map[int64]bool
	}{
		{"installed first becomes verNew", func() { r.installed(verNew) }, []int64{old}, map[int64]bool{old: true, current: false, silent: false, dead: false}},
		{"installed moves on to a newer version: behind stays, the other flips", func() { r.installed("2.1.319") }, []int64{current}, map[int64]bool{old: true, current: true}},
		{"the same installed again", func() { r.installed("2.1.319") }, nil, map[int64]bool{old: true, current: true}},
		{"installed unknown", func() { r.installedUnknown() }, []int64{old, current}, map[int64]bool{old: false, current: false}},
		{"unknown again", func() { r.installedUnknown() }, nil, map[int64]bool{old: false, current: false}},
		{"back to a known version", func() { r.installed("2.1.319") }, []int64{old, current}, map[int64]bool{old: true, current: true}},
		{"rolled back to the oldest running version", func() { r.installed(verOld) }, []int64{old, current}, map[int64]bool{old: false, current: false}},
	}
	for _, s := range steps {
		before := map[int64]int{}
		for _, id := range []int64{old, current, silent, dead} {
			before[id] = r.upsertsFor(id)
		}

		s.set()

		for _, id := range []int64{old, current, silent, dead} {
			want := 0
			for _, f := range s.wantFlips {
				if f == id {
					want = 1
				}
			}
			assert.Equal(t, before[id]+want, r.upsertsFor(id), "%s: session %d upserts", s.name, id)
		}
		for id, want := range s.behind {
			assert.Equal(t, want, r.get(id).ClaudeBehind, "%s: session %d behind", s.name, id)
		}
	}
}

// TestSetInstalledClaude_ClearsThePendingMarkInTheUpsertThatTurnsBehindFalse covers edge cases
// 11, 12 and 13 from every starting state.
func TestSetInstalledClaude_ClearsThePendingMarkInTheUpsertThatTurnsBehindFalse(t *testing.T) {
	changes := []struct {
		name        string
		set         func(r *restartRig)
		stillBehind bool
	}{
		{"installed moves on", func(r *restartRig) { r.installed("2.1.319") }, true},
		{"installed repeats", func(r *restartRig) { r.installed(verNew) }, true},
		{"rolled back to the running version", func(r *restartRig) { r.installed(verOld) }, false},
		{"rolled back below it", func(r *restartRig) { r.installed("2.1.300") }, false},
		{"the check fails", func(r *restartRig) { r.installedUnknown() }, false},
	}
	for _, st := range restartStates() {
		for _, ch := range changes {
			t.Run(st.name+"/"+ch.name, func(t *testing.T) {
				r := newRestartRig(t)
				id := r.behindSession(st)
				r.pend(id)
				bystander := r.behindSession(restartStates()[2])
				r.pend(bystander)
				r.rec.mu.Lock()
				r.rec.seen = nil
				r.rec.mu.Unlock()

				ch.set(r)

				got := r.get(id)
				assert.Equal(t, ch.stillBehind, got.ClaudeBehind)
				assert.Equal(t, ch.stillBehind, got.RestartPending, "the mark stands while behind and goes with it")
				assert.Equal(t, verOld, got.ClaudeVersion, "the running version is not the installed version's to change")
				for _, s := range r.rec.all() {
					if s.ID == id {
						assert.Equal(t, s.ClaudeBehind, s.RestartPending, "no upsert shows a pending mark on a session that is not behind")
					}
				}
				if !ch.stillBehind {
					assert.Equal(t, 1, r.upsertsFor(id), "behind and pending clear in one upsert")
				}
				assert.Equal(t, ch.stillBehind, r.stored(id).RestartPending, "the store holds the mark")
			})
		}
	}
}

// TestRestartFree_IsIdleWithNoTasksOrFailed pins the free rule through ClassifyRestart over every
// display state, crossed with the conditions that make a session skipped.
func TestClassifyRestart_EveryStateAndCondition(t *testing.T) {
	for _, st := range restartStates() {
		want := RestartQueue
		if st.free {
			want = RestartNow
		}
		t.Run(st.name+"/behind", func(t *testing.T) {
			r := newRestartRig(t)
			id := r.behindSession(st)
			assert.Equal(t, want, r.mgr.ClassifyRestart(id))
		})
		t.Run(st.name+"/behind and already pending", func(t *testing.T) {
			r := newRestartRig(t)
			id := r.behindSession(st)
			r.pend(id)
			assert.Equal(t, want, r.mgr.ClassifyRestart(id), "a pending mark does not change what the session is")
		})
		t.Run(st.name+"/current", func(t *testing.T) {
			r := newRestartRig(t)
			id := r.launch("", "")
			st.set(r, id)
			r.installed(verNew)
			r.postVersion(id, verNew)
			assert.Equal(t, RestartSkip, r.mgr.ClassifyRestart(id))
		})
		t.Run(st.name+"/newer than installed", func(t *testing.T) {
			r := newRestartRig(t)
			id := r.launch("", "")
			st.set(r, id)
			r.installed(verNew)
			r.postVersion(id, "2.1.400")
			assert.Equal(t, RestartSkip, r.mgr.ClassifyRestart(id))
		})
		t.Run(st.name+"/no version reported", func(t *testing.T) {
			r := newRestartRig(t)
			id := r.launch("", "")
			st.set(r, id)
			r.installed(verNew)
			assert.Equal(t, RestartSkip, r.mgr.ClassifyRestart(id))
		})
		t.Run(st.name+"/dead", func(t *testing.T) {
			r := newRestartRig(t)
			id := r.behindSession(st)
			r.die(id)
			assert.Equal(t, RestartSkip, r.mgr.ClassifyRestart(id))
		})
	}
	t.Run("unknown id", func(t *testing.T) {
		assert.Equal(t, RestartSkip, newRestartRig(t).mgr.ClassifyRestart(424242))
	})
	t.Run("behind but never bound a claude session", func(t *testing.T) {
		r := newRestartRig(t)
		sess, err := r.mgr.CreateSession(r.ctx, createParams(r.dir))
		require.NoError(t, err)
		_, err = r.mgr.RecordLaunch(r.ctx, sess.ID, "muster-"+strconv.FormatInt(sess.ID, 10)+":@1", "%1")
		require.NoError(t, err)
		r.installed(verNew)
		r.postVersion(sess.ID, verOld)
		require.True(t, r.get(sess.ID).ClaudeBehind)
		assert.Equal(t, RestartSkip, r.mgr.ClassifyRestart(sess.ID))
	})
}

// TestSetRestartPending_MarksAndUnmarksWithOneUpsertPerChange.
func TestSetRestartPending_MarksAndUnmarksWithOneUpsertPerChange(t *testing.T) {
	r := newRestartRig(t)
	id := r.behindSession(restartStates()[2])
	bystander := r.behindSession(restartStates()[2])

	steps := []struct {
		name        string
		pending     bool
		wantChanged bool
		wantUpserts int
	}{
		{"unmark when not marked", false, false, 0},
		{"mark", true, true, 1},
		{"mark again", true, false, 0},
		{"unmark", false, true, 1},
	}
	for _, s := range steps {
		before := r.upsertsFor(id)
		changed, err := r.mgr.SetRestartPending(r.ctx, id, s.pending)
		require.NoError(t, err, s.name)
		assert.Equal(t, s.wantChanged, changed, s.name)
		assert.Equal(t, before+s.wantUpserts, r.upsertsFor(id), "%s: upserts", s.name)
		assert.Equal(t, s.pending, r.get(id).RestartPending, s.name)
		assert.Equal(t, s.pending, r.stored(id).RestartPending, "%s: the store holds the mark", s.name)
		assert.False(t, r.get(bystander).RestartPending, "%s: another session is untouched", s.name)
	}
}

func TestSetRestartPending_RefusesWhatCannotBePending(t *testing.T) {
	t.Run("unknown id", func(t *testing.T) {
		_, err := newRestartRig(t).mgr.SetRestartPending(t.Context(), 99, true)
		assert.ErrorIs(t, err, ErrUnknownSession)
	})
	t.Run("not behind", func(t *testing.T) {
		r := newRestartRig(t)
		id := r.launch("", "")
		r.installed(verNew)
		r.postVersion(id, verNew)
		_, err := r.mgr.SetRestartPending(r.ctx, id, true)
		require.ErrorIs(t, err, ErrNotBehind)
		assert.False(t, r.get(id).RestartPending)
	})
	t.Run("no version reported", func(t *testing.T) {
		r := newRestartRig(t)
		id := r.launch("", "")
		r.installed(verNew)
		_, err := r.mgr.SetRestartPending(r.ctx, id, true)
		require.ErrorIs(t, err, ErrNotBehind)
	})
	t.Run("dead", func(t *testing.T) {
		r := newRestartRig(t)
		id := r.behindSession(restartStates()[2])
		r.die(id)
		_, err := r.mgr.SetRestartPending(r.ctx, id, true)
		require.ErrorIs(t, err, ErrNotBehind)
		assert.False(t, r.get(id).RestartPending)
	})
}

// TestRestartDue_FiresForAPendingSessionOnlyWhenItIsFree, at the manager: the callback is
// offered the id on exactly the upserts that show a pending, alive, free session, through
// every path into free and not through the busy ones.
func TestRestartDue_FiresForAPendingSessionOnlyWhenItIsFree(t *testing.T) {
	stop := func(tasks int) claudecode.StateInput {
		return claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(tasks)}
	}
	turn := claudecode.StateInput{Kind: claudecode.KindTurnActivity}
	cases := []struct {
		name  string
		start restartState
		input claudecode.StateInput
		due   bool
	}{
		{"working then Stop with no tasks", restartStates()[2], stop(0), true},
		{"working then Stop with tasks still running", restartStates()[2], stop(2), false},
		{"idle with tasks then a Stop dropping the count to 0", restartStates()[5], stop(0), true},
		{"idle with tasks then a Stop leaving some", restartStates()[5], stop(1), false},
		{"working then StopFailure", restartStates()[2], claudecode.StateInput{Kind: claudecode.KindTurnFailed}, true},
		{"planning then StopFailure", restartStates()[1], claudecode.StateInput{Kind: claudecode.KindTurnFailed}, true},
		{"working then a permission prompt", restartStates()[2], claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, false},
		{"needs_input then more activity", restartStates()[3], turn, false},
		{"needs_input then Stop with no tasks", restartStates()[3], stop(0), true},
		{"idle free then a new turn", restartStates()[4], turn, false},
		{"failed then a new turn", restartStates()[6], turn, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := newRestartRig(t)
			id := r.behindSession(tc.start)
			r.pend(id)
			r.due.reset()

			r.in(id, tc.input)

			if tc.due {
				assert.Positive(t, r.due.count(id), "the pending session became free")
			} else {
				assert.Zero(t, r.due.count(id), "the session is not free")
			}
		})
	}

	t.Run("a free session that is not pending is never offered", func(t *testing.T) {
		r := newRestartRig(t)
		id := r.behindSession(restartStates()[2])
		r.due.reset()
		r.in(id, stop(0))
		r.postVersion(id, verNew)
		assert.Empty(t, r.due.all())
	})
	t.Run("a pending session already free is offered on the mark itself", func(t *testing.T) {
		r := newRestartRig(t)
		id := r.behindSession(restartStates()[4])
		r.due.reset()
		r.pend(id)
		assert.Equal(t, 1, r.due.count(id))
	})
	t.Run("another session becoming free offers only itself", func(t *testing.T) {
		r := newRestartRig(t)
		a := r.behindSession(restartStates()[2])
		b := r.behindSession(restartStates()[2])
		r.pend(a)
		r.pend(b)
		r.due.reset()
		r.in(a, stop(0))
		assert.Positive(t, r.due.count(a))
		assert.Zero(t, r.due.count(b))
	})
}

// TestRestartDueQueries cover RestartDue and IsRestartDue over every display state.
func TestRestartDueQueries(t *testing.T) {
	r := newRestartRig(t)
	var states []int64
	for _, st := range restartStates() {
		id := r.behindSession(st)
		r.pend(id)
		states = append(states, id)
	}
	behindFree := r.behindSession(restartStates()[4])
	dead := r.behindSession(restartStates()[4])
	r.pend(dead)
	r.die(dead)

	var wantDue []int64
	for i, st := range restartStates() {
		if st.free {
			wantDue = append(wantDue, states[i])
		}
		assert.Equal(t, st.free, r.mgr.IsRestartDue(states[i]), st.name)
	}
	assert.ElementsMatch(t, wantDue, r.mgr.RestartDue())
	assert.False(t, r.mgr.IsRestartDue(behindFree), "behind and free but not pending")
	assert.False(t, r.mgr.IsRestartDue(dead))
	assert.False(t, r.mgr.IsRestartDue(31337))
}
