// Package webui embeds the built dashboard (web/vite.config.ts's outDir) into the
// musterd binary, so a copy of the binary moved away from the checkout still serves its
// own frontend (plan embed-dashboard REQ-1). internal/server picks between this embedded
// tree and an on-disk override (-web-dist) at startup; this package only exposes the
// embedded tree and a predicate for "does this FS actually contain a built dashboard".
//
// The `all:assets` pattern (rather than plain `assets`) is required: without the `all:`
// prefix, the embed directive silently drops dotfiles, and assets/.gitkeep — committed
// so a fresh clone's embed pattern always resolves before any `npm run build` has run
// (REQ-4) — would vanish from the embedded tree along with every real dotfile a future
// build might add.
package webui

import (
	"embed"
	"fmt"
	"io/fs"
)

//go:embed all:assets
var embedded embed.FS

// FS returns the embedded dashboard tree rooted at assets/ (so callers see index.html,
// not assets/index.html). Panics only if the embed declaration itself is malformed,
// which a successful build already rules out — fs.Sub on a directory go:embed proved
// exists cannot fail in practice (plan Implementation Notes).
func FS() fs.FS {
	sub, err := fs.Sub(embedded, "assets")
	if err != nil {
		panic(fmt.Errorf("webui: subbing embedded assets: %w", err))
	}
	return sub
}

// HasDashboard reports whether fsys contains a built dashboard (an index.html at its
// root). Factored to take an fs.FS rather than calling FS() itself so the fail-fast
// startup check (REQ-3) is unit-testable against an injected fstest.MapFS — a real
// post-web-build embed always contains index.html, so that branch is otherwise
// unreachable from a normally compiled binary.
func HasDashboard(fsys fs.FS) bool {
	_, err := fs.Stat(fsys, "index.html")
	return err == nil
}
