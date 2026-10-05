package session

import (
	"errors"
	"fmt"
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// The invariants of the groups plan, each asserted from every reachable source rather than
// from the convenient one (kb:lesson/invariant-missed-by-per-transition-tests):
//   I1  per-section pinned-before-unpinned, railPos unique        -> D4
//   I2  every groupId is null or names an existing group          -> D5
//   I3  an operation never changes a session outside its request  -> D6
// All run on the grouped fixture, so two groups and Ungrouped coexist with pinned and
// unpinned members in each.

// groupSource is one way the rail's (group, pinned, railPos) can change.
type groupSource struct {
	name string
	run  func(t *testing.T, r *groupsRig)
}

func i64(v int64) *int64 { return &v }

func mixedIDs(r *groupsRig) []int64 { return r.ids("21", "11", "3", "22") }

// groupSources lists every manager-level source of an I1 change the plan names: pin on and
// off, order with and without a group, group move, create-with-sessions, delete-group in
// each disposition, ungroup, a launch into a group (existing and new), and a remove that
// leaves a gap.
func groupSources() []groupSource {
	var out []groupSource
	for _, f := range fixtureSpec {
		out = append(out, groupSource{
			name: fmt.Sprintf("toggle pin of %s", f.label),
			run: func(t *testing.T, r *groupsRig) {
				require.NoError(t, r.mgr.SetPinned(r.ctx, r.id(f.label), !f.pinned))
			},
		})
	}
	for _, join := range []string{"none", "A", "B", "-"} {
		for pinned := range 3 {
			out = append(out, groupSource{
				name: fmt.Sprintf("order join=%s pinnedCount=%d", join, pinned),
				run: func(t *testing.T, r *groupsRig) {
					var ref *GroupRef
					switch join {
					case "A":
						ref = &GroupRef{ID: &r.groupA}
					case "B":
						ref = &GroupRef{ID: &r.groupB}
					case "-":
						ref = &GroupRef{}
					}
					require.NoError(t, r.mgr.SetOrder(r.ctx, r.ids("22", "23", "11"), pinned, ref))
				},
			})
		}
	}
	for _, to := range []string{"A", "B", "-"} {
		out = append(out, groupSource{
			name: "move mixed sessions to " + to,
			run: func(t *testing.T, r *groupsRig) {
				var target *int64
				switch to {
				case "A":
					target = &r.groupA
				case "B":
					target = &r.groupB
				}
				require.NoError(t, r.mgr.SetSessionsGroup(r.ctx, mixedIDs(r), target))
			},
		})
	}
	out = append(out,
		groupSource{"create group with mixed sessions", func(t *testing.T, r *groupsRig) {
			_, err := r.mgr.CreateGroup(r.ctx, "New", mixedIDs(r))
			require.NoError(t, err)
		}},
		groupSource{"delete A ungroup", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupA, DispositionUngroup, 0) }},
		groupSource{"delete B ungroup", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupB, DispositionUngroup, 0) }},
		groupSource{"delete A move to B", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupA, DispositionMove, r.groupB) }},
		groupSource{"delete B move to A", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupB, DispositionMove, r.groupA) }},
		groupSource{"delete A remove", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupA, DispositionRemove, 0) }},
		groupSource{"delete B remove", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupB, DispositionRemove, 0) }},
		groupSource{"launch into A", func(_ *testing.T, r *groupsRig) { r.launch(&r.groupA) }},
		groupSource{"launch into B", func(_ *testing.T, r *groupsRig) { r.launch(&r.groupB) }},
		groupSource{"launch into Ungrouped", func(_ *testing.T, r *groupsRig) { r.launch(nil) }},
		groupSource{"launch into a new group", func(t *testing.T, r *groupsRig) {
			g, err := r.mgr.CreateLaunchGroup(r.ctx, "Fresh")
			require.NoError(t, err)
			r.launch(&g.ID)
		}},
		groupSource{"remove a pinned member then pin the unpinned one", func(t *testing.T, r *groupsRig) {
			require.NoError(t, r.mgr.Remove(r.ctx, r.id("12")))
			require.NoError(t, r.mgr.SetPinned(r.ctx, r.id("13"), true))
		}},
		groupSource{"remove an unpinned one then reorder its section", func(t *testing.T, r *groupsRig) {
			require.NoError(t, r.mgr.Remove(r.ctx, r.id("22")))
			require.NoError(t, r.mgr.SetOrder(r.ctx, r.ids("23", "21"), 0, nil))
		}},
		groupSource{"a reload through LoadAll alone", func(_ *testing.T, _ *groupsRig) {}},
	)
	return out
}

