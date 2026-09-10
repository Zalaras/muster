# Review: version-claude-interface

**Plan**: version-claude-interface
**Verdict**: needs-changes

Two Major issues and one Minor, all tagged to pipeline agents, all small. Every authored
check passes, the full E2E suite is green, both canary logs match D26's intended shapes,
and all four masthead states were verified by hand in a real browser against a real
daemon. Nothing structural is wrong: the record → classification → wire → readout chain is
built exactly as the Protocol Contract specifies, and the adapter boundary holds.

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
| REQ-10 pin doc `git mv`-ed and rewritten; every live reference repointed | Yes | n/a (doc) | **FAIL** — one live Go comment still names the old path (Major 1) |
| REQ-11 canary-fields generated table + held-across-the-range sentence + `since`/`until` rows | Yes | n/a (doc) | pass |
| REQ-12 README "Claude Code versions" section, generated fragments, user-terms prose | Yes | n/a (doc) | pass |
| REQ-13 two stub `--version` knobs via env vars, shared stub bytes unchanged, `observedVersionRange()` | Yes | Yes | pass |
| REQ-14 design-system §5 names the readout and its glyph | Yes | n/a (doc) | pass |

## Build & Tests

E2E tests: pass (287 passed, 0 failed, 0 skipped, 26 files, 1.2m)
Daemon tests: pass (all packages, including the new `tools/versions`)
Web tests: pass (1072 tests, 29 files)
Daemon build: pass (`go build ./...`, `tools/versions` included)
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
| DOC | orchestrator doc upkeep (`TODO.md` × 3 ticks, `SPEC.md` §8 + §11, `docs/protocol.md` §1/§3.12/§5.1) | pass |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7 | `RangeOf`/`Floor`/`Verified` min-max over unsorted rows; parse rejects duplicate and malformed rows | pass | `TestRangeOf_MinMaxIndependentOfRowOrder` (ascending/descending/shuffled), `TestRangeOf_ComparesNumericallyNotLexically` (2.1.9 vs 2.1.267 — a lexical compare would fail it), `TestParseObservedVersions_RejectsDuplicateVersion`, `..._RejectsMalformedRow` (4 sub-cases) |
| D8 | `Classify` table: unknown (empty, garbage), below, verified (floor, ceiling, intermediate, suffixed), above | pass | `TestClassifyAgainst` — 11 rows against deliberately unsorted synthetic rows; plus the single-row-range boundary test |
| D9 | INV-1/INV-2 across every `CheckVersion` outcome | pass | `TestCheckVersion` — 7 cases (missing binary, non-zero exit, unparseable, below, floor, ceiling, above), each through `assertVersionReportInvariants`; stubs are real executables passed by path, no `$PATH` shim |
| D11 | `checkClaudeCode` maps each status and logs at the right level; below names the remedy | pass | `TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel` asserts `"level":"warn"`/`"info"` and the message substrings off a buffered zerolog; the fourth status (unknown) is D12's test |
| D12 | unknown outcome yields a serving-compatible info, no error | pass | `TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup`; also asserts `installed` is *absent* from the log rather than an empty string |
| D13 | hello carries `protocolVersion` 2 and exactly the four keys, installed null iff unknown | pass | `TestHandleWS_ClaudeCodeKeySetExactAndInstalledNullIffUnknown` — four statuses, key set checked against the **raw wire bytes** via `map[string]any`, so a stray key would fail |
| D14 | issue snapshot has the same four keys; markdown cell renders per spec | pass | `TestClaudeCodeCell` — 6 rows including both single-version-range branches; `TestBuildIssueSnapshot_*_KeySetExactly` pins the JSON paths |
| D15 | `gen` fills every fragment in every file; `check` names a stale file; both fail on a markerless file | pass | `TestCmdGen_FillsEveryFragmentInEveryListedFile`, `..._TableSortedAscendingRegardlessOfRecordOrder`, `TestCmdCheck_ExitsNonZeroNamingOnlyTheStaleFile`, `TestCmdGenAndCheck_FailNamingAFileWithNoFragmentMarkerAtAll`; the fixture root deliberately uses three different fragment shapes (inline range, floor/verified pair, own-lines table) |
| D16 | `bump` offline/inside-range/above/below/dirty/git-failure | pass | 7 tests; offline and inside-range use `failingRunCmd` so an unexpected git call fails the test outright; above/below assert the appended row, the newline terminator, the regenerated README fragment and the exact git argv sequence |
| D17 | `skipDecision` skips iff installed equals the ceiling with force and offline both unset | pass | `TestSkipDecision` — 7 rows including force+offline together; `TestSkipDecision_ReasonNamesTheForceEnvVar` |
| D27 | `FormatRange` renders `a–b` and `a` when equal | pass | `TestFormatRange`, both rows |
| D20 | new doc carries green ritual, red ritual, force convention, inferred-versions note, three residual probes | pass | read `docs/claude-code-versions.md` in full: all five sections present; the three residuals are plan-mode step 3, `agent_id` on subagent hooks, the `fable` alias |
| D21 | README Requirements row and section are fragments and read in user terms | pass | table row and prose both carry inline `versions:range` fragments; prose states auto-update stays on and what below/above mean for the reader |
| D22 | canary-fields generated header table, held-across-the-range sentence, `since`/`until` annotations | pass | `versions:table` fragment in place; `session_title`/`session_name` marked `since 2.1.267 asserted`; footnote ³ marks the subagent/background-task set `since 2.1.259`; the `permission_suggestions` footnote reworded to "observed absent on 2.1.267" |
| D23 | `cmd/musterd`/`internal/server` consume only strings and the status word; no version literal in non-test Go outside the record | pass | `ClaudeCodeInfo.Status` is a plain `string`; `internal/server` never names `VersionStatus`. Grep for `\d+\.\d+\.\d+` in non-test Go hits only measurement comments inside `internal/claudecode` (pre-existing) — no functional literal |
| D24 | startup launches no process beyond `claude --version` | pass | `checkClaudeCode` → `CheckVersion` → one `exec.CommandContext`; nothing else added to `run()` |
| D25 | every live reference to the old doc path repointed; SPEC §11/TODO/next-steps history left as written | **FAIL** | `internal/claudecode/launch.go:54` still reads "docs/claude-code-pin.md" (Major 1). CLAUDE.md, README, canary-fields, the canary package doc and the Makefile help are all correctly repointed; SPEC.md:881, TODO.md and next-steps.md history correctly left alone |
| D26 | the two review-cycle canary logs show the intended shapes | pass | see Manual Verification |
| W3 | protocol tests accept each status, reject missing floor/verified, unknown status, non-string non-null installed; `PROTOCOL_VERSION` is 2 | pass | 11 hello cases in `web/src/protocol.test.ts`, including the missing-key variants built by destructuring the valid fixture |
| W4 | a hello whose `protocolVersion` is not 2 routes to `onProtocolMismatch` | pass | `web/src/ws.test.ts` now uses 3 as the bad version; `isSupportedProtocolVersion` rejects `[0, 1, 3, -1, 1.5]` |
| W5 | masthead tests cover all six DOM-table rows with exact text and warning | pass | `describeClaudeVersion` describe block covers all six (row 6 loops all three non-unknown statuses); a second block pins node count/order and the glyph attributes, plus a warning→no-warning transition |
| W6 | no `any` in new web code; readout built with `replaceChildren`/`createElement` | pass | no `any` in `protocol.ts`, `masthead.ts` or the new spec/tests; `renderClaudeVersion` uses `replaceChildren` + `createTextNode`/`createElement`, no `innerHTML` |
| W7 | glyph has `role="img"`, `aria-label` == `title`, no colour of its own, no control in the readout | pass | verified in the live DOM — see Manual Verification |
| E1–E6 | each spec assertion is what the criterion says | pass | read `web/e2e/claude-version.spec.ts`: every boundary is computed from `observedVersionRange()` off the real record, never a hardcoded literal; E2 asserts exact text plus zero `role=img` children; E3 additionally asserts the name does *not* contain "update"; E5 asserts the exact sorted key set |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — record, parsing, semver compare, classification and status constants all live in `internal/claudecode`. `internal/server/issue.go`'s new import is for `FormatRange` over two opaque version strings; the package was already imported by `server.go`, `ws.go`, `ingest.go`, `state.go` and others, and `Status` crosses as a plain `string` |
| 2 | No terminal-output state parsing | pass — no `capture-pane`, no pane text read anywhere in the diff |
| 3 | No blocking hook handler | pass — no hook path touched |
| 4 | tmux always via a dedicated socket; no `resize-pane` | pass — no tmux invocation added; `resize-pane` appears nowhere in the diff |
| 5 | No payload logging | pass — the four startup log lines carry only version strings and the status word |
| 6 | No empty-gauge dishonesty | pass — verified in the browser: an unresolvable install renders the words "Claude installation unknown", never a version, an empty readout or a guessed value |
| 7 | Session identity on the tmux target | pass — not applicable; no rule keyed on `session_id` added |
| 8 | No settings trespass | pass — the only `~/.claude/settings.json` mentions in the diff are documentation prose (the `DISABLE_AUTOUPDATER` for-the-record note, carried over from the pin doc); no code reads or writes it, and no `CLAUDE_CONFIG_DIR` use |
| 9 | No real `claude` outside canary/probes | pass — every unit-test stub is a fake script (`writeVersionStub`, `writeCheckClaudeCodeStub`, `stubClaudeOnPath`, the E2E shared stub). See Major 2 for the fragility the `$PATH` shim leaves behind |

