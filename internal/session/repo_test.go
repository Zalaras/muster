package session

import (
	"context"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

// repoHarness is a Manager wired with a recording OnUpsert and OnClaudeDirChange, so a test
// can assert how many broadcasts and nudges a call produced and what was already on disk
// when the nudge fired.
type repoHarness struct {
	mgr    *Manager
	st     *store.Store
	rec    *upsertsRecorder
	nudges atomic.Int32

	mu         sync.Mutex
	dirOnNudge []string // the persisted claude_dir each nudge observed
	sessID     int64    // the session whose row the nudge reads back
	claudeID   string   // the Claude session id the last launched session bound
}

func newRepoHarness(t *testing.T) *repoHarness {
	t.Helper()
	h := &repoHarness{st: openTestStore(t), rec: &upsertsRecorder{}}
	h.mgr = newTestManager(t, h.st, nil, h.rec.record, func(c *Config) {
		c.OnClaudeDirChange = func() {
			h.nudges.Add(1)
			h.mu.Lock()
			defer h.mu.Unlock()
			row, err := h.st.GetSession(context.Background(), h.sessID)
			if err == nil && row.ClaudeDir != nil {
				h.dirOnNudge = append(h.dirOnNudge, *row.ClaudeDir)
			} else {
				h.dirOnNudge = append(h.dirOnNudge, "")
			}
		}
	})
	return h
}

// launched creates a launched, bound session in its own scratch directory.
func (h *repoHarness) launched(t *testing.T) *Session {
	t.Helper()
	sess := createLaunchedSession(t, h.mgr, h.st, t.TempDir())
	claudeID := "claude-" + strconv.FormatInt(sess.ID, 10)
	_, err := h.mgr.Apply(context.Background(), sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	h.mu.Lock()
	h.sessID = sess.ID
	h.claudeID = claudeID
	h.mu.Unlock()
	return sess
}

func (h *repoHarness) get(t *testing.T, id int64) *Session {
	t.Helper()
	s, ok := h.mgr.Get(id)
	require.True(t, ok)
	return s
}

// TestApplyAndApplyStatus_AdoptCwdAndNudgeOnce is D5: a changed Cwd is persisted as
// ClaudeDir and fires the nudge exactly once, after the persist; the same Cwd again, an
// empty one and an absent one persist nothing and nudge nothing.
func TestApplyAndApplyStatus_AdoptCwdAndNudgeOnce(t *testing.T) {
	sources := []struct {
		name  string
		apply func(h *repoHarness, s *Session, cwd *string) error
	}{
		{"hook via Apply", func(h *repoHarness, s *Session, cwd *string) error {
			_, err := h.mgr.Apply(context.Background(), s.ID, h.claudeID, nil, claudecode.StateInput{Kind: claudecode.KindInert, Cwd: cwd}, true)
			return err
		}},
		{"status line via ApplyStatus", func(h *repoHarness, s *Session, cwd *string) error {
			_, err := h.mgr.ApplyStatus(context.Background(), s.ID, claudecode.StatusUpdate{Cwd: cwd})
			return err
		}},
	}
	for _, src := range sources {
		t.Run(src.name, func(t *testing.T) {
			h := newRepoHarness(t)
			sess := h.launched(t)

			require.NoError(t, src.apply(h, sess, strPtr("/work/a")))
			assert.Equal(t, "/work/a", h.get(t, sess.ID).ClaudeDir)
			assert.EqualValues(t, 1, h.nudges.Load(), "a first report nudges once")
			assert.Equal(t, []string{"/work/a"}, h.dirOnNudge, "the nudge fires after the directory is persisted, never before")
			row, err := h.st.GetSession(context.Background(), sess.ID)
			require.NoError(t, err)
			require.NotNil(t, row.ClaudeDir)
			assert.Equal(t, "/work/a", *row.ClaudeDir)

			require.NoError(t, src.apply(h, sess, strPtr("/work/a")))
			require.NoError(t, src.apply(h, sess, strPtr("")))
			require.NoError(t, src.apply(h, sess, nil))
			assert.EqualValues(t, 1, h.nudges.Load(), "a duplicate, an empty and an absent cwd nudge nothing")
			assert.Equal(t, "/work/a", h.get(t, sess.ID).ClaudeDir, "empty and absent never clear the recorded directory")

			require.NoError(t, src.apply(h, sess, strPtr("/work/b")))
			assert.EqualValues(t, 2, h.nudges.Load(), "a move nudges once more")
			assert.Equal(t, "/work/b", h.get(t, sess.ID).ClaudeDir)
		})
	}
}

// TestApplyStatus_CwdOnlyChangePersistsWithoutBroadcasting: the wire object is unchanged
// until the repo poll derives claudeLocation, so a status post that only moves the directory
// persists quietly; an Apply of the same kind broadcasts as it always did.
func TestApplyStatus_CwdOnlyChangePersistsWithoutBroadcasting(t *testing.T) {
	h := newRepoHarness(t)
	sess := h.launched(t)
	before := len(h.rec.all())

	_, err := h.mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/a")})
	require.NoError(t, err)

	assert.Len(t, h.rec.all(), before, "no sessionUpsert for a directory-only status change")
	row, err := h.st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	require.NotNil(t, row.ClaudeDir)
	assert.Equal(t, "/work/a", *row.ClaudeDir)
}

// TestApply_PersistFailureRollsBackCwdAndDoesNotNudge: a nudge for a directory the DB never
// recorded would derive a location from state that is about to be rolled back.
func TestApply_PersistFailureRollsBackCwdAndDoesNotNudge(t *testing.T) {
	cases := []struct {
		name string
		call func(h *repoHarness, s *Session) error
	}{
		{"Apply", func(h *repoHarness, s *Session) error {
			_, err := h.mgr.Apply(context.Background(), s.ID, h.claudeID, nil, claudecode.StateInput{Kind: claudecode.KindInert, Cwd: strPtr("/work/a")}, true)
			return err
		}},
		{"ApplyStatus", func(h *repoHarness, s *Session) error {
			_, err := h.mgr.ApplyStatus(context.Background(), s.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/a")})
			return err
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newRepoHarness(t)
			sess := h.launched(t)
			require.NoError(t, h.st.Close())

			require.Error(t, tc.call(h, sess))

			assert.Empty(t, h.get(t, sess.ID).ClaudeDir)
			assert.Zero(t, h.nudges.Load())
		})
	}
}

// TestRecordLaunchAndResume_ClearClaudeDirAndLocation is D9 / REQ-7: both clear the recorded
// directory and the derived location, in memory and in the row.
func TestRecordLaunchAndResume_ClearClaudeDirAndLocation(t *testing.T) {
	cases := []struct {
		name string
		call func(h *repoHarness, s *Session) error
	}{
		{"RecordLaunch", func(h *repoHarness, s *Session) error {
			_, err := h.mgr.RecordLaunch(context.Background(), s.ID, "muster-x:@9", "%9")
			return err
		}},
		{"RecordResume", func(h *repoHarness, s *Session) error {
			_, err := h.mgr.RecordResume(context.Background(), s.ID, "muster-x:@9", "%9")
			return err
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newRepoHarness(t)
			sess := h.launched(t)
			_, err := h.mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/wt")})
			require.NoError(t, err)
			require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{
				Branch: strPtr("main"), ClaudeDir: "/work/wt",
				Location: &Location{Directory: "/work/wt", Repo: &LocationRepo{Name: "wt", Branch: "wt-b", IsWorktree: true}},
			}))
			require.NotNil(t, h.get(t, sess.ID).ClaudeLocation, "fixture: the session starts moved")

			require.NoError(t, tc.call(h, sess))

			got := h.get(t, sess.ID)
			assert.Empty(t, got.ClaudeDir)
			assert.Nil(t, got.ClaudeLocation)
			row, err := h.st.GetSession(context.Background(), sess.ID)
			require.NoError(t, err)
			assert.Nil(t, row.ClaudeDir, "the column is NULL again, not an empty string")
		})
	}
}

// TestCheckLiveness_DeadSessionHasNoLocationButKeepsItsDirectory is REQ-5's dead half: the
// derived location goes to nil when the pane dies, while the recorded directory stays so the
// row still says where Claude last was.
func TestCheckLiveness_DeadSessionHasNoLocationButKeepsItsDirectory(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	_, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/wt")})
	require.NoError(t, err)
	require.NoError(t, mgr.SetRepoState(context.Background(), sess.ID, RepoState{
		Branch: strPtr("main"), ClaudeDir: "/work/wt", Location: &Location{Directory: "/work/wt"},
	}))
	cur, _ := mgr.Get(sess.ID)
	pc.setExists(cur.TmuxTarget, false)

	mgr.checkLiveness(context.Background())

	got, _ := mgr.Get(sess.ID)
	assert.False(t, got.Alive)
	assert.Nil(t, got.ClaudeLocation)
	assert.Equal(t, "/work/wt", got.ClaudeDir)
	assert.Equal(t, "main", *got.Branch, "a dead card keeps its last-known branch")
}

// TestLoadAll_RestoresClaudeDirButNotTheDerivedLocation is the manager half of D7: the
// recorded directory survives a restart, the derived location does not (it is in memory
// only), so the repo poll's first tick has something to derive from.
func TestLoadAll_RestoresClaudeDirButNotTheDerivedLocation(t *testing.T) {
	h := newRepoHarness(t)
	sess := h.launched(t)
	_, err := h.mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/wt")})
	require.NoError(t, err)
	require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{
		Branch: strPtr("fix"), IsWorktree: true, ClaudeDir: "/work/wt", Location: &Location{Directory: "/work/wt"},
	}))

	mgr2 := newTestManager(t, h.st, nil, nil)
	require.NoError(t, mgr2.LoadAll(context.Background()))

	got, ok := mgr2.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "/work/wt", got.ClaudeDir)
	assert.Nil(t, got.ClaudeLocation)
	require.NotNil(t, got.Branch)
	assert.Equal(t, "fix", *got.Branch, "a refreshed branch survives a restart")
	assert.True(t, got.IsWorktree)
	targets := mgr2.RepoTargets()
	require.Len(t, targets, 1)
	assert.Equal(t, "/work/wt", targets[0].ClaudeDir)
}

