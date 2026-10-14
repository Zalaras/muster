package commentpass

import (
	"bytes"
	"regexp"
	"strings"
)

// ScopePrefixes are the directories the pass reads; test files inside them are excluded.
var ScopePrefixes = []string{"cmd/", "internal/", "web/src/"}

// InScope reports whether a repo-relative path is production code the pass may touch.
func InScope(rel string) bool {
	rel = strings.TrimPrefix(rel, "./")
	switch {
	case strings.HasPrefix(rel, "cmd/"), strings.HasPrefix(rel, "internal/"):
		return strings.HasSuffix(rel, ".go") && !strings.HasSuffix(rel, "_test.go")
	case strings.HasPrefix(rel, "web/src/"):
		return strings.HasSuffix(rel, ".ts") && !strings.HasSuffix(rel, ".test.ts") && !strings.HasSuffix(rel, ".d.ts")
	}
	return false
}

func DropInScope(rel string) bool {
	rel = strings.TrimPrefix(rel, "./")
	switch {
	case InScope(rel):
		return true
	case strings.HasPrefix(rel, "cmd/"), strings.HasPrefix(rel, "internal/"):
		return strings.HasSuffix(rel, "_test.go")
	case strings.HasPrefix(rel, "web/src/"):
		return strings.HasSuffix(rel, ".test.ts") || isCSS(rel)
	case strings.HasPrefix(rel, "web/e2e/"):
		return strings.HasSuffix(rel, ".ts") && !strings.HasSuffix(rel, ".d.ts")
	case strings.HasPrefix(rel, "test/"):
		return isGo(rel)
	}
	return false
}

func isGo(rel string) bool { return strings.HasSuffix(rel, ".go") }

func isCSS(rel string) bool { return strings.HasSuffix(rel, ".css") }

func isTS(rel string) bool { return strings.HasSuffix(rel, ".ts") }

var generatedRE = regexp.MustCompile(`(?m)^// Code generated .* DO NOT EDIT\.$`)

func isGenerated(src []byte) bool {
	head := src
	if len(head) > 4096 {
		head = head[:4096]
	}
	return bytes.Contains(head, []byte("DO NOT EDIT")) && generatedRE.Match(head)
}
