package session

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/store"
)

func withInterruptChecker(f func(path, promptID string) (bool, error)) testManagerOpt {
	return func(c *Config) { c.InterruptChecker = f }
}

// checkerDouble is a thread-safe interrupt checker recording every (path, promptID) it is
// asked about; answer, when set, decides the reply.
type checkerDouble struct {
	mu     sync.Mutex
	calls  [][2]string
	answer func(path, promptID string) (bool, error)
}

func (c *checkerDouble) check(path, promptID string) (bool, error) {
	c.mu.Lock()
	c.calls = append(c.calls, [2]string{path, promptID})
	answer := c.answer
	c.mu.Unlock()
	if answer == nil {
		return false, nil
	}
	return answer(path, promptID)
}

func (c *checkerDouble) seen() [][2]string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([][2]string(nil), c.calls...)
}

// driveTo creates, launches and binds a session, advances it to state through Apply (prompt
// "p-<id>" current unless the state is started) and names its transcript "<dir>/t-<id>.jsonl".
func driveTo(t *testing.T, mgr *Manager, st *store.Store, state State) *Session {
	t.Helper()
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	id := strconv.FormatInt(sess.ID, 10)
	claudeID, prompt := "claude-"+id, "p-"+id
	_, err := mgr.Apply(ctx, sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	var in claudecode.StateInput
	switch state {
	case StateStarted:
	case StateWorking:
		in = claudecode.StateInput{Kind: claudecode.KindTurnActivity}
	case StatePlanning:
		in = claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: strp("plan")}
	case StateNeedsInput:
		// A permission request never adopts a prompt id; the turn's own activity does, as on the wire.
		_, err = mgr.Apply(ctx, sess.ID, claudeID, &prompt, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
		require.NoError(t, err)
		in = claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}
	case StateIdle:
		in = claudecode.StateInput{Kind: claudecode.KindTurnClosed}
	case StateFailed:
		in = claudecode.StateInput{Kind: claudecode.KindTurnFailed}
	default:
		t.Fatalf("unsupported state %s", state)
	}
	if in.Kind != "" {
		_, err = mgr.Apply(ctx, sess.ID, claudeID, &prompt, in, true)
		require.NoError(t, err)
	}
	_, err = mgr.SetTranscript(ctx, sess.ID, claudeID, filepath.Join(t.TempDir(), "t-"+id+".jsonl"))
	require.NoError(t, err)
	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, state, got.State)
	return got
}

func mustGet(t *testing.T, mgr *Manager, id int64) *Session {
	t.Helper()
	got, ok := mgr.Get(id)
	require.True(t, ok)
	return got
}

// TestSweepInterrupts_CheckerOnlyAskedForAliveOpenTurns covers D11 (and the sweep's collect
// predicate): the checker is asked for alive sessions in working, planning or needs_input
// and never for idle, started or failed ones, a dead one, or one without a transcript path
// or a current prompt.
func TestSweepInterrupts_CheckerOnlyAskedForAliveOpenTurns(t *testing.T) {
	tests := []struct {
		name      string
		state     State
		wantAsked bool
	}{
		{"working", StateWorking, true},
		{"planning", StatePlanning, true},
		{"needs_input", StateNeedsInput, true},
		{"idle", StateIdle, false},
		{"started", StateStarted, false},
		{"failed", StateFailed, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			chk := &checkerDouble{}
			mgr := newTestManager(t, st, nil, nil, withInterruptChecker(chk.check))
			sess := driveTo(t, mgr, st, tt.state)

			mgr.sweepInterrupts(context.Background())

			if tt.wantAsked {
				require.Len(t, chk.seen(), 1)
				assert.Equal(t, sess.TranscriptPath, chk.seen()[0][0], "the session's own transcript path")
				assert.Equal(t, "p-"+strconv.FormatInt(sess.ID, 10), chk.seen()[0][1], "the current prompt id")
			} else {
				assert.Empty(t, chk.seen())
			}
		})
	}

	t.Run("a dead session in an open state is not asked", func(t *testing.T) {
		st := openTestStore(t)
		chk := &checkerDouble{}
		mgr := newTestManager(t, st, nil, nil, withInterruptChecker(chk.check))
		sess := driveTo(t, mgr, st, StateWorking)
		_, err := mgr.markEnded(context.Background(), sess.ID)
		require.NoError(t, err)

		mgr.sweepInterrupts(context.Background())

		assert.Empty(t, chk.seen())
	})

	t.Run("no transcript path yet is not asked", func(t *testing.T) {
		st := openTestStore(t)
		chk := &checkerDouble{}
		mgr := newTestManager(t, st, nil, nil, withInterruptChecker(chk.check))
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		p := "p1"
		_, err := mgr.Apply(context.Background(), sess.ID, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
		require.NoError(t, err)

		mgr.sweepInterrupts(context.Background())

		assert.Empty(t, chk.seen())
	})

	t.Run("an open turn with no current prompt id is not asked", func(t *testing.T) {
		st := openTestStore(t)
		chk := &checkerDouble{}
		mgr := newTestManager(t, st, nil, nil, withInterruptChecker(chk.check))
		sess := driveTo(t, mgr, st, StateWorking)
		mgr.mu.Lock()
		mgr.sessions[sess.ID].currentPromptID = ""
		mgr.mu.Unlock()

		mgr.sweepInterrupts(context.Background())

		assert.Empty(t, chk.seen())
	})

	t.Run("a nil checker disables the sweep", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		sess := driveTo(t, mgr, st, StateWorking)

		assert.NotPanics(t, func() { mgr.sweepInterrupts(context.Background()) })

		assert.Equal(t, StateWorking, mustGet(t, mgr, sess.ID).State)
	})
}

