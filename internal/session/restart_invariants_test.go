package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/tmux"
)

// restartStart builds the session under test in one of the conditions the invariants are
// crossed from: every display state, each unreported, behind and behind-and-pending, plus a
// current one and the dead ones.
type restartStart struct {
	name  string
	build func(r *restartRig) int64
	// reload starts a fresh manager after the whole scene is built, so the marks come back
	// held: a daemon start whose first installed-version result has not arrived yet.
	reload bool
}

func restartStarts() []restartStart {
	var out []restartStart
	for _, st := range restartStates() {
		out = append(out,
			restartStart{name: st.name + "/unreported", build: func(r *restartRig) int64 {
				id := r.launch("", "")
				st.set(r, id)
				r.installed(verNew)
				return id
			}},
			restartStart{name: st.name + "/behind", build: func(r *restartRig) int64 { return r.behindSession(st) }},
			restartStart{name: st.name + "/behind and pending", build: func(r *restartRig) int64 {
				id := r.behindSession(st)
				r.pend(id)
				return id
			}},
			restartStart{name: st.name + "/reloaded and held", reload: true, build: func(r *restartRig) int64 {
				id := r.behindSession(st)
				r.pend(id)
				return id
			}},
		)
	}
	working := restartStates()[2]
	out = append(out,
		restartStart{name: "working/current", build: func(r *restartRig) int64 {
			id := r.launch("", "")
			working.set(r, id)
			r.installed(verNew)
			r.postVersion(id, verNew)
			return id
		}},
		restartStart{name: "dead after being behind and pending", build: func(r *restartRig) int64 {
			id := r.behindSession(working)
			r.pend(id)
			r.die(id)
			return id
		}},
		restartStart{name: "dead, never reported", build: func(r *restartRig) int64 {
			id := r.launch("", "")
			r.installed(verNew)
			r.die(id)
			return id
		}},
	)
	return out
}

// restartInput is one thing that can happen to a session. global inputs reach every session
// (the installed version, a daemon start), so a bystander is not expected to stay as it was.
type restartInput struct {
	name   string
	global bool
	// ends marks the inputs that empty the version and the mark: every death, launch and resume.
	ends bool
	// keeps marks the inputs that change neither the version nor the mark.
	keeps bool
	// settles marks the installed-version results, which release or drop a held mark.
	settles bool
	run     func(r *restartRig, id, bystander int64)
}

func restartInputs() []restartInput {
	stop := func(tasks int) func(r *restartRig, id, _ int64) {
		return func(r *restartRig, id, _ int64) {
			r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(tasks)})
		}
	}
	return []restartInput{
		{name: "status post with a newer version", run: func(r *restartRig, id, _ int64) { r.postVersion(id, verNew) }},
		{name: "status post with the older version", run: func(r *restartRig, id, _ int64) { r.postVersion(id, verOld) }},
		{name: "status post without a version", keeps: true, run: func(r *restartRig, id, _ int64) { r.postNoVersion(id) }},
		{name: "installed moves on", global: true, settles: true, run: func(r *restartRig, _, _ int64) { r.installed("2.1.319") }},
		{name: "installed rolls back to the old version", global: true, settles: true, run: func(r *restartRig, _, _ int64) { r.installed(verOld) }},
		{name: "installed check fails", global: true, settles: true, run: func(r *restartRig, _, _ int64) { r.installedUnknown() }},
		{name: "Stop with no tasks", keeps: true, run: stop(0)},
		{name: "Stop with tasks", keeps: true, run: stop(2)},
		{name: "StopFailure", keeps: true, run: func(r *restartRig, id, _ int64) {
			r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnFailed})
		}},
		{name: "turn activity", keeps: true, run: func(r *restartRig, id, _ int64) {
			r.in(id, claudecode.StateInput{Kind: claudecode.KindTurnActivity})
		}},
		{name: "permission prompt", keeps: true, run: func(r *restartRig, id, _ int64) {
			r.in(id, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission})
		}},
		{name: "/clear rebind", keeps: true, run: func(r *restartRig, id, _ int64) { r.rebind(id) }},
		{name: "mark restart-pending", run: func(r *restartRig, id, _ int64) {
			_, err := r.mgr.SetRestartPending(r.ctx, id, true)
			if err != nil {
				require.ErrorIs(r.t, err, ErrNotBehind)
			}
		}},
		{name: "unmark restart-pending", run: func(r *restartRig, id, _ int64) {
			_, err := r.mgr.SetRestartPending(r.ctx, id, false)
			require.NoError(r.t, err)
		}},
		{name: "Stop path", ends: true, run: func(r *restartRig, id, _ int64) {
			r.pc.setExists(r.get(id).TmuxTarget, false)
			_, err := r.mgr.End(r.ctx, id)
			if err != nil {
				require.ErrorIs(r.t, err, ErrSessionNotAlive)
			}
		}},
		{name: "liveness death", ends: true, run: func(r *restartRig, id, _ int64) {
			r.pc.setExists(r.get(id).TmuxTarget, false)
			r.mgr.Nudge(r.ctx, id)
		}},
		{name: "Resume button", ends: true, run: func(r *restartRig, id, _ int64) { r.resumeButton(id) }},
		{name: "relaunch", ends: true, run: func(r *restartRig, id, _ int64) {
			_, err := r.mgr.RecordLaunch(r.ctx, id, "muster-relaunched:@1", "%8")
			require.NoError(r.t, err)
		}},
		{name: "reconcile finds the pane gone", ends: true, global: true, run: func(r *restartRig, _, bystander int64) {
			fresh := newTestManager(r.t, r.st, r.pc, r.rec.record, withTmuxSessions(newFakeTmuxSessions(tmux.SessionName(bystander))), withOnRestartDue(r.due.record))
			require.NoError(r.t, fresh.LoadAll(r.ctx))
			fresh.Reconcile(r.ctx)
			r.mgr = fresh
		}},
		{name: "daemon restart", global: true, keeps: true, run: func(r *restartRig, _, _ int64) { r.mgr = r.freshManager() }},
	}
}

