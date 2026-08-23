package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// baselineForState returns a Session in the given state with every state-machine-owned
// field populated non-trivially, so INV-1's table test below has something to actually
// leak into if applyStatusUpdate ever reaches state/stateSince/attention/failure/alive/
// permissionMode/compactions.
func baselineForState(state State) *Session {
	sess := &Session{
		ID:                   1,
		State:                state,
		StateSince:           fixedNow,
		PermissionMode:       PermissionAcceptEdits,
		PermissionModeSource: "hook",
		Compactions:          3,
		Alive:                true,
	}
	if state == StateNeedsInput {
		sess.Attention = &Attention{Reason: "permission", Since: fixedNow}
	}
	if state == StateFailed {
		sess.Failure = &Failure{Error: "server_error", Message: "boom"}
	}
	return sess
}

// fullStatusUpdate is a status post carrying everything a status line can ever
// surface — every field applyStatusUpdate might touch, all different from
// baselineForState's zero values.
func fullStatusUpdate() claudecode.StatusUpdate {
	title := "Renamed by status line"
	return claudecode.StatusUpdate{
		Title:   &title,
		Model:   &claudecode.StatusModel{ID: "claude-opus-5", DisplayName: "Opus 5"},
		Context: &claudecode.StatusContext{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000},
	}
}

// TestApplyStatusUpdate_NeverTouchesStateMachineOwnedFields covers INV-1 exhaustively
// (m2-terminal retro rule: assert from every reachable source state, not just the
// convenient one): a full status-line update leaves state/stateSince/attention/
// failure/alive/permissionMode/compactions bit-identical from all six displayed states,
// plus a dead (alive:false) session.
func TestApplyStatusUpdate_NeverTouchesStateMachineOwnedFields(t *testing.T) {
	states := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}

	for _, state := range states {
		t.Run(string(state), func(t *testing.T) {
			sess := baselineForState(state)

			applyStatusUpdate(sess, fullStatusUpdate())

			assert.Equal(t, state, sess.State)
			assert.True(t, fixedNow.Equal(sess.StateSince))
			assert.Equal(t, PermissionAcceptEdits, sess.PermissionMode)
			assert.Equal(t, "hook", sess.PermissionModeSource)
			assert.Equal(t, 3, sess.Compactions)
			assert.True(t, sess.Alive)

			if state == StateNeedsInput {
				require.NotNil(t, sess.Attention, "INV-1: attention must survive a status post while needs_input")
				assert.Equal(t, "permission", sess.Attention.Reason)
				assert.True(t, fixedNow.Equal(sess.Attention.Since))
			} else {
				assert.Nil(t, sess.Attention)
			}

			if state == StateFailed {
				require.NotNil(t, sess.Failure, "INV-1: failure must survive a status post while failed")
				assert.Equal(t, "server_error", sess.Failure.Error)
				assert.Equal(t, "boom", sess.Failure.Message)
			} else {
				assert.Nil(t, sess.Failure)
			}
		})
	}

	t.Run("dead session (alive:false)", func(t *testing.T) {
		sess := baselineForState(StateIdle)
		sess.Alive = false
		endedAt := fixedNow
		sess.EndedAt = &endedAt

		applyStatusUpdate(sess, fullStatusUpdate())

		assert.False(t, sess.Alive, "INV-1: a status post must never resurrect a dead session")
		assert.Equal(t, StateIdle, sess.State)
		require.NotNil(t, sess.EndedAt)
		assert.True(t, sess.EndedAt.Equal(endedAt))
	})
}

func TestApplyStatusUpdate_TitleOnlyAdoptedWhenPresentAndDifferent(t *testing.T) {
	t.Run("nil title leaves the existing title untouched and reports no change", func(t *testing.T) {
		sess := newTestSession()
		existing := "Existing"
		sess.Title = &existing

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{})

		assert.False(t, changed)
		require.NotNil(t, sess.Title)
		assert.Equal(t, "Existing", *sess.Title)
	})

	t.Run("a present, different title updates and reports changed", func(t *testing.T) {
		sess := newTestSession()
		existing := "Existing"
		sess.Title = &existing
		newTitle := "New"

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{Title: &newTitle})

		assert.True(t, changed)
		require.NotNil(t, sess.Title)
		assert.Equal(t, "New", *sess.Title)
	})

	t.Run("a present, identical title reports no change", func(t *testing.T) {
		sess := newTestSession()
		existing := "Same"
		sess.Title = &existing
		same := "Same"

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{Title: &same})

		assert.False(t, changed)
	})

	t.Run("the first title on a session with none yet is a change", func(t *testing.T) {
		sess := newTestSession()
		newTitle := "First Title"

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{Title: &newTitle})

		assert.True(t, changed)
		require.NotNil(t, sess.Title)
		assert.Equal(t, "First Title", *sess.Title)
	})
}