// TestSweepInterrupts_LandsIdleLikeStop covers REQ-4: an interrupt of the current prompt
// lands idle from every open state through the normal persist/broadcast path, clearing
// attention and failure, setting unread exactly as Stop does (from the watcher), closing the
// prompt and leaving lastActivity and backgroundTasks alone.
func TestSweepInterrupts_LandsIdleLikeStop(t *testing.T) {
	for _, state := range []State{StateWorking, StatePlanning, StateNeedsInput} {
		for _, watched := range []bool{false, true} {
			t.Run(string(state)+"/watched_"+strconv.FormatBool(watched), func(t *testing.T) {
				st := openTestStore(t)
				rec := &upsertsRecorder{}
				w := newFakeWatcher()
				chk := &checkerDouble{answer: func(string, string) (bool, error) { return true, nil }}
				mgr := newTestManager(t, st, nil, rec.record, withInterruptChecker(chk.check), withWatcher(w))
				sess := driveTo(t, mgr, st, state)
				w.setWatched(sess.ID, watched)
				mgr.mu.Lock()
				prior := "earlier activity"
				mgr.sessions[sess.ID].LastActivity = &prior
				mgr.sessions[sess.ID].BackgroundTasks = 2
				mgr.mu.Unlock()
				before := len(rec.all())

				mgr.sweepInterrupts(context.Background())

				got := mustGet(t, mgr, sess.ID)
				assert.Equal(t, StateIdle, got.State)
				assert.Nil(t, got.Attention)
				assert.Nil(t, got.Failure)
				assert.Empty(t, got.AttentionAgent)
				assert.Equal(t, !watched, got.Unread, "unread as Stop sets it: true iff no terminal client is attached")
				assert.Equal(t, &prior, got.LastActivity, "lastActivity is left unchanged")
				assert.Equal(t, 2, got.BackgroundTasks)
				assert.True(t, got.promptClosed("p-"+strconv.FormatInt(sess.ID, 10)))

				persisted, err := st.GetSession(context.Background(), sess.ID)
				require.NoError(t, err)
				assert.Equal(t, "idle", persisted.State, "persisted, not just in memory")
				assert.Nil(t, persisted.AttentionReason)
				assert.Len(t, rec.all(), before+1, "exactly one broadcast")

				mgr.sweepInterrupts(context.Background())
				assert.Len(t, chk.seen(), 1, "the closed turn is not asked about again")
			})
		}
	}

	t.Run("a subagent-owned wait is ended by the interrupt and forgets its owner", func(t *testing.T) {
		st := openTestStore(t)
		chk := &checkerDouble{answer: func(string, string) (bool, error) { return true, nil }}
		mgr := newTestManager(t, st, nil, nil, withInterruptChecker(chk.check))
		sess := driveTo(t, mgr, st, StateWorking)
		id := strconv.FormatInt(sess.ID, 10)
		p := "p-" + id
		_, err := mgr.Apply(context.Background(), sess.ID, "claude-"+id, &p, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: "agent-a", FromSubagent: true}, true)
		require.NoError(t, err)

		mgr.sweepInterrupts(context.Background())

		got := mustGet(t, mgr, sess.ID)
		assert.Equal(t, StateIdle, got.State)
		assert.Empty(t, got.AttentionAgent)
		persisted, err := st.GetSession(context.Background(), sess.ID)
		require.NoError(t, err)
		assert.Nil(t, persisted.AttentionAgent)
	})
}

