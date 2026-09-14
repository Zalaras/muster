// Package tmux wraps the `tmux` CLI operations Muster needs, always against a dedicated
// socket (CLAUDE.md hard rule: never the user's default server). Since m2-terminal, one
// tmux *session* per Muster session ("muster-<id>", a single window running claude) is
// the topology — not m1-sessions' single shared "muster" session with one window per
// launch. Tiles needs up to 6 concurrent live surfaces, and a tmux client attaches to a
// session (showing one window), so multiple concurrent attaches need multiple sessions.
// A window's target (kb:anchor/ws.session tmuxTarget, e.g. "muster-7:@1") is what
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
	"time"
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
// dir, with the given extra environment variables set in the pane —
// kb:anchor/ingest.envelope: `tmux new-session -e`). Returns the window's target (e.g. "muster-7:@1") and
// pane id (e.g. "%12"). Delegates to NewNamedSession with the "muster-<id>" convention.
func (c *Client) NewSession(ctx context.Context, id int64, dir string, env map[string]string, command []string) (target, pane string, err error) {
	return c.NewNamedSession(ctx, "muster-"+strconv.FormatInt(id, 10), dir, env, command)
}

// ErrSessionExists is wrapped into the error NewNamedSession returns when tmux refuses to
// create a session because the name is already taken (session-lifecycle plan REQ-4).
// Callers branch on this with errors.Is rather than matching tmux's own stderr text
// themselves — the "duplicate session:" match lives only here, beside
// shellSessionSuffix, which is the one place this file already spells out a naming/stderr
// convention (CLAUDE.md's internal/claudecode boundary discipline applies the same way).
var ErrSessionExists = errors.New("tmux session already exists")

// duplicateSessionStderr is the tmux stderr fragment that means "a session by this name
// already exists" (e.g. "duplicate session: muster-1"). Matched only here.
const duplicateSessionStderr = "duplicate session:"

// NewNamedSession creates a new tmux session named name (one window, running command in
// dir, with the given extra environment variables set in the pane —
// kb:anchor/ingest.envelope: `tmux new-session -e`). Returns the window's target (e.g. "muster-7:@1", or
// "muster-7-shell:@2" for a shell session) and pane id (e.g. "%12"). If this is the first
// command to reach the socket's server (i.e. no server was running yet), REQ-4's
// server/session-wide options are applied right after, since tmux auto-starts the server
// on first command and there is no server to configure before that.
//
// session-lifecycle REQ-5: neither failure branch below leaks the session `new-session`
// just created — each kills it by name before returning, so a caller that rolls back on
// error never has to reconcile against an orphaned tmux session.
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
		wrapped := fmt.Errorf("tmux new-session: %w", err)
		if strings.Contains(err.Error(), duplicateSessionStderr) {
			return "", "", fmt.Errorf("%w: %w", wrapped, ErrSessionExists)
		}
		return "", "", wrapped
	}
	fields := strings.Fields(strings.TrimSpace(out))
	if len(fields) != 2 {
		c.killLeakedSession(ctx, name)
		return "", "", fmt.Errorf("tmux new-session: unexpected output %q", out)
	}
	target = name + ":" + fields[0]
	pane = fields[1]

	if freshServer {
		if err := c.applyServerOptions(ctx); err != nil {
			c.killLeakedSession(ctx, name)
			return "", "", err
		}
	}
	return target, pane, nil
}

// killLeakedSession is called by NewNamedSession's post-create failure branches to clean
// up the session it just created (REQ-5). A kill failure here is not returned — the
// caller's original error takes priority — but this at-most-best-effort cleanup can still
// leave a genuine orphan if tmux itself is wedged; there is no logger threaded into
// internal/tmux to record that, so the caller (which does have one) is the one place a
// leak would ever be surfaced.
func (c *Client) killLeakedSession(ctx context.Context, name string) {
	_ = c.KillSession(ctx, name)
}

// shellSessionSuffix marks a tmux session name as a plain-shell surface
// (kb:anchor/sessions.shell) rather than a Claude pane — the one place the "muster-<id>-shell" convention is
// spelled out (plan plain-terminal-session, Affected Files).
const shellSessionSuffix = "-shell"

// ShellSessionName returns the tmux session name for session id's plain-shell surface:
// always "muster-<id>-shell".
func ShellSessionName(id int64) string {
	return "muster-" + strconv.FormatInt(id, 10) + shellSessionSuffix
}

// SessionName returns the tmux session name for session id's Claude pane: always
// "muster-<id>". The bare-name mirror of ShellSessionName (review cycle 1 Minor 2): the
// "muster-" naming convention is spelled in this one package rather than hand-rolled at
// each call site.
func SessionName(id int64) string {
	return "muster-" + strconv.FormatInt(id, 10)
}

