package webui

import (
	"io/fs"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHasDashboard covers the fail-fast predicate (plan embed-dashboard REQ-3/D5/R2)
// against injected fstest.MapFS trees — the real go:embed-ed FS always contains
// index.html once any `make web-build` has run, so it can never exercise the "missing"
// branch itself (Implementation Notes); this is the substitute the plan calls for.
func TestHasDashboard(t *testing.T) {
	tests := []struct {
		name string
		fsys fs.FS
		want bool
	}{
		{
			name: "empty tree has no dashboard",
			fsys: fstest.MapFS{},
			want: false,
		},
		{
			name: "tree with only unrelated files has no dashboard",
			fsys: fstest.MapFS{
				"assets/app.js": {Data: []byte("console.log('hi')")},
				".gitkeep":      {Data: []byte("")},
			},
			want: false,
		},
		{
			name: "tree with index.html at its root has a dashboard",
			fsys: fstest.MapFS{
				"index.html": {Data: []byte("<!doctype html>")},
			},
			want: true,
		},
		{
			name: "index.html alongside other real build output still counts",
			fsys: fstest.MapFS{
				"index.html":           {Data: []byte("<!doctype html>")},
				"assets/index-abc.js":  {Data: []byte("//js")},
				"assets/index-abc.css": {Data: []byte("/*css*/")},
				".gitkeep":             {Data: []byte("")},
			},
			want: true,
		},
		{
			name: "index.html nested under a subdirectory does not count",
			fsys: fstest.MapFS{
				"assets/index.html": {Data: []byte("<!doctype html>")},
			},
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, HasDashboard(tt.fsys))
		})
	}
}

// TestFS_RootedAtAssets covers REQ-1: FS() must expose the embedded tree rooted at
// assets/ (so callers see index.html, not assets/index.html) — asserted against the
// always-committed .gitkeep (REQ-4), which is present regardless of whether a web build
// has run in this checkout, so this test never depends on build state.
func TestFS_RootedAtAssets(t *testing.T) {
	sub := FS()

	_, err := fs.Stat(sub, ".gitkeep")
	require.NoError(t, err, "FS() must be rooted at assets/ so .gitkeep is visible at its root")

	_, err = fs.Stat(sub, "assets/.gitkeep")
	assert.Error(t, err, "FS() must not still expose the assets/ prefix itself")
}

// TestFS_DoesNotPanic pins that FS() is safe to call repeatedly and returns a usable
// fs.FS — a regression guard for the fs.Sub call the package's doc comment says "cannot
// fail in practice" (Implementation Notes); if that ever became false this would panic
// the whole test binary rather than fail one assertion, which is the point.
func TestFS_DoesNotPanic(t *testing.T) {
	assert.NotPanics(t, func() {
		_ = FS()
		_ = FS()
	})
}
