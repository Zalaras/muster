package atomicfile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/sys/unix"
)

// An immutable target is the one way to make the final rename fail after the temp file
// has been written, synced and closed, which is the step whose cleanup the defer owns.
func TestWrite_FailedRenameLeavesNoTempFileAndTheOldContent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "target")
	require.NoError(t, os.WriteFile(path, []byte("old"), 0o600))
	if err := unix.Chflags(path, unix.UF_IMMUTABLE); err != nil {
		t.Skipf("cannot mark the target immutable: %v", err)
	}
	t.Cleanup(func() { _ = unix.Chflags(path, 0) })

	err := Write(path, []byte("new"), 0o600)

	require.Error(t, err)
	require.ErrorContains(t, err, "renaming")
	assert.Equal(t, []string{"target"}, dirNames(t, dir), "no temp file may be left behind")
	got, readErr := os.ReadFile(path)
	require.NoError(t, readErr)
	assert.Equal(t, []byte("old"), got)
}
