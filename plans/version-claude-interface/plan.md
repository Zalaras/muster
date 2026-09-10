# Plan: version-claude-interface

**Created**: 2026-09-10
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: claude-version.spec.ts startDaemon (the stub's `--version` reply is computed per test from the observed-versions record — the verified ceiling, ceiling+1, or a failing reply); no other spec changes
**Closes**: #6
**Description**: Replace the single pinned Claude Code version with an observed, canary-extended verified range (floor + ceiling), surfaced in support terms in the masthead, `-version` and the startup log, with the canary skipping on the already-verified version and recording a green run outside the range automatically.

## Overview

Muster today assumes exactly one Claude Code wire format: a pinned version constant in
`internal/claudecode/version.go`, an equality check at startup, and a masthead readout that
says "drift from pinned 2.1.246" — words that mean nothing to anyone who did not set the pin
(#6). The pin bump is a manual ritual that is currently outstanding: the installed 2.1.267 went
green on the full-coverage canary on 2026-09-10 and the constant still says 2.1.246. The spec
(`plans/version-claude-interface/spec.md`, interview 2026-09-10) settles the shape: a
**declaration**, not a mechanism. There are zero observed change points — every shape in
`spikes/canary-fields.md` has held from 2.1.233 through 2.1.267 and every recorded delta is an
addition — so this plan builds no version-gated adapters, no change-point table and no startup
probe. It builds the seam those would hang off (a parsed, comparable installed version inside
`internal/claudecode`) and the honest declaration around it.

The single source of truth is an embedded data file, `internal/claudecode/observed_versions.txt`:
one row per Claude Code version `make canary` has gone green on (version, date, note). Floor
and ceiling are its min and max by semver; nothing else in the tree carries a version literal.
Startup classifies the installed version as `unknown | below | verified | above` and warns on
both sides of the range without ever refusing to start. The hello frame becomes protocol 2 with
`claudeCode: {installed, floor, verified, status}`; the masthead renders four states, with a
warning glyph and hover text for the two outside-the-range states; `musterd -version` prints the
range; the issue-capture snapshot carries the status string.

The canary closes the loop. `TestMain` compares the installed version with the ceiling: equal and
not forced → the harness and live tiers skip with a printed reason (zero tokens, no Keychain,
static tier still runs); `MUSTER_CANARY_FORCE=1` runs everything (the plan-review convention). A
new Go tool, `tools/versions`, has three subcommands: `gen` renders marker-bounded fragments into
`README.md`, `spikes/canary-fields.md` and `docs/claude-code-versions.md` (the renamed pin doc);
`check` fails naming any stale file and joins `make check`; `bump` runs after a green non-offline
canary, appends the installed version when it is outside the range, regenerates the docs, and
leaves the tree uncommitted with a diff summary and a commit hint — refusing if the record file
already has uncommitted changes.

## Requirements

### Must Have
- [ ] REQ-1: `internal/claudecode/observed_versions.txt` is the one record of observed versions — one
      row per green canary version: `<major.minor.patch> <YYYY-MM-DD> <note…>`, `#` comment and blank
      lines allowed. Initial rows: `2.1.246 2026-08-29 m4-canary` and
      `2.1.267 2026-09-10 canary-full-coverage`. It is `//go:embed`-ed; `Floor()` and `Verified()`
      are derived as the rows' semver min and max. The pinned-version constant, the drift error type
      and the equality check are removed. No other version literal exists outside this file and tests.
- [ ] REQ-2: `Classify(installed) VersionStatus` returns exactly one of `unknown` (empty or unparseable),
      `below` (`< Floor()`), `verified` (`Floor() ≤ v ≤ Verified()`), `above` (`> Verified()`), comparing
      the leading `major.minor.patch` numerically and ignoring any suffix. Versions strictly inside the
      range that were never run are `verified`. `InstalledVersion` is unchanged.
- [ ] REQ-3: `CheckVersion(ctx, bin) VersionReport` never returns an error to the caller: `Installed` is
      nil iff `Status` is `unknown` (INV-1); `Floor`/`Verified` are always populated (INV-2). Startup
      logs one line per outcome — info for `verified`, warn for `below` (wording includes the remedy
      "update Claude Code"), warn for `above` (wording says it is newer than any version Muster has been
      tested with), and the existing "could not determine claude code version" warn for `unknown` — and
      continues identically in all four cases (INV-3).
- [ ] REQ-4: Protocol 2: `hello.claudeCode` becomes `{ installed: string|null, floor: string,
      verified: string, status: "unknown"|"below"|"verified"|"above" }`; `protocolVersion` is 2; the
      old `pinned` and `drift` keys are gone from the wire, the Go wire structs and `web/src/protocol.ts`.
      The issue-capture snapshot's `claudeCode` object takes the same four keys and its markdown cell
      is rendered from them.
- [ ] REQ-5: Masthead readout (`#claude-version`) renders: `verified` → `claude <installed>`, no glyph;
      `above` → `claude <installed>` followed by a warning glyph whose hover text is
      "This Claude Code version has not been tested with Muster"; `below` → the same glyph with hover
      text "This Claude Code version has not been tested with Muster — please update Claude Code";
      `unknown` → "Claude installation unknown". Pre-hello stays "claude unknown". No dismiss control,
      nothing persisted.
- [ ] REQ-6: `musterd -version` prints `musterd <version> (Claude Code verified <floor>–<verified>)`, or
      `(Claude Code verified <v>)` when floor equals ceiling, from REQ-1's record.
- [ ] REQ-7: `make canary` (non-offline): `TestMain` compares the installed version with `Verified()`;
      equal and `MUSTER_CANARY_FORCE` unset → prints the skip reason, the harness and live tiers skip,
      the static tier and the classification test still run, exit green, no session launched, no
      Keychain read. `MUSTER_CANARY_FORCE=1` runs every tier regardless. `MUSTER_CANARY_OFFLINE=1`
      behaviour is unchanged and always wins (INV-4). The pin-equality canary test is replaced by a
      parse-and-report test.
- [ ] REQ-8: `go run ./tools/versions bump` (chained after a green `go test` in the `canary` recipe):
      offline → prints and exits 0 without edits; installed inside the range → prints and exits 0
      without edits; `above` or `below` → appends `<installed> <today> make canary` to the record,
      runs `gen`, prints `git diff --stat` and a commit hint, exits 0, tree left uncommitted; record file
      already dirty in git → exits non-zero naming the reason and edits nothing. A red run never reaches
      it (INV-5).
- [ ] REQ-9: `go run ./tools/versions gen` rewrites every `<!-- versions:<name> -->…<!-- /versions:<name> -->`
      fragment in `README.md`, `spikes/canary-fields.md` and `docs/claude-code-versions.md` from the
      on-disk record; `check` renders to memory and exits non-zero naming each stale file, and also
      fails naming any listed file that carries no fragment. `make check` runs `check`.
- [ ] REQ-10: `docs/claude-code-pin.md` is renamed (`git mv`) to `docs/claude-code-versions.md` and
      rewritten around the range: why a range, the green ritual (automatic record + regenerate, then
      commit), the red ritual (a real interface change — add the version branch by hand inside
      `internal/claudecode` keyed off the classified version, keep the old path, extend the canary,
      add `since`/`until` to the affected `canary-fields.md` rows, re-run), the force-flag review
      convention, the intermediate-versions-are-inferred honesty note, and the residual
      `/interface-probe` rituals carried over. Every live reference to the old path (README, CLAUDE.md,
      Go comments, canary package docs, Makefile help) points at the new name; historical mentions in
      `SPEC.md` §11, `TODO.md` and `next-steps.md` stay as written.

### Should Have
- [ ] REQ-11: `spikes/canary-fields.md`: the title's version range and the header's validation paragraph
      are replaced by a generated observed-versions table fragment plus one hand-written sentence stating
      that every row not annotated held across the whole range; rows whose applicability differs gain
      `since`/`until`: the subagent/background-task fields (`since 2.1.259`), `session_title`/
      `session_name` via `--name` (`since 2.1.267` asserted), `permission_suggestions` optional
      (absent observed `2.1.267` in plan mode).
- [ ] REQ-12: README "Version pinning" becomes "Claude Code versions": the Requirements-table row and the
      section's range sentence are generated fragments; the prose says auto-update stays on, what
      `below`/`above` mean for the user, and links the new doc. The `musterd -version` comment on the
      install-check line describes the range.
- [ ] REQ-13: The E2E harness's stub `claude` gains two knobs on `ScratchDaemonOptions` —
      `stubClaudeVersion?: string` (the leading version the stub echoes, default `2.0.0-e2e-stub`) and
      `stubClaudeVersionFails?: boolean` (stub exits 1 on `--version` printing nothing) — implemented as
      environment variables passed to the daemon spawn, so the single shared stub file is unchanged; and
      a helper `observedVersionRange()` that reads REQ-1's record from the repo root and returns
      `{ floor, verified }`.

### Nice to Have
- [ ] REQ-14: `docs/design/design-system.md` §5 Masthead names the Claude Code version readout and its
      warning glyph (no state colour; the word is carried by the hover text).

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval). **Breaking: `protocolVersion` 1 → 2**
— an existing message's field set changes (§1 versioning rule). The dashboard is embedded in the
binary, so the only skewed client is a tab left open across a `musterd` upgrade; it takes the
existing "reload the dashboard" path.

### Header
"Everything is protocol **version 1**" → "Everything is protocol **version 2** (bumped 2026-09-10,
plan `version-claude-interface`, for the `hello.claudeCode` shape); the version only bumps on a
breaking change to an existing message (additive fields don't bump it)."

### WS: daemon→UI `hello` (§5.1, changed)
```json
{ "type": "hello", "protocolVersion": 2,
  "daemon": { "version": "0.7.0" },
  "claudeCode": { "installed": "2.1.267", "floor": "2.1.246", "verified": "2.1.267", "status": "verified" } }
```
- `claudeCode.installed` — `string|null`: the leading `major.minor.patch` of `claude --version` at
  daemon startup. `null` iff `status` is `"unknown"` (the check failed, hung past its timeout or was
  unparseable).
- `claudeCode.floor` — `string`, always present: the lowest version `make canary` has gone green on.
- `claudeCode.verified` — `string`, always present: the highest such version (the ceiling).
  `floor ≤ verified` always; equal when only one version has been observed.
- `claudeCode.status` — `"unknown" | "below" | "verified" | "above"`: `below` is `installed < floor`,
  `verified` is `floor ≤ installed ≤ verified` (versions strictly inside the range are inferred, not
  individually run), `above` is `installed > verified`.
- Removed: `pinned`, `drift`.
- Sent once per connection, before `snapshot`, as before. The masthead renders the four states
  (ux-flows §3.1 masthead; this plan's UI Specifications).

### HTTP: POST /api/issue/captures (§3.12, snapshot allowlist changed)
**Auth**: UI cookie (unchanged). **Request**: unchanged.
**Response 200**: unchanged shape; inside `snapshot`, the always-present group becomes
`claudeCode.{installed,floor,verified,status}` with exactly the `hello` semantics above
(`installed` null iff `status` is `unknown`). The rendered `snapshotMarkdown` Claude Code cell is
`<installed> installed · verified <floor>–<verified> · <status>` (e.g.
`2.1.270 installed · verified 2.1.246–2.1.267 · above`), or
`installed unknown · verified <floor>–<verified>` when `status` is `unknown`; a single-version range
renders as the one version. Errors: unchanged.

### §9 Changelog entry
"**2026-09-10 — protocol 2: `hello.claudeCode` is a verified range** (plan
`version-claude-interface`, closes #6). `{pinned, installed, drift}` → `{installed, floor, verified,
status}`; `installed` null iff `status` is `unknown`; `floor`/`verified` always present. §3.12's
snapshot allowlist follows. First version bump; the embedded dashboard ships with the daemon, so
the only skewed client is an open tab, which gets "reload the dashboard"."

## Schema Changes

No schema changes required.

## UI Specifications

Design authority: `docs/design/design-system.md` §5 Masthead (right-aligned account-level readouts),
§3 (a state colour may only mean its state — the glyph takes **no** state colour, it inherits the
readout's text colour), §6.1 (unknown renders as the word). `docs/design/ux-flows.md` §3.1 (the
masthead carries what is true of the whole account). No mockup renders the version readout; the
existing `#claude-version` span in `web/index.html` is the surface and stays where it is.

### Views
- Masthead (both Focus and Tiles — the masthead is identical in both, design-system §4) —
  `#claude-version` readout, rendered by `renderClaudeVersion(el, info)` in `web/src/render/masthead.ts`.

### DOM
`renderClaudeVersion` derives its content through a new exported pure function
`describeClaudeVersion(info: ClaudeCodeInfo | null): { text: string; warning: string | null }` and
then rebuilds the element's children with `replaceChildren` (no innerHTML):

| input | `text` | `warning` |
|---|---|---|
| `null` (pre-hello) | `claude unknown` | `null` |
| `status: "unknown"` (any `installed`) | `Claude installation unknown` | `null` |
| `status: "verified"` | `claude <installed>` | `null` |
| `status: "above"` | `claude <installed>` | `This Claude Code version has not been tested with Muster` |
| `status: "below"` | `claude <installed>` | `This Claude Code version has not been tested with Muster — please update Claude Code` |
| any non-`unknown` status with `installed === null` (defensive; the daemon never sends it) | `Claude installation unknown` | `null` |

When `warning` is non-null the element's children are: a text node `claude <installed> ` (trailing
space) and `<span class="version-warn" role="img" aria-label="<warning>" title="<warning>">⚠</span>`
(U+26A0, no variation selector). Resulting `textContent`: `claude 2.0.0 ⚠`. When `warning` is null
the element holds the text node alone. There is no button, link or other control inside the readout.
`.version-warn` gets a small left margin in `web/src/style.css` and no colour rule.

