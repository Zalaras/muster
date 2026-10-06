package commentpass

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Drop removes the comment block containing each path:line, records the drops as an
// orchestrator cycle and commits by pathspec. Every refusal is collected before any
// write.
func (p *Pass) Drop(ctx context.Context, refs []string, cycle int, message string) error {
	if err := p.requireBranch(ctx); err != nil {
		return err
	}
	byPath, problems := parseDropRefs(refs)
	paths := make([]string, 0, len(byPath))
	for path := range byPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	planned := map[string]*fileScan{}
	drops := map[string][]Block{}
	for _, path := range paths {
		fs, err := p.scanPath(path)
		if err != nil {
			problems = append(problems, err.Error())
			continue
		}
		blocks, more := planDrop(fs, byPath[path])
		planned[path], drops[path] = fs, blocks
		problems = append(problems, more...)
	}
	if len(problems) > 0 {
		return fmt.Errorf("%w:\n  %s", ErrRefused, strings.Join(problems, "\n  "))
	}
	ledger, _, err := p.readLedger()
	if err != nil {
		return err
	}
	entry := Cycle{Cycle: cycle, At: p.Now().UTC().Format(time.RFC3339), By: "orchestrator"}
	var tsRels []string
	for _, path := range paths {
		if werr := p.dropBlocks(path, planned[path], drops[path], &entry); werr != nil {
			return werr
		}
		if !isGo(path) {
			tsRels = append(tsRels, path)
		}
	}
	if ferr := p.finishCycle(ctx, ledger, entry, paths, tsRels, message); ferr != nil {
		return ferr
	}
	p.printf("drop: %d comment blocks removed in %d files; ledger %s\n", entry.Counts.Drop, len(paths), p.ledgerPath())
	return nil
}

func parseDropRefs(refs []string) (map[string][]int, []string) {
	byPath := map[string][]int{}
	var problems []string
	for _, r := range refs {
		path, lineStr, ok := strings.Cut(r, ":")
		line, convErr := strconv.Atoi(lineStr)
		switch {
		case !ok || convErr != nil || line < 1:
			problems = append(problems, "not a path:line: "+r)
		case !InScope(path):
			problems = append(problems, "outside the pass's scope: "+r)
		default:
			byPath[path] = append(byPath[path], line)
		}
	}
	return byPath, problems
}

// planDrop resolves each line to the block holding it; a directive or a line with no
// comment is a problem, never a silent skip.
func planDrop(fs *fileScan, lines []int) ([]Block, []string) {
	li := indexLines(fs.src)
	var out []Block
	var problems []string
	seen := map[int]bool{}
	for _, line := range lines {
		if directiveAt(fs, li, line) {
			problems = append(problems, fmt.Sprintf("%s:%d is a directive", fs.path, line))
			continue
		}
		found := false
		for _, b := range fs.blocks {
			if !containsLine(b, line) {
				continue
			}
			found = true
			if !seen[b.Span.Start] {
				seen[b.Span.Start] = true
				out = append(out, b)
			}
		}
		if !found {
			problems = append(problems, fmt.Sprintf("no comment on %s:%d", fs.path, line))
		}
	}
	return out, problems
}

func (p *Pass) dropBlocks(path string, fs *fileScan, blocks []Block, entry *Cycle) error {
	var spans []Span
	for _, b := range blocks {
		spans = append(spans, b.Span)
		entry.Counts.Candidates++
		entry.Counts.Drop++
		entry.Drops = append(entry.Drops, Drop{Key: KeyOf(path, b.Lines), Path: path, Anchor: anchorFor(fs.src, b), Lines: b.Lines})
	}
	out := removeSpans(fs.src, spans)
	if isGo(path) {
		formatted, err := formatGo(out)
		if err != nil {
			return fmt.Errorf("%s does not parse with the comment removed: %w", path, err)
		}
		out = formatted
	}
	return p.writeFile(path, out)
}

func directiveAt(fs *fileScan, li lineIndex, line int) bool {
	for _, t := range fs.toks {
		if isDirective(t.text) && li.lineOf(t.start) <= line && line <= li.lineOf(max(t.start, t.end-1)) {
			return true
		}
	}
	return false
}