func TestApplyStatusUpdate_ModelOnlyAdoptedWhenPresentAndDifferent(t *testing.T) {
	t.Run("nil model leaves the existing model untouched and reports no change", func(t *testing.T) {
		sess := newTestSession()
		sess.Model = &Model{ID: "sonnet", DisplayName: "Sonnet"}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{})

		assert.False(t, changed)
		assert.Equal(t, "sonnet", sess.Model.ID)
	})

	t.Run("a present, different model id updates and reports changed", func(t *testing.T) {
		sess := newTestSession()
		sess.Model = &Model{ID: "sonnet", DisplayName: "Sonnet"}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Model: &claudecode.StatusModel{ID: "claude-opus-5", DisplayName: "Opus 5"},
		})

		assert.True(t, changed)
		assert.Equal(t, "claude-opus-5", sess.Model.ID)
		assert.Equal(t, "Opus 5", sess.Model.DisplayName)
	})

	t.Run("same id but a different display name alone still counts as changed", func(t *testing.T) {
		sess := newTestSession()
		sess.Model = &Model{ID: "sonnet", DisplayName: "sonnet"}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Model: &claudecode.StatusModel{ID: "sonnet", DisplayName: "Sonnet"},
		})

		assert.True(t, changed, "R3: a missed display-name-only diff would silently spam upserts on every status post")
		assert.Equal(t, "Sonnet", sess.Model.DisplayName)
	})

	t.Run("a present, identical model reports no change", func(t *testing.T) {
		sess := newTestSession()
		sess.Model = &Model{ID: "sonnet", DisplayName: "Sonnet"}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Model: &claudecode.StatusModel{ID: "sonnet", DisplayName: "Sonnet"},
		})

		assert.False(t, changed)
	})

	t.Run("the first model on a session with none yet is a change", func(t *testing.T) {
		sess := newTestSession()

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Model: &claudecode.StatusModel{ID: "sonnet", DisplayName: "Sonnet"},
		})

		assert.True(t, changed)
		require.NotNil(t, sess.Model)
	})
}

func TestApplyStatusUpdate_ContextOnlyAdoptedWhenPresentAndDifferent(t *testing.T) {
	t.Run("nil context leaves the existing context untouched and reports no change", func(t *testing.T) {
		sess := newTestSession()
		sess.Context = &Context{UsedPct: 10, TotalInputTokens: 1000, WindowSize: 200000}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{})

		assert.False(t, changed)
		assert.Equal(t, 10.0, sess.Context.UsedPct)
	})

	t.Run("a present, different context replaces the pointer and reports changed", func(t *testing.T) {
		sess := newTestSession()
		sess.Context = &Context{UsedPct: 10, TotalInputTokens: 1000, WindowSize: 200000}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Context: &claudecode.StatusContext{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000},
		})

		assert.True(t, changed)
		assert.Equal(t, 42.0, sess.Context.UsedPct)
		assert.Equal(t, int64(84000), sess.Context.TotalInputTokens)
		assert.Equal(t, int64(200000), sess.Context.WindowSize)
	})

	t.Run("a present, identical context reports no change", func(t *testing.T) {
		sess := newTestSession()
		sess.Context = &Context{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Context: &claudecode.StatusContext{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000},
		})

		assert.False(t, changed)
	})

	t.Run("the first context on a session with none yet is a change", func(t *testing.T) {
		sess := newTestSession()

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Context: &claudecode.StatusContext{UsedPct: 5, TotalInputTokens: 500, WindowSize: 200000},
		})

		assert.True(t, changed)
		require.NotNil(t, sess.Context)
	})

	t.Run("a token-count-only difference at an unchanged percentage still counts as changed", func(t *testing.T) {
		// INV-2 treats the triple as one unit; a diff hiding in totalInputTokens or
		// windowSize alone must not be missed just because usedPct happens to match.
		sess := newTestSession()
		sess.Context = &Context{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000}

		changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
			Context: &claudecode.StatusContext{UsedPct: 42, TotalInputTokens: 85000, WindowSize: 200000},
		})

		assert.True(t, changed)
		assert.Equal(t, int64(85000), sess.Context.TotalInputTokens)
	})
}

func TestApplyStatusUpdate_EmptyUpdateReportsNoChangeAndTouchesNothing(t *testing.T) {
	sess := newTestSession()
	title := "Unchanged"
	sess.Title = &title
	sess.Model = &Model{ID: "sonnet", DisplayName: "Sonnet"}
	sess.Context = &Context{UsedPct: 10, TotalInputTokens: 1000, WindowSize: 200000}

	changed := applyStatusUpdate(sess, claudecode.StatusUpdate{})

	assert.False(t, changed)
	assert.Equal(t, "Unchanged", *sess.Title)
	assert.Equal(t, "sonnet", sess.Model.ID)
	assert.Equal(t, 10.0, sess.Context.UsedPct)
}

// TestApplyStatusUpdate_MultipleFieldsChangingAtOnceStillReportsChangedOnce guards
// against a boolean accumulation bug (e.g. overwriting changed instead of OR-ing it).
func TestApplyStatusUpdate_MultipleFieldsChangingAtOnceStillReportsChangedOnce(t *testing.T) {
	sess := newTestSession()
	newTitle := "New Title"

	changed := applyStatusUpdate(sess, claudecode.StatusUpdate{
		Title:   &newTitle,
		Model:   &claudecode.StatusModel{ID: "claude-opus-5", DisplayName: "Opus 5"},
		Context: &claudecode.StatusContext{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000},
	})

	assert.True(t, changed)
	require.NotNil(t, sess.Title)
	assert.Equal(t, "New Title", *sess.Title)
	require.NotNil(t, sess.Model)
	assert.Equal(t, "claude-opus-5", sess.Model.ID)
	require.NotNil(t, sess.Context)
	assert.Equal(t, 42.0, sess.Context.UsedPct)
}