func TestRepoTargets_ListsEverySessionWithItsDirectories(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)
	a := createLaunchedSession(t, mgr, st, t.TempDir())
	b := createLaunchedSession(t, mgr, st, t.TempDir())
	_, err := mgr.ApplyStatus(context.Background(), b.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/b")})
	require.NoError(t, err)
	as, _ := mgr.Get(a.ID)
	pc.setExists(as.TmuxTarget, true)
	bs, _ := mgr.Get(b.ID)
	pc.setExists(bs.TmuxTarget, false)
	mgr.checkLiveness(context.Background())

	byID := map[int64]RepoTarget{}
	for _, tg := range mgr.RepoTargets() {
		byID[tg.ID] = tg
	}

	require.Len(t, byID, 2)
	assert.Equal(t, RepoTarget{ID: a.ID, Directory: a.Directory, Alive: true}, byID[a.ID])
	assert.Equal(t, RepoTarget{ID: b.ID, Directory: b.Directory, ClaudeDir: "/work/b", Alive: false, Epoch: 1}, byID[b.ID])
}

// TestSetRepoState covers the broadcast-on-real-change contract and the stale-reading guard.
func TestSetRepoState(t *testing.T) {
	loc := func(dir, branch string) *Location {
		return &Location{Directory: dir, Repo: &LocationRepo{Name: "wt", Branch: branch}}
	}

	t.Run("a changed branch persists and broadcasts once; the same reading again does neither", func(t *testing.T) {
		h := newRepoHarness(t)
		sess := h.launched(t)
		before := len(h.rec.all())

		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("fix"), IsWorktree: true}))
		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("fix"), IsWorktree: true}))

		assert.Len(t, h.rec.all(), before+1)
		row, err := h.st.GetSession(context.Background(), sess.ID)
		require.NoError(t, err)
		require.NotNil(t, row.Branch)
		assert.Equal(t, "fix", *row.Branch)
		assert.True(t, row.IsWorktree)
	})

	t.Run("a detached HEAD (nil branch) clears the branch", func(t *testing.T) {
		h := newRepoHarness(t)
		sess := h.launched(t)
		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("fix")}))
		before := len(h.rec.all())

		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: nil}))

		assert.Nil(t, h.get(t, sess.ID).Branch)
		assert.Len(t, h.rec.all(), before+1)
		row, err := h.st.GetSession(context.Background(), sess.ID)
		require.NoError(t, err)
		assert.Nil(t, row.Branch)
	})

	t.Run("only the worktree flag changing is a change", func(t *testing.T) {
		h := newRepoHarness(t)
		sess := h.launched(t)
		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("fix")}))
		before := len(h.rec.all())

		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("fix"), IsWorktree: true}))

		assert.Len(t, h.rec.all(), before+1)
	})

	t.Run("a re-derived but identical location is not a change", func(t *testing.T) {
		h := newRepoHarness(t)
		sess := h.launched(t)
		_, err := h.mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/wt")})
		require.NoError(t, err)
		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("main"), ClaudeDir: "/work/wt", Location: loc("/work/wt", "a")}))
		before := len(h.rec.all())

		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("main"), ClaudeDir: "/work/wt", Location: loc("/work/wt", "a")}))
		assert.Len(t, h.rec.all(), before, "same value, new pointer: nothing broadcast")

		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("main"), ClaudeDir: "/work/wt", Location: loc("/work/wt", "b")}))
		assert.Len(t, h.rec.all(), before+1, "the location's branch moved")
		assert.Equal(t, "b", h.get(t, sess.ID).ClaudeLocation.Repo.Branch)

		require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("main"), ClaudeDir: "/work/wt", Location: nil}))
		assert.Len(t, h.rec.all(), before+2, "Claude came back: the location clears")
		assert.Nil(t, h.get(t, sess.ID).ClaudeLocation)
	})

	t.Run("a location for a dead session is dropped", func(t *testing.T) {
		st := openTestStore(t)
		pc := newFakePaneChecker()
		mgr := newTestManager(t, st, pc, nil)
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/wt")})
		require.NoError(t, err)
		cur, _ := mgr.Get(sess.ID)
		pc.setExists(cur.TmuxTarget, false)
		mgr.checkLiveness(context.Background())

		require.NoError(t, mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("main"), ClaudeDir: "/work/wt", Location: loc("/work/wt", "a")}))

		got, _ := mgr.Get(sess.ID)
		assert.Nil(t, got.ClaudeLocation, "REQ-5: claudeLocation is non-null only while alive")
	})

	t.Run("a reading derived from a directory that has since changed or cleared is dropped", func(t *testing.T) {
		for _, tc := range []struct {
			name   string
			finish func(h *repoHarness, s *Session)
		}{
			{"claude moved again", func(h *repoHarness, s *Session) {
				_, err := h.mgr.ApplyStatus(context.Background(), s.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/other")})
				require.NoError(t, err)
			}},
			{"a resume cleared it", func(h *repoHarness, s *Session) {
				_, err := h.mgr.RecordResume(context.Background(), s.ID, "muster-x:@9", "%9")
				require.NoError(t, err)
			}},
		} {
			t.Run(tc.name, func(t *testing.T) {
				h := newRepoHarness(t)
				sess := h.launched(t)
				_, err := h.mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Cwd: strPtr("/work/wt")})
				require.NoError(t, err)
				stale := RepoState{Branch: strPtr("main"), ClaudeDir: "/work/wt", Location: loc("/work/wt", "a")}
				tc.finish(h, sess)

				require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, stale))

				assert.Nil(t, h.get(t, sess.ID).ClaudeLocation, "the stale location must not be resurrected")
			})
		}
	})

	t.Run("an unknown session is ErrUnknownSession", func(t *testing.T) {
		h := newRepoHarness(t)

		assert.ErrorIs(t, h.mgr.SetRepoState(context.Background(), 999, RepoState{Branch: strPtr("x")}), ErrUnknownSession)
	})

	t.Run("a persist failure rolls the reading back and broadcasts nothing", func(t *testing.T) {
		h := newRepoHarness(t)
		sess := h.launched(t)
		before := h.get(t, sess.ID)
		broadcasts := len(h.rec.all())
		require.NoError(t, h.st.Close())

		require.Error(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("fix"), IsWorktree: true}))

		assert.Equal(t, before, h.get(t, sess.ID))
		assert.Len(t, h.rec.all(), broadcasts)
	})

	t.Run("a bystander session is never touched", func(t *testing.T) {
		h := newRepoHarness(t)
		a := h.launched(t)
		b := h.launched(t)
		bBefore := h.get(t, b.ID)
		broadcasts := h.rec.all()

		require.NoError(t, h.mgr.SetRepoState(context.Background(), a.ID, RepoState{Branch: strPtr("fix"), IsWorktree: true}))

		assert.Equal(t, bBefore, h.get(t, b.ID))
		after := h.rec.all()
		require.Len(t, after, len(broadcasts)+1)
		assert.Equal(t, a.ID, after[len(after)-1].ID, "the only broadcast is for the session that changed")
	})
}

