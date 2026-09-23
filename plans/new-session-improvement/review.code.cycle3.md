# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 35443 words (budget 8000, WARN exceeds)

Delta re-review (§9). Cycle 2's only open agent-tagged issues were Minors: correctness Minor 1 `[daemon-tests]` and maintainability Minor 1 `[web-impl]`. The browser part had none. I read `git diff 5d474a0..HEAD`. It touches `internal/server/sessions_test.go` and three `web/src/` files. The web edits go beyond the Minor's scope because they also rewrite comments (maintainability Note 2), so I read those comments for truth. Nothing else in `internal/`, `cmd/` or `web/src/` changed, so §3–§6 were not re-read.

Both prior Minors are fixed. One new Minor comes from the rewritten comment beside `NavigateOutcome`. The verdict is `needs-changes` for two reasons. One is that Minor. The other is K1, which is red. K1 is structurally unfixable before approval, and this is the last review cycle (Critical 1).

## Requirements

Unchanged from cycle 2; this cycle's diff changes no behaviour. The rows below are carried over, and the changed evidence is noted.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-9, INV-1 … INV-5 | Yes (cycle 2 table) | Yes. D8 is now a whole-struct comparison (Delta row 1) | pass (D13 pending, Note 1) |
| DIAG | `kb:diagram/web-components` now reads `render/` "22 modules" (`docs/diagrams/web-components.md:44`), and `web/src/render/` holds 22 non-test `.ts` files. Fixed in `4a07d07`. `daemon-components` and `containers` are unchanged and still true | — | pass |

## Build & Tests

E2E tests: pass (443/443, `15-e2e.log`) · Daemon tests (race): pass (every package `ok`; `internal/server` 110.8 s, `02-test.log`) · Web tests: pass (1837, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty; written 11:38:54, after HEAD `2e67e89` at 11:38:52) · Web build: pass · Lint: pass (`03-lint.log` 0 issues; `06-web-lint.log` 184 files clean). All read from `$GATES_LOG_DIR`, not re-run.

