# Web Implementation: embed-dashboard

**Plan**: embed-dashboard
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/vite.config.ts` | edited | `build.outDir` repointed from `dist` to `../internal/webui/assets` (REQ-5); added `build.emptyOutDir: true` (outDir is outside Vite's root, so this must be explicit or stale hashed bundles accumulate into the embedded binary); added an inline `keep-gitkeep` plugin whose `closeBundle` hook rewrites `internal/webui/assets/.gitkeep` byte-identical after `emptyOutDir` deletes it, so every build path (`npm run build` or `make web-build`) leaves the tree clean for `git status`/`git describe --dirty`. |

No other web-side files touched: this plan's web work is build configuration only, per the plan's Work Type note and "`web/src/**` — untouched" in Affected Files.

## Decisions

- Used `closeBundle` (not `buildEnd`) for the gitkeep-restore hook, matching the Implementation Notes sketch exactly — `buildEnd` fires before Vite has (re)written the emptied outDir, so a `.gitkeep` written there would be wiped again.
- Computed `gitkeepPath` via `fileURLToPath(new URL("../internal/webui/assets/.gitkeep", import.meta.url))`, resolved relative to `vite.config.ts`'s own location — this matches `build.outDir`'s relative resolution (both relative to `web/`), so the plugin writes into the exact directory Vite just built into, not a guessed absolute path.
- `internal/webui/` did not exist on disk before this build ran (daemon-impl's `internal/webui/webui.go` was already present from the parallel daemon-impl run, but the `assets/` subdirectory was created by this Vite build). Vite created `../internal/webui/assets/` on its own with no extra config — no `mkdir` needed in the plugin.
- Testable UI Elements table: no dashboard DOM changes in this plan, so nothing in that table required any implementation action here — both listed elements (`Muster` heading, `#connection-status`) are pre-existing and untouched.
- Precedent check (per Settled Patterns): this plan introduces no new focus-retention, live-update, keyboard, reorder, or stale-display concern — it's a build-output relocation. No grep for precedent was needed; noting this per the "if none exists, say so" instruction.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

Verified directly:
- `npx tsc --noEmit` from `web/` — exits 0, no output.
- `npm run build` from `web/` — succeeds, produces:
  - `internal/webui/assets/index.html` (10.05 kB)
  - `internal/webui/assets/assets/index-*.css`, `index-*.js` (+ sourcemap)
  - `internal/webui/assets/.gitkeep` restored (`wc -c` = 0 bytes, confirmed after build).
- `git status --short internal/webui` shows only `?? internal/webui/` (untracked, expected — daemon-impl/orchestrator owns adding `.gitkeep` to git and the `.gitignore` carve-out; this agent did not `git add` anything under `internal/webui/`).

No test files needed changes — none exist for `vite.config.ts`, and no TS logic changed (`web/src/**` untouched, matching the plan's Implementation Notes: "web-tests track: nothing to test").

None.
