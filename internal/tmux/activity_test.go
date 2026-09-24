package tmux

import (
	"context"
	"errors"
	"os/exec"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeActivityExec builds a Client whose exec seam is entirely canned — the same
// same-package-struct-literal pattern TestKillSession_PostKillRecheckStillThereReturnsTheOriginalKillError
// uses — for ListPaneActivity/ScrollCopyMode/CancelCopyMode tests whose assertion is
// about call shape (D1/D2/D4) or error propagation, never a tmux-observable effect (that
// coverage is the *_RealTmux tests below, on a real per-test socket).
func fakeActivityExec(t *testing.T, fn func(args []string) ([]byte, error)) *Client {
	t.Helper()
	return &Client{
		socket: "irrelevant-fake-socket",
		exec: func(_ context.Context, name string, args ...string) (stdout, stderr []byte, err error) {
			require.Equal(t, "tmux", name)
			out, err := fn(args)
			return out, nil, err
		},
	}
}

// exitErrorWithStderr fabricates a real *exec.ExitError (not hand-built) carrying msg on
// stderr, the same "echo ... >&2; exit 1" idiom the kill-session test above uses — so a
// production errors.As(err, &exitErr) matches exactly as it would against real tmux.
func exitErrorWithStderr(t *testing.T, msg string) error {
	t.Helper()
	_, err := exec.CommandContext(context.Background(), "sh", "-c", "echo "+msg+" >&2; exit 1").CombinedOutput()
	require.Error(t, err)
	var exitErr *exec.ExitError
	require.ErrorAs(t, err, &exitErr)
	return err
}

// TestListPaneActivity_ParsesEachFieldOfEveryLine covers the format string's four
// fields, including both AlternateOn readings ("1"/"0" -> true/false) on two separate
// lines.
func TestListPaneActivity_ParsesEachFieldOfEveryLine(t *testing.T) {
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		require.True(t, slices.Contains(args, "list-panes"))
		require.True(t, slices.Contains(args, "-a"))
		return []byte("muster-1 zsh 0 /dev/ttys001\nmuster-2-shell vim 1 /dev/ttys002\n"), nil
	})

	got, err := c.ListPaneActivity(context.Background())

	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, PaneActivity{SessionName: "muster-1", CurrentCommand: "zsh", AlternateOn: false, Tty: "/dev/ttys001"}, got[0])
	assert.Equal(t, PaneActivity{SessionName: "muster-2-shell", CurrentCommand: "vim", AlternateOn: true, Tty: "/dev/ttys002"}, got[1])
}

// TestListPaneActivity_MalformedLineIsSkippedDefensively covers the "a Muster-owned
// session/window name never contains a space" defensive branch: a line with the wrong
// field count is dropped rather than corrupting the result or erroring the whole call.
func TestListPaneActivity_MalformedLineIsSkippedDefensively(t *testing.T) {
	c := fakeActivityExec(t, func(_ []string) ([]byte, error) {
		return []byte("muster-1 zsh 0 /dev/ttys001\nsomething with too many spaces here\n"), nil
	})

	got, err := c.ListPaneActivity(context.Background())

	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "muster-1", got[0].SessionName)
}

// TestListPaneActivity_EmptyOutputReturnsNilNotError covers a server with no panes at
// all (distinct from no server, covered by the real-tmux test below).
func TestListPaneActivity_EmptyOutputReturnsNilNotError(t *testing.T) {
	c := fakeActivityExec(t, func(_ []string) ([]byte, error) { return []byte(""), nil })

	got, err := c.ListPaneActivity(context.Background())

	require.NoError(t, err)
	assert.Nil(t, got)
}

// TestListPaneActivity_NoServerYetIsEmptyNotError mirrors ListSessions' own convention
// (its doc comment / TestListSessions_ReturnsEveryNameNoServerIsAnEmptyResultNotAnError):
// a socket nothing has ever bound a server to must read as "no panes", not an error —
// real tmux, since the "No such file or directory" wording is itself the measured shape.
func TestListPaneActivity_NoServerYetIsEmptyNotError(t *testing.T) {
	c := New(newTestSocket(t))

	got, err := c.ListPaneActivity(context.Background())

	require.NoError(t, err)
	assert.Empty(t, got)
}

