package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// TestRestartWrites_FailedPersistRollsBackVersionBehindAndMark: every write that sets or clears
// the restart fields leaves the in-memory session exactly as it was when the store refuses it,
// and broadcasts nothing (restoreChangedFields).
func TestRestartWrites_FailedPersistRollsBackVersionBehindAndMark(t *testing.T) {
	working := restartStates()[2]
	pendingWorking := func(r *restartRig) int64 {
		id := r.behindSession(working)
		r.pend(id)
		return id
	}
	writes := []struct {
		name  string
		setup func(r *restartRig) int64
		call  func(r *restartRig, id int64) error
	}{
		{"a status post adopting a version",
			func(r *restartRig) int64 { r.installed(verNew); return r.launch("", "") },
			func(r *restartRig, id int64) error {
				_, err := r.mgr.ApplyStatus(r.ctx, id, claudecode.StatusUpdate{Version: lvl(verOld)})
				return err
			}},
		{"marking pending",
			func(r *restartRig) int64 { return r.behindSession(working) },
			func(r *restartRig, id int64) error {
				_, err := r.mgr.SetRestartPending(r.ctx, id, true)
				return err
			}},
		{"unmarking pending", pendingWorking,
			func(r *restartRig, id int64) error {
				_, err := r.mgr.SetRestartPending(r.ctx, id, false)
				return err
			}},
		{"a resume clearing them", pendingWorking,
			func(r *restartRig, id int64) error {
				_, err := r.mgr.RecordResume(r.ctx, id, "muster-resumed:@1", "%9")
				return err
			}},
		{"a relaunch clearing them", pendingWorking,
			func(r *restartRig, id int64) error {
				_, err := r.mgr.RecordLaunch(r.ctx, id, "muster-relaunched:@1", "%8")
				return err
			}},
	}
	for _, w := range writes {
		t.Run(w.name, func(t *testing.T) {
			r := newRestartRig(t)
			id := w.setup(r)
			before := r.get(id)
			broadcasts := len(r.rec.all())
			require.NoError(t, r.st.Close())

			require.Error(t, w.call(r, id), "a persist failure surfaces as an error")

			assert.Equal(t, before, r.get(id), "memory never claims what the store does not hold")
			assert.Len(t, r.rec.all(), broadcasts)
		})
	}

	t.Run("the installed version changing", func(t *testing.T) {
		r := newRestartRig(t)
		id := pendingWorking(r)
		before := r.get(id)
		broadcasts := len(r.rec.all())
		require.NoError(t, r.st.Close())

		r.installed(verOld)

		assert.Equal(t, before, r.get(id), "behind and the mark are rolled back with the failed write")
		assert.Len(t, r.rec.all(), broadcasts)
	})
}

// TestRestartWrites_FailedPersistKeepsAHeldMarkHeld: the first installed result that would
// release or drop a held mark, refused by the store, leaves the hold, the wire fields and the
// version as they were and broadcasts nothing.
func TestRestartWrites_FailedPersistKeepsAHeldMarkHeld(t *testing.T) {
	for name, installed := range map[string]string{"release": verNew, "drop": verOld} {
		t.Run(name, func(t *testing.T) {
			r := newRestartRig(t)
			id := r.behindSession(restartStates()[2])
			r.pend(id)
			r.mgr = r.freshManager()
			before := r.get(id)
			require.True(t, before.restartHeld, "fixture: the reload holds the mark")
			broadcasts := len(r.rec.all())
			require.NoError(t, r.st.Close())

			r.installed(installed)

			assert.Equal(t, before, r.get(id), "the hold is restored with the rest")
			assert.Len(t, r.rec.all(), broadcasts)
		})
	}
}
