package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// envVar carries the mode an ancestor process already holds, so a nested `make test`
// under `gates.sh` (itself running under `run --exclusive`) does not block on its own
// parent: an ancestor's exclusive covers everything, an ancestor's shared covers a nested
// shared, and a nested exclusive under a shared ancestor would deadlock against it.
const envVar = "MUSTER_GATELOCK"

// fileEnv overrides the lock file path (tests; never set in the Makefile).
const fileEnv = "MUSTER_GATELOCK_FILE"

// tickInterval is how often a waiter reports who holds the lock. A package var so a
// test can shorten it.
var tickInterval = 15 * time.Second

type mode int

const (
	modeShared mode = iota
	modeExclusive
)

func (m mode) String() string {
	if m == modeExclusive {
		return "exclusive"
	}
	return "shared"
}

func (m mode) flockFlag() int {
	if m == modeExclusive {
		return syscall.LOCK_EX
	}
	return syscall.LOCK_SH
}

// lockPath is $MUSTER_GATELOCK_FILE, else <user cache dir>/muster/gates.lock — per user,
// outside every worktree (the point is that worktrees share it) and outside $TMPDIR
// (which is per login session on macOS).
func lockPath() (string, error) {
	if p := os.Getenv(fileEnv); p != "" {
		return p, nil
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolving the user cache dir: %w", err)
	}
	dir := filepath.Join(cache, "muster")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("creating %s: %w", dir, err)
	}
	return filepath.Join(dir, "gates.lock"), nil
}

// errSelfDeadlock is the exclusive-under-shared refusal (exit 1, never a hang).
var errSelfDeadlock = errors.New("would self-deadlock: an ancestor holds the gate lock shared and this needs it exclusive")

// inherited reports whether an ancestor already holds a lock that covers the requested
// mode, per the table in the package doc. A malformed value is a usage error.
func inherited(requested mode) (covered bool, err error) {
	switch v := os.Getenv(envVar); v {
	case "":
		return false, nil
	case modeExclusive.String():
		return true, nil
	case modeShared.String():
		if requested == modeExclusive {
			return false, errSelfDeadlock
		}
		return true, nil
	default:
		return false, fmt.Errorf("%s=%q is not exclusive or shared", envVar, v)
	}
}

// busyError is the wait-expired failure; the caller maps it to exit 75.
type busyError struct {
	mode    mode
	wait    time.Duration
	holders []holder
}

func (e *busyError) Error() string {
	return fmt.Sprintf("busy after %s — held by %s; rerun when free, this is not a test failure",
		e.wait, describeHolders(e.holders))
}

// holder is one diagnostic line in the lock file: who took the lock, how, from where.
// flock is the truth; these lines only make a wait explain itself.
type holder struct {
	pid   int
	mode  mode
	cwd   string
	since time.Time
}

func (h holder) String() string {
	return fmt.Sprintf("pid %d %s %s since %s", h.pid, h.mode, h.cwd, h.since.Local().Format("15:04:05"))
}

func (h holder) line() string {
	return fmt.Sprintf("%d\t%s\t%s\t%s\n", h.pid, h.mode, h.cwd, h.since.UTC().Format(time.RFC3339))
}

func describeHolders(hs []holder) string {
	if len(hs) == 0 {
		return "an unknown holder (no holder line; the lock is flock'd)"
	}
	parts := make([]string, len(hs))
	for i, h := range hs {
		parts[i] = h.String()
	}
	return strings.Join(parts, ", ")
}

// readHolders parses the lock file, dropping lines whose pid no longer exists (a holder
// killed with SIGKILL never rewrote the file; the kernel released its flock).
func readHolders(path string) []holder {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var hs []holder
	for _, ln := range strings.Split(string(b), "\n") {
		h, ok := parseHolder(ln)
		if ok && pidAlive(h.pid) {
			hs = append(hs, h)
		}
	}
	return hs
}

func parseHolder(ln string) (holder, bool) {
	f := strings.Split(ln, "\t")
	if len(f) != 4 {
		return holder{}, false
	}
	pid, err := strconv.Atoi(f[0])
	if err != nil {
		return holder{}, false
	}
	since, err := time.Parse(time.RFC3339, f[3])
	if err != nil {
		return holder{}, false
	}
	m := modeShared
	if f[1] == modeExclusive.String() {
		m = modeExclusive
	}
	return holder{pid: pid, mode: m, cwd: f[2], since: since}, true
}

// pidAlive is kill(pid, 0): ESRCH means gone; EPERM means alive but not ours.
func pidAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

