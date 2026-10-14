# Correctness review: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 62171 words (budget 30000)

This is a delta cycle. Cycle 2 had no Minor and no agent-tagged issue from any part. Its only open
item was correctness Critical 1 `[orchestrator]`: the K1 / kb-check gate line was red because two
fact records claimed `verified` up to 2.1.300, above the 2.1.296 ceiling. That line is now green.

What changed since `a30c6b18` (review_commits[2]):
- **The branch's own commits.** a1ff4364, 9fd9eca6 and 108366d9 touch only
  `plans/rail-card-organise/` (state, the plan's `**Status**`, `proposed-backlog.md`).
- **The merge 68ba0f51.** It brings in main's landed fix b7aab8fb (model-catalog-sentence).

I checked the merge's resolution, not just its commit message. Every non-plan file the merge
touched matches b7aab8fb byte for byte (`git diff --quiet b7aab8fb HEAD`), except eight that both
sides edit: `.claude/rules/{actions,usage}.md`, `docs/INDEX.md`,
`docs/features/{actions,lifecycle,usage}/INDEX.md`, `docs/protocol.md` and
`internal/claudecode/CLAUDE.md`. For those eight, the `+`/`-` lines of `git diff a30c6b18 HEAD` are
identical to those of `git diff b7aab8fb^ b7aab8fb`. So the merge adds exactly main's change and
nothing else. No file under `web/src/` changed. The only `internal/`, `cmd/` or test change is that
reviewed fix (`modelcheck.go`, `modelcheck_test.go`, `observed_versions.txt`,
`test/canary/static_test.go`), so the §3–§6 re-read is skipped. Cycle 2's Requirements, Reviewer-Verified and
hard-rule results stand. The one row whose evidence changed is REQ-33, which has now run against
the real binary.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-32 | Yes (unchanged since cycle 2: no `web/src/`, `internal/session`, `internal/server`, `internal/store` or `internal/claudecode/status.go` change since `a30c6b18`) | as cycle 2; `05-web-test` 2622 passed, `02-test` 24 `ok` / 0 `FAIL`, `17-e2e` 840 passed | pass |
| REQ-33 | Yes. `TestPromptCacheExpiryIsStopPlusTTL` | **Now run.** The forced canary on this branch (`MUSTER_CANARY_FORCE=1 make canary`, pinned `/Users/damian/.local/share/claude/versions/2.1.300`) gives `--- PASS: TestPromptCacheExpiryIsStopPlusTTL` with `canary_test.go:482: prompt_cache ttl 5m0s, expires_at 4m56s after Stop`, and the whole package passes (`ok … test/canary 575.088s`). In cycle 2 the test was compiled but not run | pass |
| DIAG | Cycle 2's check stands: `kb:diagram/domain-model`, `store-schema`, `web-components`, `daemon-components`. The only code since then is main's `modelcheck.go` fix, which is outside this plan's diagrams and was reviewed on main | — | pass |

## Build & Tests

E2E tests: pass (840 passed, `17-e2e.log`) · Daemon tests (race): pass (24 packages `ok`, 0 `FAIL`, `02-test.log`) · Web tests: pass (2622 passed, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`, only the chunk-size advisory) · Lint: pass (golangci `0 issues.`; biome `No fixes applied`) — all read from $GATES_LOG_DIR (`gates-rail-card-organise-c3`)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass |
| test | `make test-race` | pass |
| lint | `make lint` | pass (`0 issues.`) |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2622) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (instrument/dark/light: 46 pairs, 0 failures) |
| features-inventory | (baseline) | pass (empty log) |
| versions | `make check-versions` | pass (`all fragments fresh`) |
| e2e-honest | (baseline) | pass (empty log) |
| kb-check | `make check-kb` | **pass** (`573 records, 27 features, 0 problem(s)`). `observed_versions.txt` now ends `2.1.300 2026-10-14 make canary`, so the two facts' `verified: 2.1.299..2.1.300` sit inside the ceiling |
| e2e-lint | `make e2e-lint` | pass (`e2e-lint: clean`) |
| features | features-scope | pass |
| comments | comment-checks | pass (`clean`) |
| comment-ledger | comment-pass verify | pass (8 blocks, all kept) |
| size | size-warn | WARN, 7 hits, the same set as cycle 2 (review-maintainability's) |
| e2e | `make e2e` | pass (840) |
| D1 | `make test` | pass (deduped to test-race) |
| D2 | `make lint` | pass (deduped) |
| D3 | `go build ./...` | pass (deduped) |
| D9 | `! rg -n '"(prompt_cache\|expires_at)"' cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`18-D9.log` empty) |
| W1 | `make web-test` | pass (deduped) |
| W2 | `make web-build` | pass (deduped) |
| E1 | `make e2e` | pass (deduped) |
| K1 | `make check-kb` | pass (deduped to kb-check) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Unchanged since cycle 2. The four proposed ADRs are still listed `proposed` (`kb ls --feature rail/usage --status proposed`). There are no `deviation:` lines. The merge adds nothing to `doc-delta.md`, and main's doc edits (`docs/protocol.md` `models.check`, `docs/features/launch/spec.md`) do not overlap any Doc Delta line, which covers only the Session `cache` and the order endpoint's wording. The TODO ticks wait for approval, as before |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W7 | no `any` in new web code | pass | no `web/src/` change since cycle 2's grep |
| W8 | tint uses `:root` tokens, no hard-coded white; Light reads dark→grey | pass (code) | `style.css` unchanged since cycle 2 |
| W9 | no state colour for warmth | pass | unchanged; `make contrast` green |
| W10 | card menu built by `render/menu.ts` | pass | unchanged since cycle 2 |
| D10 | REQ-33 reads `ttl` through Muster's interpreter | pass | unchanged, and now run: the canary's `ttl 5m0s` came through `claudecode.InterpretStatus` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. D9 green. The merged `modelcheck.go` change stays inside `internal/claudecode/` |
| 2 | Terminal-output state parsing | pass. Nothing added |
| 3 | Blocking hook handler | pass. No hook path changed |
| 4 | Bare tmux / resize-pane | pass. No tmux invocation added |
| 5 | Payload logging | pass. No logging added |
| 6 | Empty-gauge dishonesty | pass. Unchanged since cycle 2 |
| 7 | Identity on `session_id` | pass. Unchanged |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass. Only `test/canary/`. The forced canary ran the haiku harness |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| none: cycle 2 had no Minor in any part (correctness, browser and maintainability all list `None`) | — | `review.cycle2.md` read |
| cycle 2 correctness Critical 1 `[orchestrator]` K1 / kb-check red on the 2.1.296 ceiling (recorded for the record; not a Minor) | `b7aab8fb` via merge `68ba0f51` | `11-kb-check.log` `0 problem(s)`; `observed_versions.txt` records 2.1.300; the merge's diff checked against b7aab8fb (above) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** `plans/rail-card-organise/plan.md:4` still reads `**Status**: blocked`, stamped by 9fd9eca6. `orchestration-state.json` says `in-progress`. The orchestrator should restamp the plan header when it resumes or completes the run.
2. **[note]** Carried from cycles 1 and 2: the comment at `test/canary/canary_test.go:457` says the test reads "the first post carrying the key". The loop actually skips posts whose `prompt_cache` the interpreter rejects, and asserts on the first post it accepts.
3. **[note]** Carried for doc-reconcile, cycle 2 Note 2. A manual-mode drop on a section's `.gbody` that misses every card behaves like a header drop (`sessions.group`). So read the `doc-delta.md` amendment's "among a section's cards" as "on a card" when promoting it.
4. **[note]** Carried, and now in `proposed-backlog.md`: `Resume…` acts at once with no dialog, matching the Focus header's Resume.
5. **[note]** Carried: `web-tests.md` has no section for the cycle-1 fix wave. Its last count is 2617; the gate run shows 2622.
6. **[note]** The review pack is 62171 words against a 30000 budget.
