package session

import (
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/tmux"
)

func (r *effortRig) setNote(id int64, text *string) bool {
	r.t.Helper()
	changed, err := r.mgr.SetNote(r.ctx, id, text)
	require.NoError(r.t, err)
	return changed
}

func noteOf(s *Session) string {
	if s.Note == nil {
		return "<nil>"
	}
	return "text:" + *s.Note
}

func (r *effortRig) apply(id int64, claudeID string, in claudecode.StateInput) error {
	r.t.Helper()
	_, err := r.mgr.Apply(r.ctx, id, claudeID, nil, in, true)
	return err
}

func (r *effortRig) die(id int64) {
	r.t.Helper()
	r.pc.setExists(r.get(id).TmuxTarget, false)
	r.mgr.Nudge(r.ctx, id)
	require.False(r.t, r.get(id).Alive)
}

func (r *effortRig) restart() {
	r.t.Helper()
	fresh := r.newManager()
	require.NoError(r.t, fresh.LoadAll(r.ctx))
	r.mgr = fresh
}

// TestSetNote_StoresTextVerbatimAndBlankAsNull covers D1, D2 and edge cases 6 and 7 as one
// run of steps on one session: the changed flag and the upsert count of each, the stored
// value, and that the store holds what memory holds.
func TestSetNote_StoresTextVerbatimAndBlankAsNull(t *testing.T) {
	frontmatter := "---\ntitle: x\n---\n\n```mermaid\ngraph TD\n```\n"
	long := strings.Repeat("a line of the developer's own text\n", 3000)

	steps := []struct {
		name        string
		in          *string
		wantNote    *string
		wantChanged bool
	}{
		{"whitespace-only on a null note changes nothing", lvl("  \n\t"), nil, false},
		{"empty on a null note changes nothing", lvl(""), nil, false},
		{"null on a null note changes nothing", nil, nil, false},
		{"text is stored", lvl("hello"), lvl("hello"), true},
		{"the same text again is no change", lvl("hello"), lvl("hello"), false},
		{"leading and trailing whitespace is kept", lvl("  hello \n"), lvl("  hello \n"), true},
		{"the padded text again is no change", lvl("  hello \n"), lvl("  hello \n"), false},
		{"hello with different padding is a change", lvl("hello"), lvl("hello"), true},
		{"whitespace-only clears to null", lvl("  \n\t"), nil, true},
		{"text after a clear", lvl("again"), lvl("again"), true},
		{"empty clears to null", lvl(""), nil, true},
		{"text once more", lvl("third"), lvl("third"), true},
		{"explicit null clears", nil, nil, true},
		{"frontmatter and a mermaid fence are kept byte for byte", lvl(frontmatter), lvl(frontmatter), true},
		{"a very long note has no limit", lvl(long), lvl(long), true},
		{"CRLF line endings are kept", lvl("a\r\nb\r\n"), lvl("a\r\nb\r\n"), true},
	}

	r := newEffortRig(t)
	id := r.launch("", "")
	require.Nil(t, r.get(id).Note, "a launched session starts with no note")

	for _, s := range steps {
		before := len(r.rec.all())
		changed := r.setNote(id, s.in)

		got := r.get(id)
		assert.Equal(t, s.wantChanged, changed, "%s: changed", s.name)
		assert.Equal(t, s.wantNote, got.Note, "%s: stored note", s.name)
		wantUpserts := 0
		if s.wantChanged {
			wantUpserts = 1
		}
		seen := r.rec.all()
		require.Len(t, seen, before+wantUpserts, "%s: upserts", s.name)
		if s.wantChanged {
			assert.Equal(t, id, seen[before].ID, "%s: the upsert is for the session", s.name)
			assert.Equal(t, s.wantNote, seen[before].Note, "%s: the upsert carries the note", s.name)
		}
		assert.Equal(t, s.wantNote, r.reloaded(id).Note, "%s: the store holds what memory holds", s.name)
	}
}

func TestSetNote_UnknownSession(t *testing.T) {
	r := newEffortRig(t)
	before := len(r.rec.all())

	changed, err := r.mgr.SetNote(r.ctx, 999999, lvl("x"))

	require.ErrorIs(t, err, ErrUnknownSession)
	assert.False(t, changed)
	assert.Len(t, r.rec.all(), before, "an unknown id broadcasts nothing")
}

// TestSetNote_DoesNotMutateAnEarlierClone: Get hands out a shallow clone, so a changed note
// must arrive as a fresh pointer, never written through the one a clone already holds.
func TestSetNote_DoesNotMutateAnEarlierClone(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")
	r.setNote(id, lvl("first"))
	earlier := r.get(id)

	r.setNote(id, lvl("second"))

	require.NotNil(t, earlier.Note)
	assert.Equal(t, "first", *earlier.Note)
	assert.Equal(t, lvl("second"), r.get(id).Note)
}

