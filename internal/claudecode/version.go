package claudecode

import (
	"bufio"
	"context"
	_ "embed"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// versionRE matches the leading semver of `claude --version`, e.g. "2.1.233 (Claude Code)".
var versionRE = regexp.MustCompile(`^(\d+\.\d+\.\d+)`)

// InstalledVersion reports the version of the claude binary at bin — the same
// -claude-bin value the daemon launches sessions with (a bare "claude" resolves on
// PATH), so a test daemon's stub answers `--version` and no test ever runs the real
// binary (CLAUDE.md; docs/conventions.md §Testing).
//
// The caller supplies the context: this runs on the daemon's startup path, and a hung
// claude binary must not stall it indefinitely.
func InstalledVersion(ctx context.Context, bin string) (string, error) {
	cmd := exec.CommandContext(ctx, bin, "--version")
	// WaitDelay bounds the wait for a descendant that inherited the --version
	// stdout pipe to close it. The timer starts when ctx is done or when Wait
	// sees the process exit, whichever comes first — without it, Output's Wait
	// can block on that descendant forever even with ctx never firing
	// (docs/conventions.md §Go; this held musterd's startup hostage before its
	// first log line).
	cmd.WaitDelay = 2 * time.Second
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("running claude --version: %w", err)
	}
	trimmed := strings.TrimSpace(string(out))
	m := versionRE.FindStringSubmatch(trimmed)
	if m == nil {
		return "", fmt.Errorf("parsing claude --version output %q", trimmed)
	}
	return m[1], nil
}

// ObservedVersion is one row of the observed-versions record (observed_versions.txt): a
// Claude Code version `make canary` has gone green on.
type ObservedVersion struct {
	Version string
	Date    string
	Note    string
}

//go:embed observed_versions.txt
var observedVersionsFile string

// observedVersionLineRE matches one record row: "<major.minor.patch> <YYYY-MM-DD> <note>".
var observedVersionLineRE = regexp.MustCompile(`^(\d+\.\d+\.\d+) (\d{4}-\d{2}-\d{2}) (.+)$`)

// ParseObservedVersions parses the observed-versions record format
// (docs/claude-code-versions.md "Record file format"): one `<version> <date> <note>` row
// per line, `#` comments and blank lines allowed, rows need not be sorted. Rejects a
// duplicate version or a malformed row so a corrupt record fails loudly rather than
// silently narrowing the range.
func ParseObservedVersions(r io.Reader) ([]ObservedVersion, error) {
	var rows []ObservedVersion
	seen := make(map[string]bool)

	scanner := bufio.NewScanner(r)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		m := observedVersionLineRE.FindStringSubmatch(line)
		if m == nil {
			return nil, fmt.Errorf("observed_versions.txt line %d: malformed row %q", lineNo, line)
		}
		version := m[1]
		if seen[version] {
			return nil, fmt.Errorf("observed_versions.txt line %d: duplicate version %q", lineNo, version)
		}
		seen[version] = true
		rows = append(rows, ObservedVersion{Version: version, Date: m[2], Note: m[3]})
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("reading observed_versions.txt: %w", err)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("observed_versions.txt: no version rows found")
	}
	return rows, nil
}

// ObservedVersions returns the embedded observed-versions record, parsed fresh on every
// call — a handful of lines, no package-level cache, no init() (docs/conventions.md §Go).
// A parse failure here is a programming error the build's own tests guard against, so it
// panics like regexp.MustCompile rather than threading an error through every caller.
func ObservedVersions() []ObservedVersion {
	rows, err := ParseObservedVersions(strings.NewReader(observedVersionsFile))
	if err != nil {
		panic("internal/claudecode: embedded observed_versions.txt is invalid: " + err.Error())
	}
	return rows
}

// semver is a comparable major.minor.patch triple.
type semver struct{ major, minor, patch int }

// parseSemver parses the leading major.minor.patch of v, ignoring any suffix (e.g.
// "2.0.0-e2e-stub" parses as {2,0,0}). ok is false for anything versionRE doesn't match.
func parseSemver(v string) (semver, bool) {
	m := versionRE.FindStringSubmatch(v)
	if m == nil {
		return semver{}, false
	}
	parts := strings.SplitN(m[1], ".", 3)
	major, err1 := strconv.Atoi(parts[0])
	minor, err2 := strconv.Atoi(parts[1])
	patch, err3 := strconv.Atoi(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return semver{}, false
	}
	return semver{major, minor, patch}, true
}

