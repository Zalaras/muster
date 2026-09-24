// Package tty answers one narrow question about a controlling terminal: is its line
// discipline canonical (line-buffered, "cooked") or raw. The shell-activity poller
// (internal/server/shellactivity.go) uses this to tell a program waiting for the user
// (raw mode — zsh's zle, readline, vim, Claude Code's trust prompt) from one doing batch
// work (canonical) — kb:adr/surfaces-shell-busy-from-tmux-process-state. This is a BSD
// ioctl (TIOCGETA); Muster is macOS-only (CLAUDE.md), so no other platform is supported.
package tty

import (
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

// IsCanonical opens ttyPath read-only and reports whether ICANON is set on its line
// discipline via a TIOCGETA ioctl. O_NONBLOCK keeps the open from waiting on a device
// with nothing ready; O_NOCTTY keeps this process from acquiring ttyPath as its own
// controlling terminal. Measured not to disturb the shell process already attached to
// the tty.
func IsCanonical(ttyPath string) (bool, error) {
	f, err := os.OpenFile(ttyPath, os.O_RDONLY|unix.O_NONBLOCK|unix.O_NOCTTY, 0)
	if err != nil {
		return false, fmt.Errorf("opening %q: %w", ttyPath, err)
	}
	defer func() { _ = f.Close() }()

	termios, err := unix.IoctlGetTermios(int(f.Fd()), unix.TIOCGETA)
	if err != nil {
		return false, fmt.Errorf("TIOCGETA %q: %w", ttyPath, err)
	}
	return termios.Lflag&unix.ICANON != 0, nil
}
