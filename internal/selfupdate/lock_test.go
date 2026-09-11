package selfupdate

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAcquireLock_SecondHolderFailsFastWithErrInProgress covers D12: a non-blocking
// exclusive flock — a second acquirer in the same test process must fail immediately
// with ErrInProgress, never block, while the first holder has not released.
func TestAcquireLock_SecondHolderFailsFastWithErrInProgress(t *testing.T) {
	dir := t.TempDir()

	release, err := AcquireLock(dir)
	require.NoError(t, err)
	t.Cleanup(release)

	_, err2 := AcquireLock(dir)

	assert.ErrorIs(t, err2, ErrInProgress)
}

// TestAcquireLock_ReleasedLockCanBeReacquired covers the release func's contract: once
// the first holder releases, a second AcquireLock call on the same directory succeeds.
func TestAcquireLock_ReleasedLockCanBeReacquired(t *testing.T) {
	dir := t.TempDir()

	release, err := AcquireLock(dir)
	require.NoError(t, err)
	release()

	release2, err := AcquireLock(dir)
	require.NoError(t, err)
	release2()
}

// TestAcquireLock_DifferentDirectoriesDoNotContend covers the lock's scope: it is
// per-directory (the flock target is beside the binary), so two different exe
// directories never see each other's lock.
func TestAcquireLock_DifferentDirectoriesDoNotContend(t *testing.T) {
	dirA, dirB := t.TempDir(), t.TempDir()

	releaseA, err := AcquireLock(dirA)
	require.NoError(t, err)
	t.Cleanup(releaseA)

	releaseB, err := AcquireLock(dirB)
	require.NoError(t, err)
	t.Cleanup(releaseB)
}
