package session

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	scratchA = "/private/tmp/claude-501/-p/claude-A/scratchpad"
	scratchB = "/private/tmp/claude-501/-p/claude-B/scratchpad"
)

func TestSetScratchpad_BroadcastsAndPersistsOnlyOnAChange(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, sess.ID, "claude-A")
	before := len(rec.all())

	changed, err := mgr.SetScratchpad(ctx, sess.ID, "claude-A", scratchA)
	require.NoError(t, err)
	assert.True(t, changed)
	require.Len(t, rec.all(), before+1)
	assert.Equal(t, scratchA, rec.all()[before].ScratchpadDir)

	changed, err = mgr.SetScratchpad(ctx, sess.ID, "claude-A", scratchA)
	require.NoError(t, err)
	assert.False(t, changed, "same folder is a no-op")
	assert.Len(t, rec.all(), before+1, "no-op must not broadcast")

	row, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	require.NotNil(t, row.ScratchpadDir)
	assert.Equal(t, scratchA, *row.ScratchpadDir)
}

func TestSetScratchpad_NeverClearsAndSurvivesReload(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, sess.ID, "claude-A")
	_, err := mgr.SetScratchpad(ctx, sess.ID, "claude-A", scratchA)
	require.NoError(t, err)

	changed, err := mgr.SetScratchpad(ctx, sess.ID, "claude-A", "")
	require.NoError(t, err)
	assert.False(t, changed, "an empty dir is a no-op, never a clear")
	got, _ := mgr.Get(sess.ID)
	assert.Equal(t, scratchA, got.ScratchpadDir)

	reloaded := newTestManager(t, st, nil, nil)
	require.NoError(t, reloaded.LoadAll(ctx))
	got, ok := reloaded.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, scratchA, got.ScratchpadDir, "a daemon restart keeps the folder")
}

func TestSetScratchpad_ClaudeSessionIDGate(t *testing.T) {
	tests := []struct {
		name      string
		bound     []string
		preset    string
		kill      bool
		claudeID  string
		dir       string
		wantDir   string
		wantMoved bool
	}{
		{"current id moves it", []string{"claude-A"}, "", false, "claude-A", scratchA, scratchA, true},
		{"/clear: new id moves to new folder", []string{"claude-A", "claude-B"}, "", false, "claude-B", scratchB, scratchB, true},
		{"straggler from the left id never moves it", []string{"claude-A", "claude-B"}, scratchB, false, "claude-A", scratchA, scratchB, false},
		{"id the session never had", []string{"claude-A"}, "", false, "claude-Z", scratchB, "", false},
		{"unbound session ignores a hook from any id", nil, "", false, "claude-A", scratchA, "", false},
		{"dead session ignores a straggler from a left id", []string{"claude-A", "claude-B"}, scratchB, true, "claude-A", scratchA, scratchB, false},
		{"dead session ignores an id it never had", []string{"claude-A"}, scratchA, true, "claude-Z", scratchB, scratchA, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			h := newDeathHarness(t)
			sess := h.session(t)
			for _, id := range tt.bound {
				bindClaude(t, h.mgr, sess.ID, id)
			}
			if tt.preset != "" {
				_, err := h.mgr.SetScratchpad(ctx, sess.ID, tt.bound[len(tt.bound)-1], tt.preset)
				require.NoError(t, err)
			}
			if tt.kill {
				h.kill(t, sess.ID)
			}
			before := len(h.rec.all())

			changed, err := h.mgr.SetScratchpad(ctx, sess.ID, tt.claudeID, tt.dir)
			require.NoError(t, err)

			assert.Equal(t, tt.wantMoved, changed)
			got, _ := h.mgr.Get(sess.ID)
			assert.Equal(t, tt.wantDir, got.ScratchpadDir)
			if !tt.wantMoved {
				assert.Len(t, h.rec.all(), before, "a refused move never broadcasts")
			}
		})
	}
}

func TestSetScratchpad_ResumeRebindMovesFolderBackAndBroadcasts(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, sess.ID, "claude-A")
	_, err := mgr.SetScratchpad(ctx, sess.ID, "claude-A", scratchA)
	require.NoError(t, err)
	bindClaude(t, mgr, sess.ID, "claude-B")
	_, err = mgr.SetScratchpad(ctx, sess.ID, "claude-B", scratchB)
	require.NoError(t, err)
	bindClaude(t, mgr, sess.ID, "claude-A")
	before := len(rec.all())

	changed, err := mgr.SetScratchpad(ctx, sess.ID, "claude-A", scratchA)
	require.NoError(t, err)

	assert.True(t, changed)
	got, _ := mgr.Get(sess.ID)
	assert.Equal(t, scratchA, got.ScratchpadDir)
	require.Len(t, rec.all(), before+1)
	assert.Equal(t, scratchA, rec.all()[before].ScratchpadDir)
}

func TestSetScratchpad_ReorderedClearPairNeverMovesBack(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, sess.ID, "claude-A")
	bindClaude(t, mgr, sess.ID, "claude-B")
	_, err := mgr.SetScratchpad(ctx, sess.ID, "claude-B", scratchB)
	require.NoError(t, err)

	changed, err := mgr.SetScratchpad(ctx, sess.ID, "claude-A", scratchA)
	require.NoError(t, err)

	assert.False(t, changed)
	got, _ := mgr.Get(sess.ID)
	assert.Equal(t, scratchB, got.ScratchpadDir)
}

func TestSetScratchpad_LeavesOtherSessionsAlone(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	a := createLaunchedSession(t, mgr, st, t.TempDir())
	b := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, a.ID, "claude-A")
	bindClaude(t, mgr, b.ID, "claude-B")

	_, err := mgr.SetScratchpad(context.Background(), a.ID, "claude-A", scratchA)
	require.NoError(t, err)

	gotB, _ := mgr.Get(b.ID)
	assert.Empty(t, gotB.ScratchpadDir)
}

func TestSetScratchpad_UnknownSession(t *testing.T) {
	mgr := newTestManager(t, openTestStore(t), nil, nil)
	_, err := mgr.SetScratchpad(context.Background(), 999999, "claude-A", scratchA)
	assert.ErrorIs(t, err, ErrUnknownSession)
}
