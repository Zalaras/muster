# Daemon Implementation: version-claude-interface

**Plan**: version-claude-interface
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/version.go` | rewritten | Removed `PinnedVersion`/`VersionDriftError`/`CheckPin`. Added `ObservedVersion`, `ParseObservedVersions`, `ObservedVersions()` (embeds the new record), `RangeOf`, `Floor`, `Verified`, `FormatRange`, `VersionStatus` + 4 constants, `ClassifyAgainst`, `Classify`, `VersionReport`, `CheckVersion`. `InstalledVersion` kept byte-for-byte. Hand-rolled 3-int semver compare on the existing `versionRE` capture, no new dependency. |
| `internal/claudecode/observed_versions.txt` | created | The one record of observed versions (REQ-1): the two initial rows, `//go:embed`-ed. |
| `cmd/musterd/main.go` | modified | `-version` prints `musterd %s (Claude Code verified %s)` via `FormatRange(Floor(), Verified())`. `checkClaudeCode` rewritten around `claudecode.CheckVersion`, returns `server.ClaudeCodeInfo` directly, logs one line per status (info verified, warn below/above/unknown) with `installed/floor/verified/status` zerolog fields. |
| `internal/server/server.go` | modified | `ClaudeCodeInfo{Installed *string; Floor, Verified, Status string}` replaces `{Pinned, Installed, Drift}`. |
| `internal/server/ws.go` | modified | `claudeCodeWire{installed, floor, verified, status}`; `protocolVersion` bumped 1→2. |
| `internal/server/issue.go` | modified | `issueSnapshotClaudeCode{installed, floor, verified, status}`; `claudeCodeCell` rewritten to the Protocol Contract's cell text, using `claudecode.FormatRange` for the range portion (imports `internal/claudecode`, same pattern as `server.go`). |
| `tools/versions/main.go` | created | New `package main`: `gen` (rewrite every `<!-- versions:NAME -->` fragment from the on-disk record), `check` (fail naming stale/markerless files), `bump` (offline no-op / inside-range no-op / append+regen / refuse-on-dirty-record). Reads the record from disk, never the embedded copy. `git status`/`git diff` calls go through an injectable `runFunc` (docs/conventions.md §Testing). |
| `Makefile` | modified | Added `gen-versions`/`check-versions` targets; `check` now depends on `check-versions`; `canary` recipe chains `&& go run ./tools/versions bump` after `go test`; help text no longer says "pin". |
| `test/canary/harness_test.go` | modified | `TestMain` computes `skipReason` via the new pure `skipDecision(installed, verified, force, offline)` before `m.Run()`; `harness(t)` calls `t.Skip(skipReason)` after its existing offline check; added `forceEnv = "MUSTER_CANARY_FORCE"`. |
| `test/canary/canary_test.go` | modified | `TestInstalledVersionMatchesPin` → `TestInstalledVersionClassifies` (parses, classifies, logs; never fails on classification). Package doc rewritten to describe the skip/force/offline switches. |
| `test/canary/live_test.go` | modified | `live(t)` also checks `skipReason` after its offline check — plan Implementation Notes says "harness(t) and live(t) call t.Skip(skipReason)"; this file wasn't in the plan's Affected Files list but the instruction is unambiguous. See Decisions. |
| `docs/claude-code-versions.md` | renamed + rewritten | `git mv` from `docs/claude-code-pin.md`. New content: why a range not a pin, why auto-update stays on, the green ritual, the red ritual, skipping-on-unchanged-install (force/offline), the inferred-versions-are-honest note, and the carried-over "Current state of the canary" / "Still manual" sections. |
| `README.md` | modified | "Version pinning" → "Claude Code versions" (fragment-backed range prose); Requirements table row is a `range` fragment; doc link and `-version` comment updated. |
| `spikes/canary-fields.md` | modified | Title/header replaced with a generated `table` fragment plus the "held across the whole range" sentence; `since 2.1.267 asserted` on `session_title`/`session_name` rows, `since 2.1.259` footnote on the subagent/background-task field set, `permission_suggestions` footnote reworded per the REQ-9 amendment; remaining live references to the old doc path updated. |
| `CLAUDE.md` | modified | "Testing bar" ritual reference now points at `docs/claude-code-versions.md`. |

## Decisions

