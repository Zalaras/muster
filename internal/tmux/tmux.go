// Package tmux wraps the `tmux` CLI operations Muster needs, always against a dedicated
// socket (CLAUDE.md hard rule: never the user's default server). Since m2-terminal, one
// tmux *session* per Muster session ("muster-<id>", a single window running claude) is
// the topology — not m1-sessions' single shared "muster" session with one window per
// launch. Tiles needs up to 6 concurrent live surfaces, and a tmux client attaches to a
// session (showing one window), so multiple concurrent attaches need multiple sessions.
// A window's target (docs/protocol.md §5.3 tmuxTarget, e.g. "muster-7:@1") is what
// Muster's own session identity keys on.
package tmux

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// Client issues tmux commands against one dedicated socket.
type Client struct {
	socket string
}

// New returns a Client bound to the given socket (never the user's default tmux
// server). A value containing "/" is used as a filesystem path (-S); anything else is a
// named socket in tmux's own socket directory (-L) — REQ-5, so the E2E harness and
// per-test Go tests can point sockets at scratch dirs that already get deleted.
func New(socket string) *Client {
	return &Client{socket: socket}
}

// maxSocketPathLen is the longest -S socket path tmux can actually bind: AF_UNIX's
// sun_path is 104 bytes on macOS including the trailing NUL. Exceeding it fails deep
// inside tmux with a bare "File name too long" (m2 review cycle-2 Minor 8), so
// ValidateSocket rejects it up front with an error that says what to do instead.
const maxSocketPathLen = 103

// ValidateSocket rejects a socket value that cannot work before any tmux command runs:
// a filesystem path (contains "/", used with -S) longer than AF_UNIX's sun_path limit.
// Named sockets (-L) are not length-checked — tmux composes their path in its own short
// socket directory.
func ValidateSocket(socket string) error {
	if strings.Contains(socket, "/") && len(socket) > maxSocketPathLen {
		return fmt.Errorf("tmux socket path is %d bytes, over AF_UNIX's %d-byte sun_path limit — tmux would fail with \"File name too long\"; use a shorter path: %q",
			len(socket), maxSocketPathLen, socket)
	}
	return nil
}

// socketFlag returns the -L/-S argument pair for this client's socket.
func (c *Client) socketFlag() []string {
	if strings.Contains(c.socket, "/") {
		return []string{"-S", c.socket}
	}
	return []string{"-L", c.socket}
}

// serverOptions are the carry-over options the 2026-08-16 spike measured
// (spikes/FINDINGS.md §7) plus `prefix`/`prefix2 None` so keystrokes (including C-b)
// pass through to claude instead of being swallowed as a tmux prefix (plan
// Implementation Notes — daemon-impl verified manually: with `prefix None` set, sending
// literal `C-b` bytes through the PTY reaches the attached shell instead of tmux).
//
// detach-on-destroy is "on", not the spike's measured "off" (plan REQ-4, amended in
// review cycle 1, 2026-08-23): the spike measured "off" against M1's single-shared-
// session topology, where there was only ever one tmux session on the socket to hop to
// (itself). Under structural decision 1 (one tmux session per Muster session), "off"
// means a destroyed session's attach client migrates to a DIFFERENT Muster session
// instead of exiting — no PTY EOF (so no 4001/liveness nudge), a second client ends up
// attached to that other session (breaking INV-1), and keystrokes typed into the dead
// session's surface are delivered to a different session's Claude Code (review.md
// Critical 3). "on" makes the client exit cleanly when its session is destroyed, which
// is what termbridge.Bridge.Read's EIO->EOF mapping and REQ-6 depend on.
//
// destroy-unattached stays "off": re-verified under the amendment (not just carried
// over) with a throwaway creack/pty program mirroring Bridge.Close() exactly — attach a
// client to one of two sessions on a scratch socket with these exact two options set,
// then close the PTY master and kill+wait the attach process (Bridge.Close()'s own
// sequence, i.e. a normal client-initiated detach, NOT kill-session): `tmux
// list-sessions` afterward still showed both sessions and `list-clients` was empty —
// the session survives with no attached client, letting claude keep running while
// nobody is viewing it. destroy-unattached governs "does a session survive its last
// client detaching" and detach-on-destroy governs "what happens to a client when its
// session is destroyed" — two different events, so the amendment to one does not
// disturb the other.
var serverOptions = [][]string{
	{"set-option", "-g", "default-terminal", "tmux-256color"},
	{"set-option", "-as", "terminal-features", ",xterm-256color:RGB"},
	{"set-option", "-g", "escape-time", "0"},
	{"set-option", "-g", "status", "off"},
	{"set-option", "-g", "window-size", "manual"},
	{"set-option", "-g", "mouse", "off"},
	{"set-window-option", "-g", "aggressive-resize", "off"},
	{"set-option", "-g", "destroy-unattached", "off"},
	{"set-option", "-g", "detach-on-destroy", "on"},
	{"set-option", "-g", "prefix", "None"},
	{"set-option", "-g", "prefix2", "None"},
}

