# Daemon Implementation: M4 — Hook-command path quoting

**Plan**: m4-hook-quoting
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/settings.go` | modified | Added unexported `shellQuote(path string) string` (single-quote, `'` → `'\''`). Applied it to both `hookEntry{Type:"command", Command: …}` literals in `MergeSettings` (SessionStart and `statusLine`) — REQ-1. Extended `isMusterEntry`'s command branch to match either the raw path or `shellQuote(path)` for both `cfg.SessionStartCommand`/`cfg.StatusLineCommand`, with an empty-path guard (`p != ""`) so an empty configured path can never match a foreign empty command — REQ-3, Implementation Notes. Updated `SettingsConfig` field doc comments and `MergeSettings`'/`isMusterEntry`'s doc comments to state the raw-vs-quoted boundary. |

`internal/server/sessions.go` was inspected, not modified: it already passes `WriteWrapperScripts`' raw return values straight into `SettingsConfig.SessionStartCommand`/`StatusLineCommand` (lines 186–187), which is exactly REQ-2/D7 — no quoting outside `internal/claudecode`. `docs/protocol.md` §4.2 already carries the plan's doc delta (merged at plan approval, per plan.md) — verified present, no correction needed.

## Decisions

- No deviations from the plan. `shellQuote` implementation matches the plan's Implementation Notes exactly: `"'" + strings.ReplaceAll(s, "'", `'\''`) + "'"`.
- Doc-comment wording for `shellQuote` avoids writing a literal adjacent `''` sequence in a declaration-attached (godoc) comment, because `gofmt` on this toolchain rewrites two adjacent straight apostrophes in a doc comment into a Unicode right-double-quotation-mark (U+201D) as part of its doc-comment smart-quote pass — reproduced in isolation: a 3-line scratch file with `// ... escaped as `'\''` here.` directly above a `func`, run through `gofmt -d`, changes `'\''` to `'\”` (verified via `gofmt -d` on a throwaway file plus a byte-level `hexdump`/python check showing `e2 80 9d` was gofmt's own output, not a paste artifact). Rewording to describe the four-character replacement in prose (no doc-comment code span containing adjacent quotes) makes `gofmt -l .` exit clean; the code itself (`internal/claudecode/settings.go:45`, inside the function body, not a doc comment) still contains the literal `` `'\''` `` untouched, since gofmt's doc-comment reformatter only touches comments directly attached to a declaration, not code or inline body comments.

## Handoff

**Build status**: `go build ./...` exits 0 (verified).
`gofmt -l .` exits clean (no files listed). `go vet ./...` exits 0. `make lint` → `0 issues.`

**Sanctioned-breakage test** (plan-flagged, not a defect): `internal/claudecode/settings_test.go`'s `TestMergeSettings_FreshFileRegistersEveryHTTPHookEventAndSessionStartAsCommand` now fails — it asserts `sessionStart.Command == cfg.SessionStartCommand` and `statusLine.Command == cfg.StatusLineCommand` (bare paths), but per REQ-1 `MergeSettings` now writes the single-quoted form. This is exactly the plan's named sanctioned-breakage update (plan.md "Affected Files > Daemon tests", citing this same test by name) — daemon-tests owns updating its two assertions to expect `shellQuote(cfg.SessionStartCommand)` / `shellQuote(cfg.StatusLineCommand)`.

Full-tree check: `go test ./...` — only the one test above fails; every other package (including `internal/server`, which already passes raw paths through unchanged) passes unaffected.

No other test files need changes I'm not permitted to make. The new REQ-5/D6 shell round-trip test (`internal/server/settings_shell_test.go`), the REQ-8/D9 canary test, and the REQ-1/3/4 unit test updates are all daemon-tests' work per the plan's "Affected Files > Daemon tests" section — none of that is implementation code.