## Manual Verification

**Canary logs (D26).** Both run in the foreground, installed Claude Code 2.1.267.

- `plans/version-claude-interface/canary-run.log` — `MUSTER_CANARY_FORCE=1 make canary`,
  green in 140s. Every tier ran: the harness runs A/B/C×4/D/E, the static tier, the live
  tier (Keychain, usage API, theme config), and `TestSkipDecision`. It ends with `bump`'s
  message `versions: 2.1.267 is inside the verified range (2.1.246–2.1.267); nothing to
  record`.
- `plans/version-claude-interface/canary-skip.log` — unforced `make canary`, green in
  0.6s. Line 2 is the `TestMain` skip print. Every harness and live test is SKIP with that
  reason; `TestInstalledVersionClassifies`, `TestSkipDecision`,
  `TestSkipDecision_ReasonNamesTheForceEnvVar` and
  `TestInstalledBinaryCarriesInterfaceStrings` are PASS; `bump` prints the same
  inside-range message.

Edge Case 21 did not fire: the installed version equals the ceiling, so no row was
appended and `git status` after both runs shows only the two new log files. Nothing in the
tree was edited by either run.

**Browser (all four masthead states, real daemon, real browser).** Built `musterd`, then
ran it three times against a scratch data dir on port 18899 with a private tmux socket,
pointing `-claude-bin` at a stub for the first two.