### User Flows
1. Dashboard loads → readout shows `claude unknown` → `hello` arrives → readout re-renders per the
   table. Hovering the glyph shows the browser's native `title` tooltip with the sentence. Nothing is
   clickable; nothing is dismissed or remembered.
2. Daemon restarts after Claude Code auto-updated → the reconnect's `hello` carries the new
   classification → the readout re-renders (existing `onHello` path in `web/src/main.ts`, unchanged).

### States
- No data yet: `claude unknown` before the first `hello` (existing).
- Data: per the table above.
- Daemon down: the readout keeps its last text (existing behaviour); the full-width banner is the
  daemon-down surface (ux-flows §3.5). On reconnect `hello` re-renders it.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Claude Code version readout | — | `#claude-version`; `textContent` matches `^claude \d+\.\d+\.\d+` in `verified`/`above`/`below`, equals `Claude installation unknown` in `unknown` | a `<span>`, no implicit role; locator strategy is e2e-specs' call |
| Warning glyph (above) | `img` | `This Claude Code version has not been tested with Muster` | `role="img"` + `aria-label`; `title` carries the same string (`getByTitle` also works) |
| Warning glyph (below) | `img` | `This Claude Code version has not been tested with Muster — please update Claude Code` | same element shape; em dash U+2014 |
| Absence of any control in the readout | — | `#claude-version button, #claude-version a` matches nothing | REQ-5 "no dismiss" |