// TestListPaneActivity_UnreachableSocketReturnsAnError covers the same
// isConnectionFailure distinction ListSessions/PaneExists already make (D25's class of
// bug): a socket that exists but can't be reached must not silently read as "no panes".
// The wording isConnectionFailure matches lives in the subprocess's *output* (run()
// folds it into the wrapped error's %s, same as every other tmux command), not in the
// bare *exec.ExitError's own message — so, like TestKillSession_PostKillRecheckStillThereReturnsTheOriginalKillError,
// this returns CombinedOutput's output alongside its error rather than discarding it.
func TestListPaneActivity_UnreachableSocketReturnsAnError(t *testing.T) {
	c := fakeActivityExec(t, func(_ []string) ([]byte, error) {
		return exec.CommandContext(context.Background(), "sh", "-c",
			"echo 'error connecting to /tmp/muster-x/tmux.sock (Permission denied)' >&2; exit 1").CombinedOutput()
	})

	got, err := c.ListPaneActivity(context.Background())

	require.Error(t, err)
	assert.Nil(t, got)
}

// TestListPaneActivity_NonExitErrorIsAlwaysWrapped covers run's own ctx-deadline branch
// (a bare wrapped ctx.Err(), never an *exec.ExitError, REQ-11's shape in KillSession's
// doc comment) — errors.As must miss and the call must still surface an error, never
// (nil, nil).
func TestListPaneActivity_NonExitErrorIsAlwaysWrapped(t *testing.T) {
	c := fakeActivityExec(t, func(_ []string) ([]byte, error) {
		return nil, errors.New("some non-ExitError failure")
	})

	got, err := c.ListPaneActivity(context.Background())

	require.Error(t, err)
	assert.Nil(t, got)
}

// TestListPaneActivity_RealTmux_OneInvocationCoversEveryPane covers D4 for real: two
// live sessions on one socket are both returned by a single tmux exec, proven by
// wrapping the client's own exec seam with a call counter after both sessions already
// exist (so NewSession's own execs are excluded from the count).
func TestListPaneActivity_RealTmux_OneInvocationCoversEveryPane(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	id1, id2 := nextID(t), nextID(t)+1
	name1 := "muster-" + strconv.FormatInt(id1, 10)
	name2 := "muster-" + strconv.FormatInt(id2, 10)

	_, _, err := c.NewSession(context.Background(), id1, dir, nil, sleepCommand())
	require.NoError(t, err)
	_, _, err = c.NewSession(context.Background(), id2, dir, nil, sleepCommand())
	require.NoError(t, err)

	var calls int
	realExec := c.exec
	c.exec = func(ctx context.Context, name string, args ...string) (stdout, stderr []byte, err error) {
		calls++
		return realExec(ctx, name, args...)
	}

	got, err := c.ListPaneActivity(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 1, calls, "D4: every shell/pane on the socket must be read in one tmux invocation")
	var names []string
	for _, pa := range got {
		names = append(names, pa.SessionName)
	}
	assert.ElementsMatch(t, []string{name1, name2}, names)
}

// TestScrollCopyMode_ZeroLinesIsANoOpNoExecCalls covers the lines==0 short-circuit: no
// tmux invocation of any kind, not even the copy-mode-state read.
func TestScrollCopyMode_ZeroLinesIsANoOpNoExecCalls(t *testing.T) {
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		t.Fatalf("unexpected tmux invocation for lines=0: %v", args)
		return nil, nil
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", 0)

	require.NoError(t, err)
	assert.False(t, entered)
}

