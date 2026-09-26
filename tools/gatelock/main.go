// Command gatelock is the machine-wide gate lock: a Playwright sweep needs the machine to
// itself (two sweeps in two worktrees, or a sweep beside `make test-race`, go red —
// kb:lesson/concurrent-e2e-across-worktrees-goes-red), while Go unit-test runs may overlap
// each other. So every Playwright run holds it exclusive (web/playwright.config.ts
// globalSetup), `make test` / `make test-race` hold it shared, and `gates.sh` holds it
// once around a whole gate run.
//
//	go run ./tools/gatelock run  (--exclusive|--shared) [--wait <dur>] -- <cmd> [args…]
//	go run ./tools/gatelock hold (--exclusive|--shared) [--wait <dur>]
//	go run ./tools/gatelock status
//
// `run` execs cmd as a child with the lock held and exits with its code. `hold` prints
// `acquired` once it has the lock, then blocks until stdin closes — a Node parent that
// ends (or is SIGKILLed) closes the pipe and so releases the lock. `status` prints `free`
// or one holder per line.
//
// Exit codes: 0 ok; 1 error (including the exclusive-under-shared self-deadlock refusal);
// 2 usage; 75 (EX_TEMPFAIL) the wait expired — rerun when free, nothing failed. GNU make
// exits 2 on any failed recipe, so 75 reaches a caller only from a direct invocation
// (gates.sh re-execs itself under `run`); elsewhere the stderr message is the contract.
//
// Re-entrancy: `run` and `hold` export MUSTER_GATELOCK=<mode> to the child. A nested call
// no-ops when an ancestor's mode covers it (exclusive covers all; shared covers shared),
// and refuses (exit 1) when it would need exclusive under a shared ancestor.
package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const (
	exitOK    = 0
	exitError = 1
	exitUsage = 2
	exitBusy  = 75 // EX_TEMPFAIL
)

const defaultWait = 240 * time.Second // one full sweep, measured 202 s on 2026-09-26

const usage = "usage: gatelock run (--exclusive|--shared) [--wait <dur>] -- <cmd> [args…] | hold (--exclusive|--shared) [--wait <dur>] | status"

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}

// run dispatches and maps errors to exit codes; every message goes to stderr as
// `gatelock: …` so a reader of a make log knows which layer spoke.
func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	code, err := dispatch(args, stdin, stdout, stderr)
	if err != nil {
		fmt.Fprintln(stderr, "gatelock:", err)
	}
	return code
}

func dispatch(args []string, stdin io.Reader, stdout, stderr io.Writer) (int, error) {
	if len(args) == 0 {
		return exitUsage, errors.New(usage)
	}
	switch args[0] {
	case "status":
		if len(args) != 1 {
			return exitUsage, errors.New(usage)
		}
		return cmdStatus(stdout)
	case "run", "hold":
		o, err := parseOpts(args[1:])
		if err != nil {
			return exitUsage, err
		}
		if args[0] == "run" {
			return cmdRun(o, stdin, stdout, stderr)
		}
		if len(o.cmd) != 0 {
			return exitUsage, errors.New("hold takes no command")
		}
		return cmdHold(o, stdin, stdout, stderr)
	default:
		return exitUsage, fmt.Errorf("unknown subcommand %q (want run, hold or status)", args[0])
	}
}

type opts struct {
	mode mode
	wait time.Duration
	cmd  []string // run only: everything after `--`
}