1. Stub answering `2.0.0 (Claude Code)` — startup logged `WRN claude code version is older
   than any version Muster has been tested with; behaviour is best-effort — update Claude
   Code` with `floor=2.1.246 installed=2.0.0 status=below verified=2.1.267`, and the daemon
   served normally (INV-3 by measurement, not by inference). Observed DOM:
   `#claude-version` textContent is `claude 2.0.0 ⚠`, exactly two child nodes (`#text`,
   `SPAN`), and the glyph is
   `<span class="version-warn" role="img" aria-label="This Claude Code version has not been
   tested with Muster — please update Claude Code" title="…same string…">⚠</span>`.
   `aria-label === title` is true. **W7 measured:** the glyph's computed colour is
   `rgb(178, 182, 195)`, byte-identical to the readout's own computed colour (`--fg-muted`)
   — it carries no colour of its own. `margin-left` is `4px`. Zero `button`, `a` or `input`
   elements inside the readout.
2. Stub exiting 1 on `--version` — startup logged `WRN could not determine claude code
   version` with the error, `floor`, `verified`, `status=unknown` and **no `installed`
   field at all**. The readout reads exactly `Claude installation unknown`, one child node,
   no glyph.
3. The real installed `claude` (2.1.267) — startup logged `INF claude code version is
   within the verified range`, `status=verified`. The readout reads `claude 2.1.267` with
   no glyph. `POST /api/issue/captures` from the page returned
   `claudeCode: {installed: "2.1.267", floor: "2.1.246", verified: "2.1.267", status:
   "verified"}` — key set exactly the four — and the rendered markdown cell
   `| Claude Code | 2.1.267 installed · verified 2.1.246–2.1.267 · verified |`.

The one console error on load is a pre-existing `favicon.ico` 404, unrelated to this plan.
The scratch daemon and its tmux socket were torn down afterwards.

**Repairs table.** `test-specs.md`'s `### Repairs` says "None. No test needed a locator,
regex, wait, or fixture-value change. No assertion was deleted, skipped, or weakened." I
verified this independently: the branch diff under `web/` contains no `test.skip`,
`test.fixme` or `.only`, no assertion was replaced by a container-level `toBeVisible()`,
and the E2E fixture values are computed from the real record rather than synthesized. The
E2E Validate step's own claim of a first-run pass is consistent with what I observed —
`claude-version.spec.ts`'s six tests were green inside my full sweep.

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** D25 does not hold: a live Go comment still points at the deleted doc
   path — `internal/claudecode/launch.go:54` reads "which is *ahead* of the 2.1.246 pin in
   docs/claude-code-pin.md, so these numbers want re-confirming against the pinned build".
   That file no longer exists, so the pointer is dead, and "the pin" / "the pinned build"
   name a concept this plan removed. `internal/claudecode/launch.go:23` has the same stale
   wording ("`manual` may not exist on the 2.1.246 pin") without a path. D25 enumerates Go
   comments explicitly, and `daemon-implementation.md` claims "remaining live references to
   the old doc path updated", so this is a missed site rather than a scoping decision. Fix:
   repoint line 54 at `docs/claude-code-versions.md` and re-word both comments off "the
   pin" onto the verified range or ceiling. Nothing else in the enumerated set is stale —
   `CLAUDE.md`, `README.md`, `spikes/canary-fields.md`, the canary package doc and the
   Makefile help are all correct.