// checkRestartInvariants asserts the plan's rules as predicates over one snapshot.
func checkRestartInvariants(t *testing.T, s *Session, where string) {
	t.Helper()
	if s.restartHeld {
		assert.False(t, s.RestartPending, "%s: a held mark is off the wire (session %d)", where, s.ID)
		assert.False(t, s.ClaudeBehind, "%s: a held session is not behind (session %d)", where, s.ID)
		assert.True(t, s.Alive, "%s: a held mark belongs to an alive session (session %d)", where, s.ID)
	}
	if s.RestartPending {
		assert.True(t, s.Alive && s.ClaudeVersion != "" && s.ClaudeBehind, "%s: restartPending implies alive and behind (session %d)", where, s.ID)
	}
	if !s.Alive {
		assert.Empty(t, s.ClaudeVersion, "%s: a dead session has no version (session %d)", where, s.ID)
		assert.False(t, s.ClaudeBehind, "%s: a dead session is not behind (session %d)", where, s.ID)
		assert.False(t, s.RestartPending, "%s: a dead session is not pending (session %d)", where, s.ID)
	}
	if s.ClaudeBehind {
		assert.True(t, s.Alive && s.ClaudeVersion != "", "%s: behind implies alive with a running version (session %d)", where, s.ID)
	}
}

// checkRestartRules asserts what the rule table says one input did to the session under test:
// the version and mark of the inputs that fix them, the hold's resolution, that a held mark is
// never offered, and that the store holds what memory holds.
func checkRestartRules(t *testing.T, r *restartRig, in restartInput, id int64, before, after *Session) {
	t.Helper()
	switch {
	case in.ends:
		assert.Empty(t, after.ClaudeVersion)
		assert.False(t, after.RestartPending)
		assert.False(t, after.restartHeld, "a death, launch or resume drops a held mark with the rest")
	case in.keeps:
		assert.Equal(t, before.ClaudeVersion, after.ClaudeVersion)
		if !in.global {
			assert.Equal(t, before.RestartPending, after.RestartPending, "a state-machine input does not touch the mark")
		}
	}
	if !in.global && !in.ends {
		assert.Equal(t, before.restartHeld, after.restartHeld, "only an installed result or a death resolves a held mark")
	}
	if in.settles {
		assert.False(t, after.restartHeld, "an installed result resolves a held mark")
		if before.restartHeld {
			assert.Equal(t, after.ClaudeBehind, after.RestartPending, "a held mark becomes pending exactly when the session is behind")
		}
	}
	if after.restartHeld {
		assert.Zero(t, r.due.count(id), "a held mark is never offered for a restart")
		assert.False(t, r.mgr.IsRestartDue(id))
	}

	fromStore := r.stored(id)
	assert.Equal(t, after.ClaudeVersion, r.storedVersion(id), "the store holds the version")
	assert.Equal(t, after.RestartPending || after.restartHeld, fromStore.RestartPending, "the store holds the mark, held or live")
	assert.Equal(t, after.Alive, fromStore.Alive)
}