- **Backreference regex from Implementation Notes is not expressible in Go's `regexp` (RE2).** Measured: `regexp.Compile("<!-- versions:(\\w+) -->[\\s\\S]*?<!-- /versions:\\1 -->")` fails with `error parsing regexp: invalid escape sequence: \`\1\``. `tools/versions/main.go`'s `applyFragments` instead finds each opening marker's name, then locates that literal closing marker (`strings.Index` from the opener's end) — same non-greedy, name-matched, no-swallowing behaviour, expressible in RE2. This is an implementation detail, not a Protocol Contract change.
- **Table fragment value carries its own leading/trailing newline.** First `gen` run collapsed the multi-line markdown table onto the marker's own line (`<!-- versions:table -->| version | ... |`), which breaks GFM table detection. Fixed by making the `"table"` fragment's rendered value `"\n" + renderTable(rows) + "\n"`; re-ran `gen`/`check` and confirmed the table now renders on its own lines in `spikes/canary-fields.md` (verified by reading the file after regeneration).
- **`internal/server/issue.go` imports `internal/claudecode`** to call `FormatRange` for the snapshot cell's range text, matching the pattern `server.go`/`ws.go` already have (both import `internal/claudecode` for other reasons) — no new boundary crossing; the Status field itself stays a plain string, never a `VersionStatus`.
- **`test/canary/live_test.go` was edited even though it isn't in the plan's Affected Files.** The plan's Implementation Notes state plainly "harness(t) and live(t) call t.Skip(skipReason) after the offline check," and `live(t)` is defined in `live_test.go`, not `harness_test.go`. Treated as the same class of canary-infrastructure file as `harness_test.go` (both build-tag-gated, non-assertion infrastructure), not an assertions file — one added `if skipReason != "" { t.Skip(skipReason) }` line, no other change.
- **`internal/server/auth_test.go:119`** (`ClaudeCodeInfo{Pinned: "2.1.233"}`) breaks compilation from the `ClaudeCodeInfo` struct change and is **not** listed anywhere in the plan's Affected Files (daemon-impl or daemon-tests). Left untouched per my constraints (cannot edit test-file assertions/fixtures) — flagged in Handoff below for the test agent, in addition to the files the plan already assigned it.

## Handoff

**Build status**: `go build ./...` exits 0. `go vet -tags=canary ./test/canary/...` exits 0 (clean — the canary package's own test files needed no further changes beyond what's listed above). `golangci-lint run --tests=false ./...` reports 0 issues. `gofmt -l` is clean on every file this step touched.

**Sanctioned test-file breakage** (`go vet ./...` / `make lint` fail on these — expected, listed in the plan under daemon-tests except where noted):
- `internal/claudecode/version_test.go` — `writeVersionLeakStub` and `TestVersionDriftErrorIsMatchable` reference the removed `PinnedVersion`/`VersionDriftError` (plan-listed).
- `cmd/musterd/onexit_test.go:83` — references removed `claudecode.PinnedVersion` (plan-listed).
- `internal/server/ws_test.go:75,107` — `ClaudeCodeInfo{Pinned:, Drift:}` (plan-listed).
- `internal/server/issue_test.go:348,766,789,874` — `issueSnapshotClaudeCode{Pinned:}` / `ClaudeCodeInfo{Pinned:, Drift:}` (plan-listed).
- `internal/server/auth_test.go:119` — `ClaudeCodeInfo{Pinned: "2.1.233"}`. **Not listed in the plan's Affected Files for daemon-tests** — a one-line fixture fix (drop `Pinned:`, the zero-value struct already works everywhere else in this file). Flagging explicitly since it would otherwise be missed.

`go vet ./...` stops at the first error per package, so `internal/claudecode`, `cmd/musterd` and `internal/server` each show only their first offending line above — daemon-tests should grep for `Pinned:`/`Drift:`/`PinnedVersion`/`VersionDriftError` across each package's test files (I did this via `rg` before finishing; the four files above are the complete list) rather than fix-one-rerun-vet-repeat.