// TestSetNote_NoteSurvivesTheSessionsLifeAndRemoveDeletesIt covers D5, D6 and REQ-4: a dead
// session's note can be set and read, Stop (End), resume and a daemon restart keep it, and
// Remove deletes it with the session while a second session's note stays.
func TestSetNote_NoteSurvivesTheSessionsLifeAndRemoveDeletesIt(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")
	other := r.launch("", "")
	r.setNote(other, lvl("other note"))

	t.Run("a dead session's note can be set and is readable", func(t *testing.T) {
		r.die(id)
		before := len(r.rec.all())

		assert.True(t, r.setNote(id, lvl("written while dead")))

		assert.Equal(t, lvl("written while dead"), r.get(id).Note)
		assert.Len(t, r.rec.all(), before+1)
		assert.Equal(t, lvl("written while dead"), r.reloaded(id).Note)
	})

	t.Run("a daemon restart keeps it", func(t *testing.T) {
		r.restart()
		assert.Equal(t, lvl("written while dead"), r.get(id).Note)
	})

	t.Run("resume keeps it", func(t *testing.T) {
		_, err := r.mgr.RecordResume(r.ctx, id, "muster-resumed:@1", "%9")
		require.NoError(t, err)
		r.pc.setExists("muster-resumed:@1", true)
		require.NoError(t, r.apply(id, r.get(id).ClaudeSessionID, claudecode.StateInput{Kind: claudecode.KindResumeBind}))

		got := r.get(id)
		assert.True(t, got.Alive)
		assert.Equal(t, lvl("written while dead"), got.Note)
		assert.Equal(t, lvl("written while dead"), r.reloaded(id).Note)
	})

	t.Run("Stop keeps it", func(t *testing.T) {
		_, err := r.mgr.End(r.ctx, id)
		require.NoError(t, err)
		assert.Equal(t, lvl("written while dead"), r.get(id).Note)
		assert.Equal(t, lvl("written while dead"), r.reloaded(id).Note)
	})

	t.Run("Remove deletes it with the session and leaves another's", func(t *testing.T) {
		require.NoError(t, r.mgr.Remove(r.ctx, id))

		_, ok := r.mgr.Get(id)
		assert.False(t, ok)
		_, err := r.st.GetSession(r.ctx, id)
		require.Error(t, err, "the row, and the note column with it, is gone")
		assert.Equal(t, lvl("other note"), r.get(other).Note)
		assert.Equal(t, lvl("other note"), r.reloaded(other).Note)
	})
}

// TestSetNote_ConcurrentWritesLeaveMemoryAndStoreAgreeing: whichever write the manager
// applies last wins, and the store holds that same value (last write wins across windows).
func TestSetNote_ConcurrentWritesLeaveMemoryAndStoreAgreeing(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")

	var wg sync.WaitGroup
	for i := range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := r.mgr.SetNote(r.ctx, id, lvl("writer "+strconv.Itoa(i)))
			assert.NoError(t, err)
		}()
	}
	wg.Wait()

	got := r.get(id)
	require.NotNil(t, got.Note)
	assert.Equal(t, got.Note, r.reloaded(id).Note, "memory and store agree on the winner")
}

// noteSourceState builds the session under test in one state INV-1 names; want is the
// state the builder must leave it in, so a builder that drifts fails here, not silently.
type noteSourceState struct {
	name      string
	build     func(r *effortRig) int64
	wantState State
	wantAlive bool
}

func noteSourceStates() []noteSourceState {
	working := func(r *effortRig) int64 {
		id := r.launch("", "")
		prompt := "do the thing"
		require.NoError(r.t, r.apply(id, r.get(id).ClaudeSessionID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &prompt}))
		return id
	}
	idle := func(r *effortRig) int64 {
		id := working(r)
		require.NoError(r.t, r.apply(id, r.get(id).ClaudeSessionID, claudecode.StateInput{Kind: claudecode.KindTurnClosed}))
		return id
	}
	dead := func(r *effortRig) int64 {
		id := idle(r)
		r.die(id)
		return id
	}
	return []noteSourceState{
		{"started", func(r *effortRig) int64 { return r.launch("", "") }, StateStarted, true},
		{"working", working, StateWorking, true},
		{"needs input", func(r *effortRig) int64 {
			id := working(r)
			require.NoError(r.t, r.apply(id, r.get(id).ClaudeSessionID, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}))
			return id
		}, StateNeedsInput, true},
		{"failed", func(r *effortRig) int64 {
			id := working(r)
			failure := "server_error"
			require.NoError(r.t, r.apply(id, r.get(id).ClaudeSessionID, claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: &failure}))
			return id
		}, StateFailed, true},
		{"idle", idle, StateIdle, true},
		{"dead", dead, StateIdle, false},
		{"after a /clear rebind", func(r *effortRig) int64 {
			id := r.launch("", "")
			r.rebind(id)
			return id
		}, StateStarted, true},
		{"after resume", func(r *effortRig) int64 {
			id := dead(r)
			_, err := r.mgr.RecordResume(r.ctx, id, "muster-resumed:@1", "%9")
			require.NoError(r.t, err)
			r.pc.setExists("muster-resumed:@1", true)
			require.NoError(r.t, r.apply(id, r.get(id).ClaudeSessionID, claudecode.StateInput{Kind: claudecode.KindResumeBind}))
			return id
		}, StateIdle, true},
		{"after a daemon restart", func(r *effortRig) int64 {
			id := idle(r)
			r.restart()
			return id
		}, StateIdle, true},
	}
}

