package session

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// TestApplyInput_Unread_INV1 covers the half of the unread ⇒ idle invariant
// (unread ⇒ idle) that lives in applyInput/setState: setState (session.go) clears Unread
// unconditionally whenever the target state is not idle — the single choke point every
// applyInput arm routes through — whatever the source state or whether the transition is
// a genuine state change. Crossed against every one of the six displayed source states
// and both Unread seeds (kb:lesson/invariant-missed-by-per-transition-tests: a narrower
// per-transition test starting from one convenient state proves nothing about the
// invariant). Manager.Apply is the only place that ever sets Unread *true* — after a
// turn_closed input, per the Watcher's answer — covered separately in
// manager_rail_test.go's TestApply_TurnClosed_SetsUnreadFromWatcher, since applyInput
// itself never reads a Watcher; this test's own turn_closed row instead documents that
// applyInput leaves Unread untouched for that Kind (Manager.Apply's exclusive turf).
func TestApplyInput_Unread_INV1(t *testing.T) {
	sourceStates := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}

	cases := []struct {
		name   string
		kind   claudecode.InputKind
		closed bool // promptID "p1" pre-seeded into closedPromptIDs
		marked bool // FromSubagent
		clears bool // true: Unread must be false after, whatever it was seeded to;
		// false: Unread must equal the seeded value, untouched.
	}{
		{"bind_unchanged_claude_id", claudecode.KindBind, false, false, true},
		{"clear_rebind_explicit", claudecode.KindClearRebind, false, false, true},
		{"resume_bind_same_claude_id", claudecode.KindResumeBind, false, false, false},
		{"turn_activity_open_prompt", claudecode.KindTurnActivity, false, false, true},
		{"turn_activity_closed_prompt_subagent_marked", claudecode.KindTurnActivity, true, true, true},
		{"turn_activity_closed_prompt_unmarked_straggler", claudecode.KindTurnActivity, true, false, false},
		{"needs_input_permission_open_prompt", claudecode.KindNeedsInputPermission, false, false, true},
		{"needs_input_permission_closed_prompt_subagent_marked", claudecode.KindNeedsInputPermission, true, true, true},
		{"needs_input_permission_closed_prompt_unmarked_straggler", claudecode.KindNeedsInputPermission, true, false, false},
		{"idle_notice_fresh_prompt", claudecode.KindIdleNotice, false, false, false},
		{"idle_notice_closed_prompt_straggler", claudecode.KindIdleNotice, true, false, false},
		{"turn_failed", claudecode.KindTurnFailed, false, false, true},
		{"turn_closed_owned_by_manager_not_applyinput", claudecode.KindTurnClosed, false, false, false},
		{"death_hint", claudecode.KindDeathHint, false, false, false},
		{"clear_death_hint", claudecode.KindClearDeathHint, false, false, false},
		{"inert", claudecode.KindInert, false, false, false},
	}

	for _, from := range sourceStates {
		for _, seedUnread := range []bool{true, false} {
			for _, tc := range cases {
				t.Run(string(from)+"/"+tc.name+"/unread_seed_"+boolLabel(seedUnread), func(t *testing.T) {
					sess := newTestSession()
					sess.State = from
					sess.StateSince = fixedNow
					sess.ClaudeSessionID = "c1" // fixed and matching on every call below, so no
					// bind-family case here ever escalates to an id-change rebind — each row
					// exercises its own named Kind, not the escalation path (already covered by
					// machine_test.go's own Bind/ClearRebind/ResumeBind suites).
					sess.Unread = seedUnread
					if tc.closed {
						sess.closedPromptIDs = []string{"p1"}
					}

					promptID := "p1"
					in := claudecode.StateInput{Kind: tc.kind, FromSubagent: tc.marked}
					applyInput(sess, "c1", &promptID, in, laterNow())

					if tc.clears {
						assert.False(t, sess.Unread, "INV-1: %s must clear Unread (setState's target state is non-idle)", tc.name)
						return
					}
					assert.Equal(t, seedUnread, sess.Unread, "INV-1: %s must never touch Unread", tc.name)
				})
			}
		}
	}
}