// deathHarness is a Manager whose panes a test can kill, so a session dies through the real
// checkLiveness -> markEnded path rather than by a hand-set flag.
type deathHarness struct {
	mgr *Manager
	st  *store.Store
	pc  *fakePaneChecker
	rec *upsertsRecorder
}

func newDeathHarness(t *testing.T) *deathHarness {
	t.Helper()
	h := &deathHarness{st: openTestStore(t), pc: newFakePaneChecker(), rec: &upsertsRecorder{}}
	h.mgr = newTestManager(t, h.st, h.pc, h.rec.record)
	return h
}

// session launches a session in its own directory whose pane exists, with branch "main" read.
func (h *deathHarness) session(t *testing.T) *Session {
	t.Helper()
	sess := createLaunchedSession(t, h.mgr, h.st, t.TempDir())
	cur, _ := h.mgr.Get(sess.ID)
	h.pc.setExists(cur.TmuxTarget, true)
	require.NoError(t, h.mgr.SetRepoState(context.Background(), sess.ID, RepoState{Branch: strPtr("main")}))
	return sess
}

func (h *deathHarness) kill(t *testing.T, id int64) {
	t.Helper()
	cur, _ := h.mgr.Get(id)
	h.pc.setExists(cur.TmuxTarget, false)
	h.mgr.checkLiveness(context.Background())
	got, _ := h.mgr.Get(id)
	require.False(t, got.Alive, "fixture: the session died")
}