### Invariants

- **INV-1** `claudeCode.installed` is `null` iff `claudeCode.status` is `"unknown"` — on the hello wire
  and in the issue snapshot, from every path: binary missing, `--version` exiting non-zero, output
  unparseable, timeout, and each of `below`/`verified`/`above`.
- **INV-2** `claudeCode.floor` and `claudeCode.verified` are non-empty and `floor ≤ verified` on every
  hello and snapshot, including when `status` is `"unknown"`.
- **INV-3** No version-check outcome makes `musterd` exit non-zero or skip serving.
- **INV-4** With `MUSTER_CANARY_OFFLINE` set: no session is launched, no Keychain or network is
  touched, and no file in the tree is edited — regardless of `MUSTER_CANARY_FORCE` and of the
  installed version.
- **INV-5** A red canary run edits nothing (the `bump` step is reached only after `go test` exits 0).
- **INV-6** `Floor()`/`Verified()` equal the record's semver min/max whatever the row order; no
  other file in the tree (outside tests) carries a Claude Code version literal.

### Carried-over measurements
- `InstalledVersion`'s 2 s `WaitDelay` and `cmd/musterd`'s 5 s `versionCheckTimeout` were measured
  for the `claude --version` call (plan `post-worktree-spike-issues`). Re-checked against this plan:
  still valid — the call, its arguments and the binary are unchanged; only what is done with the
  parsed result changes.