func (r *groupsRig) deleteGroup(id int64, d GroupDisposition, to int64) {
	r.t.Helper()
	res, err := r.mgr.DeleteGroup(r.ctx, id, d, to)
	require.NoError(r.t, err)
	require.True(r.t, res.Deleted)
}

// TestRailInvariants_HoldAfterEverySourceAndAReload is D4 and D5: after each source the
// per-section invariant, unique railPos and "every groupId names a group" hold in memory and in
// the database, and again after the daemon restarts and reloads everything through LoadAll —
// with the sessions byte-for-byte what they were.
func TestRailInvariants_HoldAfterEverySourceAndAReload(t *testing.T) {
	for _, src := range groupSources() {
		t.Run(src.name, func(t *testing.T) {
			r := newFixtureRig(t)

			src.run(t, r)

			r.assertConsistent()
			liveBefore := factsByID(r.mgr.List())
			groupsBefore, ungroupedBefore := r.mgr.Groups()

			r.restart()

			r.assertConsistent()
			assert.Equal(t, liveBefore, factsByID(r.mgr.List()), "D8: a restart restores every session's group, pin and railPos")
			groupsAfter, ungroupedAfter := r.mgr.Groups()
			assert.Equal(t, groupsBefore, groupsAfter)
			assert.Equal(t, ungroupedBefore, ungroupedAfter)
		})
	}
}

func factsByID(sessions []*Session) map[int64]sessionFacts {
	out := make(map[int64]sessionFacts, len(sessions))
	for _, s := range sessions {
		out[s.ID] = factsOf(s)
	}
	return out
}

