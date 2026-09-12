package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestCheckWebDist_DiskOverridePresent covers the -web-dist-set branch when the
// directory genuinely has a built dashboard: no error, no warning (REQ-2's disk
// override behaves exactly as before this plan). dashboard is an empty fstest.MapFS —
// the disk branch returns before ever consulting it (D7's precedence).
func TestCheckWebDist_DiskOverridePresent(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html>"), 0o644))

	var buf bytes.Buffer
	log := zerolog.New(&buf)

	err := checkWebDist(dir, fstest.MapFS{}, log)

	require.NoError(t, err)
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

	err := checkWebDist(dir, fstest.MapFS{}, log)

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

	err := checkWebDist(missing, fstest.MapFS{}, log)

	require.NoError(t, err)
	assert.Contains(t, buf.String(), "no index.html")
}

// TestCheckWebDist_DiskOverridePrecedenceOverNonEmptyDashboard covers D7/D10's other
// half of the precedence clause: even when the embedded dashboard genuinely has a
// dashboard, an explicit -web-dist still wins (returns before webui.HasDashboard is ever
// consulted) — proven by an embedded fs.FS that actually has an index.html, which would
// make the fatal branch's own predicate report true, yet the disk directory (also empty
// here) is still accepted with only the permissive warning, never the fatal error.
func TestCheckWebDist_DiskOverridePrecedenceOverNonEmptyDashboard(t *testing.T) {
	dir := t.TempDir() // empty: proves the disk branch alone decided the outcome

	var buf bytes.Buffer
	log := zerolog.New(&buf)

	err := checkWebDist(dir, fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}}, log)

	require.NoError(t, err, "D7: -web-dist must take precedence over the embedded dashboard even when one is embedded")
	assert.Contains(t, buf.String(), "no index.html")
}

// TestCheckWebDist_NothingOnDiskNothingEmbeddedIsFatal covers REQ-3/REQ-9's fatal branch
// (D5/D8): webDist unset and an empty embedded fs.FS — a binary built before any
// `make web-build` — refuses to start, naming both remedies. Passing dashboard as a
// parameter (REQ-9) is what makes this deterministically testable: the real webui.FS()
// embed var varies with this checkout's own build state (a fresh clone has only
// .gitkeep; a checkout with a prior `make web-build` does not), which is exactly why
// checkWebDist takes an injected fs.FS instead of calling webui.FS() itself.
func TestCheckWebDist_NothingOnDiskNothingEmbeddedIsFatal(t *testing.T) {
	var buf bytes.Buffer
	log := zerolog.New(&buf)

	err := checkWebDist("", fstest.MapFS{}, log)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "make web-build", "D8: the fatal message must name the make web-build remedy")
	assert.Contains(t, err.Error(), "-web-dist", "D8: the fatal message must name the -web-dist remedy")
}

// TestCheckWebDist_EmbeddedDashboardPresentIsFine covers the non-fatal half of the
// webDist-unset branch: an embedded fs.FS that does have a dashboard starts cleanly, no
// error and no warning (warnings are the disk-override branch's own concern only).
func TestCheckWebDist_EmbeddedDashboardPresentIsFine(t *testing.T) {
	var buf bytes.Buffer
	log := zerolog.New(&buf)

	err := checkWebDist("", fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}}, log)

	require.NoError(t, err)
	assert.Empty(t, buf.String())
}
