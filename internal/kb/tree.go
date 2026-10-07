package kb

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// WalkTree lists every regular file under root as a sorted, forward-slash, root-relative
// path. Symlinks are not followed; the config's skip list (slash-relative directories never
// entered) and kept-hidden list (the dot-directories it does enter) stand in for git
// ls-files (design K10). Any directory whose name contains node_modules is skipped too.
func WalkTree(root string, cfg *Config) ([]string, error) {
	skipDirs, keptHiddenDirs := map[string]bool{}, map[string]bool{}
	for _, d := range cfg.Tree.SkipDirs {
		skipDirs[strings.TrimSuffix(d, "/")] = true
	}
	for _, d := range cfg.Tree.KeepHiddenDirs {
		keptHiddenDirs[d] = true
	}
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
	hashCommentRE = regexp.MustCompile(`^\s*#`)
)

// CommentLines returns the lines of text that may carry a citation, by file type: every
// line outside a code fence for markdown, comment lines only for Go and TypeScript, and
// hash-comment lines for everything else (a shell script, a Makefile, a git hook).
func CommentLines(relpath, text string) []Line {
	if strings.HasSuffix(relpath, ".md") {
		return proseLines(text)
	}
	re := hashCommentRE
	if strings.HasSuffix(relpath, ".go") || strings.HasSuffix(relpath, ".ts") {
		re = codeCommentRE
	}
	var out []Line
	for i, t := range strings.Split(text, "\n") {
		if re.MatchString(t) {
			out = append(out, Line{N: i + 1, Text: t})
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
