package session

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// scratchDir is a fresh directory with symlinks resolved, the spelling ResolvePath returns
// (macOS t.TempDir() is /var/..., which resolves to /private/var/...).
func scratchDir(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)
	return dir
}

func mkdir(t *testing.T, path string) string {
	t.Helper()
	require.NoError(t, os.MkdirAll(path, 0o755))
	return path
}

func symlink(t *testing.T, target, link string) string {
	t.Helper()
	require.NoError(t, os.Symlink(target, link))
	return link
}

func repoOf(name, branch string) *LocationRepo {
	return &LocationRepo{Name: name, Branch: branch}
}

func dirPaths(dirs []Location) []string {
	out := make([]string, len(dirs))
	for i, d := range dirs {
		out[i] = d.Directory
	}
	return out
}

// TestResolvePath: a directory that exists resolves through symlinks, one that does not is
// only cleaned (an unresolvable path keeps its spelling).
func TestResolvePath(t *testing.T) {
	root := scratchDir(t)
	resolved := mkdir(t, filepath.Join(root, "real"))
	link := symlink(t, resolved, filepath.Join(root, "link"))

	cases := []struct{ name, in, want string }{
		{"symlink resolves to its target", link, resolved},
		{"trailing slash is cleaned", resolved + "/", resolved},
		{"an existing real path is unchanged", resolved, resolved},
		{"a nonexistent path is only cleaned", root + "/gone/./x/../y", root + "/gone/y"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, ResolvePath(tc.in))
		})
	}
}

// TestNormalizeAddedDirs is the normalisation rules as a table over real directories: the
// launch directory goes under any spelling, relative entries join the launch directory,
// duplicates collapse to the first, and a directory already held keeps its git reading.
func TestNormalizeAddedDirs(t *testing.T) {
	root := scratchDir(t)
	launch := mkdir(t, filepath.Join(root, "launch"))
	launchLink := symlink(t, launch, filepath.Join(root, "launch-link"))
	other := mkdir(t, filepath.Join(root, "other"))
	otherLink := symlink(t, other, filepath.Join(root, "other-link"))
	third := mkdir(t, filepath.Join(root, "third"))
	rel := mkdir(t, filepath.Join(launch, "rel"))

	held := []Location{{Directory: other, Repo: repoOf("other", "main")}, {Directory: third, Repo: repoOf("third", "dev")}}

	cases := []struct {
		name     string
		launch   string
		reported []string
		held     []Location
		want     []Location
	}{
		{name: "D1: only the launch directory", launch: launch, reported: []string{launch}, want: []Location{}},
		{name: "D3: launch directory with a trailing slash", launch: launch, reported: []string{launch + "/", other}, want: []Location{{Directory: other}}},
		{name: "D3: launch directory arriving through a symlink", launch: launch, reported: []string{launchLink, other}, want: []Location{{Directory: other}}},
		{name: "D3: launch directory stored through a symlink, reported resolved", launch: launchLink, reported: []string{launch, other}, want: []Location{{Directory: other}}},
		{name: "D3: the launch directory is dropped wherever it sits in the list", launch: launch, reported: []string{other, launch, third}, want: []Location{{Directory: other}, {Directory: third}}},
		{name: "D4: a relative entry resolves against the launch directory", launch: launch, reported: []string{launch, "rel"}, want: []Location{{Directory: rel}}},
		{name: "D4: a relative entry that names the launch directory is dropped", launch: launch, reported: []string{launch, "."}, want: []Location{}},
		{name: "D4: duplicates collapse to the first, symlink spelling included", launch: launch, reported: []string{launch, otherLink, third, other, otherLink}, want: []Location{{Directory: other}, {Directory: third}}},
		{name: "reported order is kept", launch: launch, reported: []string{launch, third, other}, want: []Location{{Directory: third}, {Directory: other}}},
		{name: "an empty entry is skipped", launch: launch, reported: []string{launch, "", other}, want: []Location{{Directory: other}}},
		{name: "a nonexistent directory is kept, cleaned only", launch: launch, reported: []string{launch, root + "/gone/./x/../y"}, want: []Location{{Directory: root + "/gone/y"}}},
		{name: "nothing reported", launch: launch, reported: nil, want: []Location{}},
		{
			name: "a held directory keeps its reading, a new one starts with none", launch: launch,
			reported: []string{launch, third, otherLink, rel}, held: held,
			want: []Location{{Directory: third, Repo: repoOf("third", "dev")}, {Directory: other, Repo: repoOf("other", "main")}, {Directory: rel}},
		},
		{name: "a held directory no longer reported is forgotten", launch: launch, reported: []string{launch}, held: held, want: []Location{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := normalizeAddedDirs(tc.launch, tc.reported, tc.held)

			assert.Equal(t, tc.want, got)
		})
	}
}

