package locate

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWalkFinder_FindsMatchingBasenameAndSize(t *testing.T) {
	dir := t.TempDir()
	content := []byte("twelve bytes")
	target := writeFile(t, filepath.Join(dir, "sub", "target.txt"), content)
	// A same-named file elsewhere with a different size must not be returned — the
	// Finder filters by size too, before Locate ever byte-compares.
	writeFile(t, filepath.Join(dir, "other", "target.txt"), []byte("short"))
	// A different name, same size, must not match either.
	writeFile(t, filepath.Join(dir, "decoy.txt"), []byte("wrong name!!"))

	w := NewWalkFinder(DefaultWalkCap)
	got, err := w.Find(context.Background(), dir, "target.txt", int64(len(content)))

	require.NoError(t, err)
	assert.Equal(t, []string{target}, got)
}

func TestWalkFinder_FindsMultipleCandidatesOfTheSameNameAndSize(t *testing.T) {
	dir := t.TempDir()
	content := []byte("duplicated")
	a := writeFile(t, filepath.Join(dir, "a", "dup.txt"), content)
	b := writeFile(t, filepath.Join(dir, "b", "dup.txt"), content)

	w := NewWalkFinder(DefaultWalkCap)
	got, err := w.Find(context.Background(), dir, "dup.txt", int64(len(content)))

	require.NoError(t, err)
	assert.ElementsMatch(t, []string{a, b}, got)
}

func TestWalkFinder_SkipsGitDirectories(t *testing.T) {
	dir := t.TempDir()
	content := []byte("inside dot git")
	writeFile(t, filepath.Join(dir, ".git", "objects", "target.txt"), content)
	realTarget := writeFile(t, filepath.Join(dir, "src", "target.txt"), content)

	w := NewWalkFinder(DefaultWalkCap)
	got, err := w.Find(context.Background(), dir, "target.txt", int64(len(content)))

	require.NoError(t, err)
	assert.Equal(t, []string{realTarget}, got, "the .git copy must never be visited")
}

func TestWalkFinder_StopsAtEntryCapAndReportsNotFoundRatherThanErroring(t *testing.T) {
	dir := t.TempDir()
	content := []byte("cap-test")
	// The matching file is written last (alphabetically after the filler files) so a
	// tiny cap guarantees the walk exhausts before ever reaching it.
	for i := 0; i < 10; i++ {
		writeFile(t, filepath.Join(dir, "filler", string(rune('a'+i))+".txt"), []byte("filler"))
	}
	writeFile(t, filepath.Join(dir, "zzz-target.txt"), content)

	w := NewWalkFinder(2) // far fewer than the 10 filler files + target
	got, err := w.Find(context.Background(), dir, "zzz-target.txt", int64(len(content)))

	require.NoError(t, err, "hitting the cap must never surface as an error (Edge Case 11)")
	assert.Empty(t, got)
}

func TestWalkFinder_RespectsContextCancellationWithoutErroring(t *testing.T) {
	dir := t.TempDir()
	content := []byte("cancel-test")
	for i := 0; i < 10; i++ {
		writeFile(t, filepath.Join(dir, "filler", string(rune('a'+i))+".txt"), []byte("filler"))
	}
	writeFile(t, filepath.Join(dir, "zzz-target.txt"), content)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already done before Find is ever called

	w := NewWalkFinder(DefaultWalkCap)
	got, err := w.Find(ctx, dir, "zzz-target.txt", int64(len(content)))

	require.NoError(t, err)
	assert.Empty(t, got, "a cancelled context must stop the walk before it finds anything")
}

func TestWalkFinder_EmptyDirYieldsNoCandidatesNoError(t *testing.T) {
	w := NewWalkFinder(DefaultWalkCap)
	got, err := w.Find(context.Background(), "", "anything.txt", 10)

	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestWalkFinder_UnreadableRootIsARealError(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permission bits")
	}
	dir := t.TempDir()
	locked := filepath.Join(dir, "locked")
	require.NoError(t, os.Mkdir(locked, 0o755))
	require.NoError(t, os.Chmod(locked, 0o000))
	t.Cleanup(func() { _ = os.Chmod(locked, 0o755) }) // let TempDir cleanup remove it

	w := NewWalkFinder(DefaultWalkCap)
	_, err := w.Find(context.Background(), locked, "anything.txt", 10)

	assert.Error(t, err, "an unreadable walk root is a real error (protocol.md 500 case), not a silent miss")
}

func TestWalkFinder_UnreadableSubdirectoryIsSkippedNotFatal(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permission bits")
	}
	dir := t.TempDir()
	content := []byte("still findable")
	locked := filepath.Join(dir, "locked")
	require.NoError(t, os.Mkdir(locked, 0o755))
	writeFile(t, filepath.Join(locked, "target.txt"), []byte("unreachable"))
	require.NoError(t, os.Chmod(locked, 0o000))
	t.Cleanup(func() { _ = os.Chmod(locked, 0o755) })
	target := writeFile(t, filepath.Join(dir, "open", "target.txt"), content)

	w := NewWalkFinder(DefaultWalkCap)
	got, err := w.Find(context.Background(), dir, "target.txt", int64(len(content)))

	require.NoError(t, err, "one unreadable subtree must not fail the whole walk")
	assert.Equal(t, []string{target}, got)
}