// TestScrollCopyMode_EntersCopyModeWhenNotInModeAndHasHistory covers D1's positive case
// together with D2 (a single send-keys -N invocation, not a loop) and the scroll-up
// direction for a positive lines value.
func TestScrollCopyMode_EntersCopyModeWhenNotInModeAndHasHistory(t *testing.T) {
	var calls [][]string
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		calls = append(calls, append([]string(nil), args...))
		switch {
		case slices.Contains(args, "display-message"):
			return []byte("0 5\n"), nil // not in mode, history_size 5
		case slices.Contains(args, "copy-mode"):
			return []byte(""), nil
		case slices.Contains(args, "send-keys"):
			return []byte(""), nil
		default:
			t.Fatalf("unexpected tmux subcommand: %v", args)
			return nil, nil
		}
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", 3)

	require.NoError(t, err)
	assert.True(t, entered)
	require.Len(t, calls, 3, "D1: display-message, then copy-mode, then send-keys — no more")
	assert.True(t, slices.Contains(calls[1], "-e"), "copy-mode must use -e so tmux auto-exits at the bottom")
	assert.True(t, slices.Contains(calls[2], "-N"))
	assert.True(t, slices.Contains(calls[2], "3"))
	assert.True(t, slices.Contains(calls[2], "scroll-up"))
}

// TestScrollCopyMode_SkipsCopyModeWhenAlreadyInAMode is D1's negative case: the pane is
// already in a mode, so no copy-mode invocation may occur — only the state read and the
// send-keys.
func TestScrollCopyMode_SkipsCopyModeWhenAlreadyInAMode(t *testing.T) {
	var calls [][]string
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		calls = append(calls, append([]string(nil), args...))
		if slices.Contains(args, "display-message") {
			return []byte("1 50\n"), nil // already in mode
		}
		return []byte(""), nil
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", 3)

	require.NoError(t, err)
	assert.True(t, entered)
	require.Len(t, calls, 2, "D1: already in a mode must skip the copy-mode call entirely")
	for _, call := range calls {
		assert.False(t, slices.Contains(call, "copy-mode"), "must never re-enter copy-mode for a pane already in one")
	}
}

// TestScrollCopyMode_NoHistoryIsANoOp covers REQ-12/edge case 10: a pane with no history
// yet must neither enter copy-mode nor send any scroll keys — "nothing to scroll to",
// distinct from the lines==0 no-op above (this one still reads state once).
func TestScrollCopyMode_NoHistoryIsANoOp(t *testing.T) {
	var calls [][]string
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		calls = append(calls, append([]string(nil), args...))
		return []byte("0 0\n"), nil
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", 5)

	require.NoError(t, err)
	assert.False(t, entered)
	require.Len(t, calls, 1, "only the state read — no copy-mode, no send-keys")
}

// TestScrollCopyMode_NegativeLinesScrollsDown covers the sign convention: negative lines
// scroll toward the live bottom.
func TestScrollCopyMode_NegativeLinesScrollsDown(t *testing.T) {
	var sendKeysArgs []string
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		if slices.Contains(args, "display-message") {
			return []byte("1 50\n"), nil
		}
		sendKeysArgs = args
		return []byte(""), nil
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", -4)

	require.NoError(t, err)
	assert.True(t, entered)
	assert.True(t, slices.Contains(sendKeysArgs, "scroll-down"))
	assert.True(t, slices.Contains(sendKeysArgs, "4"))
	assert.False(t, slices.Contains(sendKeysArgs, "scroll-up"))
}

// TestScrollCopyMode_DisplayMessageErrorPropagates covers the state-read failing before
// any mutating command is attempted.
func TestScrollCopyMode_DisplayMessageErrorPropagates(t *testing.T) {
	c := fakeActivityExec(t, func(_ []string) ([]byte, error) {
		return nil, exitErrorWithStderr(t, "boom-display-message")
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", 5)

	require.Error(t, err)
	assert.False(t, entered)
}

// TestScrollCopyMode_CopyModeCommandErrorPropagates covers the entry command itself
// failing: the error surfaces and entered stays false (send-keys must never run after a
// failed entry).
func TestScrollCopyMode_CopyModeCommandErrorPropagates(t *testing.T) {
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		if slices.Contains(args, "display-message") {
			return []byte("0 5\n"), nil
		}
		if slices.Contains(args, "copy-mode") {
			return nil, exitErrorWithStderr(t, "boom-copy-mode")
		}
		t.Fatalf("send-keys must never run after a failed copy-mode entry: %v", args)
		return nil, nil
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", 5)

	require.Error(t, err)
	assert.False(t, entered)
}

// TestScrollCopyMode_SendKeysErrorPropagates covers the terminal command failing after a
// successful (or skipped) entry.
func TestScrollCopyMode_SendKeysErrorPropagates(t *testing.T) {
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		switch {
		case slices.Contains(args, "display-message"):
			return []byte("1 50\n"), nil
		case slices.Contains(args, "send-keys"):
			return nil, exitErrorWithStderr(t, "boom-send-keys")
		default:
			t.Fatalf("unexpected call: %v", args)
			return nil, nil
		}
	})

	entered, err := c.ScrollCopyMode(context.Background(), "muster-1-shell", 5)

	require.Error(t, err)
	assert.False(t, entered)
}