// NewSession creates a new tmux session "muster-<id>" (one window, running command in
// dir, with the given extra environment variables set in the pane — docs/protocol.md
// §4.2: `tmux new-session -e`). Returns the window's target (e.g. "muster-7:@1") and
// pane id (e.g. "%12"). Delegates to NewNamedSession with the "muster-<id>" convention.
func (c *Client) NewSession(ctx context.Context, id int64, dir string, env map[string]string, command []string) (target, pane string, err error) {
	return c.NewNamedSession(ctx, "muster-"+strconv.FormatInt(id, 10), dir, env, command)
}

// NewNamedSession creates a new tmux session named name (one window, running command in
// dir, with the given extra environment variables set in the pane — docs/protocol.md
// §4.2: `tmux new-session -e`). Returns the window's target (e.g. "muster-7:@1", or
// "muster-7-shell:@2" for a shell session) and pane id (e.g. "%12"). If this is the first
// command to reach the socket's server (i.e. no server was running yet), REQ-4's
// server/session-wide options are applied right after, since tmux auto-starts the server
// on first command and there is no server to configure before that.
func (c *Client) NewNamedSession(ctx context.Context, name, dir string, env map[string]string, command []string) (target, pane string, err error) {
	freshServer := !c.serverRunning(ctx)

	args := []string{"new-session", "-d", "-s", name, "-c", dir, "-P", "-F", "#{window_id} #{pane_id}"}
	for k, v := range env {
		args = append(args, "-e", k+"="+v)
	}
	args = append(args, "--")
	args = append(args, command...)

	out, err := c.run(ctx, args...)
	if err != nil {
		return "", "", fmt.Errorf("tmux new-session: %w", err)
	}
	fields := strings.Fields(strings.TrimSpace(out))
	if len(fields) != 2 {
		return "", "", fmt.Errorf("tmux new-session: unexpected output %q", out)
	}
	target = name + ":" + fields[0]
	pane = fields[1]

	if freshServer {
		if err := c.applyServerOptions(ctx); err != nil {
			return "", "", err
		}
	}
	return target, pane, nil
}

// shellSessionSuffix marks a tmux session name as a plain-shell surface (docs/protocol.md
// §3.16) rather than a Claude pane — the one place the "muster-<id>-shell" convention is
// spelled out (plan plain-terminal-session, Affected Files).
const shellSessionSuffix = "-shell"

// ShellSessionName returns the tmux session name for session id's plain-shell surface:
// always "muster-<id>-shell".
func ShellSessionName(id int64) string {
	return "muster-" + strconv.FormatInt(id, 10) + shellSessionSuffix
}