// TestSweepInterrupts_OnlyTheInterruptedSessionMoves covers the shared-registry variant: with
// two open sessions coexisting, an interrupt for one leaves the other untouched and unbroadcast.
func TestSweepInterrupts_OnlyTheInterruptedSessionMoves(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	chk := &checkerDouble{}
	mgr := newTestManager(t, st, nil, rec.record, withInterruptChecker(chk.check))
	victim := driveTo(t, mgr, st, StateWorking)
	bystander := driveTo(t, mgr, st, StateNeedsInput)
	chk.answer = func(path, _ string) (bool, error) { return path == victim.TranscriptPath, nil }
	before := len(rec.all())

	mgr.sweepInterrupts(context.Background())

	assert.Equal(t, StateIdle, mustGet(t, mgr, victim.ID).State)
	other := mustGet(t, mgr, bystander.ID)
	assert.Equal(t, StateNeedsInput, other.State)
	require.NotNil(t, other.Attention)
	assert.Len(t, chk.seen(), 2, "both were asked")
	require.Len(t, rec.all(), before+1)
	assert.Equal(t, victim.ID, rec.all()[before].ID, "only the victim was broadcast")
}

// TestSweepInterrupts_FailuresLeaveTheSessionUnchanged covers D10 and edge 9: an erroring
// checker, a false answer and a missing transcript file (through the real claudecode
// checker) leave state, fields and broadcasts alone, and the next tick asks again.
func TestSweepInterrupts_FailuresLeaveTheSessionUnchanged(t *testing.T) {
	tests := []struct {
		name   string
		answer func(path, promptID string) (bool, error)
	}{
		{"checker error", func(string, string) (bool, error) { return false, errors.New("permission denied") }},
		{"checker says no", func(string, string) (bool, error) { return false, nil }},
		{"missing transcript file via the real checker", claudecode.PromptInterrupted},
		{"error together with a true answer is still an error", func(string, string) (bool, error) { return true, errors.New("half read") }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			chk := &checkerDouble{answer: tt.answer}
			mgr := newTestManager(t, st, nil, rec.record, withInterruptChecker(chk.check))
			sess := driveTo(t, mgr, st, StateNeedsInput)
			before := mustGet(t, mgr, sess.ID)
			broadcasts := len(rec.all())

			mgr.sweepInterrupts(context.Background())
			mgr.sweepInterrupts(context.Background())

			assert.Equal(t, before, mustGet(t, mgr, sess.ID))
			assert.Len(t, rec.all(), broadcasts)
			assert.Len(t, chk.seen(), 2, "retried on the next tick")
		})
	}
}

// TestSweepInterrupts_RealTranscriptFile wires the real claudecode checker to real files:
// an interrupt line for the current prompt lands idle, plan-feedback and other-prompt lines
// do not (edge 7).
func TestSweepInterrupts_RealTranscriptFile(t *testing.T) {
	tests := []struct {
		name     string
		lines    func(promptID string) []string
		wantIdle bool
	}{
		{"interrupt for the current prompt", func(p string) []string { return []string{claudecodetest.InterruptLine(p, true)} }, true},
		{"mid-stream interrupt for the current prompt", func(p string) []string { return []string{claudecodetest.InterruptLine(p, false)} }, true},
		{"interrupt for an older prompt", func(string) []string { return []string{claudecodetest.InterruptLine("p-older", false)} }, false},
		{"plan-feedback rejection", func(p string) []string { return []string{claudecodetest.PlanRejectionLine(p)} }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil, withInterruptChecker(claudecode.PromptInterrupted))
			sess := driveTo(t, mgr, st, StateWorking)
			content := ""
			for _, l := range tt.lines("p-" + strconv.FormatInt(sess.ID, 10)) {
				content += l + "\n"
			}
			writeFile(t, sess.TranscriptPath, content)

			mgr.sweepInterrupts(context.Background())

			want := StateWorking
			if tt.wantIdle {
				want = StateIdle
			}
			assert.Equal(t, want, mustGet(t, mgr, sess.ID).State)
		})
	}
}

