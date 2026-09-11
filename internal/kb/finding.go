package kb

import (
	"fmt"
	"sort"
)

// Finding is one content problem, reported as path:line: msg (or path: msg when the
// problem has no line). Content problems are findings; only I/O failures are errors.
type Finding struct {
	Path string
	Line int
	Msg  string
}

func (f Finding) String() string {
	if f.Line > 0 {
		return fmt.Sprintf("%s:%d: %s", f.Path, f.Line, f.Msg)
	}
	return fmt.Sprintf("%s: %s", f.Path, f.Msg)
}

func sortFindings(fs []Finding) {
	sort.Slice(fs, func(i, j int) bool {
		a, b := fs[i], fs[j]
		if a.Path != b.Path {
			return a.Path < b.Path
		}
		if a.Line != b.Line {
			return a.Line < b.Line
		}
		return a.Msg < b.Msg
	})
}