**Manual verification performed** (outside any test file, since the ones above aren't mine to run):
- `internal/claudecode`'s new logic (`RangeOf` over unsorted rows, `FormatRange` both branches, `ClassifyAgainst` across unknown/below/verified-floor/verified-mid/verified-ceiling/above/suffixed) verified via a throwaway external program in a scratch subdirectory of the repo (removed after, `git status` confirmed no trace) — output matched every case in D7/D8/D27.
- `tools/versions bump`'s four branches (offline no-op, inside-range no-op, append+regen+diff+hint, dirty-record refusal) verified against a scratch git clone (`rsync` copy + fresh `git init`, not the real tree) with a fake `claude` stub on `PATH` — transcript included in this file's history; the real tree was never touched by these runs.
- `go run ./tools/versions check`/`gen` run for real against this tree's actual `README.md`, `spikes/canary-fields.md`, `docs/claude-code-versions.md` — `check` now exits 0.
- `MUSTER_CANARY_OFFLINE=1 make canary` exits 0 in this tree (static tier runs, harness/live tiers skip via the existing offline check, `bump` prints its offline no-op) — D18.
- `make build && ./bin/musterd -version` prints `musterd <ver> (Claude Code verified 2.1.246–2.1.267)` — D10.
- `MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v ./test/canary/...` shows `TestInstalledVersionClassifies` passing and logging `installed 2.1.267, verified range 2.1.246–2.1.267, classified verified` on this machine.

**Not implemented** (out of daemon-impl scope, per the plan's own file assignment): `internal/claudecode/version_test.go`, `cmd/musterd/onexit_test.go`, `cmd/musterd/preflight_test.go`, `cmd/musterd/main_test.go`, `internal/server/ws_test.go`, `internal/server/issue_test.go`, `tools/versions/main_test.go`, `test/canary/skip_test.go` (new) — all daemon-tests. `internal/server/auth_test.go` fixture fix — also daemon-tests, per Decisions above (unlisted but required).

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md Major 1, Major 2, Minor 1 (all tagged `[daemon-impl]`).

**Major 1 — dead pointer to the deleted doc path.** `rg -n "claude-code-pin|the 2.1.246 pin|pinned build" internal/ tools/ cmd/` before fixing returned exactly two lines, both in `internal/claudecode/launch.go`: line 23 (`` `manual` may not exist on the 2.1.246 pin. ``) and lines 54–55 (`` which is *ahead* of the 2.1.246 pin in docs/claude-code-pin.md, so these numbers want re-confirming against the pinned build. ``). Both are Go comments, both in D25's enumerated set. Fixed:
- Line 23 now reads `` `manual` may not exist across the verified range (docs/claude-code-versions.md). ``
- Lines 54–56 now read `2.1.259, inside the verified range declared in docs/claude-code-versions.md; these numbers want re-confirming if a future canary run pushes the verified ceiling past that build.` (2.1.259 sits inside the current range 2.1.246–2.1.267, so the old "ahead of the pin" framing was also factually stale, not just mis-pathed — reworded to state the true current relationship rather than keep a now-false "ahead" claim under a fixed path).
Re-ran the same `rg` after editing: zero matches in `internal/`, `tools/`, `cmd/`. The only remaining repo-wide hits for `claude-code-pin` are in historical `plans/*/*.md` and `SPEC.md`/`TODO.md`/`next-steps.md` planning artifacts, none of which are in D25's enumerated set (`CLAUDE.md`, `README.md`, `spikes/canary-fields.md`, canary package doc, Makefile help — all previously confirmed correct and untouched here).

**Major 2 — no seam for the `claude` binary in `cmdBump`.** Confirmed the codebase's existing convention for this exact problem before choosing an approach: `rg -n "claude-bin|claudeBin"` shows `cmd/musterd/main.go` already takes `-claude-bin` (default `"claude"`) and every daemon test that needs to control the binary (`cmd/musterd/onexit_test.go`, `cmd/musterd/open_test.go`, `internal/server/sessions_test.go`) passes an absolute path to a stub script — never a `$PATH` shim. Applied the same pattern to `cmdBump`: added a `claudeBin string` parameter, replaced the hard-coded `claudecode.InstalledVersion(ctx, "claude")` with `claudecode.InstalledVersion(ctx, claudeBin)`, and passed the literal `"claude"` at the single call site (`run()`'s `"bump"` case). This is the only production call site (`grep -n "cmdBump(" tools/versions/*.go` → one production call in `main.go` plus seven test calls across `main_test.go`'s seven `TestCmdBump_*` functions), so the blast radius is exactly those seven test call sites, all in the file wave 2 owns.
`go build ./...` exits 0 (test files aren't compiled by `go build`). `go vet ./...` fails exactly as expected: `tools/versions/main_test.go:167:67: not enough arguments in call to cmdBump / have (context.Context, string, *bytes.Buffer, runFunc) / want (context.Context, string, io.Writer, runFunc, string)` — sanctioned per the orchestrator's note; `main_test.go`'s six `TestCmdBump_*` calls (and `stubClaudeOnPath`, now dead code once wave 2 threads the new param) need updating to pass a fifth `claudeBin` argument, most naturally the absolute path to their existing fake-`claude` script instead of `PATH` manipulation. Flagged for daemon-tests below.

**Minor 1 — unforced canary command in the review-evidence paragraph.** `docs/claude-code-versions.md`'s closing paragraph now reads `MUSTER_CANARY_FORCE=1 make canary 2>&1 | tee plans/<plan-name>/canary-run.log` (was the unforced form), keeping "full" and the "four haiku turns" cost note attached, matching the force-flag convention stated two sections earlier and D26.

**Verification (this cycle)**:
- `go build ./...` → exit 0.
- `golangci-lint run --tests=false ./...` → `0 issues.` (pasted below).
- `gofmt -l .` → no output (clean).
- `rg -n "claude-code-pin|the 2.1.246 pin|pinned build" internal/ tools/ cmd/` → no matches (was 2, both in `launch.go`).

```
$ golangci-lint run --tests=false ./...
0 issues.
```

**Handoff for daemon-tests (wave 2)**: `cmdBump`'s signature is now
`func cmdBump(ctx context.Context, root string, stdout io.Writer, runCmd runFunc, claudeBin string) error`
(new 5th parameter, `claudeBin string`, no default inside the function — the production default `"claude"` lives only at the `run()` call site). Update `tools/versions/main_test.go`'s seven `TestCmdBump_*` tests to pass a `claudeBin` argument — an absolute path to the existing fake-`claude` script written to `t.TempDir()`, matching the `-claude-bin` seam pattern used in `cmd/musterd/onexit_test.go`/`open_test.go` — instead of `stubClaudeOnPath`'s `t.Setenv("PATH", dir)`. `TestCmdBump_OfflineEditsNothing` never reaches `InstalledVersion` (offline short-circuit) so it can pass any placeholder string. `stubClaudeOnPath` and its doc comment (which explicitly says "cmdBump hard-codes the bare binary name … with no injectable seam of its own") are now stale and should be removed or rewritten to build the stub and return its path rather than mutate `PATH`.
