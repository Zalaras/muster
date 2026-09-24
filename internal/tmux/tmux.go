// Package tmux wraps the `tmux` CLI operations Muster needs, always against a dedicated
// socket (CLAUDE.md hard rule: never the user's default server). One tmux *session* per
// Muster session ("muster-<id>", a single window running claude) is the topology
// (kb:adr/surfaces-one-tmux-session-per-session): Tiles needs up to 6 concurrent live
// surfaces, and a tmux client attaches to a session (showing one window), so multiple
// concurrent attaches need multiple sessions.
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
	// exec spawns the tmux subprocess — the one seam every method on this Client starts
	// a subprocess through, the same injectable-seam shape as preflighter's run
	// field, locate.SpotlightFinder's run field and claudecode's execFunc
	// (docs/conventions.md §Testing). stdout and stderr are always kept separate —
	// run folds them back together for its own error text, but runCapture's stdout is
	// live pane content that must never reach an error message (CLAUDE.md hard rule).
	// Production always execSeparated; same-package tests may overwrite the field
	// directly (the struct's zero-value construction path is New, same as preflighter's
	// own tests build a struct literal) to simulate a tmux exit shape real tmux cannot
	// be driven to deterministically — e.g. KillSession's post-kill PaneExists recheck
	// reporting the session still there (kb:adr/actions-kill-is-idempotent).
	exec func(ctx context.Context, name string, args ...string) (stdout, stderr []byte, err error)
}

// New returns a Client bound to the given socket (never the user's default tmux
// server). A value containing "/" is used as a filesystem path (-S); anything else is a
// named socket in tmux's own socket directory (-L), so the E2E harness and
// per-test Go tests can point sockets at scratch dirs that already get deleted.
func New(socket string) *Client {
	return &Client{socket: socket, exec: execSeparated}
}

// maxSocketPathLen is the longest -S socket path tmux can actually bind: AF_UNIX's
// sun_path is 104 bytes on macOS including the trailing NUL. Exceeding it fails deep
// inside tmux with a bare "File name too long", so ValidateSocket rejects it up front
// with an error that says what to do instead.
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

// serverOptions are the tmux options measured to make shared-attach terminal rendering
// work correctly, plus `prefix`/`prefix2 None` so keystrokes (including C-b) pass through to claude
// instead of being swallowed as a tmux prefix (verified manually: with `prefix None` set,
// sending literal `C-b` bytes through the PTY reaches the attached shell instead of tmux).
//
// detach-on-destroy is "on", not the spike's measured "off"
// (kb:adr/surfaces-detach-on-destroy-on): the spike measured "off" with only one tmux
// session on the socket, so there was nowhere to hop to. With one tmux session per Muster
// session (kb:adr/surfaces-one-tmux-session-per-session), "off" means a destroyed
// session's attach client migrates to a DIFFERENT Muster session instead of exiting — no
// PTY EOF (so no 4001/liveness nudge), a second client ends up attached to that other
// session, and keystrokes typed into the dead session's surface are delivered to a
// different session's Claude Code. "on" makes the client exit cleanly when its session is
// destroyed, which is what termbridge.Bridge.Read's EIO->EOF mapping depends on.
//
// destroy-unattached stays "off": verified with a throwaway creack/pty program mirroring
// Bridge.Close() exactly — attach a client to one of two sessions on a scratch socket with
// these exact two options set, then close the PTY master and kill+wait the attach process
// (Bridge.Close()'s own sequence, i.e. a normal client-initiated detach, NOT kill-session):
// `tmux list-sessions` afterward still showed both sessions and `list-clients` was empty —
// the session survives with no attached client, letting claude keep running while nobody
// is viewing it. destroy-unattached governs "does a session survive its last client
// detaching" and detach-on-destroy governs "what happens to a client when its session is
// destroyed" — two different events, so setting one does not disturb the other.
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
	return c.NewNamedSession(ctx, SessionName(id), dir, env, command)
}