func (h *deathHarness) target(t *testing.T, id int64) RepoTarget {
	t.Helper()
	for _, tg := range h.mgr.RepoTargets() {
		if tg.ID == id {
			return tg
		}
	}
	require.FailNow(t, "no repo target for session")
	return RepoTarget{}
}

// TestSetRepoState_DropsAReadingTakenBeforeTheSessionDied is the whole-reading half of
// "a dead session keeps its last-known repo": a reading snapshotted while the session was
// alive and applied after it died is dropped in full (branch and worktree flag included),
// whether the session is still dead or a resume made it alive again before the apply. The
// "resumed, no recorded directory" row is the one only the death counter can see: Alive is
// true again and ClaudeDir matches on both sides.
func TestSetRepoState_DropsAReadingTakenBeforeTheSessionDied(t *testing.T) {
	cases := []struct {
		name   string
		cwd    string // Claude's recorded directory when the reading was taken ("" = none)
		resume bool
		// a hand-built reading whose epoch equals the death count at apply time: only the
		// session being dead can drop it
		matchingEpoch bool
	}{
		{name: "still dead, reading carried a recorded directory", cwd: "/work/wt"},
		{name: "still dead, reading's epoch equals the death count", matchingEpoch: true},
		{name: "still dead, no recorded directory"},
		{name: "resumed, reading carried a recorded directory (the resume cleared it)", cwd: "/work/wt", resume: true},
		{name: "resumed, no recorded directory on either side", resume: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			h := newDeathHarness(t)
			sess := h.session(t)
			if tc.cwd != "" {
				_, err := h.mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Cwd: strPtr(tc.cwd)})
				require.NoError(t, err)
			}
			target := h.target(t, sess.ID)
			require.EqualValues(t, 0, target.Epoch, "fixture: no death yet")
			reading := RepoState{Branch: strPtr("made-after-death"), IsWorktree: true, ClaudeDir: target.ClaudeDir, Epoch: target.Epoch}
			if tc.cwd != "" {
				reading.Location = &Location{Directory: tc.cwd, Repo: &LocationRepo{Name: "wt", Branch: "wt-b"}}
			}

			h.kill(t, sess.ID)
			if tc.matchingEpoch {
				reading.Epoch = h.target(t, sess.ID).Epoch
			}
			if tc.resume {
				_, err := h.mgr.RecordResume(ctx, sess.ID, "muster-x:@9", "%9")
				require.NoError(t, err)
			}
			broadcasts := len(h.rec.all())

			require.NoError(t, h.mgr.SetRepoState(ctx, sess.ID, reading))

			got, _ := h.mgr.Get(sess.ID)
			require.NotNil(t, got.Branch)
			assert.Equal(t, "main", *got.Branch, "the dead session's last-known branch survives")
			assert.False(t, got.IsWorktree)
			assert.Nil(t, got.ClaudeLocation)
			assert.Len(t, h.rec.all(), broadcasts, "a dropped reading broadcasts nothing")
			row, err := h.st.GetSession(ctx, sess.ID)
			require.NoError(t, err)
			require.NotNil(t, row.Branch)
			assert.Equal(t, "main", *row.Branch, "and writes nothing")
			assert.False(t, row.IsWorktree)
			if tc.resume {
				fresh := h.target(t, sess.ID)
				assert.EqualValues(t, 1, fresh.Epoch)
				require.NoError(t, h.mgr.SetRepoState(ctx, sess.ID, RepoState{Branch: strPtr("fresh"), ClaudeDir: fresh.ClaudeDir, Epoch: fresh.Epoch}))
				got, _ = h.mgr.Get(sess.ID)
				require.NotNil(t, got.Branch)
				assert.Equal(t, "fresh", *got.Branch, "the resumed session's next reading, taken after the death, applies")
			}
		})
	}
}