// TestBystanders_AreNeverChangedOrBroadcast is D6 / I3: for every group, batch and
// delete-group path, sessions outside the request keep their group, pin, railPos and alive
// flag and are not broadcast. "Outside the request" means every session the operation did
// not name: the touched list below names the request's own sessions plus, where a pinned
// mover joins a section, that section's unpinned members, whose railPos the contract
// itself says the per-section invariant may shift ("then the per-section invariant is
// re-enforced; every session whose groupId, pinned or railPos changed is broadcast").
func TestBystanders_AreNeverChangedOrBroadcast(t *testing.T) {
	type op struct {
		name    string
		run     func(t *testing.T, r *groupsRig)
		touched []string
	}
	ops := []op{
		{"create group with unpinned sessions", func(t *testing.T, r *groupsRig) {
			_, err := r.mgr.CreateGroup(r.ctx, "N", r.ids("2", "23"))
			require.NoError(t, err)
		}, []string{"2", "23"}},
		{"create group with no sessions", func(t *testing.T, r *groupsRig) {
			_, err := r.mgr.CreateGroup(r.ctx, "N", nil)
			require.NoError(t, err)
		}, nil},
		{"rename a group", func(t *testing.T, r *groupsRig) {
			n := "x"
			require.NoError(t, r.mgr.UpdateGroup(r.ctx, r.groupA, &n, nil))
		}, nil},
		{"collapse a group", func(t *testing.T, r *groupsRig) {
			c := true
			require.NoError(t, r.mgr.UpdateGroup(r.ctx, r.groupA, nil, &c))
		}, nil},
		{"reorder sections", func(t *testing.T, r *groupsRig) {
			require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{r.groupB, 0, r.groupA}))
		}, nil},
		{"collapse all", func(t *testing.T, r *groupsRig) { require.NoError(t, r.mgr.SetAllCollapsed(r.ctx, true)) }, nil},
		{"move an unpinned card to B", func(t *testing.T, r *groupsRig) {
			require.NoError(t, r.mgr.SetSessionsGroup(r.ctx, r.ids("3"), &r.groupB))
		}, []string{"3"}},
		{"move a pinned card to A (the invariant shifts A's unpinned member)", func(t *testing.T, r *groupsRig) {
			require.NoError(t, r.mgr.SetSessionsGroup(r.ctx, r.ids("21"), &r.groupA))
		}, []string{"21", "13"}},
		{"order with a join section", func(t *testing.T, r *groupsRig) {
			require.NoError(t, r.mgr.SetOrder(r.ctx, r.ids("22", "23", "11"), 0, &GroupRef{ID: &r.groupB}))
		}, []string{"11", "21", "22", "23"}},
		{"delete A ungroup", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupA, DispositionUngroup, 0) }, []string{"11", "12", "13"}},
		{"delete A move to B", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupA, DispositionMove, r.groupB) },
			[]string{"11", "12", "13", "21", "22", "23"}},
		{"delete B remove", func(_ *testing.T, r *groupsRig) { r.deleteGroup(r.groupB, DispositionRemove, 0) }, []string{"21", "22", "23"}},
		{"end many", func(_ *testing.T, r *groupsRig) { r.mgr.EndMany(r.ctx, r.ids("22", "2")) }, []string{"22", "2"}},
		{"remove many", func(_ *testing.T, r *groupsRig) { r.mgr.RemoveMany(r.ctx, r.ids("22", "2")) }, []string{"22", "2"}},
		{"end many with a failing kill", func(_ *testing.T, r *groupsRig) {
			r.killer.setKillErr(tmuxName(r.id("2")), assert.AnError)
			r.mgr.EndMany(r.ctx, r.ids("22", "2"))
		}, []string{"22", "2"}},
	}
	for _, tt := range ops {
		t.Run(tt.name, func(t *testing.T) {
			r := newFixtureRig(t)
			before := r.snapshotAll()

			tt.run(t, r)

			r.assertBystandersUntouched(before, tt.touched...)
			r.assertConsistent()
		})
	}
}

// TestGroupID_SurvivesClearRebindStragglerLateSessionEndAndResume is D7: nothing in the
// state machine reads or writes a session's group, so each event that rebinds, reorders or
// resumes a conversation leaves it where it was, and no upsert in between carries another
// groupId.
func TestGroupID_SurvivesClearRebindStragglerLateSessionEndAndResume(t *testing.T) {
	r := newFixtureRig(t)
	id := r.id("12") // pinned member of A
	prompt := "p1"
	mode := "default"
	steps := []struct {
		name  string
		claud string
		input claudecode.StateInput
	}{
		{"bind", "claude-1", claudecode.StateInput{Kind: claudecode.KindBind}},
		{"turn activity", "claude-1", claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}},
		{"clear rebind onto a new session id", "claude-2", claudecode.StateInput{Kind: claudecode.KindClearRebind}},
		{"straggler Stop from the previous conversation", "claude-1", claudecode.StateInput{Kind: claudecode.KindTurnClosed}},
		{"late SessionEnd(clear) of the previous conversation", "claude-1", claudecode.StateInput{Kind: claudecode.KindClearDeathHint}},
		{"turn activity on the new conversation", "claude-2", claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}},
		{"death hint", "claude-2", claudecode.StateInput{Kind: claudecode.KindDeathHint}},
	}
	for _, step := range steps {
		_, err := r.mgr.Apply(r.ctx, id, step.claud, &prompt, step.input, true)
		require.NoError(t, err, step.name)
		assert.Equal(t, r.groupA, r.groupOf("12"), "after %s", step.name)
		persisted, err := r.st.GetSession(r.ctx, id)
		require.NoError(t, err)
		require.NotNil(t, persisted.GroupID, "after %s", step.name)
		assert.Equal(t, r.groupA, *persisted.GroupID, "after %s", step.name)
	}

	_, err := r.mgr.End(r.ctx, id)
	require.NoError(t, err)
	_, err = r.mgr.RecordResume(r.ctx, id, "muster-resumed:@2", "%2")
	require.NoError(t, err)
	_, err = r.mgr.Apply(r.ctx, id, "claude-2", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, true)
	require.NoError(t, err)

	assert.Equal(t, r.groupA, r.groupOf("12"), "after resume")
	assert.True(t, r.session("12").Pinned)
	for _, e := range r.log.all() {
		if e.kind == "upsert" && e.id == id {
			require.NotNil(t, e.groupID, "an upsert carried groupId null")
			assert.Equal(t, r.groupA, *e.groupID)
		}
	}
	r.assertConsistent()
}

