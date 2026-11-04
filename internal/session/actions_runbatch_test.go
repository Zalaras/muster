package session

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestRunBatch_FilesEachIDUnderTheOutcomeItsOpReturned is the one loop End, Remove and Restart
// share: a nil error files the id under the outcome the op returned (done, queued or skipped),
// the two refusals the actions already treat as a skip stay skipped however they are wrapped,
// any other error is failed, and every bucket keeps the listed order.
func TestRunBatch_FilesEachIDUnderTheOutcomeItsOpReturned(t *testing.T) {
	type verdict struct {
		outcome BatchOutcome
		err     error
	}
	ids := []int64{1, 2, 3, 4, 5, 6, 7, 8, 9}
	verdicts := map[int64]verdict{
		1: {BatchDone, nil},
		2: {BatchQueued, nil},
		3: {BatchSkipped, nil},
		4: {BatchDone, ErrUnknownSession},
		5: {BatchDone, ErrSessionNotAlive},
		6: {BatchDone, fmt.Errorf("wrapped: %w", ErrSessionNotAlive)},
		7: {BatchDone, errors.New("tmux refused")},
		8: {BatchQueued, nil},
		9: {BatchDone, nil},
	}
	r := newRestartRig(t)
	var ran []int64

	res, err := r.mgr.RunBatch(ids, "restarting", func(id int64) (BatchOutcome, error) {
		ran = append(ran, id)
		v := verdicts[id]
		return v.outcome, v.err
	})

	require.NoError(t, err)
	assert.Equal(t, ids, ran, "every id ran, in listed order, a failure stopping nothing")
	assert.Equal(t, []int64{1, 9}, res.Done)
	assert.Equal(t, []int64{2, 8}, res.Queued)
	assert.Equal(t, []int64{3, 4, 5, 6}, res.Skipped)
	assert.Equal(t, []int64{7}, res.Failed)
}

func TestRunBatch_AnEmptyListIsAnEmptyResult(t *testing.T) {
	res, err := newRestartRig(t).mgr.RunBatch(nil, "restarting", func(int64) (BatchOutcome, error) {
		require.Fail(t, "no id, no op")
		return BatchDone, nil
	})

	require.NoError(t, err)
	assert.Equal(t, BatchResult{}, res)
}

// TestRunBatch_RunsEachOpUnderItsSessionsLock: while an op runs, another holder of the same
// session's lock waits for it; the ids before and after are not held.
func TestRunBatch_RunsEachOpUnderItsSessionsLock(t *testing.T) {
	r := newRestartRig(t)
	acquired := map[int64]chan struct{}{1: make(chan struct{}), 2: make(chan struct{}), 3: make(chan struct{})}
	var heldAgainst []int64

	_, err := r.mgr.RunBatch([]int64{1, 2, 3}, "restarting", func(id int64) (BatchOutcome, error) {
		go func() {
			unlock := r.mgr.LockSession(id)
			close(acquired[id])
			unlock()
		}()
		select {
		case <-acquired[id]:
		case <-time.After(100 * time.Millisecond):
			heldAgainst = append(heldAgainst, id)
		}
		return BatchDone, nil
	})
	require.NoError(t, err)

	assert.Equal(t, []int64{1, 2, 3}, heldAgainst, "a second holder of the id's lock waits while its op runs")
	for id, ch := range acquired {
		select {
		case <-ch:
		case <-time.After(10 * time.Second):
			require.Failf(t, "lock never released", "session %d's lock was still held after the batch", id)
		}
	}
}
