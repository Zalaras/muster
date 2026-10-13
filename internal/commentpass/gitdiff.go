package commentpass

import (
	"context"
	"regexp"
	"strconv"
	"strings"
)

// diffInfo is what the pass needs from the branch diff: which lines of which files are
// new, each hunk's removed lines, and the removed and added lines for identifier bookkeeping.
type diffInfo struct {
	added map[string]map[int]bool
	hunks map[string][]hunk
	plus  []string
	minus []string
}

// hunk is one `@@` section: where it lands in the new file and the lines it deleted. A
// pure deletion has newCount 0 and sits between newStart and newStart+1.
type hunk struct {
	newStart, newCount int
	removed            []string
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
	d := &diffInfo{added: map[string]map[int]bool{}, hunks: map[string][]hunk{}}
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
			if start, ok := d.startHunk(path, line); ok {
				n = start
			}
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
			if hs := d.hunks[path]; path != "" && len(hs) > 0 {
				hs[len(hs)-1].removed = append(hs[len(hs)-1].removed, line[1:])
				d.minus = append(d.minus, line[1:])
			}
		}
	}
	return d
}

// startHunk records the hunk a `@@` header opens in path and returns its new-file start.
func (d *diffInfo) startHunk(path, header string) (int, bool) {
	m := hunkRE.FindStringSubmatch(header)
	if m == nil {
		return 0, false
	}
	start, _ := strconv.Atoi(m[1])
	count := 1
	if m[2] != "" {
		count, _ = strconv.Atoi(m[2])
	}
	if path != "" {
		d.hunks[path] = append(d.hunks[path], hunk{newStart: start, newCount: count})
	}
	return start, true
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

// removedComments are the comment-looking lines the branch deleted from path within new
// lines start..end: only the hunks landing inside that range, so a block's previous text
// never carries a deletion from elsewhere in the file.
func (d *diffInfo) removedComments(path string, start, end int) []string {
	var out []string
	for _, h := range d.hunks[path] {
		lo, hi := h.newStart, h.newStart+h.newCount-1
		if h.newCount == 0 {
			hi = lo + 1
		}
		if lo > end || hi < start {
			continue
		}
		for _, l := range h.removed {
			t := strings.TrimSpace(l)
			if strings.HasPrefix(t, "//") || strings.HasPrefix(t, "/*") || strings.HasPrefix(t, "*") {
				out = append(out, t)
			}
		}
	}
	return out
}