// TestSweepInterrupts_TurnClosedBetweenCheckAndApply covers the snapshot race the arm
// re-validates: the checker answers true, but a Stop lands meanwhile — the sweep must not
// disturb the closed turn (it lands nothing new: state idle, prompt closed once).
func TestSweepInterrupts_TurnClosedBetweenCheckAndApply(t *testing.T) {
	st := openTestStore(t)
	var mgr *Manager
	var sessID int64
	var claudeID, prompt string
	chk := &checkerDouble{answer: func(string, string) (bool, error) {
		_, err := mgr.Apply(context.Background(), sessID, claudeID, &prompt, claudecode.StateInput{Kind: claudecode.KindTurnClosed, LastActivity: strp("finished"), BackgroundTasks: intp(1)}, true)
		require.NoError(t, err)
		return true, nil
	}}
	mgr = newTestManager(t, st, nil, nil, withInterruptChecker(chk.check))
	sess := driveTo(t, mgr, st, StateWorking)
	sessID = sess.ID
	claudeID, prompt = sess.ClaudeSessionID, "p-"+strconv.FormatInt(sess.ID, 10)

	mgr.sweepInterrupts(context.Background())

	got := mustGet(t, mgr, sess.ID)
	assert.Equal(t, StateIdle, got.State)
	require.NotNil(t, got.LastActivity)
	assert.Equal(t, "finished", *got.LastActivity)
	assert.Equal(t, 1, got.BackgroundTasks)
	assert.Len(t, got.closedPromptIDs, 1, "the prompt is closed exactly once")
}

// TestPollLoop_SweepsInterrupts covers the wiring: pollLoop runs the sweep after the liveness
// check, so an interrupt lands idle without any caller nudging it (REQ-4's ~5 s tick, here 10 ms).
func TestPollLoop_SweepsInterrupts(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	chk := &checkerDouble{answer: func(string, string) (bool, error) { return true, nil }}
	mgr := newTestManager(t, st, pc, nil, withInterruptChecker(chk.check), withPollInterval(5*time.Millisecond))
	sess := driveTo(t, mgr, st, StateWorking)
	pc.setExists(sess.TmuxTarget, true)

	mgr.Start()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		mgr.Stop(ctx)
	}()

	require.Eventually(t, func() bool {
		got, ok := mgr.Get(sess.ID)
		return ok && got.State == StateIdle
	}, 2*time.Second, 5*time.Millisecond)
}

// TestApply_TurnStatePersistsAcrossARestart covers D12 at the manager layer and edge 11: the
// wait owner and background count are written on Apply and reloaded by LoadAll, and the
// reloaded owner still guards the wait (INV-B) after the restart.
func TestApply_TurnStatePersistsAcrossARestart(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	mgr1 := newTestManager(t, st, nil, nil)
	waiting := driveTo(t, mgr1, st, StateWorking)
	p := "p-" + strconv.FormatInt(waiting.ID, 10)
	_, err := mgr1.Apply(ctx, waiting.ID, waiting.ClaudeSessionID, &p, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: "agent-a", FromSubagent: true}, true)
	require.NoError(t, err)
	background := driveTo(t, mgr1, st, StateWorking)
	bp := "p-" + strconv.FormatInt(background.ID, 10)
	_, err = mgr1.Apply(ctx, background.ID, background.ClaudeSessionID, &bp, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(2)}, true)
	require.NoError(t, err)

	mgr2 := newTestManager(t, st, nil, nil)
	require.NoError(t, mgr2.LoadAll(ctx))

	reloaded := mustGet(t, mgr2, waiting.ID)
	assert.Equal(t, StateNeedsInput, reloaded.State)
	assert.Equal(t, "agent-a", reloaded.AttentionAgent)
	assert.Zero(t, reloaded.BackgroundTasks)
	assert.Equal(t, 2, mustGet(t, mgr2, background.ID).BackgroundTasks)
	assert.Empty(t, mustGet(t, mgr2, background.ID).AttentionAgent)

	// INV-B survives the restart: a second subagent's activity leaves the wait alone, the owner's ends it.
	_, err = mgr2.Apply(ctx, waiting.ID, waiting.ClaudeSessionID, &p, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: "agent-b", FromSubagent: true}, true)
	require.NoError(t, err)
	assert.Equal(t, StateNeedsInput, mustGet(t, mgr2, waiting.ID).State)
	_, err = mgr2.Apply(ctx, waiting.ID, waiting.ClaudeSessionID, &p, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: "agent-a", FromSubagent: true}, true)
	require.NoError(t, err)
	after := mustGet(t, mgr2, waiting.ID)
	assert.Equal(t, StateWorking, after.State)
	assert.Empty(t, after.AttentionAgent)
	persisted, err := st.GetSession(ctx, waiting.ID)
	require.NoError(t, err)
	assert.Nil(t, persisted.AttentionAgent, "the cleared owner is persisted as NULL")
}

