package session

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSetRepoState_AddedRepos is the session half: a reading sets the repo of
// each directory still listed, an unchanged one broadcasts nothing, a nil value means "read,
// not a checkout", an absent key keeps the last-known reading, and a reading that names a
// directory the list no longer holds is ignored for it.
func TestSetRepoState_AddedRepos(t *testing.T) {
	root := scratchDir(t)
	a := mkdir(t, filepath.Join(root, "a"))
	b := mkdir(t, filepath.Join(root, "b"))
	c := mkdir(t, filepath.Join(root, "c"))
	main := func(name string) *LocationRepo { return repoOf(name, "main") }

	cases := []struct {
		name string
		// held is the readings the session carries before the apply, by directory.
		held map[string]*LocationRepo
		// relist, when set, is the list the session holds when the reading lands (the reading
		// was taken against [a b]).
		relist      []string
		reading     map[string]*LocationRepo
		want        []Location
		wantUpserts int
	}{
		{
			name:        "a reading sets each directory's repo, nil for a non-checkout",
			reading:     map[string]*LocationRepo{a: main("a"), b: nil},
			want:        []Location{{Directory: a, Repo: main("a")}, {Directory: b}},
			wantUpserts: 1,
		},
		{
			name:    "an unchanged reading broadcasts nothing",
			held:    map[string]*LocationRepo{a: main("a")},
			reading: map[string]*LocationRepo{a: main("a"), b: nil},
			want:    []Location{{Directory: a, Repo: main("a")}, {Directory: b}},
		},
		{
			name:        "a new branch is one upsert",
			held:        map[string]*LocationRepo{a: main("a")},
			reading:     map[string]*LocationRepo{a: repoOf("a", "feat-x"), b: nil},
			want:        []Location{{Directory: a, Repo: repoOf("a", "feat-x")}, {Directory: b}},
			wantUpserts: 1,
		},
		{
			name:        "a worktree flag change is one upsert",
			held:        map[string]*LocationRepo{a: main("a")},
			reading:     map[string]*LocationRepo{a: {Name: "a", Branch: "main", IsWorktree: true}, b: nil},
			want:        []Location{{Directory: a, Repo: &LocationRepo{Name: "a", Branch: "main", IsWorktree: true}}, {Directory: b}},
			wantUpserts: 1,
		},
		{
			name:        "a nil value clears a held reading: no longer a checkout, or a detached HEAD",
			held:        map[string]*LocationRepo{a: main("a"), b: main("b")},
			reading:     map[string]*LocationRepo{a: nil, b: main("b")},
			want:        []Location{{Directory: a}, {Directory: b, Repo: main("b")}},
			wantUpserts: 1,
		},
		{
			name:    "D9: an absent key keeps the last-known reading (the directory is gone)",
			held:    map[string]*LocationRepo{a: main("a"), b: main("b")},
			reading: map[string]*LocationRepo{b: main("b")},
			want:    []Location{{Directory: a, Repo: main("a")}, {Directory: b, Repo: main("b")}},
		},
		{
			name:    "an empty reading changes nothing",
			held:    map[string]*LocationRepo{a: main("a")},
			reading: nil,
			want:    []Location{{Directory: a, Repo: main("a")}, {Directory: b}},
		},
		{
			name:        "D10: the list moved on, so only directories still listed take their reading",
			relist:      []string{b, c},
			reading:     map[string]*LocationRepo{a: main("a"), b: main("b")},
			want:        []Location{{Directory: b, Repo: main("b")}, {Directory: c}},
			wantUpserts: 1,
		},
		{
			name:    "D10: a reading of directories all dropped since is no change",
			relist:  []string{c},
			reading: map[string]*LocationRepo{a: main("a"), b: main("b")},
			want:    []Location{{Directory: c}},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newRepoHarness(t)
			sess := h.launched(t)
			bystander := h.launched(t)
			h.postAdded(t, bystander.ID, bystander.Directory, a)
			h.postAdded(t, sess.ID, sess.Directory, a, b)
			if tc.held != nil {
				require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{AddedRepos: tc.held}))
			}
			if tc.relist != nil {
				h.postAdded(t, sess.ID, append([]string{sess.Directory}, tc.relist...)...)
			}
			bystanderBefore := h.get(t, bystander.ID)
			before := len(h.rec.all())

			require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{AddedRepos: tc.reading}))

			assert.Equal(t, tc.want, h.get(t, sess.ID).AddedDirs)
			assert.Len(t, h.rec.all(), before+tc.wantUpserts)
			assert.Equal(t, bystanderBefore, h.get(t, bystander.ID), "another session is never touched")
			assert.Equal(t, dirPaths(tc.want), h.rowAdded(t, sess.ID), "the paths persist, never the readings")
		})
	}
}

