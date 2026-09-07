package tmux

import (
	"context"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// preflightTimeout bounds `tmux -V` (REQ-1): it never contacts a tmux server, so it
// returns near-instantly — a timeout means the binary itself is broken, not busy.
const preflightTimeout = 2 * time.Second

// preflighter holds the two process boundaries Preflight crosses — resolving the binary
// and running it — as function fields, the same seam shape as locate.SpotlightFinder
// (lookPath/run) and claudecode's execFunc. Production uses the exec package via
// newPreflighter; tests construct the struct directly with canned results so version
// parsing and the fatal/non-fatal decision are exercised with no subprocess at all
// (docs/conventions.md §Testing: Go tests reach subprocesses through an injectable run
// func — a real fork under `go test`'s package parallelism is what made these tests
// load-sensitive).
type preflighter struct {
	lookPath func(file string) (string, error)
	run      func(ctx context.Context, path string, args ...string) ([]byte, error)
	timeout  time.Duration
}

func newPreflighter() *preflighter {
	return &preflighter{lookPath: exec.LookPath, run: runCommand, timeout: preflightTimeout}
}

// runCommand is the production run seam: `path args...` with stdout captured, bounded by
// ctx. exec.CommandContext kills the process on ctx expiry, but Output's Wait still
// blocks on the stdout pipe closing — which a descendant that inherited it can hold open
// even after `tmux -V` itself has exited. WaitDelay bounds that wait: the timer starts
// when ctx is done or when Wait sees the process exit, whichever comes first, so a hung
// `tmux -V` (or a forked descendant holding its pipe) cannot stall this indefinitely even
// if ctx never fires (docs/conventions.md §Go; post-worktree-spike-issues REQ-1/REQ-3).
func runCommand(ctx context.Context, path string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.WaitDelay = 2 * time.Second
	return cmd.Output()
}

// MinVersion is the oldest tmux Muster's own tmux usage can rely on (REQ-2). NewSession
// in tmux.go uses "new-session -e" and applyServerOptions there uses "set-option -as
// terminal-features", both introduced in tmux 3.2; below that they fail obscurely at
// first launch instead of at startup.
var MinVersion = ParsedVersion{Major: 3, Minor: 2}

// versionPattern matches the first major.minor pair in `tmux -V` output (e.g. "tmux
// 3.3a", "tmux next-3.4"). Trailing letters/suffixes and anything before the digits are
// ignored (Edge Cases 3-4).
var versionPattern = regexp.MustCompile(`(\d+)\.(\d+)`)

// ParsedVersion is a tmux version's numeric (major, minor) pair.
type ParsedVersion struct {
	Major, Minor int
}

// String renders the version as "major.minor", e.g. "3.2".
func (v ParsedVersion) String() string {
	return strconv.Itoa(v.Major) + "." + strconv.Itoa(v.Minor)
}

// Less reports whether v is older than other, comparing major then minor numerically
// (Edge Case 3: a string compare would put "3.10" below "3.2").
func (v ParsedVersion) Less(other ParsedVersion) bool {
	if v.Major != other.Major {
		return v.Major < other.Major
	}
	return v.Minor < other.Minor
}

// ParseVersion extracts the first (major, minor) pair from raw `tmux -V` output. ok is
// false when no numeric version is found at all (e.g. "tmux master") — REQ-3's warning
// path, not an error.
func ParseVersion(raw string) (v ParsedVersion, ok bool) {
	m := versionPattern.FindStringSubmatch(raw)
	if m == nil {
		return ParsedVersion{}, false
	}
	major, err := strconv.Atoi(m[1])
	if err != nil {
		return ParsedVersion{}, false
	}
	minor, err := strconv.Atoi(m[2])
	if err != nil {
		return ParsedVersion{}, false
	}
	return ParsedVersion{Major: major, Minor: minor}, true
}

// PreflightStatus classifies a Preflight result.
type PreflightStatus int

const (
	// StatusOK means tmux was found, ran, parsed, and is at least MinVersion.
	StatusOK PreflightStatus = iota
	// StatusNotFound means tmux could not be run at all: absent from $PATH, not
	// executable, exiting non-zero, or failing to answer `tmux -V` within
	// preflightTimeout (REQ-1, Edge Cases 1-2). Fatal.
	StatusNotFound
	// StatusTooOld means tmux ran and its version parsed, but it is older than
	// MinVersion (REQ-2). Fatal.
	StatusTooOld
	// StatusUnrecognized means tmux ran but its output did not parse as a version
	// (REQ-3, e.g. "tmux master"). Not fatal — Muster cannot prove an unrecognized
	// build is too old, so startup proceeds with a warning.
	StatusUnrecognized
)

// PreflightResult is what Preflight found, never formatted text (that is
// cmd/musterd/preflight.go's job).
type PreflightResult struct {
	// Found reports whether exec.LookPath resolved a tmux binary at all. False only
	// for StatusNotFound with nothing on $PATH.
	Found bool
	// Path is the resolved absolute path (Edge Case 6/REQ-14), set whenever Found is
	// true — including when the binary was found but failed to run.
	Path string
	// Version is `tmux -V`'s stdout with the leading "tmux" program name trimmed off
	// (e.g. "3.7b", "master") — set whenever tmux actually ran (StatusOK,
	// StatusTooOld, StatusUnrecognized) and empty otherwise.
	Version string
	Status  PreflightStatus
}

// Preflight resolves tmux on $PATH and classifies its version against MinVersion. It
// never formats a report and never exits the process — cmd/musterd renders the result
// and decides whether to gate startup on it.
func Preflight(ctx context.Context) PreflightResult {
	return newPreflighter().preflight(ctx)
}

func (p *preflighter) preflight(ctx context.Context) PreflightResult {
	path, err := p.lookPath("tmux")
	if err != nil {
		return PreflightResult{Status: StatusNotFound}
	}

	runCtx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()

	out, err := p.run(runCtx, path, "-V")
	if err != nil {
		return PreflightResult{Found: true, Path: path, Status: StatusNotFound}
	}

	raw := strings.TrimSpace(string(out))
	display := strings.TrimSpace(strings.TrimPrefix(raw, "tmux"))
	v, ok := ParseVersion(raw)
	if !ok {
		return PreflightResult{Found: true, Path: path, Version: display, Status: StatusUnrecognized}
	}
	if v.Less(MinVersion) {
		return PreflightResult{Found: true, Path: path, Version: display, Status: StatusTooOld}
	}
	return PreflightResult{Found: true, Path: path, Version: display, Status: StatusOK}
}
