package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/mattn/go-isatty"
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/server"
)

// onExitPromptTimeout bounds the `-on-exit=ask` confirmation: unanswered within this
// window (or stdin isn't a TTY at all) resolves to "leave", never a silent kill
// (kb:adr/lifecycle-shutdown-leaves-sessions-running).
const onExitPromptTimeout = 10 * time.Second

// shutdownGracefully resolves the -on-exit policy and then tears the daemon down.
//
// The periodic liveness poll is stopped first, before anything else here: every step
// below (the ShellCount round trip, the on-exit prompt, EndAllSessions/KillAllShells) runs
// for up to several seconds after the shutdown signal arrives, and until the poll is
// stopped its own ticker keeps firing on its own schedule regardless. A pane that dies
// right at this moment must not have this — already dying — process's own next tick
// mark+persist it ended before the fresh process's own startup Reconcile gets to see (and
// keep) the row, which would otherwise race a restart's Reconcile into sweeping a row it
// should have kept (kb:adr/lifecycle-reconcile-converges-with-the-socket). Verified closed
// both with a Manager-level probe (a slow fake PaneChecker held a tick in flight across
// Stop) and by hand against a real daemon (kill-window then immediate SIGTERM, 15/15
// clean). Stopping the poll here is a few milliseconds in the common case (it only waits
// out an in-flight tick), well inside shutdownTimeout's own budget for the rest of
// teardown. This closes only the periodic-poll path to the symptom, not every path: a
// live terminal's PTY-EOF liveness nudge (internal/server/terminal.go's pumpPTYToSocket)
// can mark the same row ended just as fast, entirely independently of this poll.
//
// The policy is resolved (and, for "ask", possibly prompted) before the shutdown timeout
// budget starts — the ask prompt has its own 10s timeout (onExitPromptTimeout), separate
// from shutdownTimeout's budget for the rest of teardown. With zero live sessions and zero
// shells neither branch prints anything.
func shutdownGracefully(f *cliFlags, srv *server.Server, httpServer *http.Server, stdin *os.File, stderr io.Writer, log zerolog.Logger) {
	stopPollCtx, stopPollCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	srv.StopLivenessPoll(stopPollCtx)
	stopPollCancel()

	live := srv.LiveSessionCount()

	// Counted before resolveOnExit so the ask prompt can name it (kb:adr/surfaces-shell-dies-at-kill-shutdown-too).
	// A count failure (socket unreachable) is logged and treated as zero — never blocks
	// shutdown, and shell teardown below is skipped since KillAllShells would just hit
	// the same failure.
	shellCountCtx, shellCountCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	shells, shellCountErr := srv.ShellCount(shellCountCtx)
	shellCountCancel()
	if shellCountErr != nil {
		log.Warn().Err(shellCountErr).Msg("counting shells on shutdown failed")
		shells = 0
	}

	if live > 0 || shells > 0 {
		switch resolveOnExit(f.onExit, stdin, stderr, live, shells, srv.TmuxSocket()) {
		case onExitKill:
			// Bounded: an unbounded context here would let a wedged tmux kill-session
			// hang shutdown indefinitely, outside shutdownTimeout's own budget for the
			// rest of teardown below.
			endAllCtx, endAllCancel := context.WithTimeout(context.Background(), shutdownTimeout)
			ended := srv.EndAllSessions(endAllCtx)
			endAllCancel()

			// Order matters: sessions first — they may hold the socket busy — then
			// shells, each under its own budget (kb:adr/surfaces-shell-dies-at-kill-shutdown-too).
			killedShells := 0
			if shellCountErr == nil {
				killShellsCtx, killShellsCancel := context.WithTimeout(context.Background(), shutdownTimeout)
				var killErr error
				killedShells, killErr = srv.KillAllShells(killShellsCtx)
				killShellsCancel()
				if killErr != nil {
					log.Warn().Err(killErr).Msg("killing shells on shutdown failed")
				}
			}
			log.Info().Int("count", ended).Int("shells", killedShells).Str("tmux_socket", srv.TmuxSocket()).Msg("ended live sessions on shutdown")
		case onExitLeave:
			log.Info().Int("count", live).Int("shells", shells).Str("tmux_socket", srv.TmuxSocket()).Msg("leaving live sessions running")
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Warn().Err(err).Msg("http server shutdown")
	}
	srv.Shutdown(shutdownCtx)
}

// onExitDecision is -on-exit's final, already-resolved leave/kill decision: "ask" is
// resolved to one of these by resolveOnExit before run's shutdown path acts on it —
// nothing downstream of resolveOnExit ever sees "ask" itself.
type onExitDecision int

const (
	onExitLeave onExitDecision = iota
	onExitKill
)

// resolveOnExit turns the raw -on-exit flag value into a final leave/kill decision.
// "leave"/"kill" pass straight through; "ask" prompts once — but only when stdin is a
// real terminal (isTerminal) — and otherwise resolves to "leave" without printing
// anything. Callers only invoke this once they already know liveSessions > 0 || shells >
// 0: zero of both gets no prompt and no log line at all.
func resolveOnExit(flagValue string, stdin *os.File, stderr io.Writer, liveSessions, shells int, tmuxSocket string) onExitDecision {
	switch flagValue {
	case "kill":
		return onExitKill
	case "leave":
		return onExitLeave
	}
	if !isTerminal(stdin) {
		return onExitLeave
	}
	return askKillPrompt(stdin, stderr, liveSessions, shells, tmuxSocket)
}

// isTerminal reports whether f is attached to a real terminal, via
// github.com/mattn/go-isatty rather than Stat's ModeCharDevice: /dev/null is also a
// character device (measured 2026-08-31: mode=Dcrw-rw-rw- charDevice=true), which made
// the old check wrongly treat every /dev/null stdin — every onexit_test.go subprocess,
// every E2E-spawned scratch daemon — as if it were a terminal
// (kb:adr/connection-dashboard-auto-opens-on-terminal). A stat/fd failure or a nil file is
// treated as "not a terminal" — run's own nil-stdin callers must keep resolving to false.
func isTerminal(f *os.File) bool {
	if f == nil {
		return false
	}
	return isatty.IsTerminal(f.Fd())
}

// askKillPrompt prints the kill/leave confirmation to stderr and reads one line from
// stdin, racing a 10s timeout: only "y"/"Y"/"yes" (case-insensitive) answers kill;
// anything else, or the timeout firing first, answers leave — a TTY with nobody watching
// must never be silently killed. The grammar is deliberately plural-fixed ("1 shells") —
// the developer accepted it (2026-09-16) to keep the prompt text a single fixed format
// string rather than branching on count.
func askKillPrompt(stdin *os.File, stderr io.Writer, liveSessions, shells int, tmuxSocket string) onExitDecision {
	fmt.Fprintf(stderr, "%d live sessions and %d shells on tmux socket %s — kill them? [y/N] ", liveSessions, shells, tmuxSocket)

	answer := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(stdin).ReadString('\n')
		answer <- strings.TrimSpace(line)
	}()

	select {
	case a := <-answer:
		switch strings.ToLower(a) {
		case "y", "yes":
			return onExitKill
		default:
			return onExitLeave
		}
	case <-time.After(onExitPromptTimeout):
		fmt.Fprintln(stderr)
		return onExitLeave
	}
}
