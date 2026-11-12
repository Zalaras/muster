package reader

import (
	"os"
	"path/filepath"
	"sort"
	"time"
)

type ScratchFile struct {
	Path       string
	ModifiedAt time.Time
}

func ListScratch(dir string) []ScratchFile {
	paths, _, _ := WalkMarkdown(dir)
	files := make([]ScratchFile, 0, len(paths))
	for _, rel := range paths {
		info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(rel)))
		if err != nil || info.IsDir() {
			continue
		}
		files = append(files, ScratchFile{Path: rel, ModifiedAt: info.ModTime().UTC()})
	}
	sort.Slice(files, func(i, j int) bool {
		if !files[i].ModifiedAt.Equal(files[j].ModifiedAt) {
			return files[i].ModifiedAt.After(files[j].ModifiedAt)
		}
		return files[i].Path < files[j].Path
	})
	return files
}