// TestRestartInvariants_EveryInputFromEveryState crosses every input with every starting
// condition (kb:lesson/invariant-missed-by-per-transition-tests) and asserts, on the result and
// on every upsert the input broadcast, that restartPending implies alive and behind and a dead
// session has no version; that the version and mark come out as the rule table says for the
// inputs that fix them; that a coexisting behind-and-pending session is untouched by the inputs
// that are about one session; and that the store holds what memory holds.
// The reloaded-and-held starts cross every input against a mark a daemon start left off the
// wire until the first installed result.
func TestRestartInvariants_EveryInputFromEveryState(t *testing.T) {
	for _, start := range restartStarts() {
		for _, in := range restartInputs() {
			t.Run(start.name+"/"+in.name, func(t *testing.T) {
				t.Parallel()
				r := newRestartRig(t)
				id := start.build(r)
				bystander := r.behindSession(restartStates()[2])
				r.pend(bystander)
				if start.reload {
					r.mgr = r.freshManager()
				}
				before := r.get(id)
				bystanderBefore := r.get(bystander)
				r.rec.mu.Lock()
				r.rec.seen = nil
				r.rec.mu.Unlock()
				r.due.reset()

				in.run(r, id, bystander)

				after := r.get(id)
				checkRestartInvariants(t, after, "target")
				for _, s := range r.rec.all() {
					checkRestartInvariants(t, s, "broadcast")
				}
				checkRestartRules(t, r, in, id, before, after)

				if !in.global {
					got := r.get(bystander)
					assert.Equal(t, bystanderBefore.ClaudeVersion, got.ClaudeVersion, "the bystander's version is untouched")
					assert.True(t, got.RestartPending || got.restartHeld, "the bystander's mark is untouched")
					assert.True(t, got.Alive)
				}
			})
		}
	}
}

// TestRestartDeath_ClearsVersionAndMarkAndNothingRefillsThem: after every way a
// session ends — Stop, liveness, reconcile, Remove — the version and the mark are empty in
// memory and in the store, no restart is offered, a straggler status post leaves them empty and
// broadcasts nothing, and a coexisting pending session is unaffected.
func TestRestartDeath_ClearsVersionAndMarkAndNothingRefillsThem(t *testing.T) {
	deaths := []struct {
		name string
		run  func(r *restartRig, id, bystander int64)
	}{
		{"Stop", func(r *restartRig, id, _ int64) {
			r.pc.setExists(r.get(id).TmuxTarget, false)
			_, err := r.mgr.End(r.ctx, id)
			require.NoError(r.t, err)
		}},
		{"liveness death", func(r *restartRig, id, _ int64) { r.die(id) }},
		{"reconcile finds the pane gone", func(r *restartRig, _, bystander int64) {
			fresh := newTestManager(r.t, r.st, r.pc, r.rec.record, withTmuxSessions(newFakeTmuxSessions(tmux.SessionName(bystander))), withOnRestartDue(r.due.record))
			require.NoError(r.t, fresh.LoadAll(r.ctx))
			require.Equal(r.t, 1, fresh.Reconcile(r.ctx).KeptAlive, "fixture: only the bystander's tmux session exists")
			r.mgr = fresh
		}},
	}
	for _, st := range restartStates() {
		for _, death := range deaths {
			t.Run(st.name+"/"+death.name, func(t *testing.T) {
				r := newRestartRig(t)
				id := r.behindSession(st)
				r.pend(id)
				bystander := r.behindSession(restartStates()[2])
				r.pend(bystander)
				r.due.reset()

				death.run(r, id, bystander)

				dead := r.get(id)
				require.False(t, dead.Alive)
				assert.Empty(t, dead.ClaudeVersion)
				assert.False(t, dead.ClaudeBehind)
				assert.False(t, dead.RestartPending)
				assert.Empty(t, r.storedVersion(id))
				assert.False(t, r.stored(id).RestartPending)
				assert.False(t, dead.restartHeld)
				assert.Zero(t, r.due.count(id), "no restart is offered for the session that died")
				assert.False(t, r.mgr.IsRestartDue(id))
				assert.NotContains(t, r.mgr.RestartDue(), id)

				survivor := r.get(bystander)
				assert.True(t, survivor.Alive)
				assert.True(t, survivor.RestartPending || survivor.restartHeld, "the bystander is still pending (held when reconcile reloaded it)")
				assert.Equal(t, verOld, survivor.ClaudeVersion)

				broadcasts := len(r.rec.all())
				r.postVersion(id, verOld)
				assert.Empty(t, r.get(id).ClaudeVersion, "a straggler post routed after the death leaves it empty")
				assert.Empty(t, r.storedVersion(id))
				assert.Len(t, r.rec.all(), broadcasts, "and broadcasts nothing")
			})
		}
	}
}

