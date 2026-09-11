package triage

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// HistoryFile is where a TODO.md entry goes once it is ticked. Entries there still own
// their issues/N link, so it is part of what "already triaged" means — but this package
// only ever reads it.
const HistoryFile = "docs/history/todo-done.md"

// ReadTracked returns TODO.md's text and the text of every tracked entry: TODO.md followed
// by HistoryFile when it exists. Decide "is this issue already filed" against tracked;
// read-modify-write TODO.md through todo. Keeping the two apart is what stops an archived
// issue being re-filed and what keeps the write path a single file.
func ReadTracked(root string) (todo, tracked string, err error) {
	b, err := os.ReadFile(filepath.Join(root, TodoFile))
	if err != nil {
		return "", "", fmt.Errorf("reading %s: %w", TodoFile, err)
	}
	todo = string(b)
	h, herr := os.ReadFile(filepath.Join(root, HistoryFile))
	if errors.Is(herr, fs.ErrNotExist) {
		return todo, todo, nil
	}
	if herr != nil {
		return "", "", fmt.Errorf("reading %s: %w", HistoryFile, herr)
	}
	return todo, todo + "\n" + string(h), nil
}
