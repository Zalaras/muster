# Web Tests: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: pass
**Pack**: kb pack 26418 words (budget 8000, WARN exceeds) — sections rules 841 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2462 · lessons 1238 · runbooks 2

## Summary (fix mode, review cycle 1, wave 2)

Two things landed this wave, both sanctioned breakage/handoffs from review cycle 1, not
new implementation work:

1. **Correctness Minor 3 (mine)** — `web/src/api.test.ts`'s `permissionModeToCheck`
   fallback coverage used only `"someFutureMode"`, `null` and `""`. Added
   `"bypassPermissions"` (the real Claude Code mode `kb:adr/launch-bypass-and-dontask-unoffered`
   deliberately keeps unoffered — the row that actually distinguishes "falls back per
   `PERMISSION_MODES`" from "falls back per Claude Code's mode catalog") and `"nonsense"`
   (an arbitrary unrecognised string, kept alongside `"someFutureMode"` rather than
   renaming it — more boundary coverage, no loss).
2. **web-impl's wave-1 handoff** — web-impl moved the pure module
   `web/src/features/launch-restore.ts` → `web/src/render/launchrestore.ts`
   (maintainability Major 3), removed `openFallback` (Minor 1: a 1:1 relabel of
   `NavigateOutcome`, folded into the unexported `initOpen` in `features/launch.ts`), and
   added `repoRestore(repo)` + `DEFAULT_MODEL` as the one owner of a repo's restore values
   (Minor 2). It could only repoint `web/src/features/launch-restore.test.ts`'s import,
   leaving its `openFallback` describe block (3 cases) failing to compile.

Tests created/changed: moved 8 `initialRestore` cases + added 5 new (`repoRestore` × 4,
`DEFAULT_MODEL` × 1) to `web/src/render/launchrestore.test.ts`; dropped the 3
`openFallback` cases (function no longer exists); added 2 cases to `web/src/api.test.ts`.
Net: 13 → 18 assertions across the two files.

Tests created: 18 (api.test.ts: 6 in the `permissionModeToCheck` block, up from 4;
`render/launchrestore.test.ts`: 12, plus the pinned-value `PERMISSION_MODES` test
untouched) | Passing: all | Failing: 0

## W6 (REQ-6b/c) — decision: no pure seam remains; one outcome (`failed`) has zero
automated coverage anywhere

`openFallback`'s removal (web-impl Minor 1) was a legitimate maintainability call, not a
regression to undo: the outcome→action mapping it used to hold (`ok`→apply restore,
`failed`→browse root, `superseded`→do nothing) is real, but its only remaining owner is
`initOpen` in `web/src/features/launch.ts` — unexported, closed over `current`/`repos`/
`browseRequestId`/`touched` (mutable module-private state), and interleaved with real
`await navigate(...)` calls. That is controller logic tangled with DOM/async state by
design (`web/src/render/CLAUDE.md`: render/ holds pure decisions, features/ holds
controllers), not a pure function a Vitest unit test can call in isolation without
building a DOM/mock-`browse` harness — which `docs/conventions.md` § Testing and this
agent's own brief rule out ("Rendering and interaction are Playwright's job... do not
build a DOM-simulation test suite"). I did not attempt one. **Decision: REQ-6b/c's
outcome-to-action mapping is now E2E-only.**

Checked what E2E currently covers, reading each test rather than assuming from its name
(kb:lesson/conditional-test-routing-resolves-to-nobody — a declined item must cite the
covering test or be owned):

- **`ok`** (apply the initial restore) — `web/e2e/permission-mode.spec.ts`'s `it.each` over
  the four stored `lastPermissionMode` values (E4/INV-2, "a stored lastPermissionMode of
  ... pre-selects the ... radio on reopen") drives a plain dialog reopen with one recent
  present and asserts the matching radio checked — this is the `ok` outcome exercised
  straight (no race). `web/e2e/launch-defaults.spec.ts` E1/E2 cover the *no-recents*
  branch of `initOpen` (`repos[0]` absent → `navigate(undefined)`, no restore attempted).
  Covered.
- **`superseded`** — `web/e2e/launch-defaults.spec.ts`, "clicking a second Recent before
  the held-back initial browse lands..." (E10): gates the first `GET /api/browse`, clicks
  a second Recent first, releases the gate, and asserts the superseded response changed
  nothing (crumb, footer path, `aria-pressed`, radios all reflect the user's own click).
  Covered.
- **`failed`** (REQ-6c: the most-recently-launched recent's own directory has vanished by
  the time the dialog opens → fall back to the browse root) — grepped every `rm(`/`rm -rf`/
  `rmSync`/`unlink` in `web/e2e/launch*.spec.ts`: the only hit is
  `web/e2e/launch.spec.ts`'s E12 test (`a browse 404 shows the daemon's error...`), which
  deletes a *child* entry and clicks it **after** the dialog is already open on a
  successfully-restored directory — that exercises a `navigate()` failure from inside the
  picker (INV-3's "stale listing survives"), not `initOpen`'s own first navigate landing on
  a vanished directory and falling back to the root. No other launch spec deletes a
  directory before/during `openLaunchDialog`. **Not covered, by any test, unit or E2E.**

This is a real gap, not a routing question I'm declining to answer: no Vitest seam exists
to own it (the logic is now controller-shaped, per above), and no E2E spec exercises it
either. Per the lesson above I'm not calling this "not mine" — I'm naming it precisely so
the orchestrator can route it, since I cannot add it myself (Constraints: may not modify
E2E test specs, may not touch implementation). Recommend either a new E2E case in
`launch-defaults.spec.ts` (seed one recent, delete its directory before `openLaunchDialog`,
assert the dialog lands on the browse root with the daemon's error surfaced — same shape as
E9/E10's race tests but with the directory gone instead of raced) routed to e2e-specs, or,
if REQ-6c's browse-root fallback is judged low-enough-risk dead code to leave unverified,
that call recorded explicitly rather than left implicit. **Orchestrator: amend W6 from
this** — as written ("`openFallback` maps ok→restore, failed→browse-root,
superseded→none") it names a function that no longer exists; the two live outcomes are
now Reviewer-Verified via E4/E10, and `failed` needs either a new E-test id or an explicit
accepted-gap note.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `api.test.ts` | round-trips the recognised value %j to itself (×4) | `permissionModeToCheck` identity for `default`/`plan`/`acceptEdits`/`auto` | pass |
| `api.test.ts` | falls back to auto for an unrecognised string | W4: fallback moved off `"default"` | pass |
| `api.test.ts` | falls back to auto for the deliberately-unoffered bypassPermissions | correctness cycle-1 Minor 3: real Claude Code mode, never offered | pass |
| `api.test.ts` | falls back to auto for an arbitrary unrecognised string (`"nonsense"`) | correctness cycle-1 Minor 3 | pass |
| `api.test.ts` | falls back to auto for null | W4 | pass |
| `api.test.ts` | falls back to auto for the empty string | W4 | pass |
| `render/launchrestore.test.ts` | restores both fields when neither has been touched | W5/REQ-6a: `{model:false,mode:false}` | pass |
| `render/launchrestore.test.ts` | omits model but restores mode when only model was touched | W5/REQ-6a: `{model:true,mode:false}`, key absence checked with `in` | pass |
| `render/launchrestore.test.ts` | omits mode but restores model when only mode was touched | W5/REQ-6a: `{model:false,mode:true}` | pass |
| `render/launchrestore.test.ts` | restores neither field when both were touched | W5/REQ-6a: `{model:true,mode:true}` → `{}` | pass |
| `render/launchrestore.test.ts` | falls back to sonnet for an untouched model with no lastModel | REQ-6a's `?? "sonnet"` branch | pass |
| `render/launchrestore.test.ts` | falls back to auto (via permissionModeToCheck) for an untouched mode with no lastPermissionMode | REQ-6a composing W4's fallback | pass |
| `render/launchrestore.test.ts` | falls back to auto for an untouched mode the dialog has no radio for | boundary: a stored mode string outside `PERMISSION_MODES` | pass |
| `render/launchrestore.test.ts` | never falls back for a touched field, even with nothing to restore | both touched + both `null` on the repo → `{}`, not the fallback values | pass |
| `render/launchrestore.test.ts` | returns the repo's stored model and mode unfiltered | review-maintainability cycle 1 Minor 2: `repoRestore`'s base contract | pass |
| `render/launchrestore.test.ts` | falls back to DEFAULT_MODEL when the repo has no lastModel | Minor 2 | pass |
| `render/launchrestore.test.ts` | falls back to auto when the repo has no lastPermissionMode | Minor 2 | pass |
| `render/launchrestore.test.ts` | falls back to auto for a stored mode the dialog has no radio for | Minor 2 boundary | pass |
| `render/launchrestore.test.ts` | DEFAULT_MODEL is sonnet | Minor 2: the one literal owner | pass |

## Implementation Bugs

None. `initialRestore`/`repoRestore`'s behaviour is unchanged from the pre-refactor
`initialRestore`/`openFallback`'s `ok` branch, confirmed by the untouched `initialRestore`
describe block passing unmodified. The REQ-6c coverage gap above is a testing/routing gap,
not a defect in the shipped `initOpen` behaviour — I did not exercise `initOpen` at all
(no seam to reach it from Vitest), so I have no evidence either way that the browse-root
fallback itself misbehaves; only that nothing currently proves it works.

## Test Run Output

```
$ cd web && npx tsc --noEmit
(exit 0, no output)

$ make web-test
 RUN  v5.0.0 /Users/damian/Documents/code/Projects/muster/web
 Test Files  45 passed (45)
      Tests  1837 passed (1837)
   Duration  2.29s

$ make web-lint
Checked 184 files in 192ms. No fixes applied.

$ make web-build
✓ built in 1.79s
(pre-existing chunk-size-over-500kB warnings from mermaid, unrelated to this plan/wave)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py web/src/api.test.ts web/src/render/launchrestore.test.ts
dead-refs: 1 references checked, 0 missing
```

## Notes for the orchestrator

- Files changed this wave: `web/src/api.test.ts` (edited, 2 new cases), `web/src/render/launchrestore.test.ts`
  (new — supersedes the deleted `web/src/features/launch-restore.test.ts`, matching the
  render/ siblings' test-naming convention: `crumbs.test.ts`, `focusrestore.test.ts`).
  `web/src/features/launch-restore.test.ts` removed (`git rm`).
- Left `internal/claudecode/modelcheck_test.go`, `internal/server/sessions_test.go`,
  `test/canary/static_test.go` (daemon-tests' parallel wave), and
  `plans/new-session-improvement/doc-delta.md` /
  `plans/new-session-improvement/orchestration-state.json` (orchestrator-owned) alone —
  staged and committed only my own paths, by name.
- W6 needs the orchestrator's attention per the section above: as literally written it
  names a function (`openFallback`) that no longer exists in the tree.