// TestRestartRemove_OfAPendingSessionLeavesNothingToFire: a Remove of a pending session offers nothing to the queue.
func TestRestartRemove_OfAPendingSessionLeavesNothingToFire(t *testing.T) {
	for _, st := range restartStates() {
		t.Run(st.name, func(t *testing.T) {
			r := newRestartRig(t)
			id := r.behindSession(st)
			r.pend(id)
			bystander := r.behindSession(restartStates()[2])
			r.pend(bystander)
			r.due.reset()

			require.NoError(t, r.mgr.Remove(r.ctx, id))

			assert.False(t, r.mgr.Exists(id))
			assert.False(t, r.mgr.IsRestartDue(id))
			assert.Equal(t, RestartSkip, r.mgr.ClassifyRestart(id))
			assert.NotContains(t, r.mgr.RestartDue(), id)
			assert.Zero(t, r.due.count(id))
			assert.True(t, r.get(bystander).RestartPending)
		})
	}
}

// TestRestartLaunchAndResume_ClearVersionAndMark: a launch and a resume, with the /clear
// and daemon-restart exceptions: both launch paths empty the version and
// the mark and the next post refills the version only.
func TestRestartLaunchAndResume_ClearVersionAndMark(t *testing.T) {
	paths := map[string]func(r *restartRig, id int64){
		"Resume button": func(r *restartRig, id int64) { r.resumeButton(id) },
		"relaunch": func(r *restartRig, id int64) {
			_, err := r.mgr.RecordLaunch(r.ctx, id, "muster-relaunched:@1", "%8")
			require.NoError(r.t, err)
		},
	}
	for name, run := range paths {
		t.Run(name, func(t *testing.T) {
			r := newRestartRig(t)
			id := r.behindSession(restartStates()[2])
			r.pend(id)

			run(r, id)

			got := r.get(id)
			assert.Empty(t, got.ClaudeVersion)
			assert.False(t, got.ClaudeBehind)
			assert.False(t, got.RestartPending)
			assert.Empty(t, r.storedVersion(id))
			assert.False(t, r.stored(id).RestartPending)

			r.postVersion(id, verNew)
			assert.Equal(t, verNew, r.get(id).ClaudeVersion, "the new process's first post refills it")
			assert.False(t, r.get(id).ClaudeBehind)
		})
	}

	t.Run("/clear and a daemon restart keep both", func(t *testing.T) {
		r := newRestartRig(t)
		id := r.behindSession(restartStates()[2])
		r.pend(id)

		r.rebind(id)

		got := r.get(id)
		assert.Equal(t, verOld, got.ClaudeVersion)
		assert.True(t, got.ClaudeBehind)
		assert.True(t, got.RestartPending)

		fresh := r.freshManager()
		reloaded, ok := fresh.Get(id)
		require.True(t, ok)
		assert.Equal(t, verOld, reloaded.ClaudeVersion)
		assert.True(t, reloaded.restartHeld, "the reload holds the mark until the installed version is known")
		assert.False(t, reloaded.RestartPending)
		assert.True(t, r.stored(id).RestartPending, "and the store still carries it")
	})
}

// heldScene is a daemon start after marks were pending: one session per display state with a
// mark, a behind session with none, a dead one, all reloaded by a fresh manager that has not yet
// been told what is installed.
type heldScene struct {
	*restartRig
	ids      map[string]int64
	pending  []int64
	freeIDs  []int64
	notMarks int64
	dead     int64
}

func newHeldScene(t *testing.T) *heldScene {
	t.Helper()
	r := newRestartRig(t)
	h := &heldScene{restartRig: r, ids: map[string]int64{}}
	for _, st := range restartStates() {
		id := r.behindSession(st)
		r.pend(id)
		h.ids[st.name] = id
		h.pending = append(h.pending, id)
		if st.free {
			h.freeIDs = append(h.freeIDs, id)
		}
	}
	h.notMarks = r.behindSession(restartStates()[4])
	h.dead = r.behindSession(restartStates()[4])
	r.pend(h.dead)
	r.die(h.dead)
	r.mgr = r.freshManager()
	r.rec.mu.Lock()
	r.rec.seen = nil
	r.rec.mu.Unlock()
	r.due.reset()
	return h
}

