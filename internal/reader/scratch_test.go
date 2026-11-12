package reader

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeAt(t *testing.T, path string, mod time.Time) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, []byte("x"), 0o644))
	require.NoError(t, os.Chtimes(path, mod, mod))
}

func TestListScratch(t *testing.T) {
	base := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	dir := t.TempDir()
	writeAt(t, filepath.Join(dir, "old.md"), base)
	writeAt(t, filepath.Join(dir, "new.MD"), base.Add(2*time.Hour))
	writeAt(t, filepath.Join(dir, "sub", "deep", "mid.md"), base.Add(time.Hour))
	writeAt(t, filepath.Join(dir, "b-tie.md"), base.Add(time.Hour))
	writeAt(t, filepath.Join(dir, "a-tie.md"), base.Add(time.Hour))
	writeAt(t, filepath.Join(dir, "data.json"), base)
	writeAt(t, filepath.Join(dir, ".hidden", "h.md"), base)

	got := ListScratch(dir)

	var paths []string
	for _, f := range got {
		paths = append(paths, f.Path)
	}
	assert.Equal(t, []string{"new.MD", "a-tie.md", "b-tie.md", "sub/deep/mid.md", "old.md"}, paths,
		"newest first, ties by path, nested slash-separated, non-md and dot-dirs skipped")
	assert.True(t, got[0].ModifiedAt.Equal(base.Add(2*time.Hour)))
	assert.Equal(t, time.UTC, got[0].ModifiedAt.Location())
}

func TestListScratch_MissingOrEmptyDirYieldsNone(t *testing.T) {
	assert.Empty(t, ListScratch(filepath.Join(t.TempDir(), "gone")))
	assert.Empty(t, ListScratch(t.TempDir()))
}

func TestScopeScratchDir_Confine(t *testing.T) {
	dir := t.TempDir()
	root := t.TempDir()
	scratch := filepath.Join(root, "sid", "scratchpad")
	now := time.Now()
	writeAt(t, filepath.Join(scratch, "a.md"), now)
	writeAt(t, filepath.Join(scratch, "n", "b.md"), now)
	writeAt(t, filepath.Join(scratch, "c.txt"), now)
	otherSession := filepath.Join(root, "other", "scratchpad", "x.md")
	writeAt(t, otherSession, now)
	sibling := filepath.Join(root, "sid", "tasks", "t.md")
	writeAt(t, sibling, now)
	outside := filepath.Join(t.TempDir(), "secret.md")
	writeAt(t, outside, now)
	require.NoError(t, os.Symlink(outside, filepath.Join(scratch, "link.md")))
	require.NoError(t, os.Symlink(filepath.Dir(outside), filepath.Join(scratch, "linkdir")))

	tests := []struct {
		name      string
		scratch   string
		requested string
		wantOK    bool
	}{
		{"file in scratch", scratch, filepath.Join(scratch, "a.md"), true},
		{"nested file in scratch", scratch, filepath.Join(scratch, "n", "b.md"), true},
		{"non-md in scratch", scratch, filepath.Join(scratch, "c.txt"), false},
		{"another session's scratch", scratch, otherSession, false},
		{"the tasks sibling", scratch, sibling, false},
		{"dot-dot out of scratch", scratch, filepath.Join(scratch, "..", "tasks", "t.md"), false},
		{"symlink out of scratch", scratch, filepath.Join(scratch, "link.md"), false},
		{"symlinked dir out of scratch", scratch, filepath.Join(scratch, "linkdir", "secret.md"), false},
		{"no scratch configured", "", filepath.Join(scratch, "a.md"), false},
		{"scratch folder missing", filepath.Join(t.TempDir(), "gone"), filepath.Join(scratch, "a.md"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, ok := Scope{Dir: dir, ScratchDir: tt.scratch}.Confine(tt.requested)
			assert.Equal(t, tt.wantOK, ok)
		})
	}
}

func TestScopeScratchDir_PathQualifies(t *testing.T) {
	const dir = "/tmp/proj"
	const scratch = "/private/tmp/c/sid/scratchpad"
	tests := []struct {
		name    string
		scratch string
		path    string
		want    bool
	}{
		{"md in scratch", scratch, scratch + "/a.md", true},
		{"nested md, upper-case ext", scratch, scratch + "/n/a.MD", true},
		{"non-md in scratch", scratch, scratch + "/a.json", false},
		{"scratch dir itself", scratch, scratch, false},
		{"sibling prefix directory", scratch, scratch + "-2/a.md", false},
		{"dot-dot escape", scratch, scratch + "/../tasks/a.md", false},
		{"tasks sibling", scratch, "/private/tmp/c/sid/tasks/a.md", false},
		{"no scratch configured", "", scratch + "/a.md", false},
		{"session directory still qualifies", scratch, dir + "/TODO.md", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, Scope{Dir: dir, ScratchDir: tt.scratch}.PathQualifies(tt.path))
		})
	}
}
