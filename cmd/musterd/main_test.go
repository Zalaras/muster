package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/creack/pty"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
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
// a non-terminal stdin (a pipe, exactly what daemon-implementation.md's Decisions
// records run()'s stdin parameter exists to inject in tests — never a real terminal,
// unlike a pty) resolves to leave without ever reading a line.
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

// TestIsTerminal covers D12 (REQ-9): isTerminal must report false for nil, a pipe, a
// regular file, and /dev/null — the last is the regression case this plan exists for,
// since /dev/null is also a character device (measured 2026-08-31:
// mode=Dcrw-rw-rw- charDevice=true) and the old isCharDevice check wrongly treated it as
// a terminal — and true for a real pty opened with creack/pty.
func TestIsTerminal(t *testing.T) {
	t.Run("nil file is false", func(t *testing.T) {
		assert.False(t, isTerminal(nil))
	})

	t.Run("a pipe is not a terminal", func(t *testing.T) {
		r, w, err := os.Pipe()
		require.NoError(t, err)
		t.Cleanup(func() { _ = r.Close(); _ = w.Close() })

		assert.False(t, isTerminal(r))
	})

	t.Run("a regular file is not a terminal", func(t *testing.T) {
		f, err := os.CreateTemp(t.TempDir(), "regular")
		require.NoError(t, err)
		t.Cleanup(func() { _ = f.Close() })

		assert.False(t, isTerminal(f))
	})

	t.Run("dev null is not a terminal, D12's regression case", func(t *testing.T) {
		f, err := os.Open(os.DevNull)
		require.NoError(t, err)
		t.Cleanup(func() { _ = f.Close() })

		assert.False(t, isTerminal(f), "/dev/null is a character device but never a terminal — the bug REQ-9 fixes")
	})

	t.Run("a real pty is a terminal", func(t *testing.T) {
		ptmx, tty, err := pty.Open()
		require.NoError(t, err)
		t.Cleanup(func() { _ = ptmx.Close(); _ = tty.Close() })

		assert.True(t, isTerminal(ptmx), "the pty master end is a terminal")
		assert.True(t, isTerminal(tty), "the pty slave end is a terminal")
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

// ---------------------------------------------------------------------------------------
// checkClaudeCode (D11/D12)

// writeCheckClaudeCodeStub writes a real executable claude stub that echoes output and
// exits 0 for --version — a path argument, never a $PATH shim (docs/conventions.md
// §Testing).
func writeCheckClaudeCodeStub(t *testing.T, output string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "claude")
	script := fmt.Sprintf("#!/bin/sh\necho %q\nexit 0\n", output)
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

// TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel covers D11: every one of the
// four statuses maps onto the ClaudeCodeInfo fields correctly, logs at the documented
// level (info for verified, warn otherwise), and the below line names the remedy.
func TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel(t *testing.T) {
	tests := []struct {
		name          string
		bin           func(t *testing.T) string
		wantStatus    string
		wantInstalled string
		wantLevel     string
		wantMsgSubstr string
	}{
		{
			name:          "below the floor warns and names the remedy",
			bin:           func(t *testing.T) string { return writeCheckClaudeCodeStub(t, "1.0.0 (Claude Code)") },
			wantStatus:    "below",
			wantInstalled: "1.0.0",
			wantLevel:     "warn",
			wantMsgSubstr: "update Claude Code",
		},
		{
			name:          "inside the verified range logs info",
			bin:           func(t *testing.T) string { return writeCheckClaudeCodeStub(t, claudecode.Floor()+" (Claude Code)") },
			wantStatus:    "verified",
			wantInstalled: claudecode.Floor(),
			wantLevel:     "info",
		},
		{
			name:          "above the ceiling warns",
			bin:           func(t *testing.T) string { return writeCheckClaudeCodeStub(t, "99.0.0 (Claude Code)") },
			wantStatus:    "above",
			wantInstalled: "99.0.0",
			wantLevel:     "warn",
			wantMsgSubstr: "newer than any version Muster has been tested with",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			log := zerolog.New(&buf)

			info := checkClaudeCode(context.Background(), tt.bin(t), log)

			assert.Equal(t, tt.wantStatus, info.Status)
			require.NotNil(t, info.Installed)
			assert.Equal(t, tt.wantInstalled, *info.Installed)
			assert.Equal(t, claudecode.Floor(), info.Floor)
			assert.Equal(t, claudecode.Verified(), info.Verified)

			logged := buf.String()
			assert.Contains(t, logged, fmt.Sprintf(`"level":"%s"`, tt.wantLevel))
			if tt.wantMsgSubstr != "" {
				assert.Contains(t, logged, tt.wantMsgSubstr)
			}
			assert.Contains(t, logged, `"status":"`+tt.wantStatus+`"`)
			assert.Contains(t, logged, `"installed":"`+tt.wantInstalled+`"`)
		})
	}
}

// TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup covers D12/INV-3: a missing binary
// yields a serving-compatible ClaudeCodeInfo (nil Installed, populated Floor/Verified,
// status unknown) — checkClaudeCode itself has no error return, so "no error surfaces"
// means the daemon's startup path simply proceeds with this value.
func TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup(t *testing.T) {
	var buf bytes.Buffer
	log := zerolog.New(&buf)
	missingBin := filepath.Join(t.TempDir(), "no-such-claude")

	info := checkClaudeCode(context.Background(), missingBin, log)

	assert.Nil(t, info.Installed)
	assert.Equal(t, claudecode.Floor(), info.Floor)
	assert.Equal(t, claudecode.Verified(), info.Verified)
	assert.Equal(t, "unknown", info.Status)

	logged := buf.String()
	assert.Contains(t, logged, `"level":"warn"`)
	assert.Contains(t, logged, "could not determine claude code version")
	assert.NotContains(t, logged, `"installed"`, "installed must be omitted from the log, never a bogus empty string")
}
