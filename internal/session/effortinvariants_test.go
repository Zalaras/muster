package session

import (
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// effortStartState builds the session under test in one of the states the plan crosses.
type effortStartState struct {
	name  string
	build func(r *effortRig) int64
}

func effortStartStates() []effortStartState {
	return []effortStartState{
		{"launched default, no report", func(r *effortRig) int64 { return r.launch("", "") }},
		{"launched max, check pending", func(r *effortRig) int64 { return r.launch("max", "") }},
		{"default launch, reported high", func(r *effortRig) int64 {
			id := r.launch("", "")
			r.post(id, lvl("high"))
			return id
		}},
		{"default launch, reported no effort setting", func(r *effortRig) int64 {
			id := r.launch("", "")
			r.post(id, nil)
			return id
		}},
		{"matching launch, reported", func(r *effortRig) int64 {
			id := r.launch("high", "")
			r.post(id, lvl("high"))
			return id
		}},
		{"warning set (clamped)", func(r *effortRig) int64 {
			id := r.launch("max", "")
			r.post(id, lvl("high"))
			return id
		}},
		{"warning set (no effort setting)", func(r *effortRig) int64 {
			id := r.launch("high", "")
			r.post(id, nil)
			return id
		}},
		{"warning dismissed", func(r *effortRig) int64 {
			id := r.launch("max", "")
			r.post(id, lvl("high"))
			r.dismiss(id)
			return id
		}},
		{"Resume-tab seeded", func(r *effortRig) int64 { return r.launch("", "medium") }},
		{"after /clear with a check pending", func(r *effortRig) int64 {
			id := r.launch("max", "")
			r.rebind(id)
			return id
		}},
		{"after a Resume-button resume of a warned session", func(r *effortRig) int64 {
			id := r.launch("max", "")
			r.post(id, lvl("high"))
			r.resumeButton(id)
			return id
		}},
		{"after a Resume-button resume with a check pending", func(r *effortRig) int64 {
			id := r.launch("max", "")
			r.resumeButton(id)
			return id
		}},
	}
}

func (r *effortRig) rebind(id int64) {
	r.t.Helper()
	_, err := r.mgr.Apply(r.ctx, id, "claude-after-clear-"+strconv.FormatInt(id, 10), nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
	require.NoError(r.t, err)
}

func (r *effortRig) resumeButton(id int64) {
	r.t.Helper()
	_, err := r.mgr.RecordResume(r.ctx, id, "muster-resumed:@1", "%9")
	require.NoError(r.t, err)
}

// effortInput is one thing that can happen to a session. post (the level a status post carries) / isDismiss / cancelsCheck
// say which clause of the plan's invariants it is allowed to move; run applies it to id.
type effortInput struct {
	name         string
	post         func(before *Session) *string
	isDismiss    bool
	cancelsCheck bool
	run          func(r *effortRig, id int64)
}

func postInput(name string, level func(before *Session) *string) effortInput {
	return effortInput{name: name, post: level, run: func(r *effortRig, id int64) { r.post(id, level(r.get(id))) }}
}

func effortInputs() []effortInput {
	return []effortInput{
		postInput("status post with a level", func(*Session) *string { return lvl("high") }),
		postInput("status post with a different level", func(*Session) *string { return lvl("low") }),
		postInput("status post repeating the current reading", func(cur *Session) *string {
			if cur.Effort != nil {
				return cur.Effort.Level
			}
			return lvl("high")
		}),
		postInput("status post without the effort key", func(*Session) *string { return nil }),
		{name: "dismiss", isDismiss: true, run: func(r *effortRig, id int64) { r.dismiss(id) }},
		{name: "Resume button", cancelsCheck: true, run: func(r *effortRig, id int64) { r.resumeButton(id) }},
		{name: "Resume button repair of an owned pane", cancelsCheck: true, run: func(r *effortRig, id int64) {
			_, err := r.mgr.RepairOwnedSession(r.ctx, id)
			require.NoError(r.t, err)
		}},
		{name: "/clear rebind", run: func(r *effortRig, id int64) { r.rebind(id) }},
		{name: "Stop", run: func(r *effortRig, id int64) {
			_, err := r.mgr.Apply(r.ctx, id, r.get(id).ClaudeSessionID, nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
			require.NoError(r.t, err)
		}},
		{name: "liveness death", run: func(r *effortRig, id int64) {
			r.pc.setExists(r.get(id).TmuxTarget, false)
			r.mgr.Nudge(r.ctx, id)
			require.False(r.t, r.get(id).Alive)
		}},
		{name: "reconcile revives the owned pane", run: func(r *effortRig, id int64) {
			r.mgr.reviveOwnedSession(r.ctx, id, "muster-"+strconv.FormatInt(id, 10))
		}},
		{name: "daemon restart", run: func(r *effortRig, _ int64) {
			fresh := r.newManager()
			require.NoError(r.t, fresh.LoadAll(r.ctx))
			r.mgr = fresh
		}},
	}
}

// expectedEffort is the plan's rule table written independently of the implementation: it
// says what the effort snapshot of the session an input targets must be afterwards.
func expectedEffort(before effortSnap, in effortInput, postLevel *string) effortSnap {
	after := before
	switch {
	case in.post != nil:
		after.Known = true
		after.LevelNil = postLevel == nil
		after.Level = ""
		if postLevel != nil {
			after.Level = *postLevel
		}
		if before.Pending != "" {
			after.Pending = ""
			if postLevel == nil || *postLevel != before.Pending {
				after.HasWarning = true
				after.WReq = before.Pending
				after.WActualNil = postLevel == nil
				after.WActual = after.Level
				after.WModel = effortModel.DisplayName
			}
		}
	case in.isDismiss:
		after.HasWarning, after.WReq, after.WActual, after.WActualNil, after.WModel, after.WModelNil = false, "", "", false, "", false
	case in.cancelsCheck:
		after.Pending = ""
	}
	return after
}

// checkEffortInvariants asserts the effort invariants as predicates over a before/after pair, so a
// rule table that drifts from the spec fails on the invariant, not just on the table.
func checkEffortInvariants(t *testing.T, before, after *Session, in effortInput) {
	t.Helper()
	b, a := snapEffort(before), snapEffort(after)

	if after.EffortWarning != nil {
		w := after.EffortWarning
		assert.True(t, w.Actual == nil || *w.Actual != w.Requested, "INV-E1: a warning's requested and actual differ")
	}
	if !b.HasWarning && a.HasWarning {
		assert.True(t, in.post != nil && b.Pending != "", "INV-E2: a warning appears only on the first report after a launch that carried effort")
	}
	if b.HasWarning && !a.HasWarning {
		assert.True(t, in.isDismiss, "INV-E3: a warning goes only by dismiss")
	}
	if !a.Known {
		assert.False(t, b.Known, "INV-E4: effort becomes null only at a launch")
	}
	if in.post != nil {
		assert.Equal(t, before.State, after.State, "INV-E5")
		assert.True(t, before.StateSince.Equal(after.StateSince), "INV-E5")
		assert.Equal(t, before.Attention, after.Attention, "INV-E5")
		assert.Equal(t, before.Failure, after.Failure, "INV-E5")
		assert.Equal(t, before.Alive, after.Alive, "INV-E5")
		assert.Equal(t, before.PermissionMode, after.PermissionMode, "INV-E5")
		assert.Equal(t, before.Compactions, after.Compactions, "INV-E5")
	}
}

// bystanders are two sessions that share the manager and the store with the one under
// test: one with a launch check pending, one already warned.
type effortBystanders struct{ pending, warned int64 }

func (r *effortRig) addBystanders() effortBystanders {
	r.t.Helper()
	pending := r.launch("max", "")
	warned := r.launch("max", "")
	r.post(warned, lvl("high"))
	return effortBystanders{pending: pending, warned: warned}
}

// TestEffortInvariants_EveryInputFromEveryState: the effort invariants and the exact
// rule table, crossing every input with every starting state (kb:lesson/invariant-missed-by-per-transition-tests),
// with two bystander sessions present whose effort, warning and pending check must come
// out of every input untouched, and each result checked against what a restarted daemon
// loads from the store.
func TestEffortInvariants_EveryInputFromEveryState(t *testing.T) {
	for _, start := range effortStartStates() {
		for _, in := range effortInputs() {
			t.Run(start.name+"/"+in.name, func(t *testing.T) {
				t.Parallel()
				r := newEffortRig(t)
				id := start.build(r)
				by := r.addBystanders()
				before := r.get(id)
				bystanderBefore := map[int64]effortSnap{by.pending: snapEffort(r.get(by.pending)), by.warned: snapEffort(r.get(by.warned))}

				in.run(r, id)

				after := r.get(id)
				var postLevel *string
				if in.post != nil {
					postLevel = in.post(before)
				}
				assert.Equal(t, expectedEffort(snapEffort(before), in, postLevel), snapEffort(after))
				checkEffortInvariants(t, before, after, in)

				for bid, want := range bystanderBefore {
					assert.Equal(t, want, snapEffort(r.get(bid)), "bystander %d is untouched", bid)
				}
				assert.Equal(t, snapEffort(after), snapEffort(r.reloaded(id)), "the store holds what memory holds")
			})
		}
	}
}

// TestEffortInvariants_AnotherSessionsInputNeverMovesIt covers the "a bystander's
// report or dismissal never sets or clears another's warning": every starting state is
// the bystander here, and the inputs land on a different session.
func TestEffortInvariants_AnotherSessionsInputNeverMovesIt(t *testing.T) {
	others := []effortInput{}
	for _, in := range effortInputs() {
		switch in.name {
		case "status post with a level", "status post without the effort key", "dismiss", "Resume button", "/clear rebind":
			others = append(others, in)
		}
	}
	require.Len(t, others, 5)

	for _, start := range effortStartStates() {
		for _, in := range others {
			t.Run(start.name+"/"+in.name+" on another session", func(t *testing.T) {
				t.Parallel()
				r := newEffortRig(t)
				id := start.build(r)
				by := r.addBystanders()
				want := snapEffort(r.get(id))

				in.run(r, by.pending)
				in.run(r, by.warned)

				assert.Equal(t, want, snapEffort(r.get(id)))
				assert.Equal(t, want, snapEffort(r.reloaded(id)))
			})
		}
	}
}

// TestEffortCheck_SurvivesRestartAndClearThenFiresOnTheNextPost checks and edge
// cases 13 and 15 end to end: a pending check kept across a /clear rebind and a restart
// is still the one the next post is checked against; a Resume-button resume cancels it
// (edge case 11), and a warning set before either is never re-raised or re-checked.
func TestEffortCheck_SurvivesRestartAndClearThenFiresOnTheNextPost(t *testing.T) {
	t.Run("pending check across /clear and a restart", func(t *testing.T) {
		r := newEffortRig(t)
		id := r.launch("max", "")
		r.rebind(id)
		fresh := r.newManager()
		require.NoError(t, fresh.LoadAll(r.ctx))
		r.mgr = fresh

		r.post(id, lvl("high"))

		got := r.get(id)
		require.NotNil(t, got.EffortWarning)
		assert.Equal(t, "max", got.EffortWarning.Requested)
		assert.Equal(t, lvl("high"), got.EffortWarning.Actual)
	})

	t.Run("a Resume-button resume cancels the pending check", func(t *testing.T) {
		r := newEffortRig(t)
		id := r.launch("max", "")
		r.resumeButton(id)

		r.post(id, lvl("high"))

		got := r.get(id)
		assert.Nil(t, got.EffortWarning, "edge case 11: a check that never reported is cancelled by a resume")
		assert.Equal(t, lvl("high"), got.Effort.Level)
	})

	t.Run("a set warning survives a resume, a restart and later posts, and is not re-raised once dismissed", func(t *testing.T) {
		r := newEffortRig(t)
		id := r.launch("max", "")
		r.post(id, lvl("high"))
		r.resumeButton(id)
		fresh := r.newManager()
		require.NoError(t, fresh.LoadAll(r.ctx))
		r.mgr = fresh
		r.post(id, lvl("max"))
		require.NotNil(t, r.get(id).EffortWarning, "edge case 10 and 16: the warning stays")

		r.dismiss(id)
		r.post(id, lvl("low"))

		assert.Nil(t, r.get(id).EffortWarning)
		assert.Equal(t, lvl("low"), r.get(id).Effort.Level)
	})
}