// IsShellSessionName reports whether name is a shell session name ("muster-<id>-shell")
// and, if so, the session id it belongs to. Reconcile uses this to kill every orphaned
// shell on the socket unconditionally (docs/protocol.md §7.5) without duplicating the
// naming convention.
func IsShellSessionName(name string) (id int64, ok bool) {
	const prefix = "muster-"
	if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, shellSessionSuffix) {
		return 0, false
	}
	middle := name[len(prefix) : len(name)-len(shellSessionSuffix)]
	n, err := strconv.ParseInt(middle, 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

// serverRunning reports whether this socket already has a tmux server (checked before
// creating a session, so options are applied exactly once per socket server).
func (c *Client) serverRunning(ctx context.Context) bool {
	_, err := c.run(ctx, "list-sessions")
	return err == nil
}

// applyServerOptions sets the spike-measured tmux config (FINDINGS §7) globally on this
// socket's server, once, right after the first session brings the server up.
func (c *Client) applyServerOptions(ctx context.Context) error {
	for _, args := range serverOptions {
		if _, err := c.run(ctx, args...); err != nil {
			return fmt.Errorf("applying tmux option %v: %w", args, err)
		}
	}
	return nil
}

// AttachArgv returns the argv (including the "tmux" binary itself) for attaching to
// target under a dedicated PTY — internal/termbridge owns actually spawning it. Never
// invoked via a prefix key; the daemon drives tmux only through CLI commands.
func (c *Client) AttachArgv(target string) []string {
	argv := append([]string{"tmux"}, c.socketFlag()...)
	return append(argv, "attach-session", "-t", target)
}

// ResizeWindow applies `tmux resize-window` to target (FINDINGS §7(d): always called
// after pty.Setsize, never the pane-level primitive that silently no-ops).
func (c *Client) ResizeWindow(ctx context.Context, target string, cols, rows int) error {
	if _, err := c.run(ctx, "resize-window", "-t", target, "-x", strconv.Itoa(cols), "-y", strconv.Itoa(rows)); err != nil {
		return fmt.Errorf("tmux resize-window %q: %w", target, err)
	}
	return nil
}

// DisplayVar reads one tmux format variable for target (e.g. "#{window_width}") — a
// test oracle only (CLAUDE.md hard rule: capture/attach are display + oracle, never a
// state source); production code must never call this to derive session state.
func (c *Client) DisplayVar(ctx context.Context, target, format string) (string, error) {
	out, err := c.run(ctx, "display-message", "-p", "-t", target, format)
	if err != nil {
		return "", fmt.Errorf("tmux display-message %q %q: %w", target, format, err)
	}
	return strings.TrimRight(out, "\n"), nil
}

// PaneExists reports whether target still has a live pane (the liveness poll's only
// signal — never terminal output, CLAUDE.md hard rule).
func (c *Client) PaneExists(ctx context.Context, target string) (bool, error) {
	if target == "" {
		return false, nil
	}
	_, err := c.run(ctx, "list-panes", "-t", target)
	if err == nil {
		return true, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return false, nil // tmux exits non-zero when the target doesn't exist
	}
	return false, fmt.Errorf("checking pane %q: %w", target, err)
}

// KillWindow kills one window by target — used by tests to simulate a dead pane without
// needing the E2E harness's own tmux socket. Since m2-terminal every Muster session's
// tmux session has exactly one window, killing it kills the session too.
func (c *Client) KillWindow(ctx context.Context, target string) error {
	if _, err := c.run(ctx, "kill-window", "-t", target); err != nil {
		return fmt.Errorf("tmux kill-window %q: %w", target, err)
	}
	return nil
}

// KillSession kills a whole tmux session by name (m4-reconcile REQ-5's End path — named
// for clarity over KillWindow; under the one-window-per-session topology the two are
// equivalent, plan Implementation Notes).
func (c *Client) KillSession(ctx context.Context, name string) error {
	if _, err := c.run(ctx, "kill-session", "-t", name); err != nil {
		return fmt.Errorf("tmux kill-session %q: %w", name, err)
	}
	return nil
}

// ListSessions returns every tmux session name currently on this socket (m4-reconcile
// REQ-2's "unknown panes are reported, never adopted" check). An empty, non-error result
// means no server is running yet on this socket — list-sessions exits non-zero in that
// case, the same shape PaneExists already treats as "not there" rather than a real error.
func (c *Client) ListSessions(ctx context.Context) ([]string, error) {
	out, err := c.run(ctx, "list-sessions", "-F", "#{session_name}")
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return nil, nil
		}
		return nil, fmt.Errorf("listing tmux sessions: %w", err)
	}
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		return nil, nil
	}
	return strings.Split(trimmed, "\n"), nil
}

// CapturePane returns target's pane contents as plain text (m4-reconcile REQ-4's
// snapshot) — display source only, never read by the state machine (CLAUDE.md hard
// rule) and never logged by any caller (may hold prompt text). Trailing blank lines are
// trimmed so the UI's `pre.snapshot` doesn't scroll into emptiness.
func (c *Client) CapturePane(ctx context.Context, target string) (string, error) {
	out, err := c.runCapture(ctx, "capture-pane", "-p", "-t", target)
	if err != nil {
		return "", fmt.Errorf("tmux capture-pane %q: %w", target, err)
	}
	return trimTrailingBlankLines(out), nil
}

func trimTrailingBlankLines(s string) string {
	lines := strings.Split(s, "\n")
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	return strings.Join(lines, "\n")
}

func (c *Client) run(ctx context.Context, args ...string) (string, error) {
	full := append(c.socketFlag(), args...)
	cmd := exec.CommandContext(ctx, "tmux", full...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

// runCapture is run's capture-pane-only variant (review cycle 1 Minor 4/R3): unlike
// run, it never folds the subprocess's stdout into the returned error. For
// `capture-pane -p`, stdout *is* the live pane text — which may hold prompt content —
// and no caller may ever log it (CLAUDE.md hard rule, R3). Stdout and stderr are kept
// separate so a failure's error can only ever carry tmux's own stderr diagnostic.
func (c *Client) runCapture(ctx context.Context, args ...string) (string, error) {
	full := append(c.socketFlag(), args...)
	cmd := exec.CommandContext(ctx, "tmux", full...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}