Other gate lines: contrast pass (43 pairs × 3 themes, 0 failures); versions pass; e2e-honest pass (empty); dead-refs pass (2943 refs, 0 missing); e2e-lint clean; features-scope pass; size WARN ×12 (review-maintainability's). **kb-check FAIL** (the one failed line).

No soak needed: the diff repairs no spec.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to baseline `make test-race`, `02-test.log`) |
| D2 | `go build ./...` | pass (deduped to baseline `build`) |
| D3 | `make lint` | pass |
| D11 | `! rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal/ cmd/ --glob '!internal/claudecode/**'` | pass (`16-D11.log` empty) |
| D12 | `MUSTER_CANARY_OFFLINE=1 make canary` | pass (`17-D12.log`: `TestInstalledBinaryCarriesInterfaceStrings` PASS, `ok test/canary`) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (1837) |
| W3 | `make web-lint` | pass |
| E1 | `make e2e` | pass (443 passed; the `failed` matches in the log are test titles) |
| K1 | `make check-kb` | **FAIL**. `10-kb-check.log` lists the same 7 files as in cycle 2 as "owned by no feature": `internal/claudecode/modelcheck.go` and `modelcheck_test.go`, `web/e2e/launch-defaults.spec.ts`, `launch-model-check.spec.ts` and `launch-opens-session.spec.ts`, and `web/src/render/launchrestore.ts` and `launchrestore.test.ts`. `doc-delta.md:53-70` stages the globs. Critical 1 |
| DOC | doc upkeep and Doc Delta vs what shipped | pass. The cycle-2 orchestrator Major (the web-components count) is fixed in `4a07d07`. The fix wave added no `deviation:` or `doc-delta:` line (`web-implementation.md` says so; `daemon-tests.md`'s wave touched only a test). `plan.md` and `doc-delta.md` are unchanged since cycle 2, and that cycle checked every Doc Delta sentence against the code. The comment-only web edits do not affect any of them. `proposed-backlog.md` gained the placement item (cycle 2 maintainability Note 1), with **Change requested: no** |

## Reviewer-Verified Criteria

Unchanged from cycle 2 except for these two rows.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D8 | recognised → 201 with the row the pre-plan launch produced | pass | `sessions_test.go:437-501`. The test copies both `Session` values by value and zeroes eight launch-identity fields on both copies: `ID`, `RepoID`, `TmuxTarget`, `TmuxPane`, `RailPos`, `StateSince`, `CreatedAt` and `Directory`. It then runs one `assert.Equal`. `reflect.DeepEqual` follows the pointer fields (`Model`, `Context`, `Attention`, …) and includes the unexported prompt fields. So the doc comment's "every other field must match" is now true, and it stays true as fields are added. Every field that stays in the comparison is one a launch-path difference could change |
| D13 | forced canary: run F and the explicit-`default` row | **not yet run** | Awaits the developer's approval (orchestrator context). No agent tag |

## Hard-Rule Checklist

Only a test body and three web comments changed this cycle. None of them touches a rule's surface, so every row carries over from cycle 2.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (D11 green) |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass |
| 4 | Bare tmux | pass. The D8 test uses `newFakeTmux()` |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | n/a |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (D8's `claudeBin` is `"irrelevant-never-reached"`, and the check is faked) |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 correctness Minor 1 `[daemon-tests]`: "`TestLauncher_ModelRecognised_ProceedsToCreated` claims more than it asserts … Also relabel `D7` → `D8`" | `ee17bb2` | Diff read. The review's preferred fix was applied: 17 hand-picked `assert.Equal`s became one whole-struct compare after zeroing the 8 fields the doc comment names. The doc comment's exclusion list and the zeroing loop match field for field. The repo-row comment is now `// D8:`. Only `sessions_test.go` changed. The test passes in `02-test.log` |
| cycle 2 maintainability Minor 1 `[web-impl]`: "`navigate()`'s return type is declared beside `navigate()`, and `render/launchrestore.ts` exports only what its own functions take or return" | `3b4b5d5` | Diff read. `type NavigateOutcome` is now local at `launch.ts:288`, directly above `navigate()` (`:296`). `rg NavigateOutcome web/src` finds only `launch.ts:288/296/320`. `launchrestore.ts` now exports `DEFAULT_MODEL`, `Touched`, `Restore`, `repoRestore` and `initialRestore`. `DEFAULT_MODEL` is the fallback `repoRestore` returns, and it was already there in cycle 2, which did not flag it. The stale "outcome-to-fallback mapping" doc went with the type. Both conditions hold. The new doc comment carries a small inaccuracy (Minor 1) |
| cycle 2 browser part | — | No Minors in that part |

The same commit also rewrote the web comments that cited review findings (maintainability Note 2, not a Minor). I read each rewritten comment against the code:
- `focus.ts:63-66`: true.
- `launch.ts:178-180`: true.
- `launch.ts:344-346`: true.
- `launch.ts:566-569`: true.
- `launchrestore.ts:1-5`: see Note 3.
- `launchrestore.ts:29-31`: true.
- `launch.ts:285-287`: Minor 1.

## Issues

### Critical
1. **[orchestrator:user-decision]** K1 `make check-kb` is red, and this cycle cannot turn it green. The failure is the same 7 unowned files as cycles 1 and 2 (Acceptance Checks row). The fix is launch-spec frontmatter globs, which `doc-delta.md` already stages. Under kb:adr/process-doc-reconcile-after-review (accepted), those globs belong to doc-reconcile, and doc-reconcile runs only after an `approved` verdict. But `merge-review --gates-failed 1` forces `needs-changes`, and my own Verdict Rules require every gate line green. So a plan that ships a file no existing glob covers cannot reach approval. This is the last review cycle, so the pipeline reaches Review Cycle Exhaustion on this line alone once Minor 1 is fixed. The resolution goes against an accepted ADR, so it is the user's call, not a debate:
   - **Option A:** before an approval cycle, the orchestrator (or doc-reconcile, spawned early for the frontmatter only) lands the staged globs in `docs/features/launch/spec.md`. K1 then goes green in the next gate run. Cost: one spec-file edit ahead of reconcile, which the ADR assigns to after review. Doc-reconcile still promotes the body later.
   - **Option B:** approve with K1's "owned by no feature" lines for this plan's own new files treated as the expected pre-reconcile state. Completion's Final Validation `gates.sh` run, which must be fully green after doc-reconcile, is the binding K1 check. Cost: an approval issued over a red gate line, which the merge script does not allow today. It needs a user-approved override or a change to the script, and probably a retro item so the next plan does not hit the same deadlock.

### Major

None.

### Minor
1. **[web-impl]** The new doc comment on `NavigateOutcome` (`web/src/features/launch.ts:285-287`) says "`initOpen` and `navigateUp` switch on this directly (REQ-6b/c)". Only `initOpen` switches on it. `navigateUp` (`:320-325`) returns `navigate()`'s result without looking at it. Its one consumer that reads the value, the ArrowLeft handler (`:483-484`), checks only `result !== null`. `navigateUp` is also REQ-15's, not REQ-6's. Suggested wording: "`initOpen` switches on this directly (REQ-6b/c); `navigateUp` passes it through."

### Notes
1. **[note]** D13 (the forced canary) still has not run. It is the only live evidence that 2.1.280 classifies `muster-canary-unrecognized-model` as unrecognised and haiku as recognised through the production `CheckModel`. It needs the developer's approval, and its log should be pasted into the review.
2. **[note]** The daemon half of cycle 2's maintainability Note 2 was not routed and is still present: `internal/server/sessions.go:147` and `:214` say "exactly as before this plan". These comments are true but narrate history. No change requested.
3. **[note]** Carried from cycle 2 Note 5. `launchrestore.ts:3-5` now states as a rule that "a pure decision split out of a controller lives here, not in features/". `docs/conventions.md` § Composition roots and `web/src/render/CLAUDE.md` say `render/` holds pure DOM builders. The backlog item "Settle where a controller's DOM-free pure decision lives" in `proposed-backlog.md` covers this. Whichever way that item is settled, the comment should be reworded to match.
4. **[note]** Cycle 2 Notes 2, 3, 4, 7, 8 and 9 still hold as written. Nothing in this cycle's diff touches them.