func boolLabel(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// TestApplyInput_TurnActivity_PromptHandling: KindTurnActivity
// stores the adapter-supplied prompt on Session.LastPrompt truncated to 200 characters
// (mirroring lastActivity's own truncate), leaves it untouched when the adapter supplied
// none, and — because the straggler early-return in the closed/unmarked case happens
// before the Prompt is ever read (machine.go's guard runs first) — a closed-prompt
// straggler carrying a Prompt still leaves LastPrompt exactly as it was (Edge Case 10).
func TestApplyInput_TurnActivity_PromptHandling(t *testing.T) {
	t.Run("truncates a long prompt to 200 characters", func(t *testing.T) {
		sess := newTestSession()
		long := strings.Repeat("a", 250)
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &long}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Len(t, *sess.LastPrompt, 200)
		assert.Equal(t, long[:200], *sess.LastPrompt)
	})

	t.Run("a short prompt is stored verbatim", func(t *testing.T) {
		sess := newTestSession()
		short := "fix the flaky retry"
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &short}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, short, *sess.LastPrompt)
	})

	t.Run("no Prompt on the input leaves LastPrompt unchanged", func(t *testing.T) {
		sess := newTestSession()
		existing := "earlier prompt"
		sess.LastPrompt = &existing
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "earlier prompt", *sess.LastPrompt)
	})

	t.Run("a closed-prompt unmarked straggler never touches LastPrompt even when Prompt is present", func(t *testing.T) {
		sess := newTestSession()
		existing := "earlier prompt"
		sess.LastPrompt = &existing
		sess.closedPromptIDs = []string{"p1"}
		promptID := "p1"
		newText := "a stale re-post of the same prompt"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &newText}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "earlier prompt", *sess.LastPrompt, "Edge Case 10: a straggler must not overwrite lastPrompt")
	})
}

// TestApplyBind_LastPrompt covers the bind-family clauses: an explicit clear-rebind (a
// fresh /clear conversation) resets LastPrompt to nil regardless of what it held, an
// id-change escalation to clear-rebind does the same, a same-claude-id resume-bind
// leaves it completely untouched, and a plain bind with an unchanged claude id (no
// rebind at all) leaves it untouched too.
func TestApplyBind_LastPrompt(t *testing.T) {
	t.Run("explicit clear-rebind resets LastPrompt to nil", func(t *testing.T) {
		sess := newTestSession()
		existing := "before the clear"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "old-id"

		applyInput(sess, "new-id", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, fixedNow)

		assert.Nil(t, sess.LastPrompt)
	})

	t.Run("an id-change escalation to clear-rebind also resets LastPrompt to nil", func(t *testing.T) {
		sess := newTestSession()
		existing := "before the clear"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "old-id"

		applyInput(sess, "new-id", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Nil(t, sess.LastPrompt)
	})

	t.Run("a same-claude-id resume-bind leaves LastPrompt untouched", func(t *testing.T) {
		sess := newTestSession()
		existing := "before the resume"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "claude-1"

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "before the resume", *sess.LastPrompt)
	})

	t.Run("a plain bind with an unchanged claude id leaves LastPrompt untouched", func(t *testing.T) {
		sess := newTestSession()
		existing := "still here"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "claude-1"

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "still here", *sess.LastPrompt)
	})
}

func setUnreadRig(t *testing.T, state State, unread bool) (*Manager, *upsertsRecorder, *Session) {
	t.Helper()
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	advanceToState(t, mgr, sess.ID, "claude-1", state, true)
	if state == StateIdle && !unread {
		require.NoError(t, mgr.MarkSeen(context.Background(), sess.ID))
	}
	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, state, got.State)
	require.Equal(t, unread, got.Unread, "seed: an unwatched turn close leaves an idle card unread")
	return mgr, rec, got
}

