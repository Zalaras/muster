# Review: version-claude-interface

**Plan**: version-claude-interface
**Verdict**: approved

All three cycle-1 Majors and both Minors are fixed, verified against the diff and re-measured
where the fix made a claim about behaviour. No new issue of any severity is tagged to a
pipeline agent. Every authored check passes, the full 287-spec E2E suite is green, and all
four masthead states plus all four startup log lines were measured by hand against real
scratch daemons in a real browser — including the `hello` frame read straight off the wire.

This was a **full** re-review, not a §9 delta: cycle 1's open agent-tagged issues included
Majors, so the §3–§7 read and the §2a browser drive were both redone rather than waived.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 record is the one source of truth, embedded, Floor/Verified derived; pin constant/drift type/equality check removed | Yes | Yes | pass |
| REQ-2 `Classify` returns exactly the four statuses, leading-semver compare, suffix ignored | Yes | Yes | pass |
| REQ-3 `CheckVersion` never errors to the caller; four startup log lines; startup continues | Yes | Yes | pass |
| REQ-4 protocol 2 `hello.claudeCode` + issue snapshot follow; `pinned`/`drift` gone from wire, Go and TS | Yes | Yes | pass |
| REQ-5 masthead renders four states, glyph + hover text on both outside-range states, no dismiss | Yes | Yes | pass |
| REQ-6 `musterd -version` prints the range | Yes | Yes | pass |
| REQ-7 canary skips harness/live tiers on the ceiling; force runs everything; offline wins | Yes | Yes | pass |
| REQ-8 `bump` offline/inside-range/above/below/dirty-record behaviour | Yes | Yes | pass |
| REQ-9 `gen` rewrites every fragment; `check` names stale and markerless files; in `make check` | Yes | Yes | pass |
| REQ-10 pin doc `git mv`-ed and rewritten; every live reference repointed | Yes | n/a (doc) | pass — cycle-1 Major 1 fixed |
| REQ-11 canary-fields generated table + held-across-the-range sentence + `since`/`until` rows | Yes | n/a (doc) | pass |
| REQ-12 README "Claude Code versions" section, generated fragments, user-terms prose | Yes | n/a (doc) | pass |
| REQ-13 two stub `--version` knobs via env vars, shared stub bytes unchanged, `observedVersionRange()` | Yes | Yes | pass |
| REQ-14 design-system §5 names the readout and its glyph | Yes | n/a (doc) | pass |

## Build & Tests

E2E tests: pass (287 passed, 0 failed, 0 skipped, 1.3m — full suite, run first and alone)
Daemon tests: pass (all 14 packages with tests, `tools/versions` included)
Web tests: pass (1072 tests, 29 files)
Daemon build: pass (`go build ./...`)
Web build: pass (`tsc --noEmit && vite build`)
Lint: pass (`golangci-lint run` — 0 issues)
e2e-lint: pass (`e2e-lint: clean`)

## Acceptance Checks

