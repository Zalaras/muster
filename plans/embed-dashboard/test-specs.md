# E2E Test Specs: embed-dashboard

**Plan**: embed-dashboard
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 4
**Live run**: 161/161 passing (full suite)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/embedded.spec.ts | fixture sanity: the scratch dir has no web/ or internal/ tree next to the copied binary | REQ-7/R7 | The `serveEmbedded` fixture's scratch cwd genuinely contains neither tree, so the flag-omission below actually proves self-containment |
| web/e2e/embedded.spec.ts | serves the working dashboard from the embedded FS with no -web-dist flag: auth, masthead, WS connects | REQ-1, REQ-2, REQ-3 (negative-space), REQ-8, E1 | Copied binary, scratch cwd, no `-web-dist` at all → auth token exchange succeeds, `<h1>Muster</h1>` renders, `role="status"` reaches `/connected/i` (functionally pins Content-Type on the embedded path per plan Invariants) |
| web/e2e/embedded.spec.ts | still gates the embedded static handler on the auth cookie (401 relaunch page) | R5 | `requireCookie` wraps the embedded `http.FileServer` branch the same as the disk branch — cookie-less `/` still 401s with the relaunch page |
| web/e2e/embedded.spec.ts | serves /healthz without authentication from the embedded-serving daemon | (fixture sanity) | The embedded-serving daemon is a normally functioning daemon outside the one route this plan touches |

## Fixture Changes

