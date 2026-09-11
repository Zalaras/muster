package selfupdate

import (
	"fmt"
	"regexp"
	"strconv"
)

// Version is a parsed strict release version — MAJOR.MINOR.PATCH, nothing else.
type Version struct {
	Major, Minor, Patch int
}

// releasePattern is deliberately anchored end-to-end: a pre-release/build suffix
// ("v0.10.0-4-ge5102b8", "0.10.0-dirty") or a short form ("1.2") must not parse
// (REQ-8/D7) — those are exactly what marks a build as `dev`.
var releasePattern = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)$`)

// ParseRelease parses s as a strict release version: optional leading "v", then exactly
// three dot-separated non-negative integers. Reports false for anything else, including
// "dev" and any pre-release/build suffix.
func ParseRelease(s string) (Version, bool) {
	m := releasePattern.FindStringSubmatch(s)
	if m == nil {
		return Version{}, false
	}
	major, err1 := strconv.Atoi(m[1])
	minor, err2 := strconv.Atoi(m[2])
	patch, err3 := strconv.Atoi(m[3])
	if err1 != nil || err2 != nil || err3 != nil {
		return Version{}, false
	}
	return Version{Major: major, Minor: minor, Patch: patch}, true
}

// Compare returns -1, 0 or +1 as v is less than, equal to, or greater than other,
// ordering numerically field by field (REQ-6/D9) — never lexicographically, so "0.9.0"
// correctly precedes "0.10.0".
func (v Version) Compare(other Version) int {
	if v.Major != other.Major {
		return cmpInt(v.Major, other.Major)
	}
	if v.Minor != other.Minor {
		return cmpInt(v.Minor, other.Minor)
	}
	return cmpInt(v.Patch, other.Patch)
}

func cmpInt(a, b int) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}

// String renders the bare MAJOR.MINOR.PATCH form, no leading "v" — GoReleaser's
// {{.Version}} shape, matching docs/protocol.md §5.7's "running" for a release build.
// Callers that render the "v0.11.0" display form (plan Text rules) prepend "v" themselves.
func (v Version) String() string {
	return fmt.Sprintf("%d.%d.%d", v.Major, v.Minor, v.Patch)
}