// IsShellSessionName reports whether name is a shell session name ("muster-<id>-shell")
// and, if so, the session id it belongs to. Reconcile uses this to kill every orphaned
// shell on the socket unconditionally (kb:anchor/state.liveness) without duplicating the
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

// ParseSessionName reports whether name is a bare Claude-pane session name
// ("muster-<N>") and, if so, its id — the mirror of IsShellSessionName for the
// non-shell shape (session-lifecycle plan REQ-3). Never matches a shell name.
func ParseSessionName(name string) (id int64, ok bool) {
	const prefix = "muster-"
	if !strings.HasPrefix(name, prefix) || strings.HasSuffix(name, shellSessionSuffix) {
		return 0, false
	}
	n, err := strconv.ParseInt(name[len(prefix):], 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

// MaxSessionID returns the highest session id present on this socket across both naming
// conventions ("muster-<id>" and "muster-<id>-shell") — session-lifecycle plan REQ-3, the
// floor a launch probes before allocating a new id so it never collides with an orphaned
// tmux session. Mirrors ListSessions' own shape: no tmux server running yet is (0, nil),
// never an error.
func (c *Client) MaxSessionID(ctx context.Context) (int64, error) {
	names, err := c.ListSessions(ctx)
	if err != nil {
		return 0, fmt.Errorf("finding max session id: %w", err)
	}
	var highest int64
	for _, name := range names {
		if id, ok := ParseSessionName(name); ok && id > highest {
			highest = id
		}
		if id, ok := IsShellSessionName(name); ok && id > highest {
			highest = id
		}
	}
	return highest, nil
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

// ResolveSessionTarget returns the window/pane target for a live tmux session named
// name's single window (the one-window-per-session topology, package doc comment) —
// session-lifecycle REQ-9's repair primitive: Reconcile uses it to re-derive
// tmux_target/tmux_pane for a row it has decided still owns a live "muster-<id>",
// whether the stored value is the InsertSession placeholder or a stale window id.
// Returns an error if the session (or its window) doesn't exist.
func (c *Client) ResolveSessionTarget(ctx context.Context, name string) (target, pane string, err error) {
	out, err := c.run(ctx, "list-panes", "-t", name, "-F", "#{window_id} #{pane_id}")
	if err != nil {
		return "", "", fmt.Errorf("resolving target for %q: %w", name, err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	fields := strings.Fields(lines[0])
	if len(fields) != 2 {
		return "", "", fmt.Errorf("resolving target for %q: unexpected output %q", name, out)
	}
	return name + ":" + fields[0], fields[1], nil
}

// PaneExists reports whether target still has a live pane (the liveness poll's only
// signal — never terminal output, CLAUDE.md hard rule). An *exec.ExitError ordinarily
// means "tmux answered and the target isn't there", but review cycle 1 Critical 1 found
// that tmux exits non-zero the same way when it cannot even reach the socket (a
// permission error, or the socket file gone) — collapsing that into "not there" let
// KillSession, and everything downstream of it, read an unreachable server as a
// successful kill of a session that was still running. isConnectionFailure singles out
// that one stable shape (stderr's "error connecting to <path> …") so it surfaces as an
// error — "I could not ask" — instead of being folded into "not there".
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
		if isConnectionFailure(err) {
			return false, fmt.Errorf("checking pane %q: %w", target, err)
		}
		return false, nil // tmux exits non-zero when the target doesn't exist
	}
	return false, fmt.Errorf("checking pane %q: %w", target, err)
}

// isConnectionFailure reports whether err's message carries tmux's own "error connecting
// to <socket> (Permission denied)" diagnostic (D20/review Critical 1's own measured
// repro) — a socket that exists and could hold a live server, but this process lacks
// permission to reach it, as opposed to tmux reaching the socket and reporting the
// target absent. run folds CombinedOutput's stderr into the returned error (tmux.go's
// run doc comment), so the fragment is available on err.Error() without a second
// command.
//
// D24/review cycle 2 Critical: EACCES and EPERM are distinct errnos with distinct
// strerror wording — "Permission denied" is EACCES; a sandboxed denial (sandbox-exec, an
// MDM profile, the app sandbox) can instead deny with EPERM, which tmux reports as
// "Operation not permitted". Measured by the reviewer under sandbox-exec with the tmux
// server alive throughout: cycle 1's whole defect was reachable unchanged through that
// second errno. Both wordings are matched; nothing else.
//
// Deliberately narrow — matches only the two reasons actually measured, not every
// "error connecting to" shape tmux can produce. "No such file or directory" (no tmux
// server has ever bound this socket, or one exited cleanly and removed its own socket
// file) is the ordinary, load-bearing "no server yet" reading ListSessions' own doc
// comment already names, and every check-before-first-spawn in this codebase depends on
// it; "Socket operation on non-socket" (a plain file at the socket path) is a fixture
// defect, not tmux-server absence; "no server running on <path>" (a real socket, server
// already exited) is likewise not a live server. None of these three may newly read as
// "the session might still be alive" — a scratch-copy experiment that widened this match
// to bare "error connecting to" broke seven then-green tests on exactly these three
// shapes. Widening further is real future work (a crashed server's stale socket refusing
// connections is the same "couldn't ask" shape in principle) but needs its own measured
// repro and its own test, not a guess bundled into this fix.
//
// Never matches tmux's target-not-found wording (which does vary and would make this
// fail-unsafe in the wrong direction — REQ-6 forbids depending on that instability): if
// tmux's own wording for "permission denied"/"operation not permitted" ever changes, this
// degrades to the pre-fix behaviour (an unreachable socket reads as "gone") rather than to
// a false positive that would treat a live, reachable session as unreachable.
func isConnectionFailure(err error) bool {
	msg := err.Error()
	if !strings.Contains(msg, "error connecting to") {
		return false
	}
	return strings.Contains(msg, "Permission denied") || strings.Contains(msg, "Operation not permitted")
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
// equivalent, plan Implementation Notes). session-lifecycle REQ-6: a session that is
// already gone is treated as a successful kill — only a genuine failure (tmux missing,
// socket unreadable, context deadline) still returns an error. An *exec.ExitError alone
// is not proof of that: kill-session can also exit non-zero for a reason unrelated to the
// session existing (e.g. a socket tmux can't reach), and treating every ExitError as
// success would let Remove delete a row whose pane is still running — so an ExitError is
// verified against PaneExists (the same check the rest of this package already trusts)
// rather than assumed. PaneExists itself now distinguishes "confirmed gone" from
// "couldn't ask" (isConnectionFailure, review cycle 1 Critical 1), so that verification
// is no longer defeated by an unreachable socket; KillSession still never matches
// stderr's target-not-found wording, which isn't stable across versions.
func (c *Client) KillSession(ctx context.Context, name string) error {
	_, err := c.run(ctx, "kill-session", "-t", name)
	if err == nil {
		return nil
	}
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		return fmt.Errorf("tmux kill-session %q: %w", name, err)
	}

	stillThere, checkErr := c.PaneExists(ctx, name)
	if checkErr != nil || stillThere {
		// Still there, or the check itself couldn't confirm gone — either way the
		// original kill-session error is the honest report; unprovable is not proven.
		return fmt.Errorf("tmux kill-session %q: %w", name, err)
	}
	return nil
}

// ListSessions returns every tmux session name currently on this socket (m4-reconcile
// REQ-2's "unknown panes are reported, never adopted" check). An empty, non-error result
// means no server is running yet on this socket — list-sessions exits non-zero in that
// case, the same shape PaneExists already treats as "not there" rather than a real error.
//
// D25/review cycle 2 Major: that collapse used to swallow isConnectionFailure's case too
// (a socket that exists and could hold a live server, but this process cannot reach it),
// which is the worst call site for it — Reconcile treats this result as ground truth for
// which rows are still alive, so an unreachable socket used to read as "no sessions at
// all" rather than "I couldn't find out". Mirrors PaneExists' own distinction.
func (c *Client) ListSessions(ctx context.Context) ([]string, error) {
	out, err := c.run(ctx, "list-sessions", "-F", "#{session_name}")
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			if isConnectionFailure(err) {
				return nil, fmt.Errorf("listing tmux sessions: %w", err)
			}
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
	// WaitDelay bounds the wait for a descendant that inherited the
	// stdout/stderr pipe to close it. The timer starts when ctx is done or
	// when Wait sees tmux exit, whichever comes first — without it,
	// CombinedOutput's Wait can block on that descendant forever even with
	// ctx never firing (docs/conventions.md §Go).
	cmd.WaitDelay = 2 * time.Second
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
	// WaitDelay bounds the wait for a descendant that inherited these pipes to
	// close them. The timer starts when ctx is done or when Wait sees tmux
	// exit, whichever comes first — without it, Run's Wait can block on that
	// descendant forever even with ctx never firing (docs/conventions.md §Go).
	cmd.WaitDelay = 2 * time.Second
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}
