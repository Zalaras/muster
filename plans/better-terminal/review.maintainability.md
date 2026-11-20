# Maintainability review: better-terminal

**Plan**: better-terminal
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 20762 words (budget 30000)
**Scope**: delta re-review. 1 non-test file in the delta c726556f..HEAD over cmd, internal and web/src: `internal/server/renderfix_tmux.go`. The other changed files are tests (`web/render/*.spec.ts`) or `plans/`.

## Delta

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| Major 1: `internal/server/renderfix_tmux.go` had no `//go:build renderfix` line, so the render rig fake tmux compiled into production `internal/server` (id `internal/server/renderfix_tmux.go:renderTmux:missing renderfix build tag`) | 273dcb29 | Fixed. The file now starts with `//go:build renderfix` and a blank line, like its siblings: `grep -L "^//go:build renderfix" internal/server/renderfix*.go` prints nothing across all 17 files. Measured: `go list -f "{{join .GoFiles \" \"}}" ./internal/server` piped to `grep renderfix` prints nothing (grep exit 1); with `-tags renderfix` it lists `renderfix_tmux.go`. The cycle 3 gates are green on build, lint (`0 issues`) and render tests (`509 passed`). The fix is the one line the issue asked for, and Fix Attempt 3 in daemon-implementation.md records it with its evidence. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/renderfix_tmux.go | the 16 other `renderfix_*.go` files (build constraints compared) | yes (cycle 2: "real seam: the fake tmux vs the rig") | none | pass |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** Cycle 2 Note 1 still applies and asks for no change: the `nudgeOnEOF` flag on `pumpPTYToSocket` (internal/server/terminal.go) can no longer be false in production, so a later cleanup could drop it.