// TestSetRepoState_AddedReposPersistFailureRollsBack: a reading whose persist fails leaves the
// held readings as they were and broadcasts nothing.
func TestSetRepoState_AddedReposPersistFailureRollsBack(t *testing.T) {
	h := newRepoHarness(t)
	sess := h.launched(t)
	root := scratchDir(t)
	a := mkdir(t, filepath.Join(root, "a"))
	h.postAdded(t, sess.ID, sess.Directory, a)
	require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{AddedRepos: map[string]*LocationRepo{a: repoOf("a", "main")}}))
	before := h.get(t, sess.ID)
	broadcasts := len(h.rec.all())
	require.NoError(t, h.st.Close())

	err := h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{AddedRepos: map[string]*LocationRepo{a: repoOf("a", "feat-x")}})

	require.Error(t, err)
	assert.Equal(t, before, h.get(t, sess.ID))
	assert.Len(t, h.rec.all(), broadcasts)
}

// TestSetRepoState_AddedReposOfADeadOrResumedSession is the death half: a reading of added
// directories taken while the session was alive and applied after it died, or after a death
// and a resume, is dropped whole; the resumed session's own reading applies.
func TestSetRepoState_AddedReposOfADeadOrResumedSession(t *testing.T) {
	root := scratchDir(t)
	a := mkdir(t, filepath.Join(root, "a"))
	for _, resume := range []bool{false, true} {
		name := "still dead"
		if resume {
			name = "resumed and re-reported"
		}
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			h := newDeathHarness(t)
			sess := h.session(t)
			_, err := h.mgr.ApplyStatus(ctx, sess.ID, addedPost(sess.Directory, a))
			require.NoError(t, err)
			target := h.target(t, sess.ID)
			require.Equal(t, []string{a}, target.AddedDirs, "fixture: the target carries the list")
			stale := RepoState{Branch: strPtr("main"), AddedRepos: map[string]*LocationRepo{a: repoOf("a", "made-after-death")}, Epoch: target.Epoch}

			h.kill(t, sess.ID)
			if resume {
				_, err := h.mgr.RecordResume(ctx, sess.ID, "muster-x:@9", "%9")
				require.NoError(t, err)
				_, err = h.mgr.ApplyStatus(ctx, sess.ID, addedPost(sess.Directory, a))
				require.NoError(t, err)
			}
			broadcasts := len(h.rec.all())

			require.NoError(t, h.mgr.SetRepoState(ctx, sess.ID, stale))

			got, _ := h.mgr.Get(sess.ID)
			if resume {
				assert.Equal(t, []Location{{Directory: a}}, got.AddedDirs, "the stale reading does not reach the resumed session")
			} else {
				assert.Empty(t, got.AddedDirs)
			}
			assert.Len(t, h.rec.all(), broadcasts)

			if resume {
				fresh := h.target(t, sess.ID)
				require.NoError(t, h.mgr.SetRepoState(ctx, sess.ID, RepoState{Branch: strPtr("main"), AddedRepos: map[string]*LocationRepo{a: repoOf("a", "fresh")}, Epoch: fresh.Epoch}))
				got, _ = h.mgr.Get(sess.ID)
				assert.Equal(t, []Location{{Directory: a, Repo: repoOf("a", "fresh")}}, got.AddedDirs)
			}
		})
	}
}