2. **[daemon-impl]** `tools/versions` gives `cmdBump` no seam for the `claude` binary, so
   its tests can only control it through a `$PATH` shim — which `docs/conventions.md`
   §Testing forbids in as many words: "Go tests cross a process boundary through an
   injectable run func on the type that owns it …, never a `$PATH` shim — a fork per test
   is what made `make test` load-sensitive." `tools/versions/main.go:297` hard-codes
   `claudecode.InstalledVersion(ctx, "claude")`, and `tools/versions/main_test.go:72`'s
   `stubClaudeOnPath` calls `t.Setenv("PATH", dir)` and plants a shell script, used by six
   tests. (The two existing `t.Setenv("PATH", …)` sites in `cmd/musterd/preflight_test.go`
   are not precedent: they point PATH at an *empty* dir to prove absence, forking nothing.)
   Beyond the convention, the shim makes the real binary the *default* resolution — a
   future bump test that forgets the helper would silently invoke the installed `claude`,
   which is hard rule 9's blast radius even though `--version` costs no tokens. Fix: take
   the binary name (or a version-getter func) as a parameter on `cmdBump`, the way `runFunc`
   is already threaded for the git calls, and default it to `"claude"` at the `run()`
   dispatch. This does not deviate from the plan, which specifies the call but not the
   seam.

3. **[daemon-tests]** Once Major 2's seam exists, drop `stubClaudeOnPath` and pass the fake
   version through the new parameter in all six `TestCmdBump_*` tests
   (`tools/versions/main_test.go:65-77, 178, 194, 234, 262, 284, 305`). The assertions
   themselves are good and should not change — only how the installed version is supplied.
   This is blocked on Major 2 landing first.

### Minor

1. **[daemon-impl]** `docs/claude-code-versions.md`'s closing paragraph tells a plan
   reviewer to capture canary evidence with `make canary 2>&1 | tee
   plans/<plan-name>/canary-run.log` — the *unforced* command, which on an unchanged
   install now skips the harness and live tiers and produces a log with no canary evidence
   in it. That contradicts the force-flag convention the same doc states two sections
   earlier ("Force a full run anyway … the convention for a plan review that needs canary
   evidence") and this plan's own D26. Fix: name `MUSTER_CANARY_FORCE=1 make canary 2>&1 |
   tee plans/<plan-name>/canary-run.log` in that paragraph, and keep the "four haiku turns"
   cost note attached to it.

2. **[orchestrator]** Three live references to the deleted `docs/claude-code-pin.md` sit
   outside D25's enumerated set, in files no impl agent owns:
   `.claude/skills/interface-probe/SKILL.md:15` ("on a version bump, re-verify per that
   doc"), `spikes/S6-scroll-bandwidth.md:20` ("read before citing these numbers") and
   `spikes/FINDINGS.md:583` ("adopt via `docs/claude-code-pin.md`"). Each is now a dead
   pointer. Repointing them at `docs/claude-code-versions.md` is doc upkeep, not a code
   change; it does not block approval. Historical mentions in `SPEC.md` §11, `TODO.md` and
   `next-steps.md` are correctly left as written per D25 and need no action.

### Notes

1. **[note]** `CheckVersion` parses the embedded record twice per call — once through
   `RangeOf(ObservedVersions())` and again inside `ClassifyAgainst(installed,
   ObservedVersions())`. Harmless on a startup-only path over a handful of lines, and the
   plan explicitly chose per-call parsing over a package-level cache. No change requested.

2. **[note]** There are now two semver comparators in the tree: `compareSemver` in
   `internal/claudecode/version.go` and `versionLess` in `tools/versions/main.go`, the
   latter comparing digit strings by length-then-lexical rather than numerically. It is
   correct for every string `ParseObservedVersions` accepts (leading zeros would be the only
   divergence, and the parser's own rows never carry them) and the code says why it exists.
   Recorded so a future change to either one knows about the other. No change requested.

3. **[note]** The unforced canary now completes in 0.6s against 140s forced. That is the
   feature working, but it means a change confined to `internal/claudecode` gets no live
   coverage from a routine `make canary` on an unchanged install. The new doc says so
   plainly and names the force flag; worth remembering the next time a canary-adjacent
   change is reviewed.