// ErrSessionExists is wrapped into the error NewNamedSession returns when tmux refuses to
// create a session because the name is already taken.
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
// command to reach the socket's server (i.e. no server was running yet), the
// server/session-wide options are applied right after, since tmux auto-starts the server
// on first command and there is no server to configure before that.
//
// Neither failure branch below leaks the session `new-session`
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
// up the session it just created. A kill failure here is not returned — the
// caller's original error takes priority — but this at-most-best-effort cleanup can still
// leave a genuine orphan if tmux itself is wedged; there is no logger threaded into
// internal/tmux to record that, so the caller (which does have one) is the one place a
// leak would ever be surfaced.
func (c *Client) killLeakedSession(ctx context.Context, name string) {
	_ = c.KillSession(ctx, name)
}

// sessionPrefix is Muster's tmux naming convention, declared exactly once: every name
// this file builds or parses — ShellSessionName, SessionName,
// IsShellSessionName, ParseSessionName, HasSessionPrefix, and NewSession via SessionName
// — is built from this one constant rather than each hand-rolling "muster-".
const sessionPrefix = "muster-"

// shellSessionSuffix marks a tmux session name as a plain-shell surface
// (kb:anchor/sessions.shell) rather than a Claude pane — the one place the "muster-<id>-shell" convention is
// spelled out (kb:adr/surfaces-shell-is-attach-target-not-session).
const shellSessionSuffix = "-shell"

// ShellSessionName returns the tmux session name for session id's plain-shell surface:
// always "muster-<id>-shell".
func ShellSessionName(id int64) string {
	return sessionPrefix + strconv.FormatInt(id, 10) + shellSessionSuffix
}

// SessionName returns the tmux session name for session id's Claude pane: always
// "muster-<id>". The bare-name mirror of ShellSessionName: the
// "muster-" naming convention is spelled in this one package rather than hand-rolled at
// each call site.
func SessionName(id int64) string {
	return sessionPrefix + strconv.FormatInt(id, 10)
}

// HasSessionPrefix reports whether name carries Muster's tmux naming convention at all
// ("muster-..."), whether or not it further matches ParseSessionName's or
// IsShellSessionName's specific shapes — Reconcile's "was this at least meant for us"
// check before logging an unrecognized name as unknown (kb:anchor/state.liveness),
// without that call site hand-rolling the prefix itself.
func HasSessionPrefix(name string) bool {
	return strings.HasPrefix(name, sessionPrefix)
}