// TestSetUnread_FromEveryReachableState crosses both requested values against every
// displayed state and both reachable Unread seeds (Unread true exists only on idle),
// asserting unread-implies-idle after, the broadcast count and the persisted row.
func TestSetUnread_FromEveryReachableState(t *testing.T) {
	type seed struct {
		state  State
		unread bool
	}
	seeds := []seed{
		{StateStarted, false}, {StatePlanning, false}, {StateWorking, false},
		{StateNeedsInput, false}, {StateFailed, false},
		{StateIdle, false}, {StateIdle, true},
	}
	for _, sd := range seeds {
		for _, want := range []bool{true, false} {
			name := string(sd.state) + "/seed_" + boolLabel(sd.unread) + "/set_" + boolLabel(want)
			t.Run(name, func(t *testing.T) {
				mgr, rec, before := setUnreadRig(t, sd.state, sd.unread)
				broadcastsBefore := len(rec.all())
				wantUnread := want && sd.state == StateIdle
				changes := wantUnread != sd.unread

				err := mgr.SetUnread(context.Background(), before.ID, want)
				require.NoError(t, err)

				got, ok := mgr.Get(before.ID)
				require.True(t, ok)
				assert.Equal(t, wantUnread, got.Unread)
				assert.Equal(t, sd.state, got.State, "marking never moves the state")
				if got.Unread {
					assert.Equal(t, StateIdle, got.State, "unread implies idle")
				}
				wantBroadcasts := 0
				if changes {
					wantBroadcasts = 1
				}
				assert.Len(t, rec.all(), broadcastsBefore+wantBroadcasts, "one upsert on a change, none on a no-op")
				row, err := mgr.store.GetSession(context.Background(), before.ID)
				require.NoError(t, err)
				assert.Equal(t, wantUnread, row.Unread)
			})
		}
	}
}

func TestSetUnread_UnknownSessionReturnsErrUnknownSession(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)

	err := mgr.SetUnread(context.Background(), 999, true)

	require.ErrorIs(t, err, ErrUnknownSession)
	assert.Empty(t, rec.all())
}

func TestSetUnread_EndedIdleSessionCanBeMarked(t *testing.T) {
	mgr, _, sess := setUnreadRig(t, StateIdle, false)
	_, err := mgr.markEnded(context.Background(), sess.ID)
	require.NoError(t, err)

	require.NoError(t, mgr.SetUnread(context.Background(), sess.ID, true))

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.False(t, got.Alive)
	assert.True(t, got.Unread, "state is still idle, so the flag sets")
}

func TestSetUnread_PersistsAcrossAStoreReload(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	advanceToState(t, mgr, sess.ID, "claude-1", StateIdle, true)
	require.NoError(t, mgr.MarkSeen(context.Background(), sess.ID))

	require.NoError(t, mgr.SetUnread(context.Background(), sess.ID, true))

	reloaded := newTestManager(t, st, nil, nil)
	require.NoError(t, reloaded.LoadAll(context.Background()))
	got, ok := reloaded.Get(sess.ID)
	require.True(t, ok)
	assert.True(t, got.Unread)
}

// TestSetUnread_LeavesOtherSessionsAlone marks one of two coexisting idle sessions and
// asserts the other's flag and broadcasts are untouched.
func TestSetUnread_LeavesOtherSessionsAlone(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	a := createLaunchedSession(t, mgr, st, t.TempDir())
	b := createLaunchedSession(t, mgr, st, t.TempDir())
	for i, s := range []*Session{a, b} {
		advanceToState(t, mgr, s.ID, "claude-"+strings.Repeat("x", i+1), StateIdle, true)
		require.NoError(t, mgr.MarkSeen(context.Background(), s.ID))
	}
	broadcastsBefore := len(rec.all())

	require.NoError(t, mgr.SetUnread(context.Background(), a.ID, true))

	gotA, _ := mgr.Get(a.ID)
	gotB, _ := mgr.Get(b.ID)
	assert.True(t, gotA.Unread)
	assert.False(t, gotB.Unread)
	after := rec.all()[broadcastsBefore:]
	require.Len(t, after, 1)
	assert.Equal(t, a.ID, after[0].ID)
}

func TestSetUnread_AttachStillClearsAHandSetFlag(t *testing.T) {
	mgr, _, sess := setUnreadRig(t, StateIdle, false)
	require.NoError(t, mgr.SetUnread(context.Background(), sess.ID, true))

	require.NoError(t, mgr.MarkSeen(context.Background(), sess.ID))

	got, _ := mgr.Get(sess.ID)
	assert.False(t, got.Unread)
}
