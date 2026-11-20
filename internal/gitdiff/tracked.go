package gitdiff

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type rawEntry struct {
	status  string
	path    string
	oldPath *string
}

func parseRaw(raw string) []rawEntry {
	tokens := strings.Split(strings.TrimRight(raw, "\x00"), "\x00")
	var entries []rawEntry
	for i := 0; i < len(tokens); i++ {
		meta := tokens[i]
		if !strings.HasPrefix(meta, ":") {
			continue
		}
		fields := strings.Fields(meta)
		status := fields[len(fields)-1]
		if i+1 >= len(tokens) {
			break
		}
		e := rawEntry{status: status[:1], path: tokens[i+1]}
		i++
		if (e.status == "R" || e.status == "C") && i+1 < len(tokens) {
			old := e.path
			e.oldPath = &old
			e.path = tokens[i+1]
			i++
		}
		entries = append(entries, e)
	}
	return entries
}

func (r *Reader) scratchIndex(ctx context.Context, top string) (path string, cleanup func(), err error) {
	noop := func() {}
	out, err := r.output(ctx, top, nil, "rev-parse", "--git-path", "index")
	if err != nil {
		return "", noop, err
	}
	src := strings.TrimSpace(out)
	if !filepath.IsAbs(src) {
		src = filepath.Join(top, src)
	}
	info, err := os.Stat(src)
	if errors.Is(err, fs.ErrNotExist) {
		return "", noop, nil
	}
	if err != nil {
		return "", noop, err
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return "", noop, err
	}
	dir, err := os.MkdirTemp("", "muster-index-")
	if err != nil {
		return "", noop, err
	}
	cleanup = func() { _ = os.RemoveAll(dir) }
	path = filepath.Join(dir, "index")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		cleanup()
		return "", noop, err
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		cleanup()
		return "", noop, err
	}
	return path, cleanup, nil
}

func (r *Reader) trackedFiles(ctx context.Context, top, ref string) ([]File, error) {
	index, cleanup, err := r.scratchIndex(ctx, top)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	var env []string
	if index != "" {
		env = []string{"GIT_INDEX_FILE=" + index}
	}
	common := []string{"diff", "--no-ext-diff", "--no-textconv", "--no-color", "-M", ref}
	rawOut, err := r.output(ctx, top, env, append(append([]string{}, common...), "--raw", "-z", "--")...)
	if err != nil {
		return nil, err
	}
	patch, err := r.output(ctx, top, env, append(append([]string{}, common...), "--patch", "--")...)
	if err != nil {
		return nil, err
	}
	entries := parseRaw(rawOut)
	blocks := splitBlocks(patch)

	files := make([]File, 0, len(entries))
	next := 0
	for _, e := range entries {
		take := 1
		if e.status == "T" {
			take = 2
		}
		if next+take > len(blocks) {
			return nil, fmt.Errorf("git diff: %d changed files but %d patch blocks", len(entries), len(blocks))
		}
		files = append(files, fileFromBlocks(e, blocks[next:next+take]))
		next += take
	}
	if next != len(blocks) {
		return nil, fmt.Errorf("git diff: %d changed files but %d patch blocks", len(entries), len(blocks))
	}
	return files, nil
}

func fileFromBlocks(e rawEntry, blocks [][]string) File {
	f := File{Path: e.path, OldPath: e.oldPath, Status: statusName(e.status), Hunks: []Hunk{}}
	for _, block := range blocks {
		hunks, binary := parseBlock(block)
		f.Binary = f.Binary || binary
		f.Hunks = append(f.Hunks, hunks...)
	}
	for _, h := range f.Hunks {
		for _, l := range h.Lines {
			switch l.Kind {
			case "add":
				f.Additions++
			case "del":
				f.Deletions++
			}
		}
	}
	return f
}

func statusName(code string) string {
	switch code {
	case "A":
		return "added"
	case "D":
		return "deleted"
	case "R":
		return "renamed"
	default:
		return "modified"
	}
}

func splitBlocks(patch string) [][]string {
	var blocks [][]string
	for _, line := range strings.Split(patch, "\n") {
		if strings.HasPrefix(line, "diff --git ") {
			blocks = append(blocks, nil)
		}
		if len(blocks) > 0 {
			blocks[len(blocks)-1] = append(blocks[len(blocks)-1], line)
		}
	}
	return blocks
}

func cleanText(s string) string {
	return strings.ToValidUTF8(strings.TrimSuffix(s, "\r"), "�")
}

func parseBlock(lines []string) (hunks []Hunk, binary bool) {
	var cur *Hunk
	var oldN, newN int
	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "@@ "):
			h, ok := parseHunkHeader(line)
			if !ok {
				continue
			}
			hunks = append(hunks, h)
			cur = &hunks[len(hunks)-1]
			oldN, newN = h.OldStart, h.NewStart
		case cur == nil:
			if strings.HasPrefix(line, "Binary files ") || strings.HasPrefix(line, "GIT binary patch") {
				binary = true
			}
		case strings.HasPrefix(line, "+"):
			n := newN
			cur.Lines = append(cur.Lines, Line{Kind: "add", New: &n, Text: cleanText(line[1:])})
			newN++
		case strings.HasPrefix(line, "-"):
			o := oldN
			cur.Lines = append(cur.Lines, Line{Kind: "del", Old: &o, Text: cleanText(line[1:])})
			oldN++
		case strings.HasPrefix(line, " "):
			o, n := oldN, newN
			cur.Lines = append(cur.Lines, Line{Kind: "context", Old: &o, New: &n, Text: cleanText(line[1:])})
			oldN++
			newN++
		}
	}
	return hunks, binary
}

func parseHunkHeader(line string) (Hunk, bool) {
	end := strings.Index(line[2:], "@@")
	if end < 0 {
		return Hunk{}, false
	}
	h := Hunk{Header: cleanText(line), Lines: []Line{}}
	spec := strings.TrimSpace(line[2 : 2+end])
	var ok bool
	h.OldStart, h.OldLines, h.NewStart, h.NewLines, ok = parseRanges(spec)
	return h, ok
}

func parseRanges(spec string) (oldStart, oldLines, newStart, newLines int, ok bool) {
	oldPart, newPart, found := strings.Cut(spec, " ")
	if !found || !strings.HasPrefix(oldPart, "-") || !strings.HasPrefix(newPart, "+") {
		return 0, 0, 0, 0, false
	}
	var ok1, ok2 bool
	oldStart, oldLines, ok1 = parseRange(oldPart[1:])
	newStart, newLines, ok2 = parseRange(newPart[1:])
	return oldStart, oldLines, newStart, newLines, ok1 && ok2
}

func parseRange(s string) (start, count int, ok bool) {
	startText, countText, hasCount := strings.Cut(s, ",")
	count = 1
	if _, err := fmt.Sscanf(startText, "%d", &start); err != nil {
		return 0, 0, false
	}
	if hasCount {
		if _, err := fmt.Sscanf(countText, "%d", &count); err != nil {
			return 0, 0, false
		}
	}
	return start, count, true
}
