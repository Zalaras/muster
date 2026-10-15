package session

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// wantTake asserts what TakeTitleToSend answers right now (and spends the send).
func (r *titleRig) wantTake(wantTitle string, wantSend bool) {
	r.t.Helper()
	got, send := r.mgr.TakeTitleToSend(r.id)
	assert.Equal(r.t, wantSend, send, "TakeTitleToSend send flag")
	if wantSend {
		assert.Equal(r.t, wantTitle, got)
	}
}

// wantPending asserts what PendingTitle answers right now, without spending the send.
func (r *titleRig) wantPending(wantTitle string, wantPending bool) {
	r.t.Helper()
	got, pending := r.mgr.PendingTitle(r.id)
	assert.Equal(r.t, wantPending, pending, "PendingTitle")
	if wantPending {
		assert.Equal(r.t, wantTitle, got)
	}
}

// TestTitleToSend covers REQ-1/REQ-2/REQ-6 at the session layer, crossed with every source
// state: an override is handed out for sending at most once per value, only while it
// differs from Claude's name ("Orig"); only a rename to a different value arms a new send.
func TestTitleToSend(t *testing.T) {
	tests := []struct {
		name string
		run  func(r *titleRig)
	}{
		{"no override sends nothing", func(r *titleRig) {
			r.wantTake("", false)
			r.wantPending("", false)
		}},
		{"override differing from Claude's name is sent once", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
			r.wantTake("", false)
			r.wantTake("", false)
		}},
		{"REQ-2: still sent once whatever Claude reports afterwards, a suffixed name included", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
			r.report("Mine-calm-brook")
			r.wantTake("", false)
			r.report("Orig")
			r.wantTake("", false)
		}},
		{"REQ-2: not sent again after Claude reports the override itself", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
			r.report("Mine")
			r.wantTake("", false)
		}},
		{"edge 4: override equal to Claude's last-known name is never sent", func(r *titleRig) {
			r.setTitle(strPtr("Orig"))
			r.wantPending("", false)
			r.wantTake("", false)
		}},
		{"edge 4: override equal to Claude's name once Claude reports it is not sent", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.report("Mine")
			r.wantPending("", false)
			r.wantTake("", false)
		}},
		{"edge 3: a cleared override sends nothing", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.setTitle(nil)
			r.wantTake("", false)
		}},
		{"edge 2: rename A then B then A sends each once", func(r *titleRig) {
			r.setTitle(strPtr("A"))
			r.wantTake("A", true)
			r.wantTake("", false)
			r.setTitle(strPtr("B"))
			r.wantTake("B", true)
			r.wantTake("", false)
			r.setTitle(strPtr("A"))
			r.wantTake("A", true)
			r.wantTake("", false)
		}},
		{"a rename before the previous one was sent sends only the latest", func(r *titleRig) {
			r.setTitle(strPtr("A"))
			r.setTitle(strPtr("B"))
			r.wantTake("B", true)
			r.wantTake("", false)
		}},
		{"setting the same override again after it was sent does not re-arm it", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
			r.setTitle(strPtr("Mine"))
			r.wantTake("", false)
		}},
		{"clearing then setting the same value arms a new send", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
			r.setTitle(nil)
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
		}},
		{"last rename wins: after the override cleared on a suffix, renaming to the same value sends again", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
			r.report("Mine-calm-brook")
			require.Nil(r.t, r.get().TitleOverride)
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
		}},
		{"REQ-6: PendingTitle reads without spending the send", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantPending("Mine", true)
			r.wantPending("Mine", true)
			r.wantTake("Mine", true)
			r.wantPending("", false)
		}},
		{"REQ-6: MarkTitleSent counts as the one send, the next prompt sends nothing", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantPending("Mine", true)
			r.mgr.MarkTitleSent(r.id, "Mine")
			r.wantPending("", false)
			r.wantTake("", false)
		}},
		{"REQ-6: MarkTitleSent for a value renamed since leaves the new override armed", func(r *titleRig) {
			r.setTitle(strPtr("A"))
			r.wantPending("A", true)
			r.setTitle(strPtr("B"))
			r.mgr.MarkTitleSent(r.id, "A")
			r.wantPending("B", true)
			r.wantTake("B", true)
		}},
		{"REQ-6: MarkTitleSent with no override is a no-op", func(r *titleRig) {
			r.mgr.MarkTitleSent(r.id, "Mine")
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
		}},
	}

	for _, state := range titleDeliveryStates {
		for _, tt := range tests {
			t.Run(state.name+"/"+tt.name, func(t *testing.T) {
				tt.run(newTitleRig(t, state.state, state.alive))
			})
		}
	}
}

func TestTitleToSend_UnknownSession(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	got, send := mgr.TakeTitleToSend(9999)
	assert.False(t, send)
	assert.Empty(t, got)
	_, pending := mgr.PendingTitle(9999)
	assert.False(t, pending)
	assert.NotPanics(t, func() { mgr.MarkTitleSent(9999, "x") })
}

// TestTitleToSend_SurvivesDaemonRestartOnlyAsTheRowDoes covers edge cases 7 and 17: the
// delivery record is memory only, so after a restart an undelivered override is still sent
// at the next prompt, an override Claude already reports is not, and a delivered override
// the restart forgot is sent once more (accepted loss, edge 17).
func TestTitleToSend_SurvivesDaemonRestartOnlyAsTheRowDoes(t *testing.T) {
	tests := []struct {
		name        string
		run         func(r *titleRig)
		wantPending bool
	}{
		{"edge 7: undelivered override is still pending", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
		}, true},
		{"edge 7: override Claude already reports is not pending", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.report("Mine")
		}, false},
		{"edge 7: override cleared before the restart is not pending", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
			r.report("Mine-calm-brook")
		}, false},
		{"edge 17: a delivered override the restart forgot is pending once more", func(r *titleRig) {
			r.setTitle(strPtr("Mine"))
			r.wantTake("Mine", true)
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newTitleRig(t, StateIdle, true)
			tt.run(r)

			restarted := newTestManager(t, r.st, nil, nil)
			require.NoError(t, restarted.LoadAll(context.Background()))

			_, pending := restarted.PendingTitle(r.id)
			assert.Equal(t, tt.wantPending, pending)
		})
	}
}