- The shared-stub first-exec cost (~270 ms per new executable, serialised; `ensureSharedStubClaude`,
  test-strategy 2026-09-06) was measured for one stub file per run. Re-checked: still valid **only
  because** REQ-13 varies the reply through environment variables and leaves the stub's bytes (and
  therefore its content-hash path) unchanged. A per-variant stub file would have expired it.

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/version.go` — delete the pinned-version constant, the drift error type and
  the equality check; keep `InstalledVersion` byte-for-byte; add `ObservedVersion{Version, Date, Note}`,
  `ParseObservedVersions(io.Reader) ([]ObservedVersion, error)` (rejects duplicates, malformed rows,
  non-semver versions), `ObservedVersions() []ObservedVersion` (the embedded file; a parse failure is a
  programming error guarded by tests, so it panics like `regexp.MustCompile`), `RangeOf(rows) (floor,
  verified string)`, `Floor()`, `Verified()`, `FormatRange(floor, verified string) string`
  (`a–b`, or `a` when equal), `type VersionStatus string` with the four constants,
  `ClassifyAgainst(installed string, rows []ObservedVersion) VersionStatus`, `Classify(installed)`,
  `VersionReport{Installed *string; Floor, Verified string; Status VersionStatus; Err error}` and
  `CheckVersion(ctx, bin) VersionReport`. Semver comparison is a hand-rolled three-integer compare on
  the existing `versionRE` capture — no new dependency.
- `internal/claudecode/observed_versions.txt` — new; header comment + the two initial rows.
- `cmd/musterd/main.go` — `checkClaudeCode` returns `server.ClaudeCodeInfo` built from `CheckVersion`
  with the four log lines; `-version` prints `musterd %s (Claude Code verified %s)` using
  `FormatRange(Floor(), Verified())`; comments no longer mention a pin.
- `internal/server/server.go` — `ClaudeCodeInfo{Installed *string; Floor, Verified, Status string}`
  (plain strings: `internal/server` learns nothing about Claude Code beyond the status word).
- `internal/server/ws.go` — `claudeCodeWire{installed, floor, verified, status}`; `protocolVersion = 2`.
- `internal/server/issue.go` — `issueSnapshotClaudeCode{installed, floor, verified, status}`;
  `claudeCodeCell` per the Protocol Contract.
- `tools/versions/main.go` — new `package main`: `gen`, `check`, `bump`; reads the record from disk at
  `internal/claudecode/observed_versions.txt` relative to the repo root (the Makefile runs it from the
  root; it verifies `go.mod` is present in the cwd and fails otherwise); fragments `range`, `floor`,
  `verified`, `table` (markdown table `| version | verified on | run |` sorted ascending); marker regex
  `<!-- versions:(\w+) -->[\s\S]*?<!-- /versions:\1 -->`; file list hard-coded; `bump` shells out to
  `git status --porcelain -- <record>` and `git diff --stat` through an injectable run func (conventions
  §Testing) and calls `claudecode.InstalledVersion(ctx, "claude")` for the installed version.
- `Makefile` — `gen-versions` and `check-versions` targets; `check` gains `check-versions`; `canary`
  becomes `go test -tags=canary -count=1 -v ./test/canary/... && go run ./tools/versions bump`; help
  lines updated (no "pin").
- `test/canary/harness_test.go` — `TestMain` computes `skipReason` before `m.Run()` (non-offline only:
  installed == `Verified()` and `MUSTER_CANARY_FORCE` unset), prints it; `harness(t)` and `live(t)`
  call `t.Skip(skipReason)` after the offline check; `const forceEnv = "MUSTER_CANARY_FORCE"`; a pure
  `skipDecision(installed, verified string, force, offline bool) (skip bool, reason string)`.
- `test/canary/canary_test.go` — the pin-equality test becomes `TestInstalledVersionClassifies`
  (parses, logs `installed`, `Floor()`, `Verified()` and `Classify`; never fails on classification);
  package doc lists the skip/force/offline switches.
- `docs/claude-code-versions.md` — `git mv` from the pin doc and rewrite per REQ-10; the range line is a
  `range` fragment.
- `README.md` — REQ-12; the Claude Code table row and the range sentence carry inline `range`
  fragments (inline HTML comments are legal inside a GFM table cell — never a block marker on its own
  line inside the table).
- `spikes/canary-fields.md` — REQ-11; the H1's version span and the header table are fragments.
- `CLAUDE.md` — the "Testing bar" line's ritual reference points at the new doc name.

### Daemon tests (daemon-tests)
- `internal/claudecode/version_test.go` — `writeVersionLeakStub` stops using the removed constant
  (use `Verified()`); add tests for D6–D9, D27 (parse incl. duplicate/malformed rows, min/max over
  unsorted rows, classification table, INV-1 across every `CheckVersion` outcome, `FormatRange`).
- `cmd/musterd/onexit_test.go` — the stub script uses `claudecode.Verified()` instead of the removed
  constant.
- `cmd/musterd/preflight_test.go` — `-version` assertion also expects `Claude Code verified `.
- `cmd/musterd/main_test.go` — D11/D12: `checkClaudeCode` mapping and log line per status with a
  buffered zerolog; unknown outcome returns a serving-compatible info, no error.
- `internal/server/ws_test.go` — `helloWire` gains the new shape; D13 (protocolVersion 2, four keys,
  null-iff-unknown from both a populated and an unknown `ClaudeCodeInfo`).
- `internal/server/issue_test.go` — D14.
- `tools/versions/main_test.go` — D15/D16 over temp copies of the three docs and a temp record, with
  fake `git` run funcs.
- `test/canary/skip_test.go` — D17 (`//go:build canary`, pure `skipDecision` table).