// IsShellSessionName reports whether name is a shell session name ("muster-<id>-shell")
// and, if so, the session id it belongs to. Reconcile uses this to kill every orphaned
// shell on the socket unconditionally (kb:anchor/state.liveness) without duplicating the
// naming convention.
func IsShellSessionName(name string) (id int64, ok bool) {
	if !strings.HasPrefix(name, sessionPrefix) || !strings.HasSuffix(name, shellSessionSuffix) {
		return 0, false
	}
	middle := name[len(sessionPrefix) : len(name)-len(shellSessionSuffix)]
	n, err := strconv.ParseInt(middle, 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

// ParseSessionName reports whether name is a bare Claude-pane session name
// ("muster-<N>") and, if so, its id — the mirror of IsShellSessionName for the
// non-shell shape. Never matches a shell name.
func ParseSessionName(name string) (id int64, ok bool) {
	if !strings.HasPrefix(name, sessionPrefix) || strings.HasSuffix(name, shellSessionSuffix) {
		return 0, false
	}
	n, err := strconv.ParseInt(name[len(sessionPrefix):], 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

// MaxSessionID returns the highest session id present on this socket across both naming
// conventions ("muster-<id>" and "muster-<id>-shell") — the
// floor a launch probes before allocating a new id so it never collides with an orphaned
// tmux session (kb:adr/lifecycle-session-ids-monotonic-never-reused). Mirrors ListSessions'
// own shape: no tmux server running yet is (0, nil), never an error.
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

// applyServerOptions sets serverOptions (above) globally on this socket's server, once,
// right after the first session brings the server up.
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

// ResizeWindow applies `tmux resize-window` to target: always called after pty.Setsize,
// never the pane-level primitive that silently no-ops (kb:lesson/resize-pane-silent-noop).
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
	return c.displayVar(ctx, target, format)
}

// displayVar is DisplayVar's shared implementation. Unlike its exported wrapper, it is
// also called by production code below (ScrollCopyMode) — tmux's own process/mode
// tracking (`#{pane_in_mode}`, `#{history_size}`) is not pane *content*, so reading it
// to drive copy-mode does not breach the CLAUDE.md hard rule DisplayVar's own doc
// comment guards against (kb:adr/surfaces-shell-busy-from-tmux-process-state makes the
// same distinction for the busy poller).
func (c *Client) displayVar(ctx context.Context, target, format string) (string, error) {
	out, err := c.run(ctx, "display-message", "-p", "-t", target, format)
	if err != nil {
		return "", fmt.Errorf("tmux display-message %q %q: %w", target, format, err)
	}
	return strings.TrimRight(out, "\n"), nil
}

// PaneActivity is one pane's tmux-reported process/screen state, as ListPaneActivity
// reads it for the shell-activity poller (kb:anchor/ws.shell-activity). Query only —
// tmux's own process tracking, never terminal content.
type PaneActivity struct {
	// SessionName is the tmux session name owning the pane ("muster-<id>" or
	// "muster-<id>-shell") — tmux.IsShellSessionName/ParseSessionName turn it back
	// into a Muster session id.
	SessionName string
	// CurrentCommand is `#{pane_current_command}`: the shell's own basename when idle
	// or when a job is backgrounded, the foreground command otherwise.
	CurrentCommand string
	// AlternateOn is `#{alternate_on}` — true while the pane's foreground program owns
	// the alternate screen (vim, less, Claude Code's TUI).
	AlternateOn bool
	// Tty is `#{pane_tty}`, the device path internal/tty.IsCanonical reads.
	Tty string
}

// ListPaneActivity reads every pane on this socket's server in one tmux invocation
// (kb:anchor/ws.shell-activity's poll) — never filtered by session here, since a single
// `list-panes -a` is what makes this one exec regardless of how many shells exist;
// callers pick out the shell panes they care about via IsShellSessionName. A no-server-
// yet socket is an empty, non-error result (ListSessions' own convention).
func (c *Client) ListPaneActivity(ctx context.Context) ([]PaneActivity, error) {
	out, err := c.run(ctx, "list-panes", "-a", "-F", "#{session_name} #{pane_current_command} #{alternate_on} #{pane_tty}")
	if err != nil {
		if absent, checkErr := tmuxAbsence(err); !absent {
			return nil, fmt.Errorf("listing pane activity: %w", checkErr)
		}
		return nil, nil
	}
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		return nil, nil
	}
	lines := strings.Split(trimmed, "\n")
	activity := make([]PaneActivity, 0, len(lines))
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) != 4 {
			continue // defensive: a Muster-owned session/window name never contains a space
		}
		activity = append(activity, PaneActivity{
			SessionName:    fields[0],
			CurrentCommand: fields[1],
			AlternateOn:    fields[2] == "1",
			Tty:            fields[3],
		})
	}
	return activity, nil
}

// paneCopyModeState reads target's `#{pane_in_mode}`/`#{history_size}` in one
// display-message call — ScrollCopyMode's own gate, never a state source beyond this
// one wheel-driven control frame (kb:adr/surfaces-shell-scroll-via-daemon-copy-mode).
func (c *Client) paneCopyModeState(ctx context.Context, target string) (inMode bool, historySize int, err error) {
	out, derr := c.displayVar(ctx, target, "#{pane_in_mode} #{history_size}")
	if derr != nil {
		return false, 0, derr
	}
	fields := strings.Fields(out)
	if len(fields) != 2 {
		return false, 0, fmt.Errorf("tmux display-message %q: unexpected output %q", target, out)
	}
	n, perr := strconv.Atoi(fields[1])
	if perr != nil {
		return false, 0, fmt.Errorf("tmux display-message %q: parsing history_size %q: %w", target, fields[1], perr)
	}
	return fields[0] == "1", n, nil
}

