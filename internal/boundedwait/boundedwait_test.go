package boundedwait

import (
	"bytes"
	"context"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
)

// TestWait_ReturnsOnceTheGroupIsDoneWithoutWarning: a group that finishes before ctx ends
// lets Wait return with nothing logged.
func TestWait_ReturnsOnceTheGroupIsDoneWithoutWarning(t *testing.T) {
	var buf bytes.Buffer
	var wg sync.WaitGroup
	wg.Add(1)
	release := make(chan struct{})
	go func() {
		<-release
		wg.Done()
	}()

	returned := make(chan struct{})
	go func() {
		Wait(context.Background(), &wg, zerolog.New(&buf), "loop did not stop")
		close(returned)
	}()

	select {
	case <-returned:
		t.Fatal("Wait returned before the group was done")
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	select {
	case <-returned:
	case <-time.After(5 * time.Second):
		t.Fatal("Wait did not return once the group was done")
	}
	assert.Empty(t, buf.String())
}

// TestWait_GivesUpAndWarnsOnceCtxIsDone: a group that never finishes makes Wait return when
// ctx ends, logging msg once at warn.
func TestWait_GivesUpAndWarnsOnceCtxIsDone(t *testing.T) {
	var buf bytes.Buffer
	var wg sync.WaitGroup
	wg.Add(1)
	t.Cleanup(wg.Done)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	Wait(ctx, &wg, zerolog.New(&buf), "loop did not stop")

	assert.JSONEq(t, `{"level":"warn","message":"loop did not stop"}`, buf.String())
}