// --- restart (D8) ---

func TestLoadAll_RestoresGroupsLayoutAndMembership(t *testing.T) {
	r := newFixtureRig(t)
	name := "Alpha"
	yes := true
	require.NoError(t, r.mgr.UpdateGroup(r.ctx, r.groupA, &name, &yes))
	require.NoError(t, r.mgr.UpdateGroup(r.ctx, 0, nil, &yes))
	require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{0, r.groupB, r.groupA}))
	require.NoError(t, r.mgr.SetSessionsGroup(r.ctx, r.ids("3", "2"), &r.groupA))
	groupsBefore, ungroupedBefore := r.mgr.Groups()
	require.Equal(t, UngroupedLayout{Pos: 0, Collapsed: true}, ungroupedBefore)

	r.restart()

	groupsAfter, ungroupedAfter := r.mgr.Groups()
	assert.Equal(t, groupsBefore, groupsAfter, "name, pos and collapsed of every group")
	assert.Equal(t, ungroupedBefore, ungroupedAfter, "the Ungrouped section's pos and collapsed")
	assert.Equal(t, []string{"-", "B", "Alpha"}, r.sectionNames())
	assert.Equal(t, r.groupA, r.groupOf("3"))
	assert.Equal(t, r.groupA, r.groupOf("2"))
	r.assertConsistent()
}

func TestLoadAll_AnAbsentOrCorruptUngroupedLayoutReadsAsLastPlaceExpanded(t *testing.T) {
	r := newFixtureRig(t)
	require.NoError(t, r.st.KVSet(r.ctx, "rail_ungrouped", "{not json"))

	r.restart()

	_, ungrouped := r.mgr.Groups()
	assert.Equal(t, UngroupedLayout{Pos: 2, Collapsed: false}, ungrouped, "one past the last group, expanded")
}

func TestLoadAll_WithNoGroupsHasNoSectionsToShow(t *testing.T) {
	r := newGroupsRig(t)
	r.launch(nil)

	r.restart()

	groups, ungrouped := r.mgr.Groups()
	assert.Empty(t, groups)
	assert.Equal(t, UngroupedLayout{}, ungrouped)
}

// --- concurrency (D18) ---

// isExpectedGroupRace reports whether err is one a concurrent operation may legitimately
// meet because another worker deleted the group or session it named a moment before.
func isExpectedGroupRace(err error) bool {
	if err == nil {
		return true
	}
	for _, e := range []error{ErrUnknownGroup, ErrUnknownTargetGroup, ErrInvalidGroupOrder, ErrInvalidDisposition, ErrUnknownSession, ErrInvalidOrder} {
		if errors.Is(err, e) {
			return true
		}
	}
	return false
}