// TestAdoptAddedDirs is the change report the broadcast and the nudge hang off, with an
// absent key changing nothing and a dead session never adopting.
func TestAdoptAddedDirs(t *testing.T) {
	root := scratchDir(t)
	launch := mkdir(t, filepath.Join(root, "launch"))
	a := mkdir(t, filepath.Join(root, "a"))
	b := mkdir(t, filepath.Join(root, "b"))
	list := func(dirs ...string) *[]string { return &dirs }

	cases := []struct {
		name        string
		alive       bool
		before      []Location
		reported    *[]string
		want        []string
		wantChanged bool
	}{
		{name: "first report", alive: true, reported: list(launch, a), want: []string{a}, wantChanged: true},
		{name: "D2: key absent keeps the list", alive: true, before: []Location{{Directory: a}}, reported: nil, want: []string{a}},
		{name: "the same list again", alive: true, before: []Location{{Directory: a}}, reported: list(launch, a), want: []string{a}},
		{name: "a reordered list is a change", alive: true, before: []Location{{Directory: a}, {Directory: b}}, reported: list(launch, b, a), want: []string{b, a}, wantChanged: true},
		{name: "a directory added", alive: true, before: []Location{{Directory: a}}, reported: list(launch, a, b), want: []string{a, b}, wantChanged: true},
		{name: "D1: launch directory alone empties a held list", alive: true, before: []Location{{Directory: a}}, reported: list(launch), want: []string{}, wantChanged: true},
		{name: "a reported empty list empties a held list", alive: true, before: []Location{{Directory: a}}, reported: list(), want: []string{}, wantChanged: true},
		{name: "nothing held and only the launch directory reported is no change", alive: true, reported: list(launch), want: []string{}},
		{name: "D7: a dead session never adopts", alive: false, reported: list(launch, a), want: []string{}},
		{name: "D7: a dead session keeps whatever it held", alive: false, before: []Location{{Directory: a}}, reported: list(launch), want: []string{a}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sess := &Session{Directory: launch, Alive: tc.alive, AddedDirs: tc.before}

			changed := adoptAddedDirs(sess, tc.reported)

			assert.Equal(t, tc.wantChanged, changed)
			assert.Equal(t, tc.want, dirPaths(sess.AddedDirs))
		})
	}

	t.Run("a held reading survives a re-report of the same list", func(t *testing.T) {
		sess := &Session{Directory: launch, Alive: true, AddedDirs: []Location{{Directory: a, Repo: repoOf("a", "main")}}}

		changed := adoptAddedDirs(sess, list(launch, a))

		assert.False(t, changed)
		assert.Equal(t, []Location{{Directory: a, Repo: repoOf("a", "main")}}, sess.AddedDirs)
	})
}

// addedPost is a status post carrying only the directory list, the shape of the measured
// workspace.added_dirs (kb:fact/added-dirs-in-status-line).
func addedPost(dirs ...string) claudecode.StatusUpdate {
	return claudecode.StatusUpdate{AddedDirs: &dirs}
}

func (h *repoHarness) postAdded(t *testing.T, id int64, dirs ...string) {
	t.Helper()
	_, err := h.mgr.ApplyStatus(context.Background(), id, addedPost(dirs...))
	require.NoError(t, err)
}

func (h *repoHarness) rowAdded(t *testing.T, id int64) []string {
	t.Helper()
	row, err := h.st.GetSession(context.Background(), id)
	require.NoError(t, err)
	return row.AddedDirs
}