// noteInput is one thing that can happen to a session other than a note PUT. okErrs lists
// the errors the input may legitimately return from a state it does not apply to.
type noteInput struct {
	name   string
	okErrs []error
	// sweepsDead marks reconcile-with-nothing-on-the-socket: an already-dead row is deleted,
	// and its note goes with it.
	sweepsDead bool
	run        func(r *effortRig, id int64) error
}

func noteInputs() []noteInput {
	return append(noteHookInputs(), noteDaemonInputs()...)
}

func noteHookInputs() []noteInput {
	inputs := []noteInput{}
	prompt, failure := "next prompt", "server_error"
	for _, kind := range []claudecode.InputKind{
		claudecode.KindBind, claudecode.KindClearRebind, claudecode.KindResumeBind, claudecode.KindTurnActivity,
		claudecode.KindNeedsInputPermission, claudecode.KindIdleNotice, claudecode.KindTurnClosed,
		claudecode.KindTurnInterrupted, claudecode.KindTurnFailed, claudecode.KindCompactionBegan,
		claudecode.KindCompactionEnded, claudecode.KindDeathHint, claudecode.KindClearDeathHint, claudecode.KindInert,
	} {
		in := claudecode.StateInput{Kind: kind, Prompt: &prompt, FailureError: &failure}
		inputs = append(inputs, noteInput{name: "hook " + string(kind), run: func(r *effortRig, id int64) error {
			return r.apply(id, r.get(id).ClaudeSessionID, in)
		}})
	}
	return append(inputs, noteRebindInputs()...)
}

func noteRebindInputs() []noteInput {
	prompt := "next prompt"
	return []noteInput{
		{name: "hook carrying a new session id (implicit rebind)", run: func(r *effortRig, id int64) error {
			return r.apply(id, "claude-fresh-"+strconv.FormatInt(id, 10), claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &prompt})
		}},
		{name: "/clear rebind to a new session id", run: func(r *effortRig, id int64) error {
			return r.apply(id, "claude-cleared-"+strconv.FormatInt(id, 10), claudecode.StateInput{Kind: claudecode.KindClearRebind})
		}},
		{name: "straggler hook from the previous session id after a rebind", run: func(r *effortRig, id int64) error {
			old := r.get(id).ClaudeSessionID
			r.rebind(id)
			return r.apply(id, old, claudecode.StateInput{Kind: claudecode.KindTurnClosed})
		}},
	}
}

