package session

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

// addedFixture is the directories and readings the invariant tables share.
type addedFixture struct {
	infra, docs string
}

func newAddedFixture(t *testing.T) addedFixture {
	t.Helper()
	root := scratchDir(t)
	return addedFixture{
		infra: mkdir(t, filepath.Join(root, "infra")),
		docs:  mkdir(t, filepath.Join(root, "docs")),
	}
}

// addedStartState builds the session under test in one of the states the invariant is crossed from.
type addedStartState struct {
	name  string
	build func(r *effortRig, f addedFixture) int64
}

func addedStartStates() []addedStartState {
	two := func(r *effortRig, f addedFixture) int64 {
		id := r.launch("", "")
		r.postAdded(id, f.infra, f.docs)
		return id
	}
	return []addedStartState{
		{"nothing ever reported", func(r *effortRig, _ addedFixture) int64 { return r.launch("", "") }},
		{"two directories, no readings", two},
		{"two directories with readings", func(r *effortRig, f addedFixture) int64 {
			id := two(r, f)
			require.NoError(r.t, r.mgr.SetRepoState(r.ctx, id, RepoState{AddedRepos: map[string]*LocationRepo{f.infra: repoOf("infra", "main"), f.docs: nil}}))
			return id
		}},
		{"two directories, then a /clear rebind", func(r *effortRig, f addedFixture) int64 {
			id := two(r, f)
			r.rebind(id)
			return id
		}},
		{"two directories, then emptied by a launch-directory-only post", func(r *effortRig, f addedFixture) int64 {
			id := two(r, f)
			r.postAdded(id)
			return id
		}},
		{"relaunched, list re-reported", func(r *effortRig, f addedFixture) int64 {
			id := two(r, f)
			_, err := r.mgr.RecordLaunch(r.ctx, id, "muster-relaunched:@1", "%8")
			require.NoError(r.t, err)
			r.pc.setExists("muster-relaunched:@1", true)
			r.postAdded(id, f.docs)
			return id
		}},
		{"resumed, list re-reported", func(r *effortRig, f addedFixture) int64 {
			id := two(r, f)
			r.resumeButton(id)
			r.pc.setExists("muster-resumed:@1", true)
			r.postAdded(id, f.infra)
			return id
		}},
	}
}

// addedDeath is one way a session dies: the three paths into markEnded.
type addedDeath struct {
	name string
	// restarts is true when the path swaps in a freshly loaded manager, which holds paths only
	// (readings are not persisted).
	restarts bool
	run      func(r *effortRig, id int64, bystander int64)
}

func addedDeaths() []addedDeath {
	return []addedDeath{
		{"Stop", false, func(r *effortRig, id, _ int64) {
			r.pc.setExists(r.get(id).TmuxTarget, false)
			_, err := r.mgr.End(r.ctx, id)
			require.NoError(r.t, err)
		}},
		{"liveness death", false, func(r *effortRig, id, _ int64) {
			r.pc.setExists(r.get(id).TmuxTarget, false)
			r.mgr.Nudge(r.ctx, id)
		}},
		{"reconcile finds the pane gone", true, func(r *effortRig, _, bystander int64) {
			fresh := newTestManager(r.t, r.st, r.pc, r.rec.record, withTmuxSessions(newFakeTmuxSessions(tmux.SessionName(bystander))))
			require.NoError(r.t, fresh.LoadAll(r.ctx))
			report := fresh.Reconcile(r.ctx)
			require.Equal(r.t, 1, report.KeptAlive, "fixture: only the bystander's tmux session exists")
			r.mgr = fresh
		}},
	}
}

// TestAddedDirsInvariants_EveryDeathFromEveryState: after every way a
// session dies, from every source state, its added directories are empty in memory and in
// the store; a status post routed afterwards neither refills it nor broadcasts; and a second
// session coexisting on the same manager and store keeps its list and its readings
// (kb:lesson/invariant-missed-by-per-transition-tests).
func TestAddedDirsInvariants_EveryDeathFromEveryState(t *testing.T) {
	for _, start := range addedStartStates() {
		for _, death := range addedDeaths() {
			t.Run(start.name+"/"+death.name, func(t *testing.T) {
				r := newEffortRig(t)
				f := newAddedFixture(t)
				id := start.build(r, f)
				bystander := r.launch("", "")
				r.postAdded(bystander, f.docs)
				require.NoError(t, r.mgr.SetRepoState(r.ctx, bystander, RepoState{AddedRepos: map[string]*LocationRepo{f.docs: repoOf("docs", "main")}}))
				want := []Location{{Directory: f.docs, Repo: repoOf("docs", "main")}}
				require.Equal(t, want, r.get(bystander).AddedDirs, "fixture: the bystander holds a list with a reading")

				death.run(r, id, bystander)

				dead := r.get(id)
				require.False(t, dead.Alive, "fixture: the session died")
				assert.Empty(t, dead.AddedDirs, "INV-1: !alive implies addedDirs == []")
				assert.Empty(t, r.reloaded(id).AddedDirs, "INV-1 holds in the store too")
				survivor := want
				if death.restarts {
					survivor = []Location{{Directory: f.docs}}
				}
				assert.Equal(t, survivor, r.get(bystander).AddedDirs, "the bystander's list and reading are untouched")
				assert.Equal(t, want[0].Directory, r.reloaded(bystander).AddedDirs[0].Directory, "and its persisted paths")
				assert.True(t, r.get(bystander).Alive)

				broadcasts := len(r.rec.all())
				_, err := r.mgr.ApplyStatus(r.ctx, id, addedPost(r.dir, f.infra, f.docs))
				require.NoError(t, err)
				require.NoError(t, r.mgr.SetRepoState(r.ctx, id, RepoState{AddedRepos: map[string]*LocationRepo{f.infra: repoOf("infra", "main")}, Epoch: r.get(id).repoEpoch}))

				assert.Empty(t, r.get(id).AddedDirs, "D7: a status post routed after the death leaves it empty")
				assert.Empty(t, r.reloaded(id).AddedDirs)
				assert.Len(t, r.rec.all(), broadcasts, "and broadcasts nothing")
			})
		}
	}
}

// TestAddedDirsInvariants_LaunchDirectoryNeverListed: whatever the spelling of the
// launch directory in the reported list, from every starting list, it is never in the result.
func TestAddedDirsInvariants_LaunchDirectoryNeverListed(t *testing.T) {
	r := newEffortRig(t)
	f := newAddedFixture(t)
	resolved := ResolvePath(r.dir)
	link := symlink(t, r.dir, filepath.Join(scratchDir(t), "launch-link"))
	spellings := []string{r.dir, r.dir + "/", resolved, link, filepath.Join(r.dir, ".")}
	starts := [][]string{nil, {f.infra}, {f.infra, f.docs}}

	for _, spelling := range spellings {
		for _, before := range starts {
			t.Run(spelling, func(t *testing.T) {
				id := r.launch("", "")
				if before != nil {
					r.postAdded(id, before...)
				}

				_, err := r.mgr.ApplyStatus(r.ctx, id, addedPost(spelling, f.docs, spelling))
				require.NoError(t, err)

				got := dirPaths(r.get(id).AddedDirs)
				assert.Equal(t, []string{f.docs}, got)
				assert.NotContains(t, got, resolved)
				assert.NotContains(t, got, r.dir)
			})
		}
	}
}
