# web/e2e — Playwright specs, faked Claude

**Owns**: one `<feature>.spec.ts` per feature plus `helpers/<feature>.ts` locators and oracles. Claude Code is faked by hook and status-line POSTs from `helpers/payloads.ts`; a real `claude` runs only in `test/canary`. `helpers/fixtures.ts` and `web/playwright.config.ts` are web-impl's, never e2e-specs'. **Features**: actions, connection, drop, focus, ingest, issue, launch, lifecycle, rail, rename, shortcuts, surfaces, theme, tiles, update, usage, views.

**Invariants** (review-Critical; `web/scripts/e2e-lint.sh` fails the run):
- Daemons come only from `helpers/fixtures.ts`: `daemon` per test by default, `startDaemon(opts)` for computed options, `fileDaemon()` only when every test is title-scoped (kb:adr/process-e2e-explicit-fixtures).
- Import `test`, `expect`, types from `./helpers/fixtures`, never `@playwright/test` (kb:adr/process-e2e-lint-mechanises-fixture-rules).
- No fixed sleep; waits are web-first expects, `settleFor()` only for a stays-unchanged check (kb:adr/process-e2e-one-load-policy).
- Assert the settled state, never the transient "session ended" overlay (kb:adr/process-transient-displays-not-oracles).
- Payload shapes come from measured captures, never invented (kb:lesson/two-wire-shapes-accepted-hides-disagreement).
- No spec reaches a real host: `helpers/usageapi.ts`, `helpers/ghapi.ts`, `helpers/releases.ts` fake usage, Issues and Releases.

**Exemplar**: `theme.spec.ts` + `helpers/theme.ts` — header records the fixture choice, locators by role and accessible name; copy this shape.

**Gotchas**:
- Every daemon owns its port, data dir and tmux socket; a stale server tests the wrong build (kb:adr/process-e2e-per-run-ports-and-sockets-no-reuse).
- A build beside `make e2e` rewrites the served bundle mid-sweep; re-run clean before believing a red (kb:lesson/concurrent-build-invalidates-running-e2e).
- A flake fix is proven by `make e2e-soak SPEC=<file> N=10`, never a widened timeout or retry (kb:adr/process-e2e-no-playwright-retries).
- `sessionCard()` matches by substring; `uniqueTitle()` on a shared daemon.
- Rail card and strip card share one template; scope locators to the host.

<!-- kb:trailer -->
<!-- kb:hash 7f4603a6964ac64b -->
- **actions** — End, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs. → `docs/features/actions/INDEX.md`
- **connection** — Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout. → `docs/features/connection/INDEX.md`
- **drop** — File drop pastes the original on-disk path into the pane. → `docs/features/drop/INDEX.md`
- **focus** — Focus view: mainhead, main slot, dead surface, default focus, focus marker. → `docs/features/focus/INDEX.md`
- **ingest** — Hook and status-line ingest endpoints, the envelope that binds an event to a Muster session, seq assigned at ingest. → `docs/features/ingest/INDEX.md`
- **issue** — Issue capture and GitHub issue creation from the dashboard. → `docs/features/issue/INDEX.md`
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **lifecycle** — The session state machine, liveness, reconcile on start, shutdown policy, resume to idle. → `docs/features/lifecycle/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- **shortcuts** — Keyboard chords routed to views, focus and tiles. → `docs/features/shortcuts/INDEX.md`
- **surfaces** — PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target. → `docs/features/surfaces/INDEX.md`
- **theme** — Muster theme preference and the Claude theme family poll. → `docs/features/theme/INDEX.md`
- **tiles** — Tiles view: slot-stable grid, strip, tile drag, density, snapshot-not-live rule. → `docs/features/tiles/INDEX.md`
- **update** — Release check, minisign-verified apply, in-place restart with sessions re-adopted. → `docs/features/update/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- **views** — Focus and Tiles switch, density preference, view containers. → `docs/features/views/INDEX.md`
- 13 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