func noteDaemonInputs() []noteInput {
	return []noteInput{
		{name: "status post with a level", run: func(r *effortRig, id int64) error {
			_, err := r.mgr.ApplyStatus(r.ctx, id, effortPost(lvl("high")))
			return err
		}},
		{name: "status post with a new title", run: func(r *effortRig, id int64) error {
			_, err := r.mgr.ApplyStatus(r.ctx, id, claudecode.StatusUpdate{Title: lvl("claude's own name")})
			return err
		}},
		{name: "liveness death", run: func(r *effortRig, id int64) error {
			r.pc.setExists(r.get(id).TmuxTarget, false)
			r.mgr.Nudge(r.ctx, id)
			return nil
		}},
		{name: "liveness tick on a live pane", run: func(r *effortRig, id int64) error {
			r.pc.setExists(r.get(id).TmuxTarget, true)
			r.mgr.Nudge(r.ctx, id)
			return nil
		}},
		{name: "End", okErrs: []error{ErrSessionNotAlive}, run: func(r *effortRig, id int64) error {
			_, err := r.mgr.End(r.ctx, id)
			return err
		}},
		{name: "RecordResume", run: func(r *effortRig, id int64) error {
			_, err := r.mgr.RecordResume(r.ctx, id, "muster-resumed:@1", "%9")
			return err
		}},
		{name: "RepairOwnedSession", run: func(r *effortRig, id int64) error {
			_, err := r.mgr.RepairOwnedSession(r.ctx, id)
			return err
		}},
		{name: "reconcile with every pane on the socket", run: func(r *effortRig, _ int64) error {
			r.tmux.sessions = nil
			for _, s := range r.mgr.List() {
				r.tmux.sessions = append(r.tmux.sessions, tmux.SessionName(s.ID))
			}
			r.mgr.Reconcile(r.ctx)
			return nil
		}},
		{name: "reconcile with the socket empty", sweepsDead: true, run: func(r *effortRig, _ int64) error {
			r.tmux.sessions = nil
			r.mgr.Reconcile(r.ctx)
			return nil
		}},
		{name: "daemon restart", run: func(r *effortRig, _ int64) error {
			r.restart()
			return nil
		}},
		{name: "SetTranscript", run: func(r *effortRig, id int64) error {
			_, err := r.mgr.SetTranscript(r.ctx, id, r.get(id).ClaudeSessionID, "/tmp/t-"+strconv.FormatInt(id, 10)+".jsonl")
			return err
		}},
		{name: "ApplyPlanScan", run: func(r *effortRig, id int64) error {
			_, _, err := r.mgr.ApplyPlanScan(r.ctx, id, r.get(id).ClaudeSessionID, writeTempPlanFile(r.t, "plan.md"))
			return err
		}},
		{name: "SetTitle", run: func(r *effortRig, id int64) error {
			_, err := r.mgr.SetTitle(r.ctx, id, lvl("renamed by the developer"))
			return err
		}},
		{name: "SetPinned", run: func(r *effortRig, id int64) error {
			return r.mgr.SetPinned(r.ctx, id, true)
		}},
		{name: "ClearEffortWarning", run: func(r *effortRig, id int64) error {
			return r.mgr.ClearEffortWarning(r.ctx, id)
		}},
		{name: "MarkSeen", run: func(r *effortRig, id int64) error {
			return r.mgr.MarkSeen(r.ctx, id)
		}},
	}
}

// TestNote_INV1_EveryInputFromEveryState is D4: the note changes only through SetNote. Every
// input that is not a note PUT is crossed with every starting state (kb:lesson/invariant-missed-by-per-transition-tests),
// with a second session beside it whose note must come out untouched, and each result
// compared with what a restarted daemon loads from the store.
func TestNote_INV1_EveryInputFromEveryState(t *testing.T) {
	const target, bystander = "the target's note, kept as written \n", "the bystander's note"
	for _, start := range noteSourceStates() {
		for _, in := range noteInputs() {
			t.Run(start.name+"/"+in.name, func(t *testing.T) {
				t.Parallel()
				r := newEffortRig(t)
				other := r.launch("", "")
				r.setNote(other, lvl(bystander))
				id := start.build(r)
				require.Equal(t, start.wantState, r.get(id).State, "the builder reaches the state it names")
				require.Equal(t, start.wantAlive, r.get(id).Alive, "the builder reaches the liveness it names")
				r.setNote(id, lvl(target))

				err := in.run(r, id)
				for _, ok := range in.okErrs {
					if errors.Is(err, ok) {
						err = nil
					}
				}
				require.NoError(t, err)

				if in.sweepsDead && !start.wantAlive {
					_, ok := r.mgr.Get(id)
					assert.False(t, ok, "an already-dead row is swept, its note with it")
					assert.Equal(t, "text:"+bystander, noteOf(r.get(other)), "the bystander's note")
					assert.Equal(t, "text:"+bystander, noteOf(r.reloaded(other)), "the bystander's note in the store")
					return
				}

				assert.Equal(t, "text:"+target, noteOf(r.get(id)), "the target's note")
				assert.Equal(t, "text:"+bystander, noteOf(r.get(other)), "the bystander's note")
				assert.Equal(t, "text:"+target, noteOf(r.reloaded(id)), "the target's note in the store")
				assert.Equal(t, "text:"+bystander, noteOf(r.reloaded(other)), "the bystander's note in the store")
			})
		}
	}
}

// TestNote_INV1_ASessionWithNoNoteGainsNoneFromAnyInput is INV-1's other half: a null note
// stays null (no input invents text), checked from every state for every input.
func TestNote_INV1_ASessionWithNoNoteGainsNoneFromAnyInput(t *testing.T) {
	for _, start := range noteSourceStates() {
		for _, in := range noteInputs() {
			t.Run(start.name+"/"+in.name, func(t *testing.T) {
				t.Parallel()
				r := newEffortRig(t)
				id := start.build(r)

				err := in.run(r, id)
				for _, ok := range in.okErrs {
					if errors.Is(err, ok) {
						err = nil
					}
				}
				require.NoError(t, err)

				if in.sweepsDead && !start.wantAlive {
					return
				}
				assert.Nil(t, r.get(id).Note)
				assert.Nil(t, r.reloaded(id).Note)
			})
		}
	}
}
