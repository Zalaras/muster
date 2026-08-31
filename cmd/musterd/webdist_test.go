package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestCheckWebDist_DiskOverridePresent covers the -web-dist-set branch when the
// directory genuinely has a built dashboard: no error, no warning (REQ-2's disk
// override behaves exactly as before this plan).
func TestCheckWebDist_DiskOverridePresent(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html>"), 0o644))

	var buf bytes.Buffer
	log := zerolog.New(&buf)

	err := checkWebDist(dir, log)

	assert.NoError(t, err)
	assert.Empty(t, buf.String(), "a present index.html must not log any warning")
}

// TestCheckWebDist_DiskOverrideEmptyDirWarnsButDoesNotFail covers REQ-9/D6: an explicit
// -web-dist pointing at a directory with no index.html is permissive — startup succeeds
// (cmd/musterd/onexit_test.go:125 relies on exactly this with a bare t.TempDir()) but a
// warning is logged naming the directory, since this is a dev override, not the
// fail-fast path.
func TestCheckWebDist_DiskOverrideEmptyDirWarnsButDoesNotFail(t *testing.T) {
	dir := t.TempDir() // genuinely empty, no index.html

	var buf bytes.Buffer
	log := zerolog.New(&buf)

	err := checkWebDist(dir, log)

	require.NoError(t, err, "an empty -web-dist directory must not fail startup (permissive dev override)")
	out := buf.String()
	assert.Contains(t, out, "no index.html", "must warn that the directory has no index.html")
	assert.Contains(t, out, dir, "the warning must name the offending directory")
}

// TestCheckWebDist_DiskOverridePointsAtMissingDirectoryWarnsButDoesNotFail covers the
// same permissive path when the directory doesn't exist at all (os.Stat fails the same
// way as an existing-but-empty directory) — still a warning, still not fatal.
func TestCheckWebDist_DiskOverridePointsAtMissingDirectoryWarnsButDoesNotFail(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "does-not-exist")

	var buf bytes.Buffer
	log := zerolog.New(&buf)

	err := checkWebDist(missing, log)

	require.NoError(t, err)
	assert.Contains(t, buf.String(), "no index.html")
}

// The fatal branch of checkWebDist (webDist unset, nothing embedded — REQ-3/D5) is
// deliberately NOT exercised here: checkWebDist calls webui.HasDashboard(webui.FS())
// directly rather than taking an injected fs.FS, and webui.FS() is backed by a
// package-level //go:embed var fixed at compile time to whatever is on disk under
// internal/webui/assets/ when this test binary was built. `make test` has no
// web-build prerequisite (Makefile), so that directory's contents — and therefore
// checkWebDist("", ...)'s outcome — vary with build state across machines/CI in a way
// a unit test must not depend on (a fresh clone has only .gitkeep and would report the
// fatal error; this checkout currently has a real prior web build and would not).
// This is exactly the limitation the plan's Implementation Notes name explicitly ("the
// real embed var can't exercise this branch after a web build") and the reason
// webui.HasDashboard was factored to take a caller-supplied fs.FS in the first place —
// see internal/webui/webui_test.go's TestHasDashboard, which covers the branch
// condition itself (empty tree -> false, tree with index.html -> true) exhaustively
// against injected fstest.MapFS trees. The fatal message's wording (both remedies named)
// was confirmed by reading cmd/musterd/main.go's checkWebDist directly; it is otherwise
// the plan's R2 reviewer-verified item.
