package tty

import (
	"testing"

	"github.com/creack/pty"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/sys/unix"
)

// setCanonical toggles ICANON on ttyFd via TIOCSETA, mirroring what a real shell (zsh's
// zle) or a line-editing library does when it enters/leaves raw mode — the exact
// transition D8/D9's discriminator depends on.
func setCanonical(t *testing.T, fd int, canonical bool) {
	t.Helper()
	term, err := unix.IoctlGetTermios(fd, unix.TIOCGETA)
	require.NoError(t, err)
	if canonical {
		term.Lflag |= unix.ICANON
	} else {
		term.Lflag &^= unix.ICANON
	}
	require.NoError(t, unix.IoctlSetTermios(fd, unix.TIOCSETA, term))
}

// TestIsCanonical_TrueForCanonicalFalseForRaw is D8/D9's discriminator itself, measured
// against a real kernel tty rather than asserted from the fact record alone: the same
// device flips both ways as ICANON is toggled, exactly as a shell (canonical, waiting on
// a line) differs from a batch command that never touches its own tty's line discipline
// versus a program that explicitly goes raw (readline, vim, a REPL — D8's "waiting for
// the user" case).
func TestIsCanonical_TrueForCanonicalFalseForRaw(t *testing.T) {
	master, tty, err := pty.Open()
	require.NoError(t, err)
	defer func() { _ = master.Close() }()
	defer func() { _ = tty.Close() }()

	setCanonical(t, int(tty.Fd()), true)
	got, err := IsCanonical(tty.Name())
	require.NoError(t, err)
	assert.True(t, got, "D9: a canonical tty (shell prompt idle, or a batch command like sleep) must read as canonical")

	setCanonical(t, int(tty.Fd()), false)
	got, err = IsCanonical(tty.Name())
	require.NoError(t, err)
	assert.False(t, got, "D8: a raw tty (readline, vim, Claude Code's trust prompt) must never read as canonical")
}

// TestIsCanonical_UnknownPathReturnsError covers the tty vanishing between list-panes and
// the ioctl (shellactivity.go's own comment: "the tty can vanish ... never fatal, just
// sit this session out of this tick") — IsCanonical itself must surface that as a
// wrapped, non-panicking error for the poller to catch.
func TestIsCanonical_UnknownPathReturnsError(t *testing.T) {
	_, err := IsCanonical("/dev/does-not-exist-muster-test-tty")
	require.Error(t, err)
}

// TestIsCanonical_DoesNotDisturbTheRunningProcess covers D10: reading a pane's tty mode
// must not perturb bytes already in flight on it. Data written to the master before,
// between and after several IsCanonical calls on the slave's path must all arrive intact
// and in order — proving the ioctl-only, write-nothing read doesn't touch the stream
// (the property the production doc comment claims was "measured" for a real shell). Raw
// mode, not canonical: in ICANON mode the kernel line-buffers a slave read until a line
// terminator arrives, which would make this test about the tty's line discipline rather
// than about IsCanonical's own side effects — the property under test here holds
// regardless of ICANON, so raw mode (immediate byte delivery) is the simpler, no less
// valid oracle.
func TestIsCanonical_DoesNotDisturbTheRunningProcess(t *testing.T) {
	master, ttyFile, err := pty.Open()
	require.NoError(t, err)
	defer func() { _ = master.Close() }()
	defer func() { _ = ttyFile.Close() }()

	setCanonical(t, int(ttyFile.Fd()), false)

	_, err = master.Write([]byte("before"))
	require.NoError(t, err)

	for range 5 {
		_, isCanonicalErr := IsCanonical(ttyFile.Name())
		require.NoError(t, isCanonicalErr)
	}

	_, err = master.Write([]byte("after"))
	require.NoError(t, err)

	buf := make([]byte, len("beforeafter"))
	n, err := readFull(t, ttyFile, buf)
	require.NoError(t, err)
	assert.Equal(t, "beforeafter", string(buf[:n]), "D10: repeated IsCanonical reads must not drop or reorder bytes already in flight on the tty")
}

// readFull reads until buf is full or an error occurs — os.File.Read on a pty may return
// short reads across the two separate master.Write calls above.
func readFull(t *testing.T, f interface{ Read([]byte) (int, error) }, buf []byte) (int, error) {
	t.Helper()
	total := 0
	for total < len(buf) {
		n, err := f.Read(buf[total:])
		total += n
		if err != nil {
			return total, err
		}
	}
	return total, nil
}
