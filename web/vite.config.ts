import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// The dashboard is served by musterd in production; this dev server exists so the
// frontend can be iterated without rebuilding the daemon.
//
// The daemon embeds the build output via //go:embed, so outDir points at
// internal/webui/assets. emptyOutDir is explicit because outDir sits outside Vite's root
// (web/) and Vite otherwise refuses to touch it silently — without it, stale hashed bundles from prior builds would accumulate into
// the embedded binary. internal/webui/assets/.gitkeep is committed so a fresh clone's
// `go build ./...` resolves the //go:embed pattern without a prior `npm install`/build;
// emptyOutDir deletes it on every build, so this plugin restores it byte-identical in
// closeBundle (not buildEnd, which fires before the emptied dir is (re)written) — every
// build path (`npm run build` or `make web-build`) leaves the tree clean for
// `git status`/`git describe --dirty`.
const gitkeepPath = fileURLToPath(new URL("../internal/webui/assets/.gitkeep", import.meta.url));

const keepGitkeep: Plugin = {
  name: "keep-gitkeep",
  closeBundle() {
    writeFileSync(gitkeepPath, "");
  },
};

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "../internal/webui/assets",
    emptyOutDir: true,
    // Sourcemaps are embedded into the binary along with everything else in outDir, and
    // the map alone is ~955 kB of reconstructible TypeScript. Release builds
    // (.goreleaser.yaml's before-hook) set MUSTER_RELEASE=1 to drop it; every other build
    // path — `make web-build`, `make e2e` — keeps maps so a failing spec still yields an
    // original-source stack trace.
    sourcemap: process.env.MUSTER_RELEASE !== "1",
    // Plan markdown-viewing (kb:adr/reader-popout-is-a-second-page): `doc.html` is a
    // second, independent entry — its own composition root (`src/doc.ts`), not a route
    // inside `index.html`'s bundle.
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        doc: fileURLToPath(new URL("./doc.html", import.meta.url)),
      },
    },
  },
  plugins: [keepGitkeep],
});