// compareSemver returns -1, 0 or 1 as a is less than, equal to, or greater than b.
func compareSemver(a, b semver) int {
	switch {
	case a.major != b.major:
		return compareInt(a.major, b.major)
	case a.minor != b.minor:
		return compareInt(a.minor, b.minor)
	default:
		return compareInt(a.patch, b.patch)
	}
}

func compareInt(a, b int) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}

// RangeOf returns rows' semver minimum and maximum version strings — the floor and the
// verified ceiling — independent of row order (INV-6). Empty rows yields empty strings.
func RangeOf(rows []ObservedVersion) (floor, verified string) {
	if len(rows) == 0 {
		return "", ""
	}
	sorted := make([]ObservedVersion, len(rows))
	copy(sorted, rows)
	sort.Slice(sorted, func(i, j int) bool {
		pi, _ := parseSemver(sorted[i].Version)
		pj, _ := parseSemver(sorted[j].Version)
		return compareSemver(pi, pj) < 0
	})
	return sorted[0].Version, sorted[len(sorted)-1].Version
}

// Floor is the lowest version `make canary` has gone green on.
func Floor() string {
	floor, _ := RangeOf(ObservedVersions())
	return floor
}

// Verified is the highest version `make canary` has gone green on — the ceiling.
func Verified() string {
	_, verified := RangeOf(ObservedVersions())
	return verified
}

// FormatRange renders a floor/verified pair for display: "a–b" (en dash), or just "a"
// when they are equal (only one version has ever been observed).
func FormatRange(floor, verified string) string {
	if floor == verified {
		return floor
	}
	return floor + "–" + verified
}

// VersionStatus classifies an installed Claude Code against the observed range.
type VersionStatus string

const (
	// StatusUnknown means installed was empty, unparseable, or the check itself failed
	// (missing binary, non-zero exit, timeout).
	StatusUnknown VersionStatus = "unknown"
	// StatusBelow means installed is older than Floor().
	StatusBelow VersionStatus = "below"
	// StatusVerified means installed is within [Floor(), Verified()], inclusive —
	// including a version strictly between two observed rows that was never itself run
	// (it is inferred, not individually verified).
	StatusVerified VersionStatus = "verified"
	// StatusAbove means installed is newer than Verified().
	StatusAbove VersionStatus = "above"
)

// ClassifyAgainst classifies installed against rows' range. Comparison is on the leading
// major.minor.patch only, ignoring any suffix.
func ClassifyAgainst(installed string, rows []ObservedVersion) VersionStatus {
	p, ok := parseSemver(installed)
	if !ok {
		return StatusUnknown
	}
	floor, verified := RangeOf(rows)
	pf, _ := parseSemver(floor)
	pv, _ := parseSemver(verified)
	switch {
	case compareSemver(p, pf) < 0:
		return StatusBelow
	case compareSemver(p, pv) > 0:
		return StatusAbove
	default:
		return StatusVerified
	}
}

// Classify classifies installed against the embedded observed-versions record.
func Classify(installed string) VersionStatus {
	return ClassifyAgainst(installed, ObservedVersions())
}

// VersionReport is CheckVersion's result. It never carries an error to the caller in a way
// that blocks startup: Installed is nil iff Status is StatusUnknown (INV-1); Floor and
// Verified are always populated (INV-2). Err is the underlying cause when Status is
// StatusUnknown — carried for logging only, never for control flow.
type VersionReport struct {
	Installed *string
	Floor     string
	Verified  string
	Status    VersionStatus
	Err       error
}

// CheckVersion reports the installed Claude Code version at bin against the observed
// range. It never returns an error to the caller (docs/claude-code-versions.md): a missing
// binary, a non-zero --version exit, unparseable output or a timeout all resolve to
// StatusUnknown with Installed nil, never a failure that stops the daemon starting.
func CheckVersion(ctx context.Context, bin string) VersionReport {
	floor, verified := RangeOf(ObservedVersions())

	installed, err := InstalledVersion(ctx, bin)
	if err != nil {
		return VersionReport{Floor: floor, Verified: verified, Status: StatusUnknown, Err: err}
	}
	return VersionReport{
		Installed: &installed,
		Floor:     floor,
		Verified:  verified,
		Status:    ClassifyAgainst(installed, ObservedVersions()),
	}
}
