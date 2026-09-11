// Package termbridge owns the daemon-side PTY lifecycle for one terminal socket
// (kb:anchor/terminal.ws): spawning `tmux attach-session` under a `creack/pty`-managed
// pseudo-terminal, streaming raw bytes both directions, and resizing per FINDINGS §7(d)
// (pty.Setsize then tmux resize-window, never the pane-level primitive). This package
// knows nothing about WebSockets or sessions — internal/server/terminal.go is the only
// caller, and owns the socket-level concerns (auth, takeover, frame shapes).
package termbridge

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"

	"github.com/Zalaras/muster/internal/tmux"
)

// initialCols/initialRows is the attach PTY's starting geometry before the client's
// first resize frame arrives (kb:anchor/terminal.ws).
const (
	initialCols = 80
	initialRows = 24
)

// Bridge is one daemon-owned PTY attached to a tmux session.
type Bridge struct {
	cmd    *exec.Cmd
	pty    *os.File
	tmux   *tmux.Client
	target string

	closeOnce sync.Once
	closeErr  error
}

// Attach spawns `tmux attach-session -t target` under a fresh PTY, with TERM/LANG set
// explicitly (REQ-6 — without them tmux falls back to ASCII line-drawing and Claude's
// boxes render as "qqqq", which looks exactly like a rendering bug rather than a missing
// env var). ctx is exec.CommandContext's context: if it is canceled, the attach process
// is killed. In practice ctx is the caller's request context, so the Bridge's lifetime
// tracks that request for as long as it's live, and Close is what tears it down
// explicitly and idempotently once the caller is done with it either way.
func Attach(ctx context.Context, tmuxClient *tmux.Client, target string) (*Bridge, error) {
	argv := tmuxClient.AttachArgv(target)
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "LANG=en_US.UTF-8")

	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: initialCols, Rows: initialRows})
	if err != nil {
		return nil, fmt.Errorf("attaching tmux target %q: %w", target, err)
	}
	return &Bridge{cmd: cmd, pty: f, tmux: tmuxClient, target: target}, nil
}

// Read reads raw PTY output verbatim. A macOS PTY read returns EIO once the other end
// (the attach process) has exited; treat that as clean EOF (FINDINGS §7), matching what
// every other EOF-producing reader would report.
func (b *Bridge) Read(p []byte) (int, error) {
	n, err := b.pty.Read(p)
	if err != nil && errors.Is(err, syscall.EIO) {
		return n, io.EOF
	}
	return n, err
}

// Write sends raw input bytes to the attached pane.
func (b *Bridge) Write(p []byte) (int, error) {
	return b.pty.Write(p)
}

// Resize applies pty.Setsize (sizes the region the tmux client paints into) and then
// tmux resize-window (sizes the window the application lays out against) — in that
// order, always both, never the pane-level primitive (FINDINGS §7(d)).
func (b *Bridge) Resize(ctx context.Context, cols, rows int) error {
	if err := pty.Setsize(b.pty, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}); err != nil {
		return fmt.Errorf("pty.Setsize: %w", err)
	}
	if err := b.tmux.ResizeWindow(ctx, b.target, cols, rows); err != nil {
		return fmt.Errorf("tmux resize-window: %w", err)
	}
	return nil
}

// Close tears down the PTY and the attach process. Safe to call more than once (the
// terminal handler's takeover path and its own deferred cleanup both call it).
func (b *Bridge) Close() error {
	b.closeOnce.Do(func() {
		b.closeErr = b.pty.Close()
		if b.cmd.Process != nil {
			_ = b.cmd.Process.Kill()
			_, _ = b.cmd.Process.Wait()
		}
	})
	return b.closeErr
}
