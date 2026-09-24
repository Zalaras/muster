package selfupdate

import (
	"cmp"
	"fmt"
	"regexp"
	"strconv"
)

// Version is a parsed strict release version — MAJOR.MINOR.PATCH, nothing else.
type Version struct {
	Major, Minor, Patch int
}

// releasePattern is deliberately anchored end-to-end: a pre-release/build suffix
// ("v0.10.0-4-ge5102b8", "0.10.0-dirty") or a short form ("1.2") must not parse —
// those are exactly what marks a build as `dev`.
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
// ordering numerically field by field — never lexicographically, so "0.9.0"
// correctly precedes "0.10.0".
func (v Version) Compare(other Version) int {
	if v.Major != other.Major {
		return cmp.Compare(v.Major, other.Major)
	}
	if v.Minor != other.Minor {
		return cmp.Compare(v.Minor, other.Minor)
	}
	return cmp.Compare(v.Patch, other.Patch)
}

// String renders the bare MAJOR.MINOR.PATCH form, no leading "v" — GoReleaser's
// {{.Version}} shape, matching kb:anchor/ws.update's "running" for a release build.
// Callers that render the "v0.11.0" display form prepend "v" themselves.
func (v Version) String() string {
	return fmt.Sprintf("%d.%d.%d", v.Major, v.Minor, v.Patch)
}
