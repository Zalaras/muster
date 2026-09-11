package locate

import (
	"context"
	"io/fs"
	"path/filepath"
)

// WalkFinder discovers candidates by walking a directory tree, filtering by basename
// and size as it goes (REQ-5's fallback path, used once SpotlightFinder yields nothing
// verified). It skips .git directories, stops at cap entries or when ctx is done —
// Edge Case 11 treats either as "exhausted", never an error — and does not follow
// symlinked directories (filepath.WalkDir's own behaviour).
type WalkFinder struct {
	entryCap int
}

// NewWalkFinder builds a WalkFinder that stops after visiting entryCap directory entries.
func NewWalkFinder(entryCap int) *WalkFinder {
	return &WalkFinder{entryCap: entryCap}
}

// Find walks dir looking for entries named name with the given size. A dir that cannot
// be opened or read at its root is a real error (the session directory is unreadable —
// kb:anchor/sessions.locate's 500 case); an unreadable subdirectory deeper in the tree is
// skipped instead, since one bad subtree should not fail the whole search.
func (w *WalkFinder) Find(ctx context.Context, dir, name string, size int64) ([]string, error) {
	if dir == "" {
		return nil, nil
	}

	var candidates []string
	count := 0

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if path == dir {
				return err
			}
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}

		select {
		case <-ctx.Done():
			return fs.SkipAll
		default:
		}

		count++
		if count > w.entryCap {
			return fs.SkipAll
		}

		if d.IsDir() {
			if d.Name() == ".git" {
				return fs.SkipDir
			}
			return nil
		}

		if d.Name() != name {
			return nil
		}
		// A file that vanishes between listing and Info() is simply not a candidate —
		// not a reason to fail the whole walk.
		if info, infoErr := d.Info(); infoErr == nil && info.Size() == size {
			candidates = append(candidates, path)
		}
		return nil
	})

	return candidates, err
}
