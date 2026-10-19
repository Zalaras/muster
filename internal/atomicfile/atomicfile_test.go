package atomicfile

import (
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// readOnlyDir makes dir refuse new files for the rest of the test, skipping when the
// user (root) is not bound by directory permissions.
func readOnlyDir(t *testing.T, dir string) {
	t.Helper()
	require.NoError(t, os.Chmod(dir, 0o500))
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) })
	if f, err := os.Create(filepath.Join(dir, "probe")); err == nil {
		_ = f.Close()
		t.Skip("directory permissions are not enforced for this user")
	}
}

func dirNames(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names
}

func TestWrite_ReplacesByRenameAndFdKeepsReadingOldContent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "target")
	oldContent := []byte("old content\n")
	newContent := []byte("new content\n")
	require.NoError(t, Write(path, oldContent, 0o600))

	fd, err := os.Open(path)
	require.NoError(t, err)
	defer fd.Close()

	require.NoError(t, Write(path, newContent, 0o600))

	stale, err := io.ReadAll(fd)
	require.NoError(t, err)
	assert.Equal(t, oldContent, stale, "an fd opened before the rewrite must still read the complete old content")

	fresh, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, newContent, fresh, "a fresh open after the rewrite must read the complete new content")

	assert.Equal(t, []string{"target"}, dirNames(t, dir), "no temp file may remain after a successful rewrite")
}

func TestWrite_UnchangedContentLeavesInodeAndMtimeUntouched(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "target")
	content := []byte("same content\n")
	require.NoError(t, Write(path, content, 0o600))

	before, err := os.Stat(path)
	require.NoError(t, err)
	// A rewrite would show as a changed ModTime only if the clock moved on.
	time.Sleep(10 * time.Millisecond)

	require.NoError(t, Write(path, content, 0o600))

	after, err := os.Stat(path)
	require.NoError(t, err)
	assert.True(t, os.SameFile(before, after), "the same inode: no rename happened")
	assert.Equal(t, before.ModTime(), after.ModTime(), "the same mtime: no write happened")
	assert.Equal(t, []string{"target"}, dirNames(t, dir), "no temp file may be created for an unchanged rewrite")
}

func TestWrite_FreshPathIsWrittenAtTheGivenMode(t *testing.T) {
	tests := []struct {
		name string
		perm os.FileMode
	}{
		{"executable", 0o755},
		{"owner only", 0o600},
		{"owner executable", 0o700},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "target")
			content := []byte("fresh content\n")

			require.NoError(t, Write(path, content, tt.perm))

			got, err := os.ReadFile(path)
			require.NoError(t, err)
			assert.Equal(t, content, got)
			info, err := os.Stat(path)
			require.NoError(t, err)
			assert.Equal(t, tt.perm, info.Mode().Perm(), "the mode is the one asked for, whatever the umask")
		})
	}
}

func TestWrite_ChangedContentTakesTheGivenModeOverTheOldOne(t *testing.T) {
	path := filepath.Join(t.TempDir(), "target")
	require.NoError(t, Write(path, []byte("old"), 0o600))

	require.NoError(t, Write(path, []byte("new"), 0o755))

	info, err := os.Stat(path)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o755), info.Mode().Perm())
}

func TestWrite_FailureLeavesNoTempFile(t *testing.T) {
	tests := []struct {
		name    string
		arrange func(t *testing.T, dir string) string
	}{
		{"target is a directory", func(t *testing.T, dir string) string {
			path := filepath.Join(dir, "target")
			require.NoError(t, os.MkdirAll(filepath.Join(path, "occupant"), 0o755))
			return path
		}},
		{"directory refuses a new file", func(t *testing.T, dir string) string {
			path := filepath.Join(dir, "target")
			require.NoError(t, os.WriteFile(path, []byte("old"), 0o600))
			readOnlyDir(t, dir)
			return path
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			path := tt.arrange(t, dir)

			err := Write(path, []byte("new"), 0o755)

			require.Error(t, err)
			assert.Equal(t, []string{"target"}, dirNames(t, dir), "only the pre-existing target may be in the directory")
		})
	}
}

func TestWrite_FailedWriteLeavesTheOldContentIntact(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "target")
	require.NoError(t, os.WriteFile(path, []byte("old"), 0o600))
	readOnlyDir(t, dir)

	require.Error(t, Write(path, []byte("new"), 0o600))

	got, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, []byte("old"), got)
}