// TestApplyStatus_AddedDirs drives the list through the manager: on a live session,
// one upsert and one nudge per real change, none for a repeat, the persisted row carrying
// only paths, and the null repo on the upsert a status post triggers.
func TestApplyStatus_AddedDirs(t *testing.T) {
	h := newRepoHarness(t)
	sess := h.launched(t)
	root := scratchDir(t)
	infra := mkdir(t, filepath.Join(root, "infra"))
	docs := mkdir(t, filepath.Join(root, "docs"))
	upserts := func() int { return len(h.rec.all()) }

	before := upserts()
	h.postAdded(t, sess.ID, sess.Directory+"/", infra, docs)

	got := h.get(t, sess.ID)
	assert.Equal(t, []Location{{Directory: infra}, {Directory: docs}}, got.AddedDirs, "D15: a newly reported directory is listed with no reading")
	assert.Equal(t, before+1, upserts(), "one sessionUpsert for the change")
	assert.Equal(t, int32(1), h.nudges.Load(), "the repo poll is nudged so the new directories are read at once")
	assert.Equal(t, []string{infra, docs}, h.rowAdded(t, sess.ID), "only the paths are persisted")
	last := h.rec.all()[upserts()-1]
	assert.Equal(t, []Location{{Directory: infra}, {Directory: docs}}, last.AddedDirs, "the broadcast session carries the list")

	h.postAdded(t, sess.ID, sess.Directory, infra, docs)
	assert.Equal(t, before+1, upserts(), "the same list again broadcasts nothing")
	assert.Equal(t, int32(1), h.nudges.Load(), "and nudges nothing")

	_, err := h.mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Title: strPtr("a title")})
	require.NoError(t, err)
	assert.Equal(t, []string{infra, docs}, dirPaths(h.get(t, sess.ID).AddedDirs), "D2: a post without the key leaves the list")
	assert.Equal(t, int32(1), h.nudges.Load())

	h.postAdded(t, sess.ID, sess.Directory)
	assert.Empty(t, h.get(t, sess.ID).AddedDirs, "D1: only the launch directory empties the list")
	assert.Empty(t, h.rowAdded(t, sess.ID), "and the column is NULL again")
	assert.Equal(t, int32(2), h.nudges.Load(), "removing a directory nudges too")
}

// TestApplyStatus_AddedDirsAreSessionScoped: a post for one session never touches another's
// list, in memory or in the store.
func TestApplyStatus_AddedDirsAreSessionScoped(t *testing.T) {
	h := newRepoHarness(t)
	a := h.launched(t)
	b := h.launched(t)
	root := scratchDir(t)
	infra := mkdir(t, filepath.Join(root, "infra"))
	docs := mkdir(t, filepath.Join(root, "docs"))
	h.postAdded(t, a.ID, a.Directory, infra)
	h.postAdded(t, b.ID, b.Directory, docs)
	bBefore := h.get(t, b.ID)

	h.postAdded(t, a.ID, a.Directory, infra, docs)
	h.postAdded(t, a.ID, a.Directory)

	assert.Equal(t, bBefore, h.get(t, b.ID))
	assert.Equal(t, []string{docs}, h.rowAdded(t, b.ID))
}

// TestApplyStatus_AddedDirsPersistFailureRollsBack: a status post whose persist fails
// leaves the list as the store last held it, with no broadcast.
func TestApplyStatus_AddedDirsPersistFailureRollsBack(t *testing.T) {
	h := newRepoHarness(t)
	sess := h.launched(t)
	root := scratchDir(t)
	infra := mkdir(t, filepath.Join(root, "infra"))
	docs := mkdir(t, filepath.Join(root, "docs"))
	h.postAdded(t, sess.ID, sess.Directory, infra)
	broadcasts := len(h.rec.all())
	require.NoError(t, h.st.Close())

	_, err := h.mgr.ApplyStatus(context.Background(), sess.ID, addedPost(sess.Directory, infra, docs))

	require.Error(t, err)
	assert.Equal(t, []string{infra}, dirPaths(h.get(t, sess.ID).AddedDirs))
	assert.Len(t, h.rec.all(), broadcasts)
}

// TestAddedDirs_ClonesAreNeverWrittenThrough: the list is replaced, never mutated, so a
// snapshot taken before a status post or a repo reading keeps what it saw.
func TestAddedDirs_ClonesAreNeverWrittenThrough(t *testing.T) {
	h := newRepoHarness(t)
	sess := h.launched(t)
	root := scratchDir(t)
	infra := mkdir(t, filepath.Join(root, "infra"))
	h.postAdded(t, sess.ID, sess.Directory, infra)
	snapshot := h.get(t, sess.ID)

	require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{AddedRepos: map[string]*LocationRepo{infra: repoOf("infra", "main")}}))
	h.postAdded(t, sess.ID, sess.Directory)

	assert.Equal(t, []Location{{Directory: infra}}, snapshot.AddedDirs)
}