- `web/e2e/helpers/daemon.ts`:
  - `webDist` constant moved from `join(repoRoot, "web", "dist")` to `join(repoRoot, "internal", "webui", "assets")` (REQ-7) — every existing spec's disk-override path now points at the plan's new build output. This is the fixture change that makes the full pre-existing suite exercise E2 (disk-override parity) once daemon-impl/web-impl land; no existing spec file needed edits for it since none of them hardcode the path themselves.
  - New `ScratchDaemonOptions.serveEmbedded?: boolean` (default `false`, no behaviour change for any existing spec). When `true`, `ScratchDaemon.start()`:
    1. copies `bin/musterd` → `<dataDir>/musterd` (a real copy, not the shared binary in place) and `chmod 0o755`s it (`copyFile` doesn't reliably preserve the executable bit across platforms),
    2. `spawnAndWait()` spawns that copy with `cwd: dataDir` instead of the process's own cwd,
    3. `spawnAndWait()` omits the `-web-dist` flag **entirely** (not an empty string) when `serveEmbedded` is true.
  - `dataDir` is an OS `mkdtemp` scratch directory the harness already creates fresh per run (pre-existing behaviour, unchanged) — it genuinely contains no `web/` or `internal/` tree, which the new spec's first test asserts explicitly rather than assuming.
  - No fixture payload builders were needed — this plan touches no hook/status-line wire format (Protocol Contract: "No protocol changes"), so `helpers/payloads.ts` is untouched.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (embed package exposes asset tree + has-dashboard predicate) | exercised indirectly via E1 (a daemon with no `-web-dist` must be serving from the embedded tree to render anything at all); the predicate itself is a unit-test concern (daemon-tests owns it per Implementation Notes) |
| REQ-2 (serving precedence disk vs embedded) | `serves the working dashboard from the embedded FS...` (embedded branch) + the full pre-existing suite via the repointed `webDist` constant (disk branch, E2) |
| REQ-3 (fail-fast on assetless embedded binary) | Not E2E-testable as stated — a real post-web-build embed always contains `index.html` (Implementation Notes: "the real embed var can't exercise this branch after a web build"); this is a daemon-tests unit-test concern via an injected `fs.FS` (D5/R2). My E1 test only exercises the negative space (embedded FS present and used), not the fatal-exit path. |
| REQ-4 (fresh clone builds with no npm install) | Not an E2E concern — `go build ./...` gate (D1/D4), no Playwright coverage needed |
| REQ-5 (vite outDir/emptyOutDir/gitkeep plugin) | web-impl/build-config concern (W1–W4 Automated Checks); no E2E coverage needed |
| REQ-6 (Makefile updates) | Not E2E-testable; `make e2e` ordering is what makes E1 runnable at all in validate mode |
| REQ-7 (harness webDist move + serveEmbedded fixture) | `fixture sanity: the scratch dir has no web/ or internal/ tree...` + the `webDist` constant change itself, proven by the full suite still passing under `make e2e` |
| REQ-8 (new embedded.spec.ts) | This file, all 4 tests |
| E1 | `serves the working dashboard from the embedded FS...` |
| E2 (full suite passes against new disk path) | Not a new test — proven by re-running the full existing suite (`make e2e`) in validate mode once `webDist` points at `internal/webui/assets` and the assets actually exist there |
| R5 (auth gating parity) | `still gates the embedded static handler on the auth cookie...` |
| R7 (fixture genuinely uses a copy + scratch cwd + full flag omission) | `fixture sanity...` (copy/cwd genuinely have no nearby tree) + code inspection of `daemon.ts`'s `spawnAndWait()` (the `if (!this.serveEmbedded)` guard omits the flag, not just its value) |

## Repairs (validate / fix modes only)

N/A — authoring mode.

## E2E Implementation Bugs (if verdict = implementation-bug)

N/A — authoring mode.

## Test Run Output

Collection gate only (implementation does not exist yet — `internal/webui`, the repointed
`vite.config.ts` outDir, and `internal/webui/assets/index.html` are all absent on this
branch, confirmed before writing tests):

```
$ npx playwright test --list
... (161 tests listed across 15 files, including the 4 new embedded.spec.ts tests) ...
Total: 161 tests in 15 files
```

Exit 0, no duplicate titles, no syntax/import errors. Also ran `npx tsc --noEmit -p .`
(the project's strict tsconfig, `exactOptionalPropertyTypes` included, covers `e2e/`) —
exit 0, no type errors from the `daemon.ts` edits (new optional `serveEmbedded` field,
default constructor parameter, conditional `cwd`/binary-path spawn args).

Since `internal/webui/assets/` doesn't exist yet, running the suite for real right now
would fail every spec at `waitForHealthy` (musterd would refuse to start once REQ-3's
fail-fast lands, or 404 everything today) — expected and out of scope for authoring mode.

## Notes

- This plan's own Protocol Contract and UI Specifications sections state explicitly that
  no wire format, WS message, or DOM changes ship — confirmed by inspection: no new
  hook/status-line shapes were needed, so `helpers/payloads.ts` is untouched and no new
  payload builders were added.
- The plan's Testable UI Elements table's two rows (masthead heading, connection status)
  are the same ones `shell.spec.ts`/`auth.spec.ts` already use successfully against the
  disk-serving daemon — I reused the identical locators (`getByRole("heading", { name:
  "Muster" })`, `getByRole("status")` with `/connected/i`) rather than inventing new ones,
  since the plan states the DOM is unchanged.
- REQ-3 (fail-fast) has **no E2E test** by design — it cannot be reached from a normally
  built binary (a real `//go:embed` populated by any prior `make web-build` always
  contains `index.html`), exactly as the plan's own Implementation Notes call out. I did
  not fabricate a way around this (e.g. truncating the embedded FS at runtime is not
  something Playwright can do to a compiled Go binary); it stays a daemon-tests unit test
  against an injected `fstest.MapFS`, per the plan's explicit ownership split.
- REQ-9 (disk override present but empty → warning, not fatal) is also not E2E-tested:
  it's a startup-log assertion with no observable UI difference (the plan's own wording:
  "serve whatever is there (404s)"), and `cmd/musterd/onexit_test.go` already covers the
  empty-`-web-dist`-dir acceptance behaviourally at the Go level. Adding an E2E test that
  greps daemon stdout for a warning string would be testing a log line, not user-visible
  behaviour — out of scope for this agent's mandate.
- I did not touch `web/playwright.config.ts` — no config change was needed; the existing
  `fullyParallel`/per-run-port/`reuseExistingServer: false` setup already supports a
  fourth spec file with its own `ScratchDaemon` exactly like every other file in the
  suite.
- E2 (full suite passes under the new disk path) is not a new test by design — it's
  proven by the existing 157 pre-existing tests continuing to pass once `webDist` points
  at real assets, which is a validate-mode concern (`make e2e` after `make build
  web-build`), not something authoring mode can execute yet.

## Validate Attempt 1

Read `plans/embed-dashboard/daemon-implementation.md` and `plans/embed-dashboard/web-implementation.md`
before running — both confirmed the plan's Affected Files were built exactly as scoped
(`internal/webui/webui.go`, `internal/server/server.go`, `cmd/musterd/main.go`, `Makefile`,
`.gitignore` on the daemon side; `web/vite.config.ts`'s `outDir`/`emptyOutDir`/`keep-gitkeep`
plugin on the web side). No surprises that would require repairing my spec's assumptions
about the markup or the fixture shape.

**Rebuild**: ran `make web-build build` (this plan's required order — assets before the Go
embed) from the project root. Both steps exited 0:
- `npm run build` (via `web-build`): `tsc --noEmit && vite build` → produced
  `internal/webui/assets/index.html`, hashed `assets/index-*.{css,js}`, and restored
  `internal/webui/assets/.gitkeep` (0 bytes, confirmed).
- `go build ... -o bin/musterd ./cmd/musterd` → exit 0.
- `git status --porcelain internal/webui/assets` → empty (tree clean post-build, matching W4).

**My spec file, live**: `npm run e2e -- e2e/embedded.spec.ts` from `web/` — all 4 tests
passed on the first run, no repairs needed:

```
Running 4 tests using 4 workers
  ✓ serves /healthz without authentication from the embedded-serving daemon (29ms)
  ✓ fixture sanity: the scratch dir has no web/ or internal/ tree next to the copied binary (12ms)
  ✓ serves the working dashboard from the embedded FS with no -web-dist flag: auth, masthead, WS connects (350ms)
  ✓ still gates the embedded static handler on the auth cookie (401 relaunch page) (138ms)
4 passed (3.8s)
```

**Suite-wide collection re-check**: `npx playwright test --list` from `web/` → `Total: 161
tests in 15 files`, exit 0, no duplicate titles, no import/type errors.

**Full suite sweep** (Validate Mode step 5): `make e2e` from the project root, which
rebuilds (`web-build build`, same order) then runs the entire Playwright suite. All 161
tests passed, including the 4 new `embedded.spec.ts` tests and all 157 pre-existing tests
now exercising the disk-override path against `internal/webui/assets` (E2's proof — the
`webDist` constant move in `helpers/daemon.ts`, authored in the prior session, required no
further edit; every pre-existing spec goes through that constant rather than hardcoding a
path, so none needed touching).

No pre-existing spec's expectation was contradicted by this plan's Protocol Contract
(which states "No protocol changes" / "No dashboard views, flows, or DOM change") — so
there was no sanctioned-breakage repair to make, and no failure to triage as an
implementation-bug. The sweep was a pure confirmation run.

## Repairs (validate attempt 1)

None. My spec passed on the first live run with no locator, wait, or fixture repairs
needed.

No assertion was deleted, skipped, or weakened.

## Test Run Output (validate attempt 1)

```
$ make web-build build
cd web && npm run build
> tsc --noEmit && vite build
../internal/webui/assets/index.html                  10.05 kB │ gzip:  2.31 kB
../internal/webui/assets/assets/index-CZRVLi2C.css   22.59 kB │ gzip:  4.80 kB
../internal/webui/assets/assets/index-BdfCTTZN.js   381.27 kB │ gzip: 98.57 kB │ map: 955.27 kB
✓ built in 191ms
go build -ldflags "-X main.version=61e8bba" -o bin/musterd ./cmd/musterd

$ npm run e2e -- e2e/embedded.spec.ts
Running 4 tests using 4 workers
  ✓ 2 [chromium] › e2e/embedded.spec.ts:80:1 › serves /healthz without authentication from the embedded-serving daemon (29ms)
  ✓ 3 [chromium] › e2e/embedded.spec.ts:30:1 › fixture sanity: the scratch dir has no web/ or internal/ tree next to the copied binary (12ms)
  ✓ 1 [chromium] › e2e/embedded.spec.ts:40:1 › serves the working dashboard from the embedded FS with no -web-dist flag: auth, masthead, WS connects (350ms)
  ✓ 4 [chromium] › e2e/embedded.spec.ts:71:1 › still gates the embedded static handler on the auth cookie (401 relaunch page) (138ms)
4 passed (3.8s)

$ npx playwright test --list
Total: 161 tests in 15 files

$ make e2e
... (all 15 spec files) ...
161 passed (40.0s)
```

## Notes (validate attempt 1)

- No implementation surprises: both `daemon-implementation.md` and `web-implementation.md`
  confirmed the exact files/behaviour the plan's Affected Files section named, so no
  locator needed repairing against unexpected markup.
- The `webDist` constant move and the `serveEmbedded` fixture (both authored in the prior
  session, per `helpers/daemon.ts`'s existing doc comments) worked exactly as designed
  against the real built binary — no adjustment needed.
- REQ-3 (fail-fast) and REQ-9 (disk-override warning) remain intentionally untested at the
  E2E layer, per the authoring-mode rationale already recorded above; nothing in this
  validate run changed that assessment (daemon-tests' unit-test coverage is the correct
  home, per the plan's own Implementation Notes).