// ScrollCopyMode translates one wheel gesture into tmux copy-mode commands against
// target (kb:anchor/terminal.shell-ws, kb:adr/surfaces-shell-scroll-via-daemon-copy-mode).
// lines is signed: positive scrolls back into history (`scroll-up`), negative toward the
// live bottom (`scroll-down`); the caller (internal/server/terminal.go) is responsible
// for clamping its magnitude to [1, 200]. Enters copy-mode with `-e` only when the pane
// is not already in a mode and has real history to scroll to (`#{history_size}` > 0)
// — `-e` is what makes tmux leave copy-mode by itself once scrolled
// back to the bottom, so no explicit exit call exists. Issues a single
// `send-keys -X -N <n>` rather than n separate invocations, to avoid n round trips for
// one gesture. entered reports whether
// the pane is now (or already was) in a mode, so the caller's own inCopyMode tracking
// (terminal.go's pumpShellSocketToPTY) stays accurate for the "nothing to scroll
// to" no-op — where entered is false even though err is nil.
func (c *Client) ScrollCopyMode(ctx context.Context, target string, lines int) (entered bool, err error) {
	if lines == 0 {
		return false, nil
	}
	inMode, historySize, err := c.paneCopyModeState(ctx, target)
	if err != nil {
		return false, fmt.Errorf("tmux scroll copy-mode %q: %w", target, err)
	}
	if !inMode {
		if historySize <= 0 {
			return false, nil
		}
		if _, err := c.run(ctx, "copy-mode", "-e", "-t", target); err != nil {
			return false, fmt.Errorf("tmux copy-mode %q: %w", target, err)
		}
	}
	direction, n := "scroll-up", lines
	if lines < 0 {
		direction, n = "scroll-down", -lines
	}
	if _, err := c.run(ctx, "send-keys", "-X", "-N", strconv.Itoa(n), "-t", target, direction); err != nil {
		return false, fmt.Errorf("tmux send-keys %s %q: %w", direction, target, err)
	}
	return true, nil
}

// CancelCopyMode issues `send-keys -X cancel` against target, returning its pane to the
// live bottom — called before writing input bytes to a pane the daemon knows
// may still be in a mode.
func (c *Client) CancelCopyMode(ctx context.Context, target string) error {
	if _, err := c.run(ctx, "send-keys", "-X", "-t", target, "cancel"); err != nil {
		return fmt.Errorf("tmux send-keys cancel %q: %w", target, err)
	}
	return nil
}

// ResolveSessionTarget returns the window/pane target for a live tmux session named
// name's single window (the one-window-per-session topology, package doc comment) —
// Reconcile's repair primitive (kb:adr/lifecycle-reconcile-converges-with-the-socket):
// it re-derives tmux_target/tmux_pane for a row it has decided still owns a live
// "muster-<id>", whether the stored value is the InsertSession placeholder or a stale
// window id. Returns an error if the session (or its window) doesn't exist.
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
// means "tmux answered and the target isn't there", but tmux was measured exiting
// non-zero the same way when it cannot even reach the socket (a permission error, or the
// socket file gone) — collapsing that into "not there" let
// KillSession, and everything downstream of it, read an unreachable server as a
// successful kill of a session that was still running (kb:adr/actions-kill-is-idempotent).
// isConnectionFailure singles out
// that one stable shape (stderr's "error connecting to <path> …") so it surfaces as an
// error — "I could not ask" — instead of being folded into "not there". An expired ctx is
// the same story: run wraps ctx.Err() rather than returning a bare ExitError, so
// errors.As(err, &exitErr) below misses and this returns (false, err) — never (false,
// nil) — with errors.Is(err, context.DeadlineExceeded) holding on the returned error.
func (c *Client) PaneExists(ctx context.Context, target string) (bool, error) {
	if target == "" {
		return false, nil
	}
	_, err := c.run(ctx, "list-panes", "-t", target)
	if err == nil {
		return true, nil
	}
	if absent, checkErr := tmuxAbsence(err); !absent {
		return false, fmt.Errorf("checking pane %q: %w", target, checkErr)
	}
	return false, nil // tmux exits non-zero when the target doesn't exist
}