// TestRecordLaunchAndResume_EmptyAddedDirs is the launch and resume half: both start the
// list empty (Claude re-reports it on its first post), and the post that follows brings it
// back; another session's list is not touched.
func TestRecordLaunchAndResume_EmptyAddedDirs(t *testing.T) {
	root := scratchDir(t)
	infra := mkdir(t, filepath.Join(root, "infra"))
	cases := []struct {
		name string
		run  func(h *repoHarness, id int64) error
	}{
		{"launch", func(h *repoHarness, id int64) error {
			_, err := h.mgr.RecordLaunch(context.Background(), id, "muster-x:@7", "%7")
			return err
		}},
		{"resume", func(h *repoHarness, id int64) error {
			_, err := h.mgr.RecordResume(context.Background(), id, "muster-x:@9", "%9")
			return err
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newRepoHarness(t)
			sess := h.launched(t)
			bystander := h.launched(t)
			h.postAdded(t, sess.ID, sess.Directory, infra)
			h.postAdded(t, bystander.ID, bystander.Directory, infra)
			require.Equal(t, []string{infra}, dirPaths(h.get(t, sess.ID).AddedDirs), "fixture: the list is held")
			bystanderBefore := h.get(t, bystander.ID)

			require.NoError(t, tc.run(h, sess.ID))

			assert.Empty(t, h.get(t, sess.ID).AddedDirs)
			assert.Empty(t, h.rowAdded(t, sess.ID), "the column is NULL, not an empty array")
			assert.Equal(t, bystanderBefore, h.get(t, bystander.ID))

			h.postAdded(t, sess.ID, sess.Directory, infra)
			assert.Equal(t, []string{infra}, dirPaths(h.get(t, sess.ID).AddedDirs), "the first post after brings it back")
		})
	}
}

