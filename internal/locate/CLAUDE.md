# internal/locate — dropped file to original path

**Owns**: resolving a dropped file's on-disk path from its basename, size and bytes: a `Locator` asks Finders in order (Spotlight, then a capped directory walk) and verifies each candidate byte-for-byte. Pure filesystem logic; imports nothing from `internal/server`, `internal/session` or `internal/claudecode`. **Features**: drop.

**Invariants** (violations are review-Critical):
- The uploaded bytes are never written anywhere; the daemon types the original's path or nothing (kb:adr/drop-daemon-locates-original-never-stages).
- A Finder returns raw candidates, or `(nil, nil)` when its mechanism is unavailable; verification is central in `Locate`, never in a Finder.
- Subprocesses cross the `lookPath`/`run` fields; tests never fork `mdfind` (kb:adr/process-faked-subprocess-boundary).
- A command owning a stdout pipe sets `WaitDelay` (kb:adr/process-exec-waitdelay-on-pipe-owning-commands).

**Exemplar**: `spotlight.go` — a Finder with injectable process seams and graceful degradation; copy this shape for a new Finder.

**Gotchas**:
- `DefaultWalkCap` bounds the walk at 200,000 entries; a monorepo or `node_modules` stops there and the request answers not-found, not an error.
- Spotlight can be absent or slow; a timeout is a miss, never a failure.
- Verified candidates are sorted before the first is chosen; a test asserting which path wins relies on that order.

<!-- kb:trailer -->
<!-- kb:hash 610543a4e0b07d19 -->
- **drop** — File drop pastes the original on-disk path into the pane. → `docs/features/drop/INDEX.md`
- 2 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
