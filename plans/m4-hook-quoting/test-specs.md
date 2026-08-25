# E2E Test Specs: M4 — Hook-command path quoting

**Plan**: m4-hook-quoting
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 0 new tests (harness edit only; full existing suite of 71 is the coverage vehicle)
**Live run**: 71/71 passing

## Scope note

This plan's E2E scope (per plan.md "Affected Files > E2E harness (e2e-specs)" and
"UI Specifications: None — no dashboard changes") is exactly:

- **REQ-6 / E1**: `web/e2e/helpers/daemon.ts` creates the scratch daemon's data dir with
  `mkdtemp` prefix `"muster e2e-"` (a literal space), so every E2E run exercises the
  production path shape — the default macOS data dir
  (`~/Library/Application Support/Muster`) contains a space, and until this change no
  E2E run had ever exercised the shell-quoting path the two command hooks (SessionStart
  wrapper, status-line wrapper) depend on.
- **REQ-6 / E2**: the full existing Playwright suite continues to pass against that
  space-bearing data dir — this is not new coverage, it's the existing 71 tests now
  running over the production path shape for free.

There are no new UI elements, no new Testable UI Elements table rows, and no protocol
wire-shape change (the plan's Protocol Contract delta is doc-only). Per plan.md's own
"Why the E2E flip is cheap and sufficient" note: the harness's fake `claude` never reads
`settings.local.json`, so E2 proves only that the *daemon* tolerates a space-bearing data
dir end-to-end (tmux socket, DB, scripts written, launch) — the
settings→shell→script→POST chain itself is proven by the daemon-side shell round-trip
test (D6, `internal/server/settings_shell_test.go`), not by this harness change. No E2E
spec asserts the wrapper scripts' *content* or that they actually ran through `sh -c`.

## Harness change made

`web/e2e/helpers/daemon.ts`, in `ScratchDaemon.start()`:

```diff
-    const dataDir = await mkdtemp(join(tmpdir(), "muster-e2e-"));
+    const dataDir = await mkdtemp(join(tmpdir(), "muster e2e-"));
```

with a comment citing REQ-6/E1 and the spikes/FINDINGS.md 2026-08-25 addendum, and an
explicit note that a spec breaking on the space is a real defect to report, not to quote
around (matching the plan's Affected Files instruction verbatim).

**Left unchanged, deliberately:** `web/e2e/helpers/session.ts`'s `scratchDirectory()`
(`prefix = "muster-e2e-repo-"`) and `browseScratchDirectory()`
(`prefix = "muster-e2e-browse-"`). These mint the *project/checkout* directory passed as
the `directory` field to `POST /api/sessions`, which the plan's own audit conclusion
("Launch path is argv end-to-end… the directory and `claude` binary path never pass
through a shell") confirms never crosses a shell boundary — only the daemon's *data dir*
feeds the two command-hook paths this plan's quoting fix targets. Out of scope; not an
oversight.

## Tests

No new test file. Coverage requirement is satisfied by the full existing suite now
running against the space-bearing scratch data dir:

| File | Tests | Requirement |
|------|-------|-------------|
| web/e2e/auth.spec.ts | (existing) | E2 |
| web/e2e/gauges.spec.ts | (existing) | E2 |
| web/e2e/ingest.spec.ts | (existing) | E2 |
| web/e2e/launch.spec.ts | (existing) | E2 |
| web/e2e/resilience.spec.ts | (existing) | E2 |
| web/e2e/sessions.spec.ts | (existing) | E2 |
| web/e2e/shell.spec.ts | (existing) | E2 |
| web/e2e/terminal.spec.ts | (existing) | E2 |
| web/e2e/views.spec.ts | (existing) | E2 |

## Fixture Changes

No changes needed. No new synthesized hook/status-line payload shapes are introduced by
this plan; existing `web/e2e/helpers/payloads.ts` builders are untouched.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-6 / E1  | `web/e2e/helpers/daemon.ts` mkdtemp prefix now `"muster e2e-"` (verified against the plan's own grep, see below) |
| REQ-6 / E2  | Full existing suite (71 tests / 9 files), run via `make e2e`, now exercises that path |

## Collection Gate (authoring mode)

```
$ npx playwright test --list
...
Total: 71 tests in 9 files
```

No errors, no duplicate titles, all 9 spec files (`auth`, `gauges`, `ingest`, `launch`,
`resilience`, `sessions`, `shell`, `terminal`, `views`) still collect cleanly after the
harness edit. This matches the plan's "71/71 at time of writing" figure for E2 — the
harness edit did not add or remove any test.

Plan's own E1 grep, re-run directly, also passes:

```
$ rg -q 'mkdtemp\(join\(tmpdir\(\), "muster e2e-"\)\)' web/e2e/helpers/daemon.ts && echo PASS
PASS
```

## Notes

- This is a harness-only authoring pass; there is nothing to "expect to fail" here in
  the usual authoring-mode sense (no daemon code changed yet, but the harness edit is
  pure string literal and has no dependency on the daemon-impl changes to collect or,
  in fact, to run — `mkdtemp` with a space in the prefix works today regardless of
  whether `MergeSettings` quotes anything). The reason this plan still routes through
  e2e-specs' validate/E2 gate rather than being "done" here is REQ-6/E2: the full suite
  must be run live, in validate mode, against the space-bearing path once daemon-impl's
  quoting fix lands, to confirm no spec's launch/tmux/DB path silently assumed a
  space-free data dir. Until daemon-impl and the rebuild happen, running the suite now
  would only prove the *harness* tolerates the space (which it does, trivially) — not
  that the production quoting fix does its job end-to-end from the daemon side (that's
  D6, not E2).
- No `[web-impl]` or `[daemon-impl]` bugs to route in authoring mode.
- Per the mode contract, no live run was attempted here; `make e2e` (E2) is deferred to
  this plan's validate-mode invocation of e2e-specs, after daemon-impl lands and
  `make build web-build` are rerun.

## Validate Attempt 1

Read `plans/m4-hook-quoting/daemon-implementation.md` first: `shellQuote` was added in
`internal/claudecode/settings.go`, applied to both `hookEntry.Command` literals in
`MergeSettings`, and `isMusterEntry`'s command branch now matches either the raw or
quoted form for both configured script paths (REQ-1/REQ-3). `internal/server/sessions.go`
was confirmed unmodified (REQ-2/D7 — raw paths only, quoting confined to
`internal/claudecode`). No web-impl track exists for this plan (doc-only protocol delta,
no dashboard change), so there is no `web-implementation.md` to cross-check locators
against — matching the spawn prompt.

### 1. Rebuild

```
$ make build web-build
go build -ldflags "-X main.version=9b12459-dirty" -o bin/musterd ./cmd/musterd
cd web && npm run build
✓ built in 237ms
```

Both the daemon binary and `web/dist` were rebuilt before running anything, per the
rebuild-first rule (m3-gauges lesson: a stale binary makes failures look like
implementation bugs when they're a harness/build-freshness problem).

### 2. Full suite run (`make e2e`)

```
$ make e2e
...
Running 71 tests using 6 workers
  ✓  71 tests across auth.spec.ts, gauges.spec.ts, ingest.spec.ts, launch.spec.ts,
     resilience.spec.ts, sessions.spec.ts, shell.spec.ts, terminal.spec.ts, views.spec.ts
  71 passed (18.1s)
```

Every test ran against a scratch daemon whose data dir was minted by
`mkdtemp(join(tmpdir(), "muster e2e-"))` — the space-bearing prefix this plan's REQ-6/E1
put in place — so this is the full suite exercising the production path shape end to end
(tmux socket path, sqlite path, wrapper-script paths all live under a directory containing
a literal space) for the first time. No failures, no flakes across the one run needed.

### 3. My defect vs. theirs

Not applicable — zero failures, so there was nothing to triage as spec-defect vs.
implementation-defect. No locator was touched.

### 4. Collection re-verification

```
$ npx playwright test --list
...
Total: 71 tests in 9 files
```

Clean, no duplicate titles, same 71/9 as authoring — the harness edit added or removed
no test, as the authoring log predicted.

### 5. Sweep for plan-superseded specs

This plan's Protocol Contract delta is doc-only (§4.2 prose about shell-quoting; no wire
shape, no HTTP/WS change, no version bump — plan.md "Protocol Contract" section). There is
therefore no old expectation for any pre-existing spec to contradict, and none did: all 71
passed unchanged, including the specs the daemon-implementation log flagged as touching
adjacent territory (`gauges.spec.ts`, `sessions.spec.ts`, `launch.spec.ts` — none of them
assert on `settings.local.json` content or the two command-hook `command` strings, so
REQ-1's quoting change is invisible to them by design; that assertion is D6's job, on the
daemon side, per plan.md's own "Why the E2E flip is cheap and sufficient" note). No
sanctioned-breakage updates were needed.

### E1 grep

```
$ rg -q 'mkdtemp\(join\(tmpdir\(\), "muster e2e-"\)\)' web/e2e/helpers/daemon.ts && echo PASS
PASS
```

### Repairs

None. No spec file was edited in this validate pass — the authoring-mode harness change
was already correct and needed no locator repair, no fixture change, no wait adjustment.

`No assertion was deleted, skipped, or weakened.`

### Notes

- REQ-5/D6 (the shell round-trip proving the wrapper scripts actually work under `sh -c`
  from a space-bearing data dir) and REQ-8/D9 (the canary skip-body) are daemon-tests'
  responsibility per plan.md's "Affected Files > Daemon tests", not this agent's — E2E
  scope for this plan is exactly REQ-6/E1 and REQ-6/E2, both now verified live.
- REQ-9/R5 (manual verification against the real default data dir via `/dev-loop`) is
  explicitly Should-Have, non-automatable, and gates the plan's `completed` status rather
  than the review verdict — out of scope for this agent per the plan's own framing.
