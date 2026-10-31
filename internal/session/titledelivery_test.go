package session

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

// titleDeliveryStates is every source state the delivery rules must hold from, as
// kb:lesson/invariant-missed-by-per-transition-tests asks: the six displayed states plus an
// ended (kept-for-resume) row.
var titleDeliveryStates = []struct {
	name  string
	state State
	alive bool
}{
	{"started", StateStarted, true},
	{"planning", StatePlanning, true},
	{"working", StateWorking, true},
	{"needs_input", StateNeedsInput, true},
	{"failed", StateFailed, true},
	{"idle", StateIdle, true},
	{"ended", StateIdle, false},
}

func nameUpdate(name string) claudecode.StatusUpdate {
	return claudecode.StatusUpdate{Title: &name}
}

// titleRig is one session in a chosen source state whose Claude Code name is already
// "Orig" (a status post landed before any rename), plus the upsert recorder and its store.
type titleRig struct {
	t   *testing.T
	mgr *Manager
	rec *upsertsRecorder
	id  int64
	st  *store.Store
}

func newTitleRig(t *testing.T, state State, alive bool) *titleRig {
	t.Helper()
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	advanceToState(t, mgr, sess.ID, "claude-d", state, true)
	if !alive {
		_, err := mgr.markEnded(context.Background(), sess.ID)
		require.NoError(t, err)
	}
	_, err := mgr.ApplyStatus(context.Background(), sess.ID, nameUpdate("Orig"))
	require.NoError(t, err)
	return &titleRig{t: t, mgr: mgr, rec: rec, id: sess.ID, st: st}
}

func (r *titleRig) setTitle(title *string) {
	r.t.Helper()
	_, err := r.mgr.SetTitle(context.Background(), r.id, title)
	require.NoError(r.t, err)
}

func (r *titleRig) report(name string) {
	r.t.Helper()
	_, err := r.mgr.ApplyStatus(context.Background(), r.id, nameUpdate(name))
	require.NoError(r.t, err)
}

func (r *titleRig) get() *Session {
	r.t.Helper()
	sess, ok := r.mgr.Get(r.id)
	require.True(r.t, ok)
	return sess
}

