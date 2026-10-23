package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// cancelled returns a context that is already done: the shape of a prompt that gave up
// (the save prompt stopped at shutdown, or the kill prompt's timeout) while its read is
// still blocked.
func cancelled() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
}

// pendingRead reports the in-flight read channel readLine is holding, nil when none.
func pendingRead(in *lineInput) chan string {
	in.mu.Lock()
	defer in.mu.Unlock()
	return in.pending
}

func newPipeInput(t *testing.T) (*lineInput, *os.File) {
	t.Helper()
	r, w, err := os.Pipe()
	require.NoError(t, err)
	t.Cleanup(func() { _ = r.Close(); _ = w.Close() })
	return newLineInput(r, false), w
}

func TestLineInput_ReadLine(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		want   string
		wantOK bool
	}{
		{name: "a line is trimmed", input: "  yes \n", want: "yes", wantOK: true},
		{name: "windows line ending", input: "y\r\n", want: "y", wantOK: true},
		{name: "empty line", input: "\n", want: "", wantOK: true},
		{name: "EOF with nothing is an empty answer", input: "", want: "", wantOK: true},
		{name: "EOF mid-line returns what was typed", input: "y", want: "y", wantOK: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := newLineInput(strings.NewReader(tc.input), true)

			got, ok := in.readLine(context.Background())

			assert.Equal(t, tc.want, got)
			assert.Equal(t, tc.wantOK, ok)
			assert.Nil(t, pendingRead(in), "a delivered line clears the in-flight read")
		})
	}
}

func TestLineInput_ReadLineSuccessiveLinesComeInOrder(t *testing.T) {
	in := newLineInput(strings.NewReader("one\ntwo\nthree\n"), true)

	for _, want := range []string{"one", "two", "three"} {
		got, ok := in.readLine(context.Background())
		assert.True(t, ok)
		assert.Equal(t, want, got)
	}
}

// TestLineInput_ReadLineGivesUpOnContextWithoutLosingTheNextLine is the property the
// shutdown path rests on: a prompt that gives up leaves its read in flight, and the line
// typed afterwards reaches the next prompt, not the abandoned one.
func TestLineInput_ReadLineGivesUpOnContextWithoutLosingTheNextLine(t *testing.T) {
	in, w := newPipeInput(t)

	got, ok := in.readLine(cancelled())
	assert.False(t, ok, "nothing typed: the cancelled read reports no line")
	assert.Empty(t, got)
	require.NotNil(t, pendingRead(in), "the abandoned read stays in flight")

	_, err := w.WriteString("y\n")
	require.NoError(t, err)
	got, ok = in.readLine(context.Background())

	assert.True(t, ok)
	assert.Equal(t, "y", got, "the later prompt gets the line the abandoned read collected")
}

// TestLineInput_ReadLineNeverStartsASecondReader pins the single-reader rule: two prompts
// that both give up share one read goroutine. A second reader on the same bufio.Reader
// would race (this package's tests run under -race) and could swallow a line.
func TestLineInput_ReadLineNeverStartsASecondReader(t *testing.T) {
	in, w := newPipeInput(t)

	_, _ = in.readLine(cancelled())
	first := pendingRead(in)
	_, _ = in.readLine(cancelled())
	second := pendingRead(in)

	require.NotNil(t, first)
	assert.Equal(t, first, second, "the second prompt adopted the in-flight read instead of starting its own")

	_, err := w.WriteString("one\ntwo\n")
	require.NoError(t, err)
	got1, ok1 := in.readLine(context.Background())
	got2, ok2 := in.readLine(context.Background())
	assert.True(t, ok1 && ok2)
	assert.Equal(t, []string{"one", "two"}, []string{got1, got2}, "no line is lost or reordered")
}

// TestLineInput_ReadLineReturnsALineAlreadyDeliveredWhenTheContextIsCancelled covers the
// race the second select exists for: the developer's line arrived just as the prompt was
// stopped, so it belongs to that prompt rather than being left to answer the next one.
func TestLineInput_ReadLineReturnsALineAlreadyDeliveredWhenTheContextIsCancelled(t *testing.T) {
	in, w := newPipeInput(t)
	_, _ = in.readLine(cancelled())
	pending := pendingRead(in)
	require.NotNil(t, pending)

	_, err := w.WriteString("y\n")
	require.NoError(t, err)
	require.Eventually(t, func() bool { return len(pending) == 1 }, portTestWait, portTestTick, "the in-flight read collected the line")

	got, ok := in.readLine(cancelled())

	assert.True(t, ok, "a delivered line wins over a cancelled context")
	assert.Equal(t, "y", got)
	assert.Nil(t, pendingRead(in))
}

func TestLineInput_ReadLineHonoursADeadline(t *testing.T) {
	in, _ := newPipeInput(t)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	t.Cleanup(cancel)

	start := time.Now()
	_, ok := in.readLine(ctx)

	assert.False(t, ok)
	assert.Less(t, time.Since(start), 2*time.Second, "the deadline, not the input, ends the wait")
}

func TestLineInput_ReadLineAfterEOFKeepsAnsweringEmpty(t *testing.T) {
	in := newLineInput(strings.NewReader(""), true)

	for range 2 {
		got, ok := in.readLine(context.Background())
		assert.True(t, ok)
		assert.Empty(t, got)
	}
}