// TestApply_StopKeepingASubagentWaitIsNotUnread covers apply.go's closesTurn guard: Unread is
// set only when the closing input actually lands idle, so a Stop that a subagent's wait survives
// (REQ-8) never leaves unread set on a needs_input session; a main-owned wait's Stop does.
func TestApply_StopKeepingASubagentWaitIsNotUnread(t *testing.T) {
	tests := []struct {
		name       string
		agent      string
		wantState  State
		wantUnread bool
	}{
		{"main-owned wait", "", StateIdle, true},
		{"subagent-owned wait", "agent-a", StateNeedsInput, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := driveTo(t, mgr, st, StateWorking)
			id := strconv.FormatInt(sess.ID, 10)
			p := "p-" + id
			ctx := context.Background()
			_, err := mgr.Apply(ctx, sess.ID, sess.ClaudeSessionID, &p, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: tt.agent, FromSubagent: tt.agent != ""}, true)
			require.NoError(t, err)

			got, err := mgr.Apply(ctx, sess.ID, sess.ClaudeSessionID, &p, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(1)}, true)

			require.NoError(t, err)
			assert.Equal(t, tt.wantState, got.State)
			assert.Equal(t, tt.wantUnread, got.Unread)
			assert.Equal(t, 1, got.BackgroundTasks)
		})
	}
}

// TestApply_PromptlessIdlePromptAfterClear covers D2 and D3 through the enveloped path that
// owns rebinding (edge cases 1 and 2).
func TestApply_PromptlessIdlePromptAfterClear(t *testing.T) {
	t.Run("D2: an enveloped prompt-less idle_prompt on a new claude id rebinds to started and stays started", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		sess := driveTo(t, mgr, st, StateIdle)
		mgr.mu.Lock()
		mgr.sessions[sess.ID].BackgroundTasks = 2
		mgr.mu.Unlock()

		got, err := mgr.Apply(context.Background(), sess.ID, "claude-after-clear", nil, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, true)

		require.NoError(t, err)
		assert.Equal(t, StateStarted, got.State)
		assert.Nil(t, got.Attention)
		assert.Equal(t, "claude-after-clear", got.ClaudeSessionID)
		assert.Zero(t, got.BackgroundTasks, "the rebind reset it")
		boundID, ok := mgr.Resolve("claude-after-clear")
		require.True(t, ok)
		assert.Equal(t, sess.ID, boundID)
	})

	t.Run("D2: the same body from every state lands started with no attention", func(t *testing.T) {
		for _, state := range allStates {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := driveTo(t, mgr, st, state)

			got, err := mgr.Apply(context.Background(), sess.ID, "claude-after-clear", nil, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, true)

			require.NoError(t, err, state)
			assert.Equal(t, StateStarted, got.State, state)
			assert.Nil(t, got.Attention, state)
			assert.Nil(t, got.Failure, state)
			assert.Empty(t, got.AttentionAgent, state)
		}
	})

	t.Run("D2: the clear pair arriving in order then a prompt-less idle_prompt stays started", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		sess := driveTo(t, mgr, st, StateIdle)
		_, err := mgr.Apply(context.Background(), sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
		require.NoError(t, err)

		got, err := mgr.Apply(context.Background(), sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, true)

		require.NoError(t, err)
		assert.Equal(t, StateStarted, got.State)
		assert.Nil(t, got.Attention)
	})

	t.Run("D3: after a clear-rebind an idle_prompt carrying the previous conversation's closed prompt id changes nothing", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		sess := driveTo(t, mgr, st, StateIdle)
		oldClaude := sess.ClaudeSessionID
		oldPrompt := "p-" + strconv.FormatInt(sess.ID, 10)
		_, err := mgr.Apply(context.Background(), sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
		require.NoError(t, err)
		before := mustGet(t, mgr, sess.ID)

		got, err := mgr.Apply(context.Background(), sess.ID, oldClaude, &oldPrompt, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, true)

		require.NoError(t, err)
		assert.Equal(t, before.State, got.State, "the straggler must not raise an idle wait on the fresh conversation")
		assert.Nil(t, got.Attention)
		assert.Equal(t, "claude-new", got.ClaudeSessionID, "rebinding never moves backwards")
	})
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
}
