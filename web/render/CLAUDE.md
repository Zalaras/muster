# web/render — render tests, no daemon

**Owns**: `<feature>.spec.ts` files that assert a property of the display for a given daemon
state, plus `helpers/harness.ts`. A render test loads the built bundle (`internal/webui/assets`,
from `make web-build`) in real Chromium with every request fulfilled from disk and `/ws` faked
from a recorded `hello` + `snapshot`. No daemon, no tmux, no launch, no hook POSTs — the
question is "given this snapshot, what does the page show?", never "what happens next?"

**Harness contract** (`web/scripts/render-lint.sh` fails the run):
- Import `test`, `expect` and types from `./helpers/harness`, never `@playwright/test`
  (`helpers/harness.ts` is the one module allowed to).
- `await dashboard.open("<scenario>")` loads the page with that fixture behind `/ws` and
  `/api/repos`, returns the parsed fixture, and resolves once `#sessions` is attached. Assert
  with web-first expects from there; `dashboard.send(frame)` pushes a later frame.
- State comes only from `loadFixture` / `dashboard.open`. No `type: "snapshot"`, `type: "hello"`
  or `sessions: [` literal in a spec.
- Every unmocked `/api/**` is a 404 (`code: "render-harness"`) on purpose: a test that needs a
  PUT or POST to succeed is a journey and belongs in `web/e2e/`. Terminal and shell sockets are
  accepted and stay silent.
- The page clock is installed at `FIXTURE_EPOCH` (`2026-01-01T00:00:00Z`); fixture timestamps
  are that epoch plus minutes, so relative times are stable. `settleFor(page, ms)` advances it
  for a stays-unchanged check; no `waitForTimeout`, no `setTimeout`.

**Fixtures**: `fixtures/<scenario>.json` with `{scenario, hello, snapshot, repos}`, generated
by `make gen-render-fixtures` from a real daemon and never edited by hand
(kb:adr/process-render-fixtures-generated-from-daemon). `loadFixture` validates each frame
with the protocol's own parsers and names the fixture when one fails — a snapshot with one
malformed session is rejected whole, so a parse error here is a generator bug, not a test
bug. A scenario that does not exist is asked of daemon-impl in the plan's Handoff; a spec
never fabricates one.

**What goes where**: a card's badge, the ↳ block, the masthead readout, a density's layout,
an empty state — render. Launch, hooks moving a session between states, restart, kill, rename
round-trips, anything that reads the daemon's answer — `web/e2e/` (its `CLAUDE.md`).
`web/scripts/e2e-lint.sh` rule 6 fails a newly added E2E test that touches no daemon.

**Running**: `npm run render-test` from `web/` (render-lint, then Playwright with
`playwright.render.config.ts`, which holds the gate lock shared — it may run beside unit tests,
never beside a sweep). Build the bundle first; a missing `index.html` is named in the error.
