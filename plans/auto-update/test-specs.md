# E2E Test Specs: auto-update

**Plan**: auto-update
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 15
**Live run**: 15/15 passing (update.spec.ts); 302/302 passing (full suite, `make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/update.spec.ts | a strictly newer release badges Settings and shows Running/Available in the dialog (E1, INV-2) | REQ-6, REQ-9, REQ-10 | Badge dot + `aria-label`/`data-update` appear; dialog Running/Available/toggle/buttons match Text rules |
| web/e2e/update.spec.ts | pref persisted off across a daemon restart: two check intervals pass with zero further /latest requests (E2, INV-1, edge case 6) | REQ-2, INV-1 | A restarted daemon with the pref persisted off makes zero `/latest` requests over two ticks |
| web/e2e/update.spec.ts | unchecking the toggle clears the badge and shows checking disabled; rechecking triggers an immediate check (E3, REQ-3, INV-1) | REQ-3 | Toggle off clears badge/shows "checking disabled"; toggle on increments `/latest` count immediately, badge returns |
| web/e2e/update.spec.ts | clicking Update swaps the on-disk binary and reports Updated without restarting the running process (E4, User Flow 2) | REQ-12, REQ-14..18, REQ-25 | Phase text walks Downloading→Updated; binary SHA-256 swapped; `-version` reports new; Running unchanged; exactly one archive download |
| web/e2e/update.spec.ts | Update and restart brings back the same Claude session, its terminal, and an unchanged tmux pane PID (E5, INV-5 one-session case) | REQ-11, REQ-19, INV-5 | Confirm body "No plain-terminal shells…"; pane/server PID unchanged; reconnect shows new Running/up to date; session card + terminal still work |
| web/e2e/update.spec.ts | Update and restart with two Claude sessions and a plain shell names the shell in the confirm, then removes only the shell (E6, INV-5 two-session case) | REQ-11, REQ-27, INV-5 | Confirm body "0 shells" then "1 shell will close: `<title>`"; after restart the shell tmux session is gone, both Claude panes' PIDs unchanged |
| web/e2e/update.spec.ts | each verification refusal reports Update failed and leaves the on-disk binary byte-identical (E7, INV-3, REQ-24) | REQ-15, REQ-16, REQ-24, INV-3 | Tampered checksums / missing minisig / foreign key / SHA mismatch each yield "Update failed: …" with an unchanged binary hash |
| web/e2e/update.spec.ts | a dev build never checks or badges, and the dialog shows no Update buttons (E8, REQ-8) | REQ-8 | `bin/musterd`'s own dev version string: no badge, no buttons, zero `/latest` requests |
| web/e2e/update.spec.ts | a binary staged under $HOMEBREW_PREFIX badges but disables both buttons with the brew remedy (E9, REQ-21, edge case 11) | REQ-13, REQ-21 | Homebrew classification: badge shown, both buttons disabled, status line names `brew upgrade musterd` |
| web/e2e/update.spec.ts | fake latest equal to running, then older: Available reads up to date and no badge either way (E10, D9, edge case 4) | REQ-6 | Equal-or-older releases never set `available`; text "up to date", no badge, in both cases |
| web/e2e/update.spec.ts | two pages clicking Update while the archive is held: exactly one download, both report Updated (E11, REQ-20) | REQ-20 | Concurrent `POST /api/update/apply` from two pages serialises to one download; both observe the same completion |
| web/e2e/update.spec.ts | Update and restart returns the dashboard on the same port and data dir (E12, INV-7) | REQ-19, INV-7 | Same `baseURL`/tokens answer after a non-default-addr/data-dir/tmux-socket daemon's restart |
| web/e2e/update.spec.ts | a binary staged inside a scratch git tree badges but disables both buttons naming the installer (E13, REQ-21, edge case 9) | REQ-13, REQ-21 | Unmanaged (git-tree) classification: badge shown, both buttons disabled, status line names the installer |
| web/e2e/update.spec.ts | `musterd -update` while the daemon runs is detected within one tick, showing Restart now with no click (E14, REQ-26) | REQ-22, REQ-26 | An out-of-band `-update` CLI swap is detected by the running daemon's own tick; dialog updates with no UI interaction |
| web/e2e/update.spec.ts | Restart now after a plain Update shows the confirm and completes with no second download (E15, REQ-25) | REQ-25 | `Restart now` reuses the already-installed binary; archive request count does not increase across the restart-only apply |

## Fixture Changes

- **`web/e2e/helpers/releases.ts`** (new) — `FakeReleaseServer`: an in-process HTTP server standing in for `github.com/Zalaras/muster/releases` (never the real host). `/latest` 302s to `{self}/tag/<tag>` per `setLatest()` (REQ-5, both absolute-and-relative-Location parsing exercised since this server's own redirect is absolute); `/download/<tag>/<asset>` serves whatever `publish()` built. `publish()` shells out to the system `tar` to build a real `musterd_<ver>_darwin_<arch>.tar.gz` containing a real, already-built `musterd` binary plus a `README.md`, computes its SHA-256 into `checksums.txt` (GoReleaser's `<hex>  <asset>` shape, REQ-16), and signs it in legacy minisign `Ed` mode using Node's own `crypto` Ed25519 primitives (REQ-15/Implementation Notes > Minisign). `requestCount`/`hold`/`release` mirror `FakeGitHubAPI`'s established pattern. `tamper(tag, kind)` implements all four E7 refusal fixtures. `goArch()` maps this test machine's `process.arch` to the Go `runtime.GOARCH` string the daemon resolves internally, so archive naming agrees without either side hardcoding one.

  **Cross-checked against a real `minisign` binary during authoring** (not shipped as a test, just verification of the byte format before writing the class): generated a keypair and signed a file with `minisign -S -l`, decoded both the public-key file and the `.minisig` file byte-for-byte to confirm the `"Ed"(2) ‖ key_id(8) ‖ payload` layout the plan's Implementation Notes describe, and confirmed the global (line-4) signature covers `sig ‖ <trusted-comment-TEXT>` (not the whole "trusted comment: …" line — this wasn't stated byte-for-byte in the plan and would have been a plausible place to get wrong). Then generated an entirely Node-signed keypair/pubkey/sigfile from scratch and had the *real* `minisign -V` binary verify it successfully, and confirmed a single flipped byte in the signed file makes that same real verifier refuse. This is the strongest available evidence the fake's signer produces genuine minisign-format output, not merely internally-self-consistent output — `github.com/aead/minisign` (legacy `Ed` mode) should therefore accept it directly once daemon-impl lands.

- **`web/e2e/helpers/update.ts`** (new) — locators for the Settings dialog's Updates section and the restart confirm dialog, transcribed from the plan's Testable UI Elements table. Reuses `helpers/theme.ts`'s `settingsButton`/`settingsDialog`/`openSettingsDialog` rather than redefining them (the Settings button's default substring-name match already covers the badged `aria-label`).

- **`web/e2e/update.spec.ts`** (new) — E1 through E15, as tabulated above.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1..3 | E1, E2, E3 |
| REQ-4 | E1 (immediate on-Start check), E14 (periodic tick) |
| REQ-5 | E1, E4 (absolute redirect + `{base}/download/{tag}/asset` shape) |
| REQ-6 | E1, E10 |
| REQ-8 | E8 |
| REQ-9, REQ-10 | E1 |
| REQ-11 | E5, E6 |
| REQ-12 | E4, E7 |
| REQ-13 | E8, E9, E13 |
| REQ-14..18 | E4, E7 |
| REQ-15, REQ-16, REQ-24 | E7 |
| REQ-19 | E5, E6, E12 |
| REQ-20 | E11 |
| REQ-21 | E9, E13 |
| REQ-22 | E14 |
| REQ-25 | E4 (Restart now label), E15 |
| REQ-26 | E14 |
| REQ-27 | E6 |
| INV-1 | E2, E3 |
| INV-2 | E1 |
| INV-3 | E7 |
| INV-5 | E5 (one session), E6 (two sessions + shell) |
| INV-7 | E12 |
| D9 (E2E-visible edge) | E10 |

Not covered here (by design, per the plan): REQ-23/D5/D6/M1/M2 (CI signing infra, Manual/Reviewer-verified); REQ-7, D7/D8/D10..D26 (Go-unit-level, daemon-tests'); W1..W10 (web-tests'/reviewer's).

## Notes

**Blocking dependency (expected, per the orchestrator's handoff instructions).**
`npx playwright test --list` currently fails at collection:

```
SyntaxError: The requested module './helpers/daemon' does not provide an export named 'buildVersionedMusterd'
Listing tests:
Total: 0 tests in 0 files
```

This is the plan's own cross-dependency, not a defect in the three files this step added. Per the spawn prompt: `web/e2e/helpers/daemon.ts`'s new options (`updateBaseURL`, `updateCheckInterval`, `updatePublicKeyFile`, `binary`, `env`) and new exports (`buildVersionedMusterd`, `stageBinary`) are listed under the plan's **Web** Affected Files, i.e. web-impl's job, and I was directed not to add them to `daemon.ts` myself. I imported and called them exactly as the plan names them (function names, option names, and the one worked example — `buildVersionedMusterd(version): Promise<string>`, `stageBinary(src, dir?): Promise<string>`) and treated `stageBinary`'s `dir` argument as optional (omit for a fresh installer-classified `mkdtemp`; pass a directory the caller already prepared for the homebrew/unmanaged fixtures) since the plan's own Implementation Notes describe exactly that usage split ("Homebrew simulation is `HOMEBREW_PREFIX=<scratch>/brew`... Unmanaged simulation is `git init` in the staging dir").

To confirm the failure is *only* this cross-dependency and not a defect anywhere in my three files, I ran `npx tsc --noEmit` (not part of the authoring gate, since Playwright's own transform doesn't type-check — used here only as a stronger self-check): every error it reports against `update.spec.ts` is either the same missing `daemon.ts` export or an excess-property complaint against `ScratchDaemonOptions` for the same new fields (`binary`, `updateBaseURL`, and by the same mechanism `updateCheckInterval`/`updatePublicKeyFile`/`env`, which TypeScript's excess-property check doesn't enumerate individually once it's already flagged one). `web/e2e/helpers/releases.ts` and `web/e2e/helpers/update.ts` produce **zero** tsc errors on their own. `sh web/scripts/e2e-lint.sh` passes clean. I also grepped for duplicate test titles in `update.spec.ts` myself (none — the file couldn't be checked by Playwright's own global collision check since collection never got past the import). Once web-impl lands the named `daemon.ts` additions, I expect `--list` to succeed with 15 tests with no further edits to these three files — recommend `e2e-validate` re-runs `--list` first as a cheap confirmation before attempting a live run.

**Other assumptions, flagged for validate mode:**
- The unmanaged-install remedy text (E13) isn't pinned verbatim by the plan ("names the installer one-liner"); I matched loosely (`/install\.sh|curl/i`) against `scripts/install.sh`'s own name. Likely needs tightening once `internal/selfupdate/install.go`'s actual `InstallerRemedy` string exists.
- `stageBinary`'s exact signature is inferred from the plan's prose, not a type signature (see above) — if web-impl ships a different argument order or a required second argument, my calls (`stageBinary(oldBinary)` for installer, `stageBinary(oldBinary, someDir)` for homebrew/unmanaged) may need a mechanical adjustment.
- The badge dot (`settingsBadgeDot`) is asserted via plain `toBeVisible()`/`toBeHidden()`, not paired with an opacity check — the plan describes it as a static filled circle with no stated hover/fade behaviour, and it's `aria-hidden` (decorative, not a control a user acts on), so the opacity-trap concern for interactive elements doesn't obviously apply here. If web-impl implements the show/hide via `opacity` rather than the `hidden` attribute or `display`, this will need a `toHaveCSS("opacity", …)` companion in validate mode.
- E4/E7/E11 assume the fake server's `hold()` (which holds *every* request, not just the archive) is safe to use for deterministic phase observation without the daemon's periodic `/latest` check interfering — true for the default 24h interval every one of those tests leaves in place.
- No hook or status-line payload is synthesized anywhere in this file (correctly, per the plan: this feature adds no Claude Code ingest path). Sessions used in E5/E6 are launched via the real `POST /api/sessions` only, per `helpers/session.ts`'s existing convention.

No test asserts a role the plan's Testable UI Elements table doesn't support, and no existing spec file was edited or had coverage removed (this plan's E2E Scope is `new-specs`).

## Validate Attempt 1

Rebuilt (`make web-build build` from the project root — required, since `npm run e2e -- <file>` alone
serves whatever binary/dashboard was last compiled) and ran `update.spec.ts` live three times total
against the completed daemon-impl/web-impl/daemon-tests/web-tests work.

**Run 1** (baseline, no spec edits): 12/15 passed, 3 failed — `E8`, `E9`, `E11`. Triaged each against
`daemon-implementation.md`/`web-implementation.md` and the actual shipped code before touching anything.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | E8 — dev build shows no Update buttons | `expect(updateRestartButton(dialog)).toHaveCount(0)` timed out: locator resolved to 1 element | `#update-restart-button` is a plain id locator, not a role query. `render/update.ts` never removes either button from the DOM — it toggles the `hidden` attribute (`elements.restartBtn.hidden = !vm.buttonsVisible`), paired with a `style.css` `[hidden] { display: none }` companion rule (confirmed by reading both files). `getByRole` happens to exclude hidden elements from its default match set, which is why the sibling `updateApplyButton` (a role locator) assertion on the same line passed — `toHaveCount(0)` can never be true for an id locator against an element the product deliberately keeps in the DOM. | `await expect(updateRestartButton(dialog)).toBeHidden();` | REQ-13 ("absent for a dev install"). **Proven red**: temporarily forced `elements.applyBtn.hidden = false; elements.restartBtn.hidden = false;` in `web/src/render/update.ts`, rebuilt, reran E8 alone — the repaired `toBeHidden()` assertion failed exactly as expected (`Received: visible`) once the unrelated `toHaveCount(0)` line above it was also temporarily disabled to isolate it. Restored `render/update.ts` (`git diff --stat` showed zero product diff afterward) and reran — green. |
| 2 | E9 — binary staged under `$HOMEBREW_PREFIX` disables both buttons | `expect(updateApplyButton(dialog)).toBeDisabled()` failed: button was enabled (install resolved to `installer`, not `homebrew`) | macOS's `mkdtemp(os.tmpdir())` returns a `/var/folders/...` path that is itself a symlink to `/private/var/folders/...` (confirmed: `fs.promises.realpath` on a freshly-`mkdtemp`'d dir returns the `/private/var/...` form). `cmd/musterd`'s startup classification resolves its own exe path through `filepath.EvalSymlinks` before calling `selfupdate.Classify`, so the daemon's real `exePath` is under `/private/var/...`, while my fixture's `HOMEBREW_PREFIX` env value stayed the unresolved `/var/...` form. `Classify`'s `withinDir` is a `filepath.Rel` path-prefix comparison (not a filesystem stat), so the two never matched and the daemon fell through to `installer`. E13 (the unmanaged/git-tree sibling test) didn't hit this because its check is an `os.Stat` on `.git` — filesystem identity, indifferent to which symlink alias names the same path — not a string comparison. | Resolved `scratchRoot` via `realpath()` before deriving `brewPrefix`, so both sides of the comparison name the same real path. | REQ-13/REQ-21 (homebrew classification, both buttons disabled, brew remedy shown) — unweakened; the fix is entirely in fixture setup, not in what's asserted. |
| 3 | E11 — two pages clicking Update, exactly one download | `updateApplyButton(dialog2).click()` timed out for the full 60s: button never became enabled | Not a product defect — verified by re-running with the two attempted click orderings. The instant either window's click starts the apply, the daemon's `update` broadcast (phase → `downloading`) reaches every connected window and disables the Update button everywhere (Text rules: "phase not in flight"), correctly per W10 (no optimistic local state — the disable is broadcast-driven, same mechanism proven correct by E1–E7). Playwright's `.click()` imposes its own actionability wait (≥2 stable animation frames) per page/CDP session before dispatching; a websocket round-trip over localhost consistently lands well inside that window, so whichever side goes through `.click()` deterministically loses to the other — confirmed by trying both orderings (sequential and `Promise.all`) and even a click-vs-raw-POST race, which flipped which side lost but never let both win. This is the test tool's own click-simulation latency, not a constraint a real second browser window has (a native click's fetch dispatches synchronously). E4/E7/E15 already prove the button's click reliably reaches `POST /api/update/apply`; E11's unique job is the server-side concurrency guarantee (REQ-20) and both windows converging via the broadcast, not re-proving click-to-fetch wiring. | Both windows now fire the identical authenticated request their own click handler sends (`src/api.ts`'s `applyUpdate` — same endpoint/body/same-origin credentials) via `page.request.post`/`page2.request.post` in one `Promise.all`, asserting both responses are `202`. The rest of the test (phase text, final "Updated" status on both dialogs via their own websockets, exactly-one archive download) is untouched. | REQ-20 (concurrent-apply serialisation: two genuinely concurrent requests, one download, consistent broadcast to both windows) — strengthened if anything: the previous version couldn't actually prove concurrency since one click always lost the race outside the assertions; this version proves the daemon actually receives and serialises two overlapping requests. |
| 4 | `shell.spec.ts`: `GET /api/state returns exactly the M0 snapshot object once authenticated` | `toEqual` failed: received body had extra `prefs.updateCheck` and a new top-level `update` object | Plan auto-update's approved protocol delta (§3.3/§5.2/§5.5/§5.7, merged into `docs/protocol.md`) adds `updateCheck` to every `prefs` echo and a top-level `update` object to every snapshot — this is exactly the class of pre-existing exact-shape assertion the plan's delta is documented to break (same pattern as every prior plan's own comment trail in this file, e.g. `railSort`/`theme`/`usageModel`). Not a spec-authoring mistake of mine (`update.spec.ts`'s own scope is `new-specs`, unrelated) — a sanctioned break from this plan's approved contract. | Added `updateCheck: true` to the expected `prefs` object and the full expected `update` object (`install: "dev"` — this scratch daemon runs `bin/musterd`, itself `git describe`-stamped so REQ-8 classifies it dev; `available`/`checkedAt`/`installed` null; `apply` idle; `remedy` null since dev has none), with `running: expect.any(String)` since the dev version string changes with every commit and pinning it exactly would break on the next commit for reasons unrelated to this test's purpose. | Every other field in the exact-shape assertion is untouched and still pinned literally — protocol delta cited (`docs/protocol.md` §3.3/§5.2/§5.5/§5.7). |
| 5 | `views.spec.ts`: `GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)` | Same `toEqual` failure shape, on `prefs` alone, both before and after the `PUT /api/prefs` in the test | Same root cause as repair 4 — `prefs.updateCheck` is new and unconditionally present. | Added `updateCheck: true` to both expected `prefs` objects (before and after the density PUT) and widened the inline type annotations to include it. | Every other field (`view`, `density`, `usageModel`, `railSort`, `theme`) stays pinned exactly as before, both pre- and post-PUT — protocol delta cited (`docs/protocol.md` §3.3/§5.5). |

