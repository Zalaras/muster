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

// MinVersion is the oldest tmux Muster's own tmux usage can rely on (REQ-2). NewSession
// above uses "new-session -e" and applyServerOptions uses "set-option -as
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
	path, err := exec.LookPath("tmux")
	if err != nil {
		return PreflightResult{Status: StatusNotFound}
	}

	runCtx, cancel := context.WithTimeout(ctx, preflightTimeout)
	defer cancel()

	out, err := exec.CommandContext(runCtx, path, "-V").Output()
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
