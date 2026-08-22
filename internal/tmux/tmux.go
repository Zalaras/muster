// Package tmux wraps the `tmux` CLI operations m1-sessions needs, always against a
// dedicated socket (CLAUDE.md hard rule: never the user's default server). One tmux
// *session* named "muster" holds one *window* per Muster session; a window's target
// (docs/protocol.md §5.3 tmuxTarget, e.g. "muster:@4") is what Muster's own session
// identity keys on.
package tmux

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// tmuxSessionName is the single tmux session every window lives in, inside the
// daemon's dedicated socket. Fixed regardless of the socket name (the -tmux-socket
// flag), since the socket itself is already the isolation boundary.
const tmuxSessionName = "muster"

// Client issues tmux commands against one dedicated socket.
type Client struct {
	socket string
}

// New returns a Client bound to the given socket name (never the user's default
// tmux server).
func New(socket string) *Client {
	return &Client{socket: socket}
}

// NewWindow ensures the daemon's tmux session exists, then creates a new window in
// dir running command, with the given extra environment variables set in the pane
// (docs/protocol.md §4.2: `tmux new-window -e`). Returns the window's target
// (e.g. "muster:@4") and pane id (e.g. "%12").
func (c *Client) NewWindow(ctx context.Context, dir string, env map[string]string, command []string) (target, pane string, err error) {
	if err = c.ensureSession(ctx, dir); err != nil {
		return "", "", err
	}

	args := []string{"-L", c.socket, "new-window", "-t", tmuxSessionName + ":", "-c", dir, "-P", "-F", "#{window_id} #{pane_id}"}
	for k, v := range env {
		args = append(args, "-e", k+"="+v)
	}
	args = append(args, "--")
	args = append(args, command...)

	out, err := c.run(ctx, args...)
	if err != nil {
		return "", "", fmt.Errorf("tmux new-window: %w", err)
	}
	fields := strings.Fields(strings.TrimSpace(out))
	if len(fields) != 2 {
		return "", "", fmt.Errorf("tmux new-window: unexpected output %q", out)
	}
	return tmuxSessionName + ":" + fields[0], fields[1], nil
}

// ensureSession creates the daemon's tmux session (a single placeholder window in
// dir) if this socket's server doesn't have one yet. tmux auto-starts the server on
// the socket for either command.
func (c *Client) ensureSession(ctx context.Context, dir string) error {
	if _, err := c.run(ctx, "-L", c.socket, "has-session", "-t", tmuxSessionName); err == nil {
		return nil
	}
	if _, err := c.run(ctx, "-L", c.socket, "new-session", "-d", "-s", tmuxSessionName, "-c", dir); err != nil {
		return fmt.Errorf("tmux new-session: %w", err)
	}
	return nil
}

// PaneExists reports whether target still has a live pane (the liveness poll's only
// signal — never terminal output, CLAUDE.md hard rule).
func (c *Client) PaneExists(ctx context.Context, target string) (bool, error) {
	if target == "" {
		return false, nil
	}
	_, err := c.run(ctx, "-L", c.socket, "list-panes", "-t", target)
	if err == nil {
		return true, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return false, nil // tmux exits non-zero when the target doesn't exist
	}
	return false, fmt.Errorf("checking pane %q: %w", target, err)
}

// KillWindow kills one window by target — used by tests to simulate a dead pane
// without needing the E2E harness's own tmux socket.
func (c *Client) KillWindow(ctx context.Context, target string) error {
	if _, err := c.run(ctx, "-L", c.socket, "kill-window", "-t", target); err != nil {
		return fmt.Errorf("tmux kill-window %q: %w", target, err)
	}
	return nil
}

func (c *Client) run(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "tmux", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}