### Web (web-impl)
- `web/src/protocol.ts` — `ClaudeCodeStatus`, `ClaudeCodeInfo{installed, floor, verified, status}`,
  `parseClaudeCode` (types + enum; rejects unknown status strings), `PROTOCOL_VERSION = 2`.
- `web/src/render/masthead.ts` — `describeClaudeVersion` (exported, pure) and `renderClaudeVersion`
  DOM per UI Specifications.
- `web/src/style.css` — `.version-warn` margin rule.
- `docs/design/design-system.md` — REQ-14 sentence in §5 Masthead.

### Web tests (web-tests)
- `web/src/protocol.test.ts` — W3 (`validHello` fixture updated to protocol 2).
- `web/src/ws.test.ts` — W4 (the "unsupported" hello uses a version other than 2; fixture updated).
- `web/src/render/masthead.test.ts` — W5.

### E2E (e2e-specs)
- `web/e2e/claude-version.spec.ts` — new; E1–E6.
- `web/e2e/helpers/daemon.ts` — REQ-13: the stub script reads `MUSTER_E2E_STUB_VERSION` (default
  `2.0.0-e2e-stub`) and `MUSTER_E2E_STUB_VERSION_FAIL`; `ScratchDaemonOptions.stubClaudeVersion` /
  `stubClaudeVersionFails`; the spawn passes `env: { ...process.env, … }` only when a knob is set;
  `observedVersionRange()`; comments stop saying "drift check"/"pin".

### Orchestrator doc upkeep (not an impl agent's)
- `docs/protocol.md` — plan-work merges the Protocol Contract at approval.
- `SPEC.md` — §8 "Dependency posture" rewritten to the range posture (detect and classify, warn on
  both sides, never freeze auto-update, canary extends the range); §11 changelog entry dated on
  completion.
