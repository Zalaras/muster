# internal/reader — a session's markdown scope and confinement rules

**Owns**: which paths a session's reader may list and serve. `Scope` (a session's directory
plus its plan path) decides the change-signal test (`PathQualifies`) and the serving
confinement (`Confine`); `ListMarkdown`/`WalkMarkdown` list a directory's `.md` files.
`WriteLog` is the in-memory record of routed writes a session's reader shows `written <age>
ago` for. Pure filesystem logic; imports nothing from `internal/server`, `internal/session`
or `internal/claudecode`. **Features**: reader.

**Invariants** (violations are review-Critical):
- `Confine` resolves symlinks on both `Dir` and the requested path before comparing them —
  a `.md` symlink inside `Dir` pointing outside it must never resolve to allowed
  (kb:spec/reader's confinement rule).
- `PathQualifies` is lexical only (no symlink resolution): it is the change-signal's scope
  test, not the serving guard (kb:adr/reader-change-signal-is-the-write-hook).
- `WriteLog` never grows past `maxWriteLogPaths` entries per session; `Record` evicts the
  single oldest once the cap is exceeded, never more.
- `ListMarkdown`/`WalkMarkdown` never fail: a git error selects the walk fallback, and a
  walk that hits its cap reports `truncated:true` rather than erroring.

**Exemplar**: `reader.go`'s `Scope` — a small value type carrying the two paths a rule
needs, with the rule itself as a method, matching `internal/locate`'s shape (a domain type
plus pure functions, no logger, no HTTP).

**Gotchas**:
- `ListMarkdown`'s `gitErr` return is non-nil only when the git query itself failed; the
  walk fallback that follows it is not itself a failure. It exists so the caller (which
  holds the logger) can log the git failure — this package deliberately has none.
- `WriteLog`'s eviction calls `internal/evict.Oldest`, not `internal/server`'s own
  `captureStore` code: this package must not import `internal/server` (the dependency runs
  the other way), so the shared rule lives in the lower `internal/evict` package instead,
  the same layering `internal/boundedwait` uses.

<!-- kb:trailer -->
<!-- kb:hash 4a6d0c0f1aa666cd -->
- **reader** — The docs surface — a sanitized markdown reader for a session's plan and the .md files under its directory, with a file nav, outline and pop-out. → `docs/features/reader/INDEX.md`
- 1 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