// TestAddedDirs_ClearPairInEitherOrder covers edge cases 6 and 7: the old id's
// SessionEnd(clear) and the new id's SessionStart in either order, with a status post
// before, between or after, never empty the list (the session did not die) and the list is
// always what the last post reported. Persisted rows agree.
func TestAddedDirs_ClearPairInEitherOrder(t *testing.T) {
	root := scratchDir(t)
	a := mkdir(t, filepath.Join(root, "a"))
	b := mkdir(t, filepath.Join(root, "b"))
	c := mkdir(t, filepath.Join(root, "c"))

	type step string
	const (
		postAB step = "post [a b]"
		postBC step = "post [b c]"
		hint   step = "SessionEnd(clear) for the old id"
		rebind step = "SessionStart for the new id"
	)
	cases := []struct {
		steps []step
		want  []string
	}{
		{[]step{postAB, hint, rebind}, []string{a, b}},
		{[]step{postAB, rebind, hint}, []string{a, b}},
		{[]step{postAB, hint, rebind, postAB}, []string{a, b}},
		{[]step{postAB, rebind, hint, postAB}, []string{a, b}},
		{[]step{postAB, rebind, postBC, hint}, []string{b, c}},
		{[]step{postAB, hint, postBC, rebind}, []string{b, c}},
		{[]step{postAB, postBC, hint, rebind}, []string{b, c}},
		{[]step{postAB, postBC, rebind, hint}, []string{b, c}},
		{[]step{hint, rebind, postAB}, []string{a, b}},
		{[]step{rebind, postAB, hint}, []string{a, b}},
	}
	for _, tc := range cases {
		name := ""
		for _, s := range tc.steps {
			name += string(s) + "; "
		}
		t.Run(name, func(t *testing.T) {
			h := newRepoHarness(t)
			sess := h.launched(t)
			old := h.claudeID
			ctx := context.Background()

			for _, s := range tc.steps {
				switch s {
				case postAB:
					h.postAdded(t, sess.ID, sess.Directory, a, b)
				case postBC:
					h.postAdded(t, sess.ID, sess.Directory, b, c)
				case hint:
					_, err := h.mgr.Apply(ctx, sess.ID, old, nil, claudecode.StateInput{Kind: claudecode.KindClearDeathHint}, true)
					require.NoError(t, err)
				case rebind:
					_, err := h.mgr.Apply(ctx, sess.ID, "claude-after-clear", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
					require.NoError(t, err)
				}
			}

			got := h.get(t, sess.ID)
			assert.True(t, got.Alive, "a /clear is not a death")
			assert.Equal(t, tc.want, dirPaths(got.AddedDirs))
			assert.Equal(t, tc.want, h.rowAdded(t, sess.ID))
		})
	}
}

// TestAddedDirs_SurviveADaemonRestart covers edge case 10: an alive session's paths
// come back from the store, in order, with no reading (only paths persist), whether or not
// a /clear happened first; a session that never had any comes back with none.
func TestAddedDirs_SurviveADaemonRestart(t *testing.T) {
	root := scratchDir(t)
	infra := mkdir(t, filepath.Join(root, "infra"))
	docs := mkdir(t, filepath.Join(root, "docs"))
	cases := []struct {
		name  string
		setup func(t *testing.T, h *repoHarness, id int64)
		want  []string
	}{
		{"two directories with readings", func(t *testing.T, h *repoHarness, id int64) {
			h.postAdded(t, id, h.get(t, id).Directory, infra, docs)
			require.NoError(t, h.mgr.SetRepoState(context.Background(), id, RepoState{AddedRepos: map[string]*LocationRepo{infra: repoOf("infra", "main")}}))
		}, []string{infra, docs}},
		{"after a /clear", func(t *testing.T, h *repoHarness, id int64) {
			h.postAdded(t, id, h.get(t, id).Directory, docs, infra)
			_, err := h.mgr.Apply(context.Background(), id, "claude-after-clear", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
			require.NoError(t, err)
		}, []string{docs, infra}},
		{"none ever reported", func(*testing.T, *repoHarness, int64) {}, []string{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newRepoHarness(t)
			sess := h.launched(t)
			bystander := h.launched(t)
			h.postAdded(t, bystander.ID, bystander.Directory, docs)
			tc.setup(t, h, sess.ID)

			fresh := newTestManager(t, h.st, nil, nil)
			require.NoError(t, fresh.LoadAll(context.Background()))

			got, ok := fresh.Get(sess.ID)
			require.True(t, ok)
			assert.Equal(t, tc.want, dirPaths(got.AddedDirs))
			for _, d := range got.AddedDirs {
				assert.Nil(t, d.Repo, "readings are not persisted: the start-up poll re-reads them")
			}
			other, ok := fresh.Get(bystander.ID)
			require.True(t, ok)
			assert.Equal(t, []string{docs}, dirPaths(other.AddedDirs))
		})
	}
}

// TestRepoTargets_CarryAddedDirPaths: the poll's snapshot lists an alive session's added
// directories as paths, and none for a session that has none or is dead.
func TestRepoTargets_CarryAddedDirPaths(t *testing.T) {
	r := newEffortRig(t)
	root := scratchDir(t)
	infra := mkdir(t, filepath.Join(root, "infra"))
	docs := mkdir(t, filepath.Join(root, "docs"))
	withList := r.launch("", "")
	without := r.launch("", "")
	dead := r.launch("", "")
	r.postAdded(withList, infra, docs)
	r.postAdded(dead, infra)
	r.pc.setExists(r.get(dead).TmuxTarget, false)
	r.mgr.Nudge(r.ctx, dead)
	require.False(t, r.get(dead).Alive)

	byID := map[int64]RepoTarget{}
	for _, tg := range r.mgr.RepoTargets() {
		byID[tg.ID] = tg
	}

	assert.Equal(t, []string{infra, docs}, byID[withList].AddedDirs)
	assert.Empty(t, byID[without].AddedDirs)
	assert.Empty(t, byID[dead].AddedDirs)
}

// postAdded reports dirs the way a status post does: led by the launch directory.
func (r *effortRig) postAdded(id int64, dirs ...string) {
	r.t.Helper()
	_, err := r.mgr.ApplyStatus(r.ctx, id, addedPost(append([]string{r.dir}, dirs...)...))
	require.NoError(r.t, err)
}
