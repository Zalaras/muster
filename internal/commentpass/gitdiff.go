package commentpass

import (
	"context"
	"regexp"
	"strconv"
	"strings"
)

// diffInfo is what the pass needs from the branch diff: which lines of which files are
// new, and the removed and added lines for identifier bookkeeping.
type diffInfo struct {
	added   map[string]map[int]bool
	removed map[string][]string
	plus    []string
	minus   []string
}

var hunkRE = regexp.MustCompile(`^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@`)

func (p *Pass) diff(ctx context.Context, base string) (*diffInfo, error) {
	args := append([]string{"diff", "--unified=0", "--no-color", "--no-ext-diff", "-M", "--diff-filter=AMR", base, "--"}, scopeDirs()...)
	out, err := p.git(ctx, args...)
	if err != nil {
		return nil, err
	}
	return parseDiff(out), nil
}

func scopeDirs() []string {
	out := make([]string, len(ScopePrefixes))
	for i, d := range ScopePrefixes {
		out[i] = strings.TrimSuffix(d, "/")
	}
	return out
}

func parseDiff(out string) *diffInfo {
	d := &diffInfo{added: map[string]map[int]bool{}, removed: map[string][]string{}}
	path := ""
	n := 0
	for _, line := range strings.Split(out, "\n") {
		switch {
		case strings.HasPrefix(line, "+++ "):
			path = ""
			if rest, ok := strings.CutPrefix(line, "+++ b/"); ok {
				path = rest
			}
		case strings.HasPrefix(line, "@@"):
			m := hunkRE.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			n, _ = strconv.Atoi(m[1])
		case strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++"):
			if path != "" {
				if d.added[path] == nil {
					d.added[path] = map[int]bool{}
				}
				d.added[path][n] = true
				d.plus = append(d.plus, line[1:])
				n++
			}
		case strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---"):
			if path != "" {
				d.removed[path] = append(d.removed[path], line[1:])
				d.minus = append(d.minus, line[1:])
			}
		}
	}
	return d
}

func (p *Pass) untracked(ctx context.Context) ([]string, error) {
	args := append([]string{"ls-files", "--others", "--exclude-standard", "--"}, scopeDirs()...)
	out, err := p.git(ctx, args...)
	if err != nil {
		return nil, err
	}
	return inScopeLines(out), nil
}

func (p *Pass) tracked(ctx context.Context) ([]string, error) {
	args := append([]string{"ls-files", "--"}, scopeDirs()...)
	out, err := p.git(ctx, args...)
	if err != nil {
		return nil, err
	}
	return inScopeLines(out), nil
}

func inScopeLines(out string) []string {
	var paths []string
	for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
		if l != "" && InScope(l) {
			paths = append(paths, l)
		}
	}
	return paths
}

var (
	goDeclRE = regexp.MustCompile(`^(?:func(?: \([^)]*\))?|type|var|const) ([A-Za-z_]\w*)`)
	tsDeclRE = regexp.MustCompile(`^export (?:async )?(?:function|const|let|class|interface|type|enum) ([A-Za-z_$][\w$]*)`)
)

func declNames(lines []string) map[string]bool {
	names := map[string]bool{}
	for _, l := range lines {
		for _, re := range []*regexp.Regexp{goDeclRE, tsDeclRE} {
			if m := re.FindStringSubmatch(l); m != nil {
				names[m[1]] = true
			}
		}
	}
	return names
}

// removedIdents are top-level names the branch deleted and did not re-declare anywhere.
func (d *diffInfo) removedIdents() []string {
	gone, back := declNames(d.minus), declNames(d.plus)
	var out []string
	for n := range gone {
		if !back[n] {
			out = append(out, n)
		}
	}
	return out
}

// removedComments are the diff's deleted lines in path that look like comment lines.
func (d *diffInfo) removedComments(path string) []string {
	var out []string
	for _, l := range d.removed[path] {
		t := strings.TrimSpace(l)
		if strings.HasPrefix(t, "//") || strings.HasPrefix(t, "/*") || strings.HasPrefix(t, "*") {
			out = append(out, t)
		}
	}
	return out
}
