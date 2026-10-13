# Doc Reconcile: state-issues

**Verdict**: blocked
**Pack**: kb: pack 11106 words (budget 30000)
**Features derived**: lifecycle, ingest, canary (plan header: **Features** lifecycle; **Touches** ingest, focus)

## Claims

No claim was verified or promoted. Step 1 stopped the run before Step 2, so no spec or protocol edit was made.

## Contradictions

None found (the claims were not reached).

## Blocked: the changed-file set widened beyond the plan's headers

`git diff --name-only main...HEAD` mapped through the `go:` / `web:` / `e2e:` globs gives:

- lifecycle (in **Features**): `internal/session/*` (apply, machine, session, writeorder and their tests), `web/e2e/state-transitions.spec.ts`, `web/e2e/helpers/state-transitions.ts`.
- ingest (in **Touches**): `internal/claudecode/interpret.go`, `interpret_test.go`, `claudecodetest/claudecodetest.go`, `web/e2e/helpers/payloads.ts`.
- **canary (in neither header)**: `test/canary/state_test.go`, changed by commit 36362964 (`test(state-issues): cover idle_prompt, compaction, ...`). The `go:` glob `test/canary/**` in `docs/features/canary/spec.md` owns it.

What the canary change is: the diff is 2 insertions and 1 deletion, regrouping the `github.com/Zalaras/muster/internal/claudecode` import below the third-party imports. It changes no behaviour and no assertion. I judge it a goimports regroup, but the rule in my brief is mechanical and not mine to waive: a changed file owned by a feature outside **Features** and **Touches** means that feature's spec was missing from every agent's `kb pack` for the run. Here the canary spec is absent from the pack (`features=lifecycle touches=ingest,focus`).

Everything else maps inside the headers. No changed file is uncovered by a glob.

## For the orchestrator

- [orchestrator] Decide the canary widening. Either (a) add `canary` to the plan's `**Touches**` header, noting the change is an import regroup with no behaviour change, and re-run doc-reconcile, or (b) tell me in a message to proceed with the verdict waived. I can then verify and promote the lifecycle delta right away. Nothing in the delta touches canary behaviour.
- [orchestrator] Since `**Touches**` ingest is in play: the delta's claims about `idle_prompt`, compaction and the mode latch change ingest's adapter (`internal/claudecode/interpret.go`). When I run, I will note which claims change ingest behaviour so you can promote ingest to `**Features**`.
- [orchestrator] Pre-existing and unrelated: `docs/features/lifecycle/spec.md` is 1097 words by `wc -w` (frontmatter included) against the 800 `spec_words` budget, yet `make check-kb` passes, so the checker evidently counts something narrower. The delta's deletions will shrink it further; I do not expect a budget problem.

## Checks

`make check-kb` on the unedited tree (HEAD 5bbbf714): `kb: 557 records, 27 features, 0 problem(s)` / `kb: all checks pass`. No gen-kb run; no spec touched.
