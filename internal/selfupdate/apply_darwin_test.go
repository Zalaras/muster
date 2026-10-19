package selfupdate

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/sys/unix"
)

// TestInstallBinary_FailedRenameLeavesNoTempFile reaches a failure after installBinary's
// temp file has been written: an immutable binary lets the temp be created, written and
// closed but refuses the final rename over it. Only the binary, with its old content,
// may remain in the directory.
func TestInstallBinary_FailedRenameLeavesNoTempFile(t *testing.T) {
	dir := t.TempDir()
	exePath := filepath.Join(dir, "musterd")
	before := []byte("original untouched content")
	require.NoError(t, os.WriteFile(exePath, before, 0o755))
	if err := unix.Chflags(exePath, unix.UF_IMMUTABLE); err != nil {
		t.Skipf("cannot mark the binary immutable: %v", err)
	}
	t.Cleanup(func() { _ = unix.Chflags(exePath, 0) })

	err := applyNewBinary(t, exePath)

	require.Error(t, err)
	require.ErrorContains(t, err, "renaming", "the failure must be the final rename, after the temp was written")
	entries, readErr := os.ReadDir(dir)
	require.NoError(t, readErr)
	require.Len(t, entries, 1, "no leftover temp file beside the binary")
	assert.Equal(t, "musterd", entries[0].Name())
	got, readErr := os.ReadFile(exePath)
	require.NoError(t, readErr)
	assert.Equal(t, before, got)
}