// TestApplyStatus_TitleOverrideDelivery checks through Manager.ApplyStatus and
// edge cases 1, 13, 14 and 15: before delivery a reported Claude name never touches the
// override; after delivery (a send, a resume's --name, or Claude's name matching it) a
// reported name that differs from both the override and the name Claude held just before
// delivery clears it — persisted, one sessionUpsert, the dashboard showing Claude's name
// — and a straggling report of the pre-delivery name never does. Crossed with every
// source state: a status post must leave the state machine's fields where they were.
func TestApplyStatus_TitleOverrideDelivery(t *testing.T) {
	const mine = "Mine"
	tests := []struct {
		name string
		// prepare runs after SetTitle(mine) (Claude's name is "Orig"), before the reports.
		prepare func(r *titleRig)
		reports []string
		// override is the override value prepare leaves in place.
		override    string
		wantCleared bool
	}{
		{
			name:     "REQ-8: before delivery a different name leaves the override",
			reports:  []string{"Other"},
			override: mine,
		},
		{
			name:     "REQ-8: before delivery a run of different names leaves the override",
			reports:  []string{"Other", "Another", "Orig"},
			override: mine,
		},
		{
			name:     "claude name equal to the override is delivered, override kept",
			reports:  []string{mine},
			override: mine,
		},
		{
			name:        "edge 1: after a send a suffixed name clears the override",
			prepare:     func(r *titleRig) { r.takeSend(mine) },
			reports:     []string{"Mine-calm-brook"},
			override:    mine,
			wantCleared: true,
		},
		{
			name:        "edge 13: after a send a /rename clears the override",
			prepare:     func(r *titleRig) { r.takeSend(mine) },
			reports:     []string{"Typed In Claude"},
			override:    mine,
			wantCleared: true,
		},
		{
			name:     "edge 14: after a send a straggling pre-delivery name keeps the override",
			prepare:  func(r *titleRig) { r.takeSend(mine) },
			reports:  []string{"Orig"},
			override: mine,
		},
		{
			name:     "after a send Claude reports the override, then a straggling pre-delivery name: kept",
			prepare:  func(r *titleRig) { r.takeSend(mine) },
			reports:  []string{mine, "Orig"},
			override: mine,
		},
		{
			name:        "after a send Claude reports the override, then a /rename: cleared",
			prepare:     func(r *titleRig) { r.takeSend(mine) },
			reports:     []string{mine, "Typed In Claude"},
			override:    mine,
			wantCleared: true,
		},
		{
			name:        "after a send a straggler is kept, a later suffix still clears",
			prepare:     func(r *titleRig) { r.takeSend(mine) },
			reports:     []string{"Orig", "Mine-calm-brook"},
			override:    mine,
			wantCleared: true,
		},
		{
			name: "REQ-6: delivered by a resume --name, a suffixed name clears",
			prepare: func(r *titleRig) {
				r.t.Helper()
				r.mgr.MarkTitleSent(r.id, mine)
			},
			reports:     []string{"Mine-calm-brook"},
			override:    mine,
			wantCleared: true,
		},
		{
			name: "REQ-6: delivered by a resume --name, a straggling pre-delivery name is kept",
			prepare: func(r *titleRig) {
				r.t.Helper()
				r.mgr.MarkTitleSent(r.id, mine)
			},
			reports:  []string{"Orig"},
			override: mine,
		},
		{
			name:     "delivered by match, a straggling pre-delivery name is kept",
			reports:  []string{mine, "Orig"},
			override: mine,
		},
		{
			name:        "delivered by match, a later /rename clears",
			reports:     []string{mine, "Typed In Claude"},
			override:    mine,
			wantCleared: true,
		},
		{
			name: "edge 15: override set equal to Claude's current name, then a /rename clears",
			prepare: func(r *titleRig) {
				r.setTitle(nil)
				r.setTitle(strPtr("Orig"))
			},
			reports:     []string{"Typed In Claude"},
			override:    "Orig",
			wantCleared: true,
		},
		{
			name: "edge 15: override set equal to Claude's current name, the same name again keeps it",
			prepare: func(r *titleRig) {
				r.setTitle(nil)
				r.setTitle(strPtr("Orig"))
			},
			reports:  []string{"Orig"},
			override: "Orig",
		},
	}

	for _, state := range titleDeliveryStates {
		for _, tt := range tests {
			t.Run(state.name+"/"+tt.name, func(t *testing.T) {
				r := newTitleRig(t, state.state, state.alive)
				r.setTitle(strPtr(mine))
				if tt.prepare != nil {
					tt.prepare(r)
				}
				before := r.get()
				require.NotNil(t, before.TitleOverride)
				require.Equal(t, tt.override, *before.TitleOverride)

				for _, name := range tt.reports[:len(tt.reports)-1] {
					r.report(name)
				}
				upsertsBeforeLast := len(r.rec.all())
				last := tt.reports[len(tt.reports)-1]
				r.report(last)
				after := r.get()
				final := r.rec.all()[upsertsBeforeLast:]

				if tt.wantCleared {
					assert.Nil(t, after.TitleOverride, "the override must clear")
					require.NotNil(t, after.DisplayTitle())
					assert.Equal(t, last, *after.DisplayTitle(), "the dashboard shows Claude's name")
					require.Len(t, final, 1, "a clear broadcasts exactly one sessionUpsert")
					require.NotNil(t, final[0].DisplayTitle())
					assert.Equal(t, last, *final[0].DisplayTitle())
					assert.Nil(t, final[0].TitleOverride)
				} else {
					require.NotNil(t, after.TitleOverride, "the override must stay")
					assert.Equal(t, tt.override, *after.TitleOverride)
					require.NotNil(t, after.DisplayTitle())
					assert.Equal(t, tt.override, *after.DisplayTitle(), "INV-1: the wire title is the override")
					assert.Empty(t, final, "a kept override changes nothing on the wire: no upsert")
				}

				// A status post is never a state source (kb:anchor/state.transitions).
				assert.Equal(t, before.State, after.State)
				assert.Equal(t, before.Alive, after.Alive)
				assert.Equal(t, before.Attention, after.Attention)
				assert.Equal(t, before.Failure, after.Failure)

				// The clear (or the keep) is what a restarted daemon loads.
				reloaded := newTestManager(t, r.st, nil, nil)
				require.NoError(t, reloaded.LoadAll(context.Background()))
				got, ok := reloaded.Get(r.id)
				require.True(t, ok)
				assert.Equal(t, after.TitleOverride, got.TitleOverride, "persisted")
			})
		}
	}
}

func TestApplyStatus_PostWithoutANameNeverClears(t *testing.T) {
	for _, state := range titleDeliveryStates {
		t.Run(state.name, func(t *testing.T) {
			r := newTitleRig(t, state.state, state.alive)
			r.setTitle(strPtr("Mine"))
			r.takeSend("Mine")

			_, err := r.mgr.ApplyStatus(context.Background(), r.id, claudecode.StatusUpdate{
				Context: &claudecode.StatusContext{UsedPct: 10, TotalInputTokens: 1000, WindowSize: 200000},
			})
			require.NoError(t, err)

			got := r.get()
			require.NotNil(t, got.TitleOverride, "a post carrying no name says nothing about the name")
			assert.Equal(t, "Mine", *got.TitleOverride)
		})
	}
}

// TestApplyStatus_ClearedOverrideStaysClearedForTheSameNameAgain: once cleared, the
// same Claude name arriving again changes nothing further (no second upsert).
func TestApplyStatus_ClearedOverrideStaysClearedForTheSameNameAgain(t *testing.T) {
	r := newTitleRig(t, StateIdle, true)
	r.setTitle(strPtr("Mine"))
	r.takeSend("Mine")
	r.report("Mine-calm-brook")
	require.Nil(t, r.get().TitleOverride)
	before := len(r.rec.all())

	r.report("Mine-calm-brook")

	assert.Nil(t, r.get().TitleOverride)
	assert.Len(t, r.rec.all(), before, "nothing more to broadcast")
	_, pending := r.mgr.PendingTitle(r.id)
	assert.False(t, pending)
}

// takeSend records a send of want through the ingest path's seam and fails the test when
// the manager did not hand back want as a send.
func (r *titleRig) takeSend(want string) {
	r.t.Helper()
	got, send := r.mgr.TakeTitleToSend(r.id)
	require.True(r.t, send)
	require.Equal(r.t, want, got)
}
