import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// The dashboard is served by musterd in production; this dev server exists so the
// frontend can be iterated without rebuilding the daemon. M0 adds the proxy to the
// daemon's HTTP and WebSocket endpoints.
//
// Plan embed-dashboard: the daemon embeds the build output via //go:embed, so outDir
// points at internal/webui/assets instead of the old web/dist. emptyOutDir is explicit
// because outDir sits outside Vite's root (web/) and Vite otherwise refuses to touch it
// silently — without it, stale hashed bundles from prior builds would accumulate into
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
    sourcemap: true,
  },
  plugins: [keepGitkeep],
});