// TestCancelCopyMode_IssuesSendKeysCancelWithTarget covers REQ-10's own tmux command
// shape in isolation from the read loop that calls it.
func TestCancelCopyMode_IssuesSendKeysCancelWithTarget(t *testing.T) {
	var gotArgs []string
	c := fakeActivityExec(t, func(args []string) ([]byte, error) {
		gotArgs = args
		return []byte(""), nil
	})

	err := c.CancelCopyMode(context.Background(), "muster-7-shell")

	require.NoError(t, err)
	assert.True(t, slices.Contains(gotArgs, "send-keys"))
	assert.True(t, slices.Contains(gotArgs, "-X"))
	assert.True(t, slices.Contains(gotArgs, "cancel"))
	assert.True(t, slices.Contains(gotArgs, "muster-7-shell"))
}

// TestCancelCopyMode_ErrorPropagates covers the tmux command failing.
func TestCancelCopyMode_ErrorPropagates(t *testing.T) {
	c := fakeActivityExec(t, func(_ []string) ([]byte, error) {
		return nil, exitErrorWithStderr(t, "boom-cancel")
	})

	err := c.CancelCopyMode(context.Background(), "muster-7-shell")

	require.Error(t, err)
}

// scrollableRealSessionCommand produces enough real pane history (tmux's history-limit
// default is 2000 lines) for a real copy-mode enter to have somewhere to scroll to, then
// sits forever so the session stays live for the rest of the test.
func scrollableRealSessionCommand() []string {
	return []string{"/bin/sh", "-c", "seq 1 3000; sleep 60"}
}

// TestScrollCopyMode_RealTmux_EntersCopyModeAndAdvancesScrollPosition proves D1 against a
// genuine tmux-observable effect: a real pane's #{pane_in_mode} and #{scroll_position}
// after the call, not merely the command shape the fake-exec tests above check.
func TestScrollCopyMode_RealTmux_EntersCopyModeAndAdvancesScrollPosition(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	target, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, scrollableRealSessionCommand())
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		hs, derr := c.DisplayVar(context.Background(), target, "#{history_size}")
		return derr == nil && hs != "0" && hs != ""
	}, 5*time.Second, 50*time.Millisecond, "real pane must accumulate history before copy-mode has anywhere to scroll to")

	entered, err := c.ScrollCopyMode(context.Background(), target, 20)
	require.NoError(t, err)
	assert.True(t, entered)

	inMode, err := c.DisplayVar(context.Background(), target, "#{pane_in_mode}")
	require.NoError(t, err)
	assert.Equal(t, "1", inMode)
	scrollPos, err := c.DisplayVar(context.Background(), target, "#{scroll_position}")
	require.NoError(t, err)
	assert.NotEqual(t, "0", scrollPos, "a real scroll-up must advance the pane's scroll position")

	// TestCancelCopyMode_RealTmux_ReturnsPaneToLiveBottom's assertion, inline: proves the
	// two production entry points compose correctly against the same real pane, not just
	// each in isolation.
	require.NoError(t, c.CancelCopyMode(context.Background(), target))
	inMode2, err := c.DisplayVar(context.Background(), target, "#{pane_in_mode}")
	require.NoError(t, err)
	assert.Equal(t, "0", inMode2, "REQ-10: cancel must return the pane to the live bottom")
}
