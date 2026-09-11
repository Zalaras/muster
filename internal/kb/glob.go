package kb

import (
	"path"
	"strings"
)

// MatchGlob matches a slash-separated pattern against a slash-relative path. A double
// star segment matches zero or more whole segments; every other segment is matched by
// path.Match, which never crosses a slash. Matching is byte-exact, so a mis-cased pattern
// matches nothing even on a case-insensitive filesystem (design §6).
func MatchGlob(pattern, relpath string) bool {
	return matchSegments(strings.Split(pattern, "/"), strings.Split(relpath, "/"))
}

func matchSegments(pat, segs []string) bool {
	for len(pat) > 0 {
		if pat[0] == "**" {
			if len(pat) == 1 {
				return true
			}
			for i := 0; i <= len(segs); i++ {
				if matchSegments(pat[1:], segs[i:]) {
					return true
				}
			}
			return false
		}
		if len(segs) == 0 {
			return false
		}
		ok, err := path.Match(pat[0], segs[0])
		if err != nil || !ok {
			return false
		}
		pat, segs = pat[1:], segs[1:]
	}
	return len(segs) == 0
}

// Expand returns every tree path the pattern matches, in tree order.
func Expand(tree []string, pattern string) []string {
	var out []string
	for _, p := range tree {
		if MatchGlob(pattern, p) {
			out = append(out, p)
		}
	}
	return out
}