// parseOpts hand-parses the flags (tools never use the flag package — tools/CLAUDE.md
// exemplar): exactly one mode flag, an optional --wait, and for run a `--` separator.
func parseOpts(args []string) (opts, error) {
	o := opts{wait: defaultWait}
	modes := 0
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--exclusive":
			o.mode, modes = modeExclusive, modes+1
		case a == "--shared":
			o.mode, modes = modeShared, modes+1
		case a == "--wait" || strings.HasPrefix(a, "--wait="):
			v := strings.TrimPrefix(a, "--wait=")
			if a == "--wait" {
				if i+1 >= len(args) {
					return o, errors.New("--wait needs a duration")
				}
				i++
				v = args[i]
			}
			d, err := time.ParseDuration(v)
			if err != nil || d < 0 {
				return o, fmt.Errorf("--wait %q is not a duration (want e.g. 150s or 0)", v)
			}
			o.wait = d
		case a == "--":
			if i+1 >= len(args) {
				return o, errors.New("nothing after -- to run")
			}
			o.cmd = args[i+1:]
			i = len(args)
		default:
			return o, fmt.Errorf("unknown argument %q\n%s", a, usage)
		}
	}
	if modes != 1 {
		return o, errors.New("exactly one of --exclusive or --shared is required")
	}
	return o, nil
}

// take resolves re-entrancy, then acquires. covered means an ancestor already holds it
// and the caller proceeds without a lock of its own.
func take(o opts, status io.Writer) (release func(), code int, err error) {
	covered, err := inherited(o.mode)
	if err != nil {
		if errors.Is(err, errSelfDeadlock) {
			return nil, exitError, err
		}
		return nil, exitUsage, err
	}
	if covered {
		return func() {}, exitOK, nil
	}
	path, err := lockPath()
	if err != nil {
		return nil, exitError, err
	}
	release, err = acquire(path, o.mode, o.wait, status)
	if err != nil {
		var busy *busyError
		if errors.As(err, &busy) {
			return nil, exitBusy, err
		}
		return nil, exitError, err
	}
	return release, exitOK, nil
}

func cmdRun(o opts, stdin io.Reader, stdout, stderr io.Writer) (int, error) {
	if len(o.cmd) == 0 {
		return exitUsage, errors.New("run needs `-- <cmd> [args…]`")
	}
	release, code, err := take(o, stderr)
	if err != nil {
		return code, err
	}
	defer release()
	child := exec.Command(o.cmd[0], o.cmd[1:]...) //nolint:noctx // the lock holder's child has no deadline; the wait was before it
	child.Stdin, child.Stdout, child.Stderr = stdin, stdout, stderr
	child.Env = append(os.Environ(), envVar+"="+o.mode.String())
	if startErr := child.Start(); startErr != nil {
		return exitError, fmt.Errorf("starting %s: %w", o.cmd[0], startErr)
	}
	stop := forwardSignals(child)
	defer stop()
	err = child.Wait()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		if st, ok := exit.Sys().(syscall.WaitStatus); ok && st.Signaled() {
			return 128 + int(st.Signal()), nil
		}
		return exit.ExitCode(), nil
	}
	if err != nil {
		return exitError, fmt.Errorf("waiting for %s: %w", o.cmd[0], err)
	}
	return exitOK, nil
}

// forwardSignals relays SIGINT/SIGTERM to the child so Ctrl-C reaches it while we keep
// the lock until it has actually exited; the returned func stops relaying.
func forwardSignals(child *exec.Cmd) func() {
	ch := make(chan os.Signal, 2)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case s := <-ch:
				_ = child.Process.Signal(s)
			case <-done:
				return
			}
		}
	}()
	return func() { signal.Stop(ch); close(done) }
}

func cmdHold(o opts, stdin io.Reader, stdout, stderr io.Writer) (int, error) {
	release, code, err := take(o, stderr)
	if err != nil {
		return code, err
	}
	defer release()
	fmt.Fprintln(stdout, "acquired")
	_, _ = io.Copy(io.Discard, stdin) // until EOF: the parent closing the pipe is the release
	return exitOK, nil
}

func cmdStatus(stdout io.Writer) (int, error) {
	path, err := lockPath()
	if err != nil {
		return exitError, err
	}
	free, err := probeFree(path)
	if err != nil {
		return exitError, err
	}
	if free {
		fmt.Fprintln(stdout, "free")
		return exitOK, nil
	}
	hs := readHolders(path)
	if len(hs) == 0 {
		fmt.Fprintln(stdout, "held (no live holder line)")
		return exitOK, nil
	}
	for _, h := range hs {
		fmt.Fprintln(stdout, h.String())
	}
	return exitOK, nil
}