// TestLoadAll_HoldsTheReloadedMarkOffTheWireUntilTheInstalledVersionIsKnown, at the
// manager: the version comes back from the row, the mark is held (not pending, not behind, never
// due, not classifiable for a restart) and the store keeps it, through every free and busy
// state, until the first installed-version result.
func TestLoadAll_HoldsTheReloadedMarkOffTheWireUntilTheInstalledVersionIsKnown(t *testing.T) {
	h := newHeldScene(t)

	for name, id := range h.ids {
		got := h.get(id)
		assert.Equal(t, verOld, got.ClaudeVersion, name)
		assert.True(t, got.restartHeld, "%s: the mark is held", name)
		assert.False(t, got.RestartPending, "%s: and off the wire", name)
		assert.False(t, got.ClaudeBehind, "%s: nothing is behind while the installed version is unknown", name)
		assert.True(t, h.stored(id).RestartPending, "%s: the store keeps the mark", name)
		assert.False(t, h.mgr.IsRestartDue(id), name)
		assert.Equal(t, RestartSkip, h.mgr.ClassifyRestart(id), "%s: a restart request skips it", name)
		_, err := h.mgr.SetRestartPending(h.ctx, id, true)
		require.ErrorIs(t, err, ErrNotBehind, "%s: it cannot be marked again", name)
	}
	assert.False(t, h.get(h.notMarks).restartHeld)
	assert.False(t, h.get(h.dead).restartHeld)
	assert.Empty(t, h.mgr.RestartDue(), "nothing is due, not even the free ones")
	assert.Empty(t, h.due.all(), "and nothing was offered")
}

// TestLoadAll_AStatusPostBeforeTheFirstInstalledResultKeepsTheHold covers the window between a
// daemon start and the first result: a post of any version leaves the hold, the wire and the
// store column as they were, and no upsert shows a pending mark.
func TestLoadAll_AStatusPostBeforeTheFirstInstalledResultKeepsTheHold(t *testing.T) {
	posts := map[string]func(h *heldScene, id int64){
		"the same version":  func(h *heldScene, id int64) { h.postVersion(id, verOld) },
		"a newer version":   func(h *heldScene, id int64) { h.postVersion(id, verNew) },
		"no version at all": func(h *heldScene, id int64) { h.postNoVersion(id) },
		"a state-machine Stop": func(h *heldScene, id int64) {
			h.in(id, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(0)})
		},
	}
	for name, post := range posts {
		t.Run(name, func(t *testing.T) {
			h := newHeldScene(t)
			for stateName, id := range h.ids {
				post(h, id)

				got := h.get(id)
				assert.True(t, got.restartHeld, "%s: still held", stateName)
				assert.False(t, got.RestartPending, stateName)
				assert.False(t, got.ClaudeBehind, stateName)
				assert.True(t, h.stored(id).RestartPending, "%s: the store column survives the write the post causes", stateName)
				assert.False(t, h.mgr.IsRestartDue(id), stateName)
			}
			for _, s := range h.rec.all() {
				assert.False(t, s.RestartPending, "no upsert shows a pending mark")
				assert.False(t, s.ClaudeBehind, "no upsert shows behind")
			}
			assert.Empty(t, h.due.all())
		})
	}
}