- `TODO.md` — tick "Version the Claude Code interface" (Pre-v1 Cleanup); tick the post-v1 "Claude Code
  pin — deferred… rethink the pin strategy itself" item as folded in; tick "Version-pin warning is
  developer-facing (#6)". `orchestration-state.json`: `closes_issues: [6]`.

## Edge Cases

1. `claude --version` fails, exceeds the 5 s timeout (WaitDelay bounds the pipe wait) or prints
   something unparseable → `status: "unknown"`, `installed: null`, floor/verified still on the wire,
   masthead "Claude installation unknown", startup continues and serves → D9, D12, E4
2. Suffixed versions (`2.0.0-e2e-stub`, a future `2.2.0-beta`) parse as their leading
   `major.minor.patch`; comparison ignores the suffix; non-semver garbage → `unknown` → D8
3. `MUSTER_CANARY_OFFLINE=1` never bumps and never skips the static tier → D16, D18
4. A change to `internal/claudecode/` on an unchanged install is not exercised by an unforced canary
   (the skip fires); the doc names `MUSTER_CANARY_FORCE=1` as the way to verify it → D17, D20
5. Rollback inside the range (`claude update 2.1.250`): not the ceiling → no skip; green → no bump
   because the range already covers it → D16, D17
6. Green below the floor (e.g. 2.1.240): the same append rule; floor moves down → D7, D16
7. Hand edits to a generated fragment → `check` fails naming the file until reverted or made in the
   record → D15
8. Uncommitted changes to the record file when `bump` runs → refuses, non-zero, names the reason,
   edits nothing → D16
9. E2E default stub (`2.0.0-e2e-stub`) classifies as `below`; the knobs produce `verified`, `above`
   and `unknown` → E1, E2, E3, E4
10. Versions strictly between observed rows were never run; classification says `verified` and the
    doc says plainly they are inferred → D8, D20
11. A dashboard tab left open across the upgrade receives protocol 2 → the existing "reload the
    dashboard" path; no compatibility shim → W4
12. Record with a duplicate version or a malformed row → `ParseObservedVersions` errors; the unit test
    over the embedded file fails the build gate → D7
13. Unsorted rows (a below-floor append lands at the end of the file) → min/max still correct; the
    generated table is sorted ascending → D7, D15
14. Single-row record (floor == ceiling) → `FormatRange` renders one version in `-version`, the issue
    cell and the docs; classification still yields exactly one status → D27, D8
15. Installed equals the floor or the ceiling exactly → `verified` → D8
16. Daemon restart after Claude Code auto-updated mid-session → the reconnect's hello carries the new
    classification and the readout re-renders through the existing `onHello` → untested: the harness
    cannot change the stub's `--version` reply between a daemon's start and its `restart()`; the render
    itself is W5, the wire is D13
17. Hook loss, duplication, reordering and the `/clear` session-id pair → untested: not applicable —
    this plan touches no hook path and adds no rule keyed on `session_id`
18. `MUSTER_CANARY_FORCE=1` together with `MUSTER_CANARY_OFFLINE=1` → offline wins: no session, no
    Keychain, no bump → D16, D17
19. `bump` run where `git` is unavailable or the cwd is not the repo root → non-zero with a named
    reason, no edits → D16
20. A listed doc file carries no fragment at all (markers deleted) → `gen`/`check` fail naming it → D15
21. The installed Claude Code moved past the ceiling before this plan's review runs → the forced
    review run appends the new version to the record on the plan branch (correct by design); the skip
    path is then evidenced by D17 alone, and the reviewer checks the appended row is well-formed → D17
22. Hello with a non-`unknown` status but `installed: null` (a daemon bug) → the parser accepts the
    types; the renderer shows "Claude installation unknown" rather than "claude null" → W5
23. `musterd -version` on a machine with no tmux and no claude → still prints the range (the record is
    embedded; the flag returns before any preflight) → D10

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` compiles (including `tools/versions`).
- **D3**: `make lint` passes.
- **D4**: the canary package compiles with the skip logic (`go vet -tags=canary`).
- **D5**: the committed generated fragments are fresh (`go run ./tools/versions check` exits 0).
- **D6**: the record file contains exactly two version rows, `2.1.246` dated `2026-08-29` and `2.1.267`
  dated `2026-09-10`.
- **D7**: unit tests show `RangeOf`/`Floor`/`Verified` return the semver min and max over unsorted rows,
  and `ParseObservedVersions` rejects a duplicate version and a malformed row.
- **D8**: a unit table covers `Classify` for `unknown` (empty, garbage), `below`, `verified` (equal to
  floor, equal to ceiling, an intermediate never-run version, a suffixed version), and `above`.
- **D9**: unit tests show INV-1 and INV-2 hold for `CheckVersion` from every outcome: missing binary,
  `--version` exiting non-zero, unparseable output, and stubs answering a below, verified and above
  version.
- **D10**: the built binary's `-version` output contains `Claude Code verified ` followed by the range.
- **D11**: a `cmd/musterd` unit test shows `checkClaudeCode` maps each of the four statuses to the
  `ClaudeCodeInfo` fields and emits the status-specific log line (info for verified, warn otherwise;
  the below line contains "update Claude Code").
- **D12**: a `cmd/musterd` unit test shows the `unknown` outcome yields a `ClaudeCodeInfo` with nil
  `Installed`, populated `Floor`/`Verified`, status `unknown`, and no error surfaces to `run`.
- **D13**: `internal/server` tests read a hello with `protocolVersion` 2 and a `claudeCode` object whose
  key set is exactly `installed, floor, verified, status`, with `installed` null iff status unknown.
- **D14**: `internal/server` tests show the issue snapshot's `claudeCode` has the same four keys and the
  markdown cell renders as specified for a populated and for an unknown status.
- **D15**: `tools/versions` unit tests show `gen` fills every fragment name in every listed file, `check`
  exits non-zero naming a stale file, and both fail naming a listed file with no fragment.
- **D16**: `tools/versions` unit tests show `bump` edits nothing under offline, edits nothing inside the
  range, appends and regenerates for above and for below, refuses on a dirty record, and refuses when
  `git` fails.
- **D17**: a canary-tagged unit table shows `skipDecision` skips iff installed equals the ceiling with
  force and offline both unset.
- **D18**: `MUSTER_CANARY_OFFLINE=1 make canary` exits 0 on this machine (static tier runs; bump prints
  its offline no-op).
- **D19**: `docs/claude-code-versions.md` exists and the old pin-doc path does not.
- **D20**: the new doc carries the green ritual, the red ritual, the force-flag review convention, the
  inferred-intermediate-versions note and the three residual probe rituals.
- **D21**: README's Requirements row and "Claude Code versions" section are fragments and read in
  user terms (auto-update on, what below/above mean).
- **D22**: `spikes/canary-fields.md` has the generated header table, the one-sentence held-across-the-range
  statement, and `since`/`until` on the subagent-field rows, the `--name` title rows and the
  `permission_suggestions` footnote.
- **D23**: `cmd/musterd` and `internal/server` consume only the report's strings and status word; no
  Claude Code version literal exists in non-test Go outside the record file.
- **D24**: the daemon's startup path launches no process beyond the existing `claude --version` call.
- **D25**: every live reference to the old doc path (README, CLAUDE.md, Go comments, canary package
  docs, Makefile help) points at `docs/claude-code-versions.md`; `SPEC.md` §11, `TODO.md` and
  `next-steps.md` history is left as written.
- **D26**: the review-cycle canary logs show the intended shapes: `plans/version-claude-interface/canary-run.log`
  (forced) runs every tier and ends with `bump`'s message, and `canary-skip.log` (unforced, if the
  installed version equals the ceiling at review time) shows the `TestMain` skip line, SKIP for the
  harness and live tests, PASS for the static tier and `bump`'s inside-range message.
- **D27**: unit tests show `FormatRange` renders `a–b` for distinct versions and `a` when equal.

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: protocol unit tests accept the new `claudeCode` shape for each status (including null
  `installed` with `unknown`), reject a missing `floor`/`verified`, an unknown status string and a
  non-string non-null `installed`, and assert `PROTOCOL_VERSION` is 2.
- **W4**: the WS client unit test routes a hello whose `protocolVersion` is not 2 to `onProtocolMismatch`.
- **W5**: masthead unit tests cover `describeClaudeVersion` for all six rows of the DOM table (null,
  unknown, verified, above, below, non-unknown with null installed) asserting exact text and warning.
- **W6**: no `any` in new web code; the readout is built with `replaceChildren`/`createElement`, not
  interpolated innerHTML.
- **W7**: the glyph element has `role="img"`, `aria-label` equal to `title` equal to the warning
  sentence, no colour token of its own, and the readout contains no button, link or dismiss control.
- **W8**: `make contrast` passes.

### E2E
- **E1**: with the default stub, the readout text starts `claude 2.0.0` and the glyph named "This Claude
  Code version has not been tested with Muster — please update Claude Code" is visible with that `title`.
- **E2**: with `stubClaudeVersion` set to the record's ceiling, the readout reads `claude <ceiling>` and no
  glyph is present in the readout.
- **E3**: with `stubClaudeVersion` set to the ceiling with its patch incremented, the glyph named "This
  Claude Code version has not been tested with Muster" is visible and its name does not mention updating.
- **E4**: with `stubClaudeVersionFails`, the daemon starts and serves the dashboard and the readout reads
  exactly `Claude installation unknown` with no glyph.
- **E5**: `POST /api/issue/captures` on the default daemon returns a snapshot whose `claudeCode` key set
  is exactly `installed, floor, verified, status`, with `status` `below`, `installed` `2.0.0`, and
  `floor`/`verified` equal to `observedVersionRange()`.
- **E6**: the readout contains no `button` or `a` element, and clicking the glyph leaves it present.
- **E7**: `make e2e` passes (the existing `shell.spec.ts` `claude 2.` assertion included).

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 go vet -tags=canary ./test/canary/...
D5 go run ./tools/versions check
D6 test "$(grep -cE '^[0-9]+\.[0-9]+\.[0-9]+ ' internal/claudecode/observed_versions.txt)" = 2 && grep -qE '^2\.1\.246 2026-08-29 ' internal/claudecode/observed_versions.txt && grep -qE '^2\.1\.267 2026-09-10 ' internal/claudecode/observed_versions.txt
D10 make build && ./bin/musterd -version | grep -q 'Claude Code verified '
D17 MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -run 'TestSkipDecision' ./test/canary/...
D18 MUSTER_CANARY_OFFLINE=1 make canary
D19 test -f docs/claude-code-versions.md && ! test -e docs/claude-code-pin.md
W1 make web-build
W2 make web-test
W8 make contrast
E7 make e2e
```

### Reviewer-Verified

- **D7**, **D8**, **D9**, **D11**, **D12**, **D13**, **D14**, **D15**, **D16**, **D27**: read the named
  unit tests and confirm each case listed in the criterion is present and discriminating (a case the
  implementation could fail).
- **D20**, **D21**, **D22**, **D25**: read the three docs and the reference sites.
- **D23**, **D24**: read `cmd/musterd/main.go`, `internal/server/{server,ws,issue}.go` and
  `internal/claudecode/version.go`.
- **D26**: read the two run logs in the plan directory.
- **W3**, **W4**, **W5**: read the named Vitest files.
- **W6**, **W7**: read `web/src/render/masthead.ts` and `web/src/style.css`; confirm in the observed DOM
  of E1 that the glyph carries `role="img"` and matching `aria-label`/`title`.
- **E1**–**E6**: covered by `make e2e` (E7); the reviewer reads the spec to confirm each assertion is
  what the criterion says, not a weaker one.

## Implementation Notes

**Boundary.** Everything Claude-Code-shaped stays in `internal/claudecode`: the record, parsing,
semver compare, classification, the range formatter, the status constants. `cmd/musterd` receives a
`VersionReport` and hands `internal/server` strings. `internal/server` never imports a status type; it
carries the word. The tool in `tools/versions` imports `internal/claudecode` for parsing,
`RangeOf`, `FormatRange` and `ClassifyAgainst`, and reads the record **from disk**, not the embedded
copy: `go run` compiled the tool before `bump` appended the row, so an embedded read would render the
pre-append range (`gen` after `bump` would otherwise be stale by exactly the version just recorded).

**Record file format.**
```
# Claude Code versions `make canary` has gone green on, one per line:
#   <major.minor.patch> <YYYY-MM-DD> <note>
# Floor and ceiling are this file's min and max. Appended by `go run ./tools/versions bump`
# after a green run outside the range (docs/claude-code-versions.md). Never edit a version elsewhere.
2.1.246 2026-08-29 m4-canary
2.1.267 2026-09-10 canary-full-coverage
```
Rows need not be sorted (append-only, one rule); duplicates are a parse error. The embedded copy is
parsed on each `Floor()`/`Verified()` call — a handful of lines, no package-level cache, no `init()`
(conventions §Go).

**Semver.** `versionRE` already captures the leading `\d+\.\d+\.\d+`; split, `strconv.Atoi`, compare
majors then minors then patches. A string that fails the regex is `unknown`. No dependency added.

**Startup log wording** (zerolog fields `installed`, `floor`, `verified`, `status` on all four):
- verified — Info `claude code version is within the verified range`
- above — Warn `claude code version is newer than any version Muster has been tested with; behaviour past the verified range is best-effort (run make canary to verify it)`
- below — Warn `claude code version is older than any version Muster has been tested with; behaviour is best-effort — update Claude Code`
- unknown — Warn `could not determine claude code version` with `Err` (existing).

**Canary `TestMain`.** Order: read `MUSTER_CANARY_OFFLINE`; if unset, call `InstalledVersion` once
(the harness's own `build()` calls it again — fine, it is ~150 ms), compute `skipDecision`, print
`canary: installed X equals the verified ceiling; skipping the harness and live tiers (set
MUSTER_CANARY_FORCE=1 to run them)` to stdout, store the reason in a package variable read by
`harness(t)`/`live(t)` after their offline check. An `InstalledVersion` error in `TestMain` is not
fatal there — leave it to `build()` so the failure message is the existing one. The static tier and
`TestInstalledVersionClassifies` never consult the skip.

**`bump` sequence.** offline? → print, exit 0. `InstalledVersion(ctx, "claude")` → error exits 1.
Read record from disk, `ClassifyAgainst` → verified → print `X is inside the verified range
(floor–ceiling); nothing to record`, exit 0. Otherwise `git status --porcelain -- <record>` → non-empty
→ print `refusing to record X: internal/claudecode/observed_versions.txt has uncommitted changes —
commit or revert them first`, exit 1. Append `X <today> make canary` (newline-terminated), run `gen`,
print `git diff --stat`, print the hint
`git commit -am "fix(versions): record Claude Code X as verified by make canary"` (a `fix` cuts a patch
release, so users on X stop seeing the warning; conventions §Commits). Nothing is committed.

**Fragments.** `range` → `FormatRange(RangeOf(rows))`; `floor`; `verified`; `table` → a markdown
table `| version | verified on | run |` sorted ascending, one row per record row. Inline fragments
(`range` in the README table cell and prose, the canary-fields H1, the doc's range line) are written
`<!-- versions:range -->2.1.246–2.1.267<!-- /versions:range -->` on one line; the `table` fragment
sits on its own lines. The regex is non-greedy and name-matched so nested or adjacent fragments cannot
swallow each other. `check` compares the rendered file bytes to the on-disk bytes.

**Doc rename.** `git mv docs/claude-code-pin.md docs/claude-code-versions.md` so history follows.
The rewrite keeps the "Current state of the canary" run table and the "Still manual" residuals from
the current text (they are accurate as of `canary-full-coverage`), replaces everything about the pin
with the range, the two rituals and the force convention, and keeps the `DISABLE_AUTOUPDATER` note as
the for-the-record freeze mechanism.

**Canary evidence for review.** Per the existing convention, one full run per review cycle:
`MUSTER_CANARY_FORCE=1 make canary 2>&1 | tee plans/version-claude-interface/canary-run.log`
(4 haiku turns). Additionally, and free, an unforced run to `canary-skip.log` — meaningful only
while the installed version equals the ceiling (Edge Case 21). Both run in the foreground of the
session that needs them, never backgrounded (CLAUDE.md).

**Doc upkeep** (orchestrator): `SPEC.md` §8 dependency-posture bullet → "detect and classify the
installed Claude Code against the canary-verified range; warn on both sides, never refuse, never
disable auto-update; a green canary extends the range automatically" + §11 entry; `TODO.md` ticks
listed under Affected Files; `docs/protocol.md` is merged by plan-work at approval.