// tmuxAbsence classifies a non-nil error from one of run's "target not found" queries
// (ListPaneActivity, PaneExists, ListSessions): true means tmux answered and the thing
// asked about genuinely isn't there, so the caller should treat it as an ordinary
// empty/false result rather than a failure. false carries the error the caller should
// propagate instead — either err itself (not an *exec.ExitError at all, e.g. run's
// wrapped ctx.Err() on an expired deadline) or isConnectionFailure's "couldn't even ask"
// case. Written once so the three query methods can't diverge on this decision the way
// isConnectionFailure's own doc names two measured failures over.
func tmuxAbsence(err error) (absent bool, checkErr error) {
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		return false, err
	}
	if isConnectionFailure(err) {
		return false, err
	}
	return true, nil
}

// isConnectionFailure reports whether err's message carries tmux's own "error connecting
// to <socket> (Permission denied)" diagnostic (kb:adr/actions-kill-is-idempotent) — a
// socket that exists and could hold a live server, but this process lacks
// permission to reach it, as opposed to tmux reaching the socket and reporting the
// target absent. run folds CombinedOutput's stderr into the returned error (tmux.go's
// run doc comment), so the fragment is available on err.Error() without a second
// command.
//
// EACCES and EPERM are distinct errnos with distinct
// strerror wording — "Permission denied" is EACCES; a sandboxed denial (sandbox-exec, an
// MDM profile, the app sandbox) can instead deny with EPERM, which tmux reports as
// "Operation not permitted". Measured under sandbox-exec with the tmux
// server alive throughout: matching only EACCES left the original "unreachable socket
// reads as gone" defect reachable unchanged through that second errno. Both wordings are
// matched; nothing else.
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
// fail-unsafe in the wrong direction to depend on): if
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
// needing the E2E harness's own tmux socket. Every Muster session's
// tmux session has exactly one window (kb:adr/surfaces-one-tmux-session-per-session), so
// killing it kills the session too.
func (c *Client) KillWindow(ctx context.Context, target string) error {
	if _, err := c.run(ctx, "kill-window", "-t", target); err != nil {
		return fmt.Errorf("tmux kill-window %q: %w", target, err)
	}
	return nil
}

// KillSession kills a whole tmux session by name (named
// for clarity over KillWindow; under the one-window-per-session topology the two are
// equivalent). A session that is
// already gone is treated as a successful kill (kb:adr/actions-kill-is-idempotent) — only
// a genuine failure (tmux missing,
// socket unreadable, context deadline) still returns an error. An *exec.ExitError alone
// is not proof of that: kill-session can also exit non-zero for a reason unrelated to the
// session existing (e.g. a socket tmux can't reach), and treating every ExitError as
// success would let Remove delete a row whose pane is still running — so an ExitError is
// verified against PaneExists (the same check the rest of this package already trusts)
// rather than assumed. PaneExists itself now distinguishes "confirmed gone" from
// "couldn't ask" (isConnectionFailure), so that verification
// is no longer defeated by an unreachable socket; KillSession still never matches
// stderr's target-not-found wording, which isn't stable across versions. An
// expired ctx on the kill-session call itself is likewise never mistaken for "gone" — run
// wraps ctx.Err() instead of a bare ExitError, so errors.As below misses and the original
// (deadline) error is returned without a PaneExists verify.
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

