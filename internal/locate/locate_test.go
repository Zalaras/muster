package locate

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubFinder is a Finder whose Find is entirely scripted, so Locator.Locate's own
// fallback/short-circuit logic (REQ-5) can be tested independently of any real
// discovery mechanism (Spotlight, the walk).
type stubFinder struct {
	candidates []string
	err        error
	called     bool
}

func (f *stubFinder) Find(_ context.Context, _, _ string, _ int64) ([]string, error) {
	f.called = true
	return f.candidates, f.err
}

// writeFile writes content to path (creating parent dirs), returning path for chaining.
func writeFile(t *testing.T, path string, content []byte) string {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, content, 0o644))
	return path
}

// dirSnapshot lists every file under root with its size, for INV-2 before/after
// comparisons ("no locate request creates or modifies any file").
func dirSnapshot(t *testing.T, root string) map[string]int64 {
	t.Helper()
	snap := map[string]int64{}
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		info, infoErr := d.Info()
		require.NoError(t, infoErr)
		rel, relErr := filepath.Rel(root, path)
		require.NoError(t, relErr)
		snap[rel] = info.Size()
		return nil
	})
	require.NoError(t, err)
	return snap
}

func TestLocate_ReturnsPathForSingleVerifiedCandidate(t *testing.T) {
	dir := t.TempDir()
	upload := []byte("unique bytes for D4")
	path := writeFile(t, filepath.Join(dir, "found.txt"), upload)

	loc := &Locator{finders: []Finder{&stubFinder{candidates: []string{path}}}}

	got, err := loc.Locate(context.Background(), dir, "found.txt", upload)

	require.NoError(t, err)
	resolved, err := filepath.EvalSymlinks(path)
	require.NoError(t, err)
	assert.Equal(t, resolved, got)
}

func TestLocate_ReturnsNotLocatedWhenSameNameSizeDifferentBytes(t *testing.T) {
	dir := t.TempDir()
	upload := []byte("AAAAAAAAAA")
	onDisk := []byte("BBBBBBBBBB") // same length, different content
	require.Len(t, onDisk, len(upload))
	path := writeFile(t, filepath.Join(dir, "same-size.txt"), onDisk)

	loc := &Locator{finders: []Finder{&stubFinder{candidates: []string{path}}}}

	_, err := loc.Locate(context.Background(), dir, "same-size.txt", upload)

	assert.ErrorIs(t, err, ErrNotLocated)
}

func TestLocate_ReturnsAmbiguousWithSortedPaths(t *testing.T) {
	dir := t.TempDir()
	upload := []byte("duplicated across two subdirs")
	pathB := writeFile(t, filepath.Join(dir, "zzz", "dup.txt"), upload)
	pathA := writeFile(t, filepath.Join(dir, "aaa", "dup.txt"), upload)

	loc := &Locator{finders: []Finder{&stubFinder{candidates: []string{pathB, pathA}}}}

	_, err := loc.Locate(context.Background(), dir, "dup.txt", upload)

	var ambiguous *ErrAmbiguous
	require.ErrorAs(t, err, &ambiguous)
	require.Len(t, ambiguous.Paths, 2)
	assert.True(t, sort.StringsAreSorted(ambiguous.Paths), "paths must be sorted: %v", ambiguous.Paths)

	resolvedA, err := filepath.EvalSymlinks(pathA)
	require.NoError(t, err)
	resolvedB, err := filepath.EvalSymlinks(pathB)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{resolvedA, resolvedB}, ambiguous.Paths)
}

func TestLocate_DedupesSameFileReachedViaSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need elevated privileges on windows")
	}
	dir := t.TempDir()
	upload := []byte("one real file, two paths")
	realPath := writeFile(t, filepath.Join(dir, "real", "one.txt"), upload)

	linkDir := filepath.Join(dir, "linked")
	require.NoError(t, os.Symlink(filepath.Join(dir, "real"), linkDir))
	viaLink := filepath.Join(linkDir, "one.txt")

	// Sanity: the symlink really resolves to the same file before asserting dedup.
	_, err := os.Stat(viaLink)
	require.NoError(t, err)

	loc := &Locator{finders: []Finder{&stubFinder{candidates: []string{realPath, viaLink}}}}

	got, err := loc.Locate(context.Background(), dir, "one.txt", upload)

	require.NoError(t, err, "two paths to the same file must count once, not be ambiguous")
	resolved, err := filepath.EvalSymlinks(realPath)
	require.NoError(t, err)
	assert.Equal(t, resolved, got)
}

func TestLocate_FallsThroughToNextFinderWhenFirstYieldsNoVerifiedCandidate(t *testing.T) {
	dir := t.TempDir()
	upload := []byte("second finder has the real one")
	path := writeFile(t, filepath.Join(dir, "second.txt"), upload)

	first := &stubFinder{candidates: nil} // e.g. Spotlight: nothing verified
	second := &stubFinder{candidates: []string{path}}
	loc := &Locator{finders: []Finder{first, second}}

	got, err := loc.Locate(context.Background(), dir, "second.txt", upload)

	require.NoError(t, err)
	assert.True(t, first.called)
	assert.True(t, second.called)
	resolved, err := filepath.EvalSymlinks(path)
	require.NoError(t, err)
	assert.Equal(t, resolved, got)
}