var fixtureLabels = []string{"11", "21", "22", "1", "12", "2", "23", "13", "3"}

// randomGroupOp performs one randomly chosen group, order, pin or move operation, reading the
// current groups first as a dashboard would.
func randomGroupOp(r *groupsRig, rng *rand.Rand, newName string) error {
	groups, ungrouped := r.mgr.Groups()
	var target *int64
	if len(groups) > 0 && rng.Intn(3) > 0 {
		target = i64(groups[rng.Intn(len(groups))].ID)
	}
	a, b := r.id(fixtureLabels[rng.Intn(len(fixtureLabels))]), r.id(fixtureLabels[rng.Intn(len(fixtureLabels))])
	flag := rng.Intn(2) == 0
	var err error
	switch rng.Intn(9) {
	case 0:
		_, err = r.mgr.CreateGroup(r.ctx, newName, []int64{a})
	case 1:
		err = r.mgr.SetSessionsGroup(r.ctx, []int64{a, b}, target)
	case 2:
		err = r.mgr.SetPinned(r.ctx, a, flag)
	case 3:
		err = r.mgr.SetOrder(r.ctx, []int64{a}, rng.Intn(2), &GroupRef{ID: target})
	case 4:
		if len(groups) > 1 {
			_, err = r.mgr.DeleteGroup(r.ctx, groups[0].ID, DispositionMove, groups[1].ID)
		}
	case 5:
		if len(groups) > 0 {
			_, err = r.mgr.DeleteGroup(r.ctx, groups[len(groups)-1].ID, DispositionUngroup, 0)
		}
	case 6:
		err = r.mgr.UpdateGroup(r.ctx, 0, nil, &flag)
	case 7:
		order := sectionOrder(groups, ungrouped)
		rng.Shuffle(len(order), func(x, y int) { order[x], order[y] = order[y], order[x] })
		err = r.mgr.SetGroupsOrder(r.ctx, order)
	default:
		err = r.mgr.SetAllCollapsed(r.ctx, flag)
	}
	return err
}

// TestGroups_ConcurrentMixedOperationsKeepEveryInvariant runs group, order, pin, move and
// launch requests from many goroutines at once (the per-section rebuild and the group
// methods share Manager.mu and groupsMu), then checks the invariants, that the database
// matches memory, and that the last broadcast of each thing is the final state — two group
// changes can never reach a client out of order. Run under -race by make test-race.
func TestGroups_ConcurrentMixedOperationsKeepEveryInvariant(t *testing.T) {
	r := newFixtureRig(t)

	var wg sync.WaitGroup
	for worker := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rng := rand.New(rand.NewSource(int64(worker)))
			for i := range 30 {
				err := randomGroupOp(r, rng, fmt.Sprintf("g%d-%d", worker, i))
				assert.True(t, isExpectedGroupRace(err), "worker %d op %d: %v", worker, i, err)
			}
		}()
	}
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		require.Fail(t, "group operations deadlocked")
	}

	r.assertConsistent()
	finalGroups, finalUngrouped := r.mgr.Groups()
	last := r.log.lastGroups(t)
	assert.ElementsMatch(t, finalGroups, last.groups, "the last groups message is the final state")
	assert.Equal(t, finalUngrouped, last.ungrouped)
	lastUpsert := map[int64]railEvent{}
	for _, e := range r.log.all() {
		if e.kind == "upsert" {
			lastUpsert[e.id] = e
		}
	}
	for _, s := range r.mgr.List() {
		if e, ok := lastUpsert[s.ID]; ok {
			assert.Equal(t, groupIDVal(s.GroupID), groupIDVal(e.groupID), "session %d: the last upsert's group is the final one", s.ID)
			assert.Equal(t, s.Pinned, e.pinned, "session %d: pin", s.ID)
			assert.Equal(t, s.RailPos, e.railPos, "session %d: railPos", s.ID)
		}
	}
}