// ListSessions returns every tmux session name currently on this socket — the
// "unknown sessions are reported, never adopted" check (kb:adr/lifecycle-reconcile-before-first-snapshot).
// An empty, non-error result
// means no server is running yet on this socket — list-sessions exits non-zero in that
// case, the same shape PaneExists already treats as "not there" rather than a real error.
//
// That collapse used to swallow isConnectionFailure's case too
// (a socket that exists and could hold a live server, but this process cannot reach it),
// which is the worst call site for it — Reconcile treats this result as ground truth for
// which rows are still alive (kb:adr/lifecycle-reconcile-converges-with-the-socket), so an
// unreachable socket used to read as "no sessions at
// all" rather than "I couldn't find out". Mirrors PaneExists' own distinction, including
// for an expired ctx: run's wrapped ctx.Err() misses errors.As below the same way.
func (c *Client) ListSessions(ctx context.Context) ([]string, error) {
	out, err := c.run(ctx, "list-sessions", "-F", "#{session_name}")
	if err != nil {
		if absent, checkErr := tmuxAbsence(err); !absent {
			return nil, fmt.Errorf("listing tmux sessions: %w", checkErr)
		}
		return nil, nil
	}
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		return nil, nil
	}
	return strings.Split(trimmed, "\n"), nil
}

// CapturePane returns target's pane contents as plain text (kb:adr/actions-pane-snapshot-display-only's
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
	stdout, stderr, err := c.exec(ctx, "tmux", full...)
	if err != nil {
		if ctx.Err() != nil {
			// exec.CommandContext kills the subprocess on an expired context the same
			// way a genuine tmux failure exits — a bare *exec.ExitError("signal:
			// killed") — so a deadline used to read as "tmux answered and said gone".
			// Wrapping ctx.Err() here instead means every caller's
			// errors.As(err, &exitErr) now correctly misses (the ExitError is not in
			// this chain), and errors.Is(err, context.DeadlineExceeded) holds instead:
			// PaneExists returns (false, err), never (false, nil), and KillSession's
			// post-kill verify can't report a deadline-killed check as "gone"
			// (kb:adr/actions-kill-is-idempotent).
			//nolint:errorlint // err is deliberately %v, not %w: it must NOT join the
			// chain, or errors.As(err, &exitErr) below would still match its
			// *exec.ExitError and undo the whole point of this branch.
			return string(stdout), fmt.Errorf("tmux %s: %w (%v)", args[0], ctx.Err(), err)
		}
		// tmux writes an ordinary query's error only to one of the two streams (its
		// replies on success, a diagnostic on stderr on failure), so folding both into
		// the message reproduces execCombinedOutput's old single-buffer text without
		// this method needing to know which stream tmux used.
		return string(stdout), fmt.Errorf("%w: %s", err, strings.TrimSpace(string(stdout)+string(stderr)))
	}
	return string(stdout), nil
}

// execSeparated is the Client.exec production seam: spawns name with args, stdout and
// stderr captured into separate buffers, bounded by a WaitDelay for a descendant that
// inherited a pipe (docs/conventions.md §Go).
func execSeparated(ctx context.Context, name string, args ...string) (stdout, stderr []byte, err error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	// WaitDelay bounds the wait for a descendant that inherited the
	// stdout/stderr pipe to close it. The timer starts when ctx is done or
	// when Wait sees tmux exit, whichever comes first — without it, Run's
	// Wait can block on that descendant forever even with ctx never firing
	// (docs/conventions.md §Go).
	cmd.WaitDelay = 2 * time.Second
	err = cmd.Run()
	return outBuf.Bytes(), errBuf.Bytes(), err
}

// runCapture is run's capture-pane-only variant, through the same Client.exec seam
// (rather than a second exec.CommandContext of its own, which also missed run's
// ctx-expiry wrapping below): unlike run, it never folds the
// subprocess's stdout into the returned error. For `capture-pane -p`, stdout *is* the
// live pane text — which may hold prompt content — and no caller may ever log it
// (CLAUDE.md hard rule). Stdout and stderr are kept separate so a failure's error can
// only ever carry tmux's own stderr diagnostic.
func (c *Client) runCapture(ctx context.Context, args ...string) (string, error) {
	full := append(c.socketFlag(), args...)
	stdout, stderr, err := c.exec(ctx, "tmux", full...)
	if err != nil {
		if ctx.Err() != nil {
			//nolint:errorlint // see run's identical branch: err must stay %v, never %w.
			return "", fmt.Errorf("tmux %s: %w (%v)", args[0], ctx.Err(), err)
		}
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(string(stderr)))
	}
	return string(stdout), nil
}
