package main

import (
	"bytes"
	"io"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestResolveOnExit_ExplicitLeaveAndKillNeverConsultStdin covers REQ-3: the two explicit
// flag values pass straight through without ever looking at stdin (nil is deliberately
// passed here — a real *os.File would panic isCharDevice-adjacent code if it were
// consulted, so a nil that's never touched proves the short-circuit).
func TestResolveOnExit_ExplicitLeaveAndKillNeverConsultStdin(t *testing.T) {
	assert.Equal(t, onExitLeave, resolveOnExit("leave", nil, io.Discard, 3, "muster"))
	assert.Equal(t, onExitKill, resolveOnExit("kill", nil, io.Discard, 3, "muster"))
}

// TestResolveOnExit_AskWithNonTTYStdinIsLeave covers D21's underlying unit: "ask" against
// a non-character-device stdin (a pipe, exactly what daemon-implementation.md's Decisions
// records run()'s stdin parameter exists to inject in tests — never ModeCharDevice, unlike
// a real terminal) resolves to leave without ever reading a line.
func TestResolveOnExit_AskWithNonTTYStdinIsLeave(t *testing.T) {
	r, w, err := os.Pipe()
	require.NoError(t, err)
	t.Cleanup(func() { _ = r.Close(); _ = w.Close() })

	got := resolveOnExit("ask", r, io.Discard, 2, "muster")

	assert.Equal(t, onExitLeave, got)
}

func TestResolveOnExit_InvalidFlagValueFallsThroughToTheAskPath(t *testing.T) {
	// fs.Parse already rejects an invalid -on-exit value before resolveOnExit is ever
	// reached in production (main's own switch), but resolveOnExit itself has no case for
	// anything but "kill"/"leave" — everything else takes the ask path. Pinning this so a
	// future refactor that removes main's own validation doesn't silently start killing
	// sessions on an unrecognized value.
	r, w, err := os.Pipe()
	require.NoError(t, err)
	t.Cleanup(func() { _ = r.Close(); _ = w.Close() })

	got := resolveOnExit("bogus", r, io.Discard, 1, "muster")

	assert.Equal(t, onExitLeave, got, "an unrecognized value must never silently resolve to kill")
}

func TestIsCharDevice(t *testing.T) {
	t.Run("nil file is false", func(t *testing.T) {
		assert.False(t, isCharDevice(nil))
	})

	t.Run("a pipe is not a char device", func(t *testing.T) {
		r, w, err := os.Pipe()
		require.NoError(t, err)
		t.Cleanup(func() { _ = r.Close(); _ = w.Close() })

		assert.False(t, isCharDevice(r), "os.Pipe()'s read end must report as a pipe (FIFO), never ModeCharDevice")
	})

	t.Run("a regular file is not a char device", func(t *testing.T) {
		f, err := os.CreateTemp(t.TempDir(), "regular")
		require.NoError(t, err)
		t.Cleanup(func() { _ = f.Close() })

		assert.False(t, isCharDevice(f))
	})
}

// TestAskKillPrompt covers Edge Case 10 and REQ-3's answer parsing: only y/Y/yes
// (case-insensitive) answers kill; anything else — including an empty line — answers
// leave. Every case also asserts the prompt text names the live-session count and socket.
func TestAskKillPrompt(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  onExitDecision
	}{
		{"lowercase y answers kill", "y\n", onExitKill},
		{"uppercase Y answers kill", "Y\n", onExitKill},
		{"yes answers kill", "yes\n", onExitKill},
		{"YES (mixed case) answers kill", "YES\n", onExitKill},
		{"n answers leave", "n\n", onExitLeave},
		{"empty line answers leave", "\n", onExitLeave},
		{"garbage answers leave", "maybe\n", onExitLeave},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, w, err := os.Pipe()
			require.NoError(t, err)
			t.Cleanup(func() { _ = r.Close() })
			_, werr := w.WriteString(tt.input)
			require.NoError(t, werr)
			require.NoError(t, w.Close())

			var stderr bytes.Buffer
			got := askKillPrompt(r, &stderr, 3, "muster")

			assert.Equal(t, tt.want, got)
			assert.Contains(t, stderr.String(), "3 live sessions on tmux socket muster")
		})
	}
}

// TestAskKillPrompt_EOFWithNoInputAnswersLeave covers a stdin that closes before sending
// any line at all (e.g. piped from a command that produced no output) — ReadString
// returns io.EOF with an empty string, which must resolve to leave, not kill.
func TestAskKillPrompt_EOFWithNoInputAnswersLeave(t *testing.T) {
	r, w, err := os.Pipe()
	require.NoError(t, err)
	t.Cleanup(func() { _ = r.Close() })
	require.NoError(t, w.Close()) // EOF immediately, no bytes ever written

	got := askKillPrompt(r, io.Discard, 1, "muster")

	assert.Equal(t, onExitLeave, got)
}

// TestRun_InvalidOnExitValueIsRejected covers the flag-parsing guard ahead of
// resolveOnExit: an unrecognized -on-exit value must fail fast at startup rather than
// silently falling back to a default policy.
func TestRun_InvalidOnExitValueIsRejected(t *testing.T) {
	err := run([]string{"-on-exit", "bogus", "-addr", "127.0.0.1:0"}, nil, io.Discard, io.Discard)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "-on-exit")
}