// TestLoadAll_TheFirstInstalledResultReleasesOrDropsEveryHeldMark: the first result re-derives
// each held mark in one upsert; a session still behind becomes pending and the free ones are
// offered for a restart, exactly once each; every other result drops the mark and the store
// column; sessions without a mark and the dead one are not released or dropped.
func TestLoadAll_TheFirstInstalledResultReleasesOrDropsEveryHeldMark(t *testing.T) {
	outcomes := []struct {
		name   string
		set    func(h *heldScene)
		behind bool
	}{
		{"known and still behind", func(h *heldScene) { h.installed(verNew) }, true},
		{"known and equal to the running version", func(h *heldScene) { h.installed(verOld) }, false},
		{"known and older than the running version", func(h *heldScene) { h.installed("2.1.300") }, false},
		{"unknown: the check failed or the binary did not resolve", func(h *heldScene) { h.installedUnknown() }, false},
	}
	for _, o := range outcomes {
		t.Run(o.name, func(t *testing.T) {
			h := newHeldScene(t)
			beforeUpserts := map[int64]int{}
			for _, id := range append([]int64{h.notMarks, h.dead}, h.pending...) {
				beforeUpserts[id] = h.upsertsFor(id)
			}

			o.set(h)

			for name, id := range h.ids {
				got := h.get(id)
				assert.False(t, got.restartHeld, "%s: resolved", name)
				assert.Equal(t, o.behind, got.ClaudeBehind, name)
				assert.Equal(t, o.behind, got.RestartPending, "%s: pending exactly when behind", name)
				assert.Equal(t, o.behind, h.stored(id).RestartPending, "%s: the store holds the resolved mark", name)
				assert.Equal(t, beforeUpserts[id]+1, h.upsertsFor(id), "%s: one upsert", name)
			}
			for _, s := range h.rec.all() {
				if s.ID != h.notMarks {
					assert.Equal(t, s.ClaudeBehind, s.RestartPending, "no upsert shows a pending mark on a session that is not behind")
				}
			}
			wantBehindUpserts := 0
			if o.behind {
				wantBehindUpserts = 1
			}
			assert.Equal(t, beforeUpserts[h.notMarks]+wantBehindUpserts, h.upsertsFor(h.notMarks), "the unmarked session only flips behind")
			assert.False(t, h.get(h.notMarks).RestartPending)
			assert.Equal(t, beforeUpserts[h.dead], h.upsertsFor(h.dead), "the dead session is not touched")
			assert.False(t, h.get(h.dead).ClaudeBehind)

			if o.behind {
				assert.ElementsMatch(t, h.freeIDs, h.due.all(), "each free pending session is offered once, the busy ones are not")
				assert.ElementsMatch(t, h.freeIDs, h.mgr.RestartDue())
			} else {
				assert.Empty(t, h.due.all(), "nothing is offered for a dropped mark")
				assert.Empty(t, h.mgr.RestartDue())
			}
		})
	}
}

// TestLoadAll_AHeldMarkDiesWithItsSession: a death before the first installed result drops the
// hold and the store column with the version, whichever way the session ends; a later result
// finds nothing to release.
func TestLoadAll_AHeldMarkDiesWithItsSession(t *testing.T) {
	ends := map[string]func(h *heldScene, id int64){
		"liveness death": func(h *heldScene, id int64) { h.die(id) },
		"Stop": func(h *heldScene, id int64) {
			h.pc.setExists(h.get(id).TmuxTarget, false)
			_, err := h.mgr.End(h.ctx, id)
			require.NoError(t, err)
		},
		"Resume button": func(h *heldScene, id int64) { h.resumeButton(id) },
		"relaunch": func(h *heldScene, id int64) {
			_, err := h.mgr.RecordLaunch(h.ctx, id, "muster-relaunched:@1", "%8")
			require.NoError(t, err)
		},
	}
	for name, end := range ends {
		t.Run(name, func(t *testing.T) {
			h := newHeldScene(t)
			id := h.ids["idle with no background tasks"]
			other := h.ids["working"]

			end(h, id)

			got := h.get(id)
			assert.False(t, got.restartHeld)
			assert.Empty(t, got.ClaudeVersion)
			assert.False(t, h.stored(id).RestartPending)
			assert.True(t, h.get(other).restartHeld, "another held session is unaffected")
			assert.True(t, h.stored(other).RestartPending)

			h.installed(verNew)
			assert.False(t, h.get(id).RestartPending, "the result finds nothing to release")
			assert.False(t, h.mgr.IsRestartDue(id))
			assert.Zero(t, h.due.count(id))
			assert.True(t, h.get(other).RestartPending, "the other session's mark is released")
		})
	}
}

// TestLoadAll_AMidRunReloadOnceTheInstalledVersionIsKnownResolvesAtOnce is the render rig's
// markDead path: a LoadAll on a manager that already knows the installed version never holds.
func TestLoadAll_AMidRunReloadOnceTheInstalledVersionIsKnownResolvesAtOnce(t *testing.T) {
	r := newRestartRig(t)
	id := r.behindSession(restartStates()[2])
	r.pend(id)

	require.NoError(t, r.mgr.LoadAll(r.ctx))

	got := r.get(id)
	assert.False(t, got.restartHeld)
	assert.True(t, got.RestartPending)
	assert.True(t, got.ClaudeBehind)
}
