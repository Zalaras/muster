package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/webui"
)

// checkWebDist validates the -web-dist / embedded-dashboard serving precedence at startup
// (kb:adr/connection-dashboard-embedded-in-binary). An on-disk override (-web-dist set) is
// a permissive dev override: a directory missing index.html only logs a warning and
// startup proceeds — cmd/musterd/onexit_test.go:125 depends on an empty -web-dist dir
// being accepted, and this is deliberate: serve whatever is there. Falling through to the
// embedded dashboard (-web-dist unset) with nothing actually embedded — a binary built
// before any `make web-build` — is fatal: it replaces the old silent 404-everything
// failure with an actionable error naming both remedies, before the daemon ever starts
// listening (kb:adr/connection-missing-web-build-fails-fast).
//
// dashboard is the embedded dashboard fs.FS: run passes the real webui.FS(), and taking it
// as a parameter rather than calling webui.FS() directly makes the "nothing on disk,
// nothing embedded" fatal branch deterministically testable with a fake, empty fs.FS
// instead of depending on this binary's own build having embedded a dashboard.
func checkWebDist(webDist string, dashboard fs.FS, log zerolog.Logger) error {
	if webDist != "" {
		if _, err := os.Stat(filepath.Join(webDist, "index.html")); err != nil {
			log.Warn().Str("web_dist", webDist).
				Msg("-web-dist directory has no index.html; serving whatever is there")
		}
		return nil
	}
	if !webui.HasDashboard(dashboard) {
		return fmt.Errorf("no dashboard embedded in this binary: run `make web-build` before building musterd, or pass -web-dist pointing at a built dashboard directory")
	}
	return nil
}
