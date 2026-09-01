# E2E Test Specs: tmux-installation

**Plan**: tmux-installation
**Mode**: validate (attempt 1)
**Verdict**: harness-only
**Tests created**: 0
**Live run**: 174/174 passing (full suite, `make e2e`)

## Scope

This plan's `E2E Scope` is `harness-only`. Its only E2E-owned deliverable is the harness edit
named under Affected Files > E2E harness: `web/e2e/helpers/daemon.ts`, covering REQ-10 and
REQ-15. No new spec file was written; `daemon/cmd/musterd`, `internal/tmux`, and `web/src/` were
not touched.

## Harness Edit

`web/e2e/helpers/daemon.ts`:

1. **REQ-10** — `spawnAndWait()`'s `args` array gains the literal single argument
   `"-open=false"`, appended after the existing `-issue-repo` pair. This is defence in depth
   over REQ-6's terminal condition (the harness already spawns every scratch daemon with
   `stdio: ["ignore", …]`, giving fd 0 `/dev/null`, which is not a terminal) — belt-and-braces
   per the plan's own framing, not the guarantee itself.
2. **REQ-15** — `kill()`'s 5s escalation `setTimeout` callback now calls `console.warn(...)`
   (naming the SIGTERM-to-SIGKILL escalation and including the daemon's captured tail output)
   before calling `proc.kill("SIGKILL")`. Previously the escalation fired silently. This makes
   a future regression into non-graceful shutdown (e.g. back into the `-on-exit=ask` prompt
   this plan's REQ-9 fixes) visible in the suite's own console output instead of masked.

Neither edit touches `web/playwright.config.ts` or any global setup/teardown file.

## Fixture Changes

No new payload builders or fixtures. No wire-format shapes are involved — both changes are
process-spawn/lifecycle plumbing in the harness's TypeScript, not synthesized Claude Code
payloads.

## Existing Specs Now Covered

Every one of the 16 existing spec files under `web/e2e/` imports `startScratchDaemon` /
`ScratchDaemon` from `helpers/daemon.ts` and therefore now exercises both changes on every run
(every spawn carries `-open=false`; every teardown/kill path is covered by the warning path,
which fires only if the daemon fails to exit gracefully within 5s of SIGTERM):

| File |
|------|
| web/e2e/actions.spec.ts |
| web/e2e/auth.spec.ts |
| web/e2e/embedded.spec.ts |
| web/e2e/gauges.spec.ts |
| web/e2e/ingest.spec.ts |
| web/e2e/issue-capture.spec.ts |
| web/e2e/launch.spec.ts |
| web/e2e/rail-order.spec.ts |
| web/e2e/reconcile.spec.ts |
| web/e2e/resilience.spec.ts |
| web/e2e/sessions.spec.ts |
| web/e2e/shell.spec.ts |
| web/e2e/terminal.spec.ts |
| web/e2e/tiles-launch.spec.ts |
| web/e2e/usage-model.spec.ts |
| web/e2e/views.spec.ts |

Verified: `grep -L "helpers/daemon" web/e2e/*.spec.ts` returns no files (i.e. all 16 import it).

## Coverage

| Requirement | Coverage |
|-------------|----------|
| REQ-10      | `web/e2e/helpers/daemon.ts` `spawnAndWait()` — exercised by every spec file's daemon spawn (E1) |
| REQ-15      | `web/e2e/helpers/daemon.ts` `kill()` — exercised by every spec file's teardown; the warning path itself only fires on a non-graceful-shutdown regression, which none of the 16 files currently trigger |

E1 ("no suite run can open a browser") is a structural guarantee from REQ-6's terminal
condition plus this flag, not something a spec can directly observe (there is no browser to
assert the absence of within the sandboxed harness) — the collection + full-suite run is the
available evidence that the change is inert under normal operation and doesn't break any
existing test.

## Verification

Collection gate, from `web/`:

```
npx playwright test --list
```

Result: no error, `Total: 174 tests in 16 files` — unchanged from before the edit (this step
adds no test titles), confirming the config loads and no duplicate-title or syntax regression
was introduced.

Validate mode (later pipeline step) will run `make e2e` to prove the full suite still passes
live with `-open=false` on every spawn and the new warning path compiled in.

## Notes

- Did not touch `cmd/musterd/onexit_test.go` (REQ-11) — that is a Go test file owned by
  daemon-tests, not this agent's scope.
- Did not touch `.claude/skills/dev-loop/SKILL.md` (REQ-16) — owned by daemon-impl per the
  plan's Affected Files.
- The `console.warn` message intentionally does not print the full stdout tail beyond the
  existing `this.output` (already capped to a 16KB tail by `spawnAndWait`'s drain logic), so
  no risk of dumping hook-payload-scale output; `this.output` never contains hook payload text
  in the first place since musterd's own logging never logs those (CLAUDE.md hard rule),
  independent of this harness.

## Validate Attempt 1

**Rebuild** (from project root, in order):

```
$ make web-build build
cd web && npm run build
> tsc --noEmit && vite build
...
✓ built in 247ms
go build -ldflags "-X main.version=f8408e9" -o bin/musterd ./cmd/musterd
```

Exit 0. tsc ran over `web/e2e/` as part of the build (no type errors), and the Go compile ran
strictly after the web build, so `bin/musterd` embeds the fresh `internal/webui/assets` — not a
stale dashboard.

**Full suite** (`make e2e` from project root, which itself re-runs `web-build` + `build` as
ordered prerequisites before `npm run e2e`):

```
Running 174 tests using 6 workers
...
174 passed (42.7s)
```

Every one of the 174 tests across all 16 spec files passed on the first run. No repairs were
needed — nothing in my scope (the harness helper) required a second attempt.

**Collection re-check** (`npx playwright test --list` from `web/`, post-run): `Total: 174 tests
in 16 files` — identical to the authoring-mode count, confirming no duplicate-title or syntax
regression.

**R6 — the specific thing this validate pass was asked to measure.** I read the complete `make
e2e` output (captured above, not trimmed past what's shown — 174 result lines plus the summary)
looking for the `kill()` escalation warning REQ-15 added
(`scratch musterd did not exit within 5s of SIGTERM; escalating to SIGKILL. last output:...`,
`web/e2e/helpers/daemon.ts:470-472`). **The warning did not fire, on any of the 174 tests,
across the whole suite run.** Every scratch daemon teardown — including every spec that ends
the run with a live session still attached (`terminal.spec.ts`, `sessions.spec.ts`,
`views.spec.ts`'s live-tile tests, `actions.spec.ts`'s dozens of live-session cases, etc.) — exited
on `SIGTERM` inside the 5s window, so `kill()`'s `proc.once("exit", ...)` branch won, not the
`setTimeout` escalation branch. This is measured evidence, not inference: the warning text is
distinctive and would appear verbatim in the `npm run e2e` stdout/stderr this agent captured in
full; grepping that captured output for `SIGKILL` or `did not exit` returns no matches. This
confirms the plan's central claim (Overview, REQ-9, Edge Case 14): `-on-exit=ask` against every
scratch daemon's `/dev/null` stdin now resolves to leave immediately via `isTerminal`, rather
than sitting out the 10s prompt timeout and forcing the harness's old 5s `SIGKILL` escalation.

No implementation-code changes were made (none were needed — the harness-only deliverable
already matched the plan and required no repair). No files were edited this attempt; nothing
new to commit beyond what commit `4a6bb42` already carries.