// TestSetRepoState_ADeathThatFailedToPersistDoesNotDropAGoodReading: the session never
// ended (the DB still says alive and the flip rolled back), so the epoch rolls back with
// Alive and a reading taken before the attempted death still applies. The next real death
// bumps it again and the same reading is then stale.
func TestSetRepoState_ADeathThatFailedToPersistDoesNotDropAGoodReading(t *testing.T) {
	ctx := context.Background()
	h := newDeathHarness(t)
	sess := h.session(t)
	target := h.target(t, sess.ID)
	reading := RepoState{Branch: strPtr("checked-out"), IsWorktree: true, Epoch: target.Epoch}

	canceled, cancel := context.WithCancel(ctx)
	cancel()
	_, err := h.mgr.markEnded(canceled, sess.ID)
	require.Error(t, err, "fixture: the death's persist failed")
	got, _ := h.mgr.Get(sess.ID)
	require.True(t, got.Alive, "fixture: the failed death rolled back")
	assert.Equal(t, target.Epoch, h.target(t, sess.ID).Epoch, "the epoch rolled back with Alive")

	require.NoError(t, h.mgr.SetRepoState(ctx, sess.ID, reading))

	got, _ = h.mgr.Get(sess.ID)
	require.NotNil(t, got.Branch)
	assert.Equal(t, "checked-out", *got.Branch, "a good reading of a session that never ended applies")
	assert.True(t, got.IsWorktree)

	h.kill(t, sess.ID)
	require.NoError(t, h.mgr.SetRepoState(ctx, sess.ID, RepoState{Branch: strPtr("late"), Epoch: target.Epoch}))
	got, _ = h.mgr.Get(sess.ID)
	assert.Equal(t, "checked-out", *got.Branch, "after the real death the same epoch is stale")
}