func TestLocate_FallsThroughWhenFirstFinderCandidateFailsByteCompare(t *testing.T) {
	// A finder can return a raw candidate that turns out not to verify (different
	// bytes); REQ-5 still lets a later finder have a turn — "verified" is what
	// matters, not merely "found by the first finder".
	dir := t.TempDir()
	upload := []byte("the true contents")
	decoy := writeFile(t, filepath.Join(dir, "decoy.txt"), []byte("wrong contentsXX"))
	right := writeFile(t, filepath.Join(dir, "real.txt"), upload)

	first := &stubFinder{candidates: []string{decoy}}
	second := &stubFinder{candidates: []string{right}}
	loc := &Locator{finders: []Finder{first, second}}

	got, err := loc.Locate(context.Background(), dir, "real.txt", upload)

	require.NoError(t, err)
	resolved, err := filepath.EvalSymlinks(right)
	require.NoError(t, err)
	assert.Equal(t, resolved, got)
}

func TestLocate_StopsAtFirstFinderThatYieldsAnyVerifiedCandidateEvenIfAmbiguous(t *testing.T) {
	dir := t.TempDir()
	upload := []byte("ambiguous in finder one")
	pathA := writeFile(t, filepath.Join(dir, "a", "dup.txt"), upload)
	pathB := writeFile(t, filepath.Join(dir, "b", "dup.txt"), upload)
	// A file that would also match, but must never be consulted because finder one
	// already produced a (ambiguous) verified result.
	elsewhere := writeFile(t, filepath.Join(dir, "c", "dup.txt"), upload)

	first := &stubFinder{candidates: []string{pathA, pathB}}
	second := &stubFinder{candidates: []string{elsewhere}}
	loc := &Locator{finders: []Finder{first, second}}

	_, err := loc.Locate(context.Background(), dir, "dup.txt", upload)

	var ambiguous *ErrAmbiguous
	require.ErrorAs(t, err, &ambiguous)
	assert.Len(t, ambiguous.Paths, 2, "the second finder's candidate must not be consulted once the first is ambiguous")
	assert.True(t, first.called)
	assert.False(t, second.called)
}

func TestLocate_ReturnsNotLocatedWhenNoFinderYieldsAnything(t *testing.T) {
	dir := t.TempDir()
	loc := &Locator{finders: []Finder{&stubFinder{}, &stubFinder{}}}

	_, err := loc.Locate(context.Background(), dir, "absent.txt", []byte("bytes"))

	assert.ErrorIs(t, err, ErrNotLocated)
}

func TestLocate_WrapsAndReturnsARealFinderError(t *testing.T) {
	dir := t.TempDir()
	boom := errors.New("boom: directory unreadable")
	loc := &Locator{finders: []Finder{&stubFinder{err: boom}}}

	_, err := loc.Locate(context.Background(), dir, "x.txt", []byte("y"))

	require.Error(t, err)
	assert.ErrorIs(t, err, boom)
	assert.NotErrorIs(t, err, ErrNotLocated)
}

func TestLocate_VerifyCandidatesDropsVanishedCandidateInsteadOfErroring(t *testing.T) {
	dir := t.TempDir()
	upload := []byte("will vanish")
	ghost := filepath.Join(dir, "ghost.txt") // never actually written

	loc := &Locator{finders: []Finder{&stubFinder{candidates: []string{ghost}}}}

	_, err := loc.Locate(context.Background(), dir, "ghost.txt", upload)

	assert.ErrorIs(t, err, ErrNotLocated, "an unreadable candidate must be dropped, not treated as a match or an error")
}

// TestLocate_NeverWritesToDisk is INV-2's Locate-level pin: every outcome above must
// leave the walk root byte-for-byte as it was. Re-runs the outcome matrix and snapshots
// the directory before/after each.
func TestLocate_NeverWritesToDisk(t *testing.T) {
	upload := []byte("inv-2 fingerprint bytes")

	cases := []struct {
		name  string
		setup func(dir string) []string // returns candidate paths to hand the stub finder
	}{
		{
			name: "found",
			setup: func(dir string) []string {
				return []string{writeFile(t, filepath.Join(dir, "found.bin"), upload)}
			},
		},
		{
			name: "not located (bytes differ)",
			setup: func(dir string) []string {
				return []string{writeFile(t, filepath.Join(dir, "differs.bin"), []byte("XXXXXXXXXXXXXXXXXXXXXXXX"[:len(upload)]))}
			},
		},
		{
			name: "ambiguous",
			setup: func(dir string) []string {
				return []string{
					writeFile(t, filepath.Join(dir, "a", "dup.bin"), upload),
					writeFile(t, filepath.Join(dir, "b", "dup.bin"), upload),
				}
			},
		},
		{
			name: "absent",
			setup: func(_ string) []string {
				return nil
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			candidates := tc.setup(dir)
			before := dirSnapshot(t, dir)

			loc := &Locator{finders: []Finder{&stubFinder{candidates: candidates}}}
			_, _ = loc.Locate(context.Background(), dir, "irrelevant-name", upload)

			after := dirSnapshot(t, dir)
			assert.Equal(t, before, after, "Locate must never create, modify or remove a file under the walk root")
		})
	}
}