Run via `.claude/skills/orchestrate/scripts/gates.sh version-claude-interface --checks-only`
— 14 lines, 0 failed.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `go vet -tags=canary ./test/canary/...` | pass |
| D5 | `go run ./tools/versions check` | pass |
| D6 | record has exactly two rows, `2.1.246 2026-08-29` and `2.1.267 2026-09-10` | pass |
| D10 | `make build && ./bin/musterd -version \| grep -q 'Claude Code verified '` | pass |
| D17 | `MUSTER_CANARY_OFFLINE=1 go test -tags=canary -run TestSkipDecision ./test/canary/...` | pass |
| D18 | `MUSTER_CANARY_OFFLINE=1 make canary` | pass |
| D19 | `docs/claude-code-versions.md` exists, `docs/claude-code-pin.md` gone | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W8 | `make contrast` | pass |
| E7 | `make e2e` | pass |
| DOC | orchestrator doc upkeep | pass — `TODO.md` all three ticks (`Version the Claude Code interface`, the post-v1 pin-strategy item folded in, `Version-pin warning is developer-facing` #6), `SPEC.md` §8 posture rewritten + §7 risk reworded + §11 entry, `docs/protocol.md` header/§3.12/§5.1/§9 all merged |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7 | `RangeOf`/`Floor`/`Verified` min-max over unsorted rows; parse rejects duplicate and malformed rows | pass | `TestRangeOf_MinMaxIndependentOfRowOrder` (ascending/descending/shuffled), `TestRangeOf_ComparesNumericallyNotLexically` (2.1.9 vs 2.1.267 — a lexical compare fails it), `TestRangeOf_SingleRow_FloorEqualsVerified`, `TestParseObservedVersions_RejectsDuplicateVersion`, `..._RejectsMalformedRow` (4 sub-cases) |
| D8 | `Classify` table: unknown (empty, garbage), below, verified (floor, ceiling, intermediate, suffixed), above | pass | `TestClassifyAgainst` — 11 rows against deliberately unsorted synthetic rows, every named case present; plus `TestClassifyAgainst_SingleRowRange_EqualIsVerifiedNeighboursAreNot` |
| D9 | INV-1/INV-2 across every `CheckVersion` outcome | pass | `TestCheckVersion` — 7 sub-tests (missing binary, non-zero exit, unparseable, below, floor, ceiling, above), each through `assertVersionReportInvariants`, which asserts INV-1 in both directions; stubs are real executables passed by path |
| D11 | `checkClaudeCode` maps each status and logs at the right level; below names the remedy | pass | `TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel` asserts `"level":"warn"`/`"info"` and the message substrings off a buffered zerolog; the fourth status is D12's test. Re-measured live: all four lines, exact wording, correct level |
| D12 | unknown outcome yields a serving-compatible info, no error | pass | `TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup`; also asserts `installed` is *absent* from the log rather than empty. Measured live: the unknown line carries `error`, `floor`, `verified`, `status` and no `installed` field at all |
| D13 | hello carries `protocolVersion` 2 and exactly the four keys, installed null iff unknown | pass | `TestHandleWS_ClaudeCodeKeySetExactAndInstalledNullIffUnknown` checks the key set against the **raw wire bytes**. Confirmed independently by reading a live `hello` off a real socket — see Manual Verification |
| D14 | issue snapshot has the same four keys; markdown cell renders per spec | pass | `TestClaudeCodeCell` (6 rows, both single-version-range branches), `TestBuildIssueSnapshot_*_KeySetExactly`. Measured live on an `above` daemon: cell renders `2.1.268 installed · verified 2.1.246–2.1.267 · above`, matching the Protocol Contract example exactly |
| D15 | `gen` fills every fragment in every file; `check` names a stale file; both fail on a markerless file | pass | `TestCmdGen_FillsEveryFragmentInEveryListedFile` (all four fragment names in three different shapes), `..._TableSortedAscendingRegardlessOfRecordOrder`, `TestCmdCheck_ExitsNonZeroNamingOnlyTheStaleFile` (two `NotContains` prove only the stale file is named), `TestCmdGenAndCheck_FailNamingAFileWithNoFragmentMarkerAtAll` |
| D16 | `bump` offline/inside-range/above/below/dirty/git-failure | pass | 7 tests. Offline and inside-range use `failingRunCmd`, which fatals if git is called at all; above/below assert the appended row, its newline terminator, the regenerated README fragment, the commit hint and the exact git argv sequence; dirty and git-failure both assert the record is byte-identical afterwards |
| D17 | `skipDecision` skips iff installed equals the ceiling with force and offline both unset | pass | `TestSkipDecision` — 7 rows covering both directions of the "iff", asserting an empty reason whenever it does not skip; `TestSkipDecision_ReasonNamesTheForceEnvVar` |
| D27 | `FormatRange` renders `a–b` and `a` when equal | pass | `TestFormatRange`, both rows |
| D20 | new doc carries green ritual, red ritual, force convention, inferred-versions note, three residual probes | pass | read `docs/claude-code-versions.md` in full: all five present; the three residuals are plan-mode step 3, `agent_id` on subagent hooks, the `fable` alias. The review-evidence paragraph now names the **forced** command (cycle-1 Minor 1) |
| D21 | README Requirements row and section are fragments and read in user terms | pass | both the table row and the prose carry inline `versions:range` fragments; the prose says auto-update stays on and what below/above mean for the reader, and links the new doc |
| D22 | canary-fields generated header table, held-across-the-range sentence, `since`/`until` annotations | pass | `versions:table` fragment renders both rows; the one-sentence statement is directly under it; `since`/`until` on the subagent, `--name` title and `permission_suggestions` rows |
| D23 | `cmd/musterd`/`internal/server` consume only strings and the status word; no version literal in non-test Go outside the record | pass | `ClaudeCodeInfo.Status` is a plain `string`; `internal/server` never names `VersionStatus`. Grep for a quoted `N.N.N` in non-test Go hits only two doc comments in `internal/claudecode/version.go` and pre-existing fixture data in `internal/claudecode/claudecodetest/` — both inside the boundary, neither functional |
| D24 | startup launches no process beyond `claude --version` | pass | `checkClaudeCode` → `CheckVersion` → one `exec.CommandContext`; nothing else added to `run()` |
| D25 | every live reference to the old doc path repointed; SPEC §11/TODO/next-steps history left as written | pass | cycle-1 Major 1 fixed: `internal/claudecode/launch.go:23` and `:54` now name `docs/claude-code-versions.md` and describe the range rather than "the pin"/"the pinned build". Repo-wide grep for `claude-code-pin` outside `plans/` now hits only `TODO.md`, `SPEC.md` and `next-steps.md` history, correctly left as written |
| D26 | the two review-cycle canary logs show the intended shapes | pass | see Manual Verification |
| W3 | protocol tests accept each status, reject missing floor/verified, unknown status, non-string non-null installed; `PROTOCOL_VERSION` is 2 | pass | accepts below/verified/above, unknown+null, and the defensive non-unknown+null; rejects missing/non-string floor and verified, the status string `"drifted"`, a missing status and a non-string non-null installed; `isSupportedProtocolVersion` now rejects `[0, 1, 3, -1, 1.5]` — the added `1` is the discriminating guard for the bump |
| W4 | a hello whose `protocolVersion` is not 2 routes to `onProtocolMismatch` | pass | `web/src/ws.test.ts:133` uses 3, asserts `onProtocolMismatch` called with 3 and `onHello` not called |
| W5 | masthead tests cover all six DOM-table rows with exact text and warning | pass | `describeClaudeVersion` block covers all six with `toEqual` on the whole `{text, warning}` object; row 5 pins the em dash U+2014; row 6 loops all three non-unknown statuses. A second block pins node count/order, `className`, `role`, `aria-label === title`, and a warning→no-warning transition |
| W6 | no `any` in new web code; readout built with `replaceChildren`/`createElement` | pass | every `any` in the six changed web files is the English word inside a comment or test name; `renderClaudeVersion` uses `replaceChildren` + `createTextNode`/`createElement`, no `innerHTML` anywhere |
| W7 | glyph has `role="img"`, `aria-label` == `title`, no colour of its own, no control in the readout | pass | measured in the live DOM — see Manual Verification |
| E1–E6 | each spec assertion is what the criterion says | pass | read `web/e2e/claude-version.spec.ts`: every boundary is computed from `observedVersionRange()` off the real record, never a hardcoded literal; E2 asserts exact text plus zero `role=img` children; E3 additionally asserts the accessible name does *not* contain "update"; E5 asserts the exact sorted key set |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the record, parsing, semver compare, classification, range formatter and status constants all live in `internal/claudecode`. Three files gained the import: `internal/server/issue.go` (for `FormatRange` over two opaque version strings), `tools/versions/main.go` (the tool's whole job) and `cmd/musterd/main_test.go`. `Status` crosses into `internal/server` as a plain `string`; that package never names `VersionStatus` |
| 2 | No terminal-output state parsing | pass — no `capture-pane` and no ANSI parsing anywhere in the branch diff |
| 3 | No blocking hook handler | pass — no hook path touched; no hook timeout changed |
| 4 | tmux always via a dedicated socket; no `resize-pane` | pass — no tmux invocation added; `resize-pane` appears nowhere in the diff. My own browser drive used four private sockets and tore them all down |
| 5 | No payload logging | pass — the four startup log lines carry only version strings and the status word, confirmed by reading the real log output of all four states |
| 6 | No empty-gauge dishonesty | pass — measured: an unresolvable install renders the words `Claude installation unknown` as a single text node, never a version, an empty readout, a `0%` or a guessed value |
| 7 | Session identity on the tmux target | pass — not applicable; no rule keyed on `session_id` added |
| 8 | No settings trespass | pass — the only `~/.claude/settings.json` mentions in the diff are documentation prose (the `DISABLE_AUTOUPDATER` for-the-record note carried over from the pin doc). No code reads or writes it; no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — cycle-1 Major 2 fixed at the root: `cmdBump` now takes `claudeBin` and the only `$PATH` shims left in the tree are `cmd/musterd/preflight_test.go:116` and `:141`, both pointing at an empty dir to prove absence, forking nothing. Every stub is a real script passed by absolute path |

## Manual Verification

**Canary logs (D26).** I judged the two committed cycle-1 logs sufficient rather than
burning four more haiku turns. The only change to `internal/claudecode/` or `test/canary/`
since they were produced is two **comment** lines in `launch.go` (measured:
`git diff d1a3c1b..HEAD -- internal/claudecode/ test/canary/ Makefile` is exactly those two
hunks, both comment text). Comments cannot move the canary's behaviour, so a fresh forced
run would produce the same log for a known reason. Read both in full:

- `canary-run.log` — `MUSTER_CANARY_FORCE=1 make canary`, green in 140.4s. Every tier ran
  (harness runs A/B/C×4/D/E, static, live), and it ends with `bump`'s message
  `versions: 2.1.267 is inside the verified range (2.1.246–2.1.267); nothing to record`.
- `canary-skip.log` — unforced, green in 0.614s. Line 2 is the `TestMain` skip print;
  every harness and live test is SKIP carrying that reason; `TestInstalledVersionClassifies`,
  both `TestSkipDecision*` and `TestInstalledBinaryCarriesInterfaceStrings` are PASS;
  `bump` prints the same inside-range message.

Edge Case 21 did not fire — the installed version equals the ceiling, so no row was
appended and the record is untouched.

**Browser (all four states, four real daemons, real browser).** Built `musterd`, then ran
four scratch daemons on ports 18901–18904, each with its own data dir and its own private
tmux socket, pointing `-claude-bin` at a purpose-built stub for three of them.

1. **below** — stub answering `2.0.0 (Claude Code)`. Startup logged
   `WRN claude code version is older than any version Muster has been tested with;
   behaviour is best-effort — update Claude Code` with `floor=2.1.246 installed=2.0.0
   status=below verified=2.1.267`, and the daemon served normally (INV-3 by measurement).
   Observed DOM: `#claude-version` textContent is `claude 2.0.0 ⚠`, exactly two child nodes
   (`#text`, `SPAN`). **W7 measured**: the glyph's `role` is `img`, `aria-label === title`
   is true for the full em-dash sentence, its computed colour is `rgb(178, 182, 195)` —
   byte-identical to the readout's own computed colour, so it carries no colour of its own
   — `margin-left` is `4px`, and the readout's `font-variant-numeric` is `tabular-nums`.
   Zero `button`, `a`, `input` or `[role=button]` inside the readout.
2. **above** — stub answering `2.1.268 (Claude Code)`. Startup logged
   `WRN claude code version is newer than any version Muster has been tested with;
   behaviour past the verified range is best-effort (run make canary to verify it)`.
   Readout `claude 2.1.268 ⚠`; the glyph's name and title are the short sentence and do
   **not** contain "update". `POST /api/issue/captures` returned 201 with
   `claudeCode: {installed: "2.1.268", floor: "2.1.246", verified: "2.1.267", status:
   "above"}` — key set exactly the four — and the rendered markdown row
   `| Claude Code | 2.1.268 installed · verified 2.1.246–2.1.267 · above |`.
3. **unknown** — stub exiting 1 on `--version`. Startup logged
   `WRN could not determine claude code version` with
   `error="running claude --version: exit status 1"`, `floor`, `verified`, `status=unknown`
   and **no `installed` field at all**. The connection status reached `connected` (INV-3
   again, functionally). Readout is exactly `Claude installation unknown`, one text node,
   zero glyphs.
4. **verified** — the real installed `claude` (2.1.267), `--version` only, never launched.
   Startup logged `INF claude code version is within the verified range`, `status=verified`.
   Readout `claude 2.1.267`, one text node, no glyph, no controls. I also opened a
   WebSocket from the page and read the `hello` frame directly:
   `protocolVersion: 2`, top-level keys `[type, protocolVersion, daemon, claudeCode]`, and
   `claudeCode` keys in wire order `[installed, floor, verified, status]` — the wire measured,
   not inferred from the render.

`musterd -version` printed `musterd v0.4.0-66-g4dac86a (Claude Code verified 2.1.246–2.1.267)`
(D10 by hand as well as by gate). The one console error on every load is the pre-existing
`favicon.ico` 404. All four daemons and all four tmux sockets were torn down afterwards;
`pgrep` confirms no orphan `musterd` and no orphan stub, and `git status` is clean — the
drive edited nothing.

**Repairs table.** `test-specs.md`'s `### Repairs` says "None. No test needed a locator,
regex, wait, or fixture-value change. No assertion was deleted, skipped, or weakened." I
verified this independently rather than taking it: the branch diff under `web/` contains no
added `test.skip`, `test.fixme`, `test.fail` or `.only`, no assertion was replaced by a
container-level `toBeVisible()`, and every E2E boundary value is computed from the real
record via `observedVersionRange()` rather than synthesized. `make e2e-lint` was re-run and
prints `e2e-lint: clean`.

## Cycle 1 Fixes (full re-review; §9 delta not applicable)

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 Major 1 `[daemon-impl]` "a live Go comment still points at the deleted doc path — `launch.go:54`" | `6e1df27` | diff read; both `:23` and `:54` now name `docs/claude-code-versions.md` and describe the verified range rather than "the pin". Repo-wide grep for `claude-code-pin` outside `plans/` returns only the three history files D25 exempts |
| cycle 1 Major 2 `[daemon-impl]` "`cmdBump` gives no seam for the `claude` binary, so tests can only use a `$PATH` shim" | `6e1df27` | diff read; `cmdBump` takes a 5th `claudeBin string` parameter, `run()`'s `"bump"` case supplies the `"claude"` default, and the doc comment cites the conventions rule. `go build`/`make lint` green |
| cycle 1 Major 3 `[daemon-tests]` "drop `stubClaudeOnPath`, pass the fake version through the new parameter in all six tests" | `5f47bc9` | diff read; `stubClaudeOnPath` is gone, replaced by `writeClaudeVersionStub` returning an absolute path, threaded through all seven `TestCmdBump_*` calls. Assertions unchanged, as the Major asked. Tree-wide grep confirms no `t.Setenv("PATH", …)` survives outside preflight's two empty-dir sites |
| cycle 1 Minor 1 `[daemon-impl]` "the doc's review-evidence paragraph names the *unforced* canary command" | `6e1df27` | diff read; the paragraph now reads `MUSTER_CANARY_FORCE=1 make canary 2>&1 \| tee plans/<plan-name>/canary-run.log`, says "full, forced", and keeps the four-haiku-turns cost note attached |
| cycle 1 Minor 2 `[orchestrator]` "three dead pin-doc pointers outside D25's set" | `10ff535` | diff read; `.claude/skills/interface-probe/SKILL.md`, `spikes/S6-scroll-bandwidth.md` and `spikes/FINDINGS.md` all now point at `docs/claude-code-versions.md` |

The cycle-2 diff touches nothing beyond what these five fixes needed: `launch.go` (two
comments), `tools/versions/main.go` (the seam), `tools/versions/main_test.go` (the seam's
callers), `docs/claude-code-versions.md` (one paragraph), and the three doc pointers.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The masthead readout is a **startup snapshot**. If Claude Code auto-updates
   while `musterd` is running, the readout keeps showing the version measured at startup,
   with no staleness marker, until a daemon restart — and a version that crossed the ceiling
   mid-session shows no warning glyph until then. This is exactly what the plan specifies
   (REQ-5, Edge Case 16: re-render happens on the reconnect's `hello`), so it is a settled
   design choice rather than a defect, but it is the one honesty-adjacent residual in the
   feature and worth remembering if a "recheck the version periodically" item ever lands.
2. **[note]** Two semver comparators now live in the tree: `compareSemver` in
   `internal/claudecode/version.go` (numeric, via `strconv.Atoi`) and `versionLess` in
   `tools/versions/main.go` (digit strings compared length-then-lexically). They diverge
   only on a leading-zero component, which would make `renderTable`'s sort disagree with
   `RangeOf`'s. I confirmed that is unreachable in practice: `bump` only ever writes what
   `versionRE` matched out of real `claude --version` output, and both existing rows are
   zero-free. Recorded so a future change to either one knows about the other. Carried
   forward from cycle 1; no change requested.
3. **[note]** `CheckVersion` parses the embedded record twice per call — once via
   `RangeOf(ObservedVersions())` and again inside `ClassifyAgainst(installed,
   ObservedVersions())`. Harmless on a startup-only path over a handful of lines, and the
   plan explicitly chose per-call parsing over a package-level cache. Carried forward from
   cycle 1; no change requested.
4. **[note]** The unforced canary now completes in 0.6s against 140.4s forced. That is the
   feature working as designed, but it means a change confined to `internal/claudecode`
   gets no live coverage from a routine `make canary` on an unchanged install. The new doc
   says so plainly and names the force flag; worth remembering the next time a
   canary-adjacent change is reviewed. Carried forward from cycle 1.
5. **[note]** Two small coverage observations, neither a gap in what is verified overall.
   The masthead unit test's fake `createElement` ignores its tag-name argument
   (`web/src/render/masthead.test.ts:339`), so "no control lives in the readout" is proved
   by E6 in the real DOM rather than by the unit test — and E6 does prove it. And D9's own
   case list omits the `--version` timeout path; that path is structurally the same branch
   as its three error cases (any `InstalledVersion` error → `unknown` with nil `Installed`),
   and the 2 s `WaitDelay` bound itself is covered a layer down by
   `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup`.
6. **[note]** `README.md`'s documents table still describes `spikes/FINDINGS.md` as
   "measured against Claude Code 2.1.233 (addenda through 2.1.246)", while that file now
   carries addenda citing 2.1.251 and 2.1.259. This predates the plan, sits outside REQ-12's
   scope, and says nothing false about behaviour this plan shipped — but it is a Claude Code
   version claim in the README that the range work did not sweep, so it is the natural
   companion to a future FINDINGS refresh rather than something to fix here.