// TestSetRepoState_ASessionsDeathLeavesItsNeighboursReadingsApplying: the epoch is per
// session, so one session dying drops only its own in-flight reading.
func TestSetRepoState_ASessionsDeathLeavesItsNeighboursReadingsApplying(t *testing.T) {
	ctx := context.Background()
	h := newDeathHarness(t)
	dying := h.session(t)
	survivor := h.session(t)
	dyingTarget := h.target(t, dying.ID)
	survivorTarget := h.target(t, survivor.ID)

	h.kill(t, dying.ID)

	assert.EqualValues(t, 1, h.target(t, dying.ID).Epoch)
	assert.EqualValues(t, 0, h.target(t, survivor.ID).Epoch, "the survivor's epoch did not move")
	require.NoError(t, h.mgr.SetRepoState(ctx, dying.ID, RepoState{Branch: strPtr("stale"), Epoch: dyingTarget.Epoch}))
	require.NoError(t, h.mgr.SetRepoState(ctx, survivor.ID, RepoState{Branch: strPtr("fix"), IsWorktree: true, Epoch: survivorTarget.Epoch}))

	d, _ := h.mgr.Get(dying.ID)
	s, _ := h.mgr.Get(survivor.ID)
	assert.Equal(t, "main", *d.Branch, "the dead session's reading was dropped")
	require.NotNil(t, s.Branch)
	assert.Equal(t, "fix", *s.Branch, "the neighbour's reading, snapshotted before the other's death, applies")
	assert.True(t, s.IsWorktree)
}
