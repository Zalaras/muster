package kb

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// skipDirs are never walked, by slash-relative path.
var skipDirs = map[string]bool{
	".git":                  true,
	"node_modules":          true,
	"web/dist":              true,
	"dist":                  true,
	"bin":                   true,
	"internal/webui/assets": true,
}

// keptHiddenDirs are the hidden directories the walk descends into.
var keptHiddenDirs = map[string]bool{".claude": true, ".githooks": true, ".github": true}

// WalkTree lists every regular file under root as a sorted, forward-slash, root-relative
// path. Symlinks are not followed; the fixed skip list stands in for git ls-files
// (design K10).
func WalkTree(root string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, rerr := filepath.Rel(root, p)
		if rerr != nil {
			return rerr
		}
		rel = filepath.ToSlash(rel)
		if rel == "." {
			return nil
		}
		if d.IsDir() {
			base := d.Name()
			if skipDirs[rel] || strings.Contains(base, "node_modules") ||
				(strings.HasPrefix(base, ".") && !keptHiddenDirs[base]) {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type().IsRegular() {
			out = append(out, rel)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walking %s: %w", root, err)
	}
	sort.Strings(out)
	return out, nil
}

// Line is one numbered line of a file.
type Line struct {
	N    int
	Text string
}

var (
	fenceRE       = regexp.MustCompile("^\\s*(`{3,}|~{3,})")
	codeCommentRE = regexp.MustCompile(`^\s*(//|/\*|\*)`)
)

// CommentLines returns the lines of text that may carry a citation, by file type: every
// line outside a code fence for markdown, comment lines only for Go and TypeScript, and
// nothing for anything else (the dead-refs rule set).
func CommentLines(relpath, text string) []Line {
	var out []Line
	switch {
	case strings.HasSuffix(relpath, ".md"):
		out = append(out, proseLines(text)...)
	case strings.HasSuffix(relpath, ".go"), strings.HasSuffix(relpath, ".ts"):
		for i, t := range strings.Split(text, "\n") {
			if codeCommentRE.MatchString(t) {
				out = append(out, Line{N: i + 1, Text: t})
			}
		}
	}
	return out
}

// proseLines returns the markdown lines outside code fences, fence lines excluded.
func proseLines(text string) []Line {
	var out []Line
	fence := ""
	for i, t := range strings.Split(text, "\n") {
		if m := fenceRE.FindStringSubmatch(t); m != nil {
			switch {
			case fence == "":
				fence = m[1]
			case m[1][0] == fence[0] && len(m[1]) >= len(fence):
				fence = ""
			}
			continue
		}
		if fence == "" {
			out = append(out, Line{N: i + 1, Text: t})
		}
	}
	return out
}