`No assertion was deleted, skipped, or weakened.`

### Verification sequence

1. `make web-build build` (project root) — clean, confirms the sanctioned `ws.test.ts`/`protocol.test.ts` fixture breakage web-impl flagged was already fixed by web-tests (no `tsc` errors).
2. `npx playwright test --list` (web/) — 302 tests, 27 files, no collection errors, before and after every edit.
3. Deliberately broke `web/src/render/update.ts` (forced both buttons always visible), rebuilt, ran E8 alone to prove repair #1's `toBeHidden()` assertion actually goes red on a regression; restored the file (`git diff --stat -- web/src/render/update.ts` showed no diff afterward), rebuilt again.
4. `npm run e2e -- e2e/update.spec.ts` (web/) — iterated through repairs 1–3; final run: **15/15 passing** in 19.4s (down from over a minute dominated by E11's 60s timeout).
5. `npx tsc --noEmit -p .` (web/) — zero errors against the edited spec files.
6. `make e2e` (project root, full suite) — first run: 300/302 passing, 2 failures (`shell.spec.ts`, `views.spec.ts`, both the sanctioned-breakage shape above). Applied repairs 4–5, reran `npx playwright test e2e/shell.spec.ts e2e/views.spec.ts` — 21/21 passing. Reran full `make e2e` — **302/302 passing**.
7. Final `git status --short` shows only `web/e2e/shell.spec.ts`, `web/e2e/update.spec.ts`, `web/e2e/views.spec.ts` modified — no product file left changed.

### Test Run Output

```
Running 15 tests using 4 workers
  ✓ E1..E15 (update.spec.ts)
  15 passed (19.4s)

$ make e2e
  ...
  302 passed (1.5m)
```

### Notes for the record

- The three "Other assumptions, flagged for validate mode" items from authoring that turned out to
  matter: none of the badge-opacity, `stageBinary` signature, or unmanaged-remedy-wording concerns
  materialized as defects — `stageBinary`/`buildVersionedMusterd` match my authoring-time calls
  exactly, and E13's loose `/install\.sh|curl/i` status-line match passed against the real
  `InstallerRemedy` string (`internal/selfupdate/install.go`) without needing tightening.
- `helpers/daemon.ts`'s new `ScratchDaemonOptions` fields and exports (`buildVersionedMusterd`,
  `stageBinary`, `updateBaseURL`, `updateCheckInterval`, `updatePublicKeyFile`, `binary`, `env`) all
  worked exactly as called — no handoff needed back to web-impl.
- No hook or status-line payload is synthesized anywhere in this file, consistent with authoring
  (this plan adds no Claude Code ingest path).
