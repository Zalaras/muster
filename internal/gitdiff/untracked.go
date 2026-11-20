package gitdiff

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (r *Reader) untrackedFiles(ctx context.Context, top string) ([]File, error) {
	paths, err := r.git.ListUntracked(ctx, top)
	if err != nil {
		return nil, fmt.Errorf("git ls-files: %w", err)
	}
	return addedFiles(top, paths), nil
}

func (r *Reader) allFilesAdded(ctx context.Context, top string) ([]File, error) {
	paths, err := r.git.ListFiles(ctx, top)
	if err != nil {
		return nil, fmt.Errorf("git ls-files: %w", err)
	}
	return addedFiles(top, paths), nil
}

func addedFiles(top string, paths []string) []File {
	var files []File
	seen := map[string]bool{}
	for _, p := range paths {
		if seen[p] || strings.HasSuffix(p, "/") {
			continue
		}
		seen[p] = true
		if f, ok := addedFile(top, p); ok {
			files = append(files, f)
		}
	}
	return files
}

func addedFile(top, rel string) (File, bool) {
	f := File{Path: filepath.ToSlash(rel), Status: "added", Hunks: []Hunk{}}
	abs := filepath.Join(top, rel)
	info, err := os.Lstat(abs)
	if err != nil {
		return File{}, false
	}
	var content []byte
	switch {
	case info.Mode()&os.ModeSymlink != 0:
		target, linkErr := os.Readlink(abs)
		if linkErr != nil {
			return File{}, false
		}
		content = []byte(target)
	case info.Mode().IsRegular():
		if info.Size() > maxUntrackedBytes {
			f.Binary = true
			return f, true
		}
		content, err = os.ReadFile(abs)
		if err != nil {
			return File{}, false
		}
	default:
		return File{}, false
	}
	if bytes.IndexByte(content, 0) >= 0 {
		f.Binary = true
		return f, true
	}
	if len(content) == 0 {
		return f, true
	}
	text := strings.TrimSuffix(string(content), "\n")
	rows := strings.Split(text, "\n")
	h := Hunk{Header: fmt.Sprintf(untrackedHunkStart, len(rows)), NewStart: 1, NewLines: len(rows), Lines: make([]Line, 0, len(rows))}
	for i, row := range rows {
		n := i + 1
		h.Lines = append(h.Lines, Line{Kind: "add", New: &n, Text: cleanText(row)})
	}
	f.Hunks = []Hunk{h}
	f.Additions = len(rows)
	return f, true
}