// acquire takes the lock in mode m, waiting up to wait for it, reporting the holder on
// status every tickInterval while it waits. The returned release rewrites the holder
// lines without this holder's, unlocks and closes. wait == 0 means try once.
//
// The blocking flock runs in a goroutine; on expiry the goroutine is told to abandon,
// so if it wins the lock later it releases at once instead of holding it on a leaked fd.
func acquire(path string, m mode, wait time.Duration, status io.Writer) (release func(), err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644) // O_CLOEXEC by default: a child never inherits the lock
	if err != nil {
		return nil, fmt.Errorf("opening %s: %w", path, err)
	}
	fd := int(f.Fd())
	if err := syscall.Flock(fd, m.flockFlag()|syscall.LOCK_NB); err == nil {
		return finishAcquire(f, path, m), nil
	} else if !errors.Is(err, syscall.EWOULDBLOCK) {
		_ = f.Close()
		return nil, fmt.Errorf("locking %s: %w", path, err)
	}
	if wait <= 0 {
		_ = f.Close()
		return nil, &busyError{mode: m, wait: wait, holders: readHolders(path)}
	}
	if err := waitFor(f, path, m, wait, status); err != nil {
		return nil, err
	}
	return finishAcquire(f, path, m), nil
}

// waitFor blocks on flock in a goroutine and returns nil once it holds the lock, or a
// busyError when wait expires first; on expiry the goroutine is abandoned (see acquire).
func waitFor(f *os.File, path string, m mode, wait time.Duration, status io.Writer) error {
	var mu sync.Mutex
	abandoned := false
	got := make(chan error, 1)
	go func() {
		err := syscall.Flock(int(f.Fd()), m.flockFlag())
		mu.Lock()
		defer mu.Unlock()
		if abandoned {
			_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
			_ = f.Close()
			return
		}
		got <- err
	}()
	start := time.Now()
	timer := time.NewTimer(wait)
	defer timer.Stop()
	tick := time.NewTicker(tickInterval)
	defer tick.Stop()
	for {
		select {
		case err := <-got:
			if err != nil {
				_ = f.Close()
				return fmt.Errorf("locking %s: %w", path, err)
			}
			return nil
		case <-tick.C:
			fmt.Fprintf(status, "gatelock: waiting for %s (%.0fs of %s) — held by %s\n",
				m, time.Since(start).Seconds(), wait, describeHolders(readHolders(path)))
		case <-timer.C:
			mu.Lock()
			select {
			case err := <-got: // the goroutine won just now; take the lock after all
				mu.Unlock()
				if err != nil {
					_ = f.Close()
					return fmt.Errorf("locking %s: %w", path, err)
				}
				return nil
			default:
			}
			abandoned = true
			mu.Unlock()
			return &busyError{mode: m, wait: wait, holders: readHolders(path)}
		}
	}
}

// finishAcquire records this holder's line (an exclusive holder owns the file and
// truncates; a shared holder appends) and builds the release func.
func finishAcquire(f *os.File, path string, m mode) func() {
	cwd, _ := os.Getwd()
	me := holder{pid: os.Getpid(), mode: m, cwd: cwd, since: time.Now()}
	if m == modeExclusive {
		_ = f.Truncate(0)
	}
	_, _ = f.Seek(0, io.SeekEnd)
	_, _ = f.WriteString(me.line())
	var once sync.Once // a second release is a no-op, never a double close
	return func() {
		once.Do(func() {
			dropHolderLine(path, me)
			_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
			_ = f.Close()
		})
	}
}

// dropHolderLine rewrites the file without me's line, still under the lock. Two shared
// holders releasing at once can lose each other's line; the lines are diagnostic only.
func dropHolderLine(path string, me holder) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	mine := strings.TrimSuffix(me.line(), "\n")
	var keep []string
	for _, ln := range strings.Split(strings.TrimSuffix(string(b), "\n"), "\n") {
		if ln != "" && ln != mine {
			keep = append(keep, ln)
		}
	}
	out := ""
	if len(keep) > 0 {
		out = strings.Join(keep, "\n") + "\n"
	}
	_ = os.WriteFile(path, []byte(out), 0o644)
}

// probeFree reports whether nobody holds the lock, by taking and dropping a
// non-blocking exclusive flock — the truth, independent of the holder lines.
func probeFree(path string) (bool, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return false, fmt.Errorf("opening %s: %w", path, err)
	}
	defer f.Close()
	err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err == nil {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		return true, nil
	}
	if errors.Is(err, syscall.EWOULDBLOCK) {
		return false, nil
	}
	return false, fmt.Errorf("probing %s: %w", path, err)
}
