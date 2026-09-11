# Web Implementation: auto-update

**Plan**: auto-update
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | modified | `Prefs.updateCheck`; `UpdateInstallKind`/`UpdateApplyPhase`/`UpdateApply`/`UpdateInfo` types + parsers; `Snapshot.update`; `UpdateMessage` + `parseMessage` case |
| `web/src/ws.ts` | modified | `WsClientHandlers.onUpdate`; dispatch for the `update` message type |
| `web/src/api.ts` | modified | `PrefsRequest.updateCheck`; `applyUpdate(restart)`; `fetchRestartImpact()` + `RestartImpact`/`RestartImpactShell` types |
| `web/src/render/update.ts` | created | Pure `buildUpdateViewModel` (every Text-rules row) + `renderUpdateSection`, `renderSettingsBadge`, `renderRestartImpact`, `initRestartConfirm` (modelled on `render/confirm.ts`) |
| `web/src/render/settings.ts` | modified | `SettingsDialogElements`/`Handlers` extended with `updateToggle`/`applyBtn`/`restartBtn` and their wiring; `setChecked` takes `updateCheck` too |
| `web/src/main.ts` | modified | `currentUpdate`/`currentPrefs` state; `renderUpdateBlock()` called every render pass; Update/Update-and-restart/Restart-confirm dispatchers; badge + section wiring; confirm closes on disconnect |
| `web/index.html` | modified | Settings-button badge dot; `#settings-update` fieldset (Running/Available/toggle/status/buttons); `#update-restart-dialog` confirm |
| `web/src/style.css` | modified | `.update-dot` (+ `[hidden]` companion), `#settings-update`, `.update-versions`, `.check`, `.update-actions`, apply/restart-button `[hidden]` companion — tokens only |
| `web/e2e/helpers/daemon.ts` | modified | `ScratchDaemonOptions`: `updateBaseURL` (always passed, default `""`), `updateCheckInterval`, `updatePublicKeyFile`, `binary`, `env`; exports `buildVersionedMusterd(version)`, `stageBinary(src, dir?)` |

## Decisions

- `Snapshot.update`/`Prefs.updateCheck` follow the existing "required on the parsed type, defaulted at parse time when the wire key is absent" convention already used for `railSort`/`theme` (never `??` at every call site).
- `render/update.ts`'s `UpdateViewModel.toggleChecked` is computed (for W5's full Text-rules table contract) but never applied to the DOM by `renderUpdateSection` — only `settings.ts`'s `setChecked(theme, updateCheck)` writes `#update-check-toggle`'s `.checked`, called only from `main.ts`'s `applyPrefsFromSnapshot` (the same INV-7 code path the theme radios already use). `renderUpdateSection` writes only `.disabled` (needs `install`, which only the view model carries). This avoids two writers of the same DOM property while keeping both the plan's mandated `buildUpdateViewModel` signature and the INV-7 "only ever from the broadcast" discipline intact.
- `update === null` (before the first snapshot, or a pre-plan daemon that never sends `update`, edge case 32) renders `running: "unknown"` (the design-system §6 honesty word), `available: "not checked yet"`, buttons hidden, badge off, and the toggle disabled (its own effect is unobservable with no daemon-side support). No plan text pins the exact `running` string for this branch; verified by building a real binary and confirming it renders and never throws (see Handoff).
- The restart confirm dialog (`render/update.ts`'s `initRestartConfirm`) is a second instance of the `render/confirm.ts` End/Remove pattern (precedent reuse, docs/conventions.md's cross-cutting-concern check) rather than a new mechanism: `showModal()`/`close()`, body rebuilt from data at open time, Confirm closes then fires the handler.
- `ScratchDaemonOptions.binary` is a distinct field from the existing `musterdBinOverride` (which stays harness-self-test-only per its own doc comment) — `binary` takes precedence when both are given. This matches the plan's Affected Files naming `binary` as new, separate from the pre-existing field.
- `stageBinary`'s `dir` argument, when supplied, is used as-is (assumed to already exist — every call site in `update.spec.ts` either passes nothing, or a directory it just created via `mkdtemp`/`mkdir`); no extra `mkdir` call was added since no test needs it.

## Handoff

**Build status**: NOT FULLY GREEN — `npx tsc --noEmit` (and therefore `npm run build`, which runs it first) fails with exactly two errors, both pre-existing fixtures in `web/src/ws.test.ts` that the plan's new required `Prefs.updateCheck` field breaks:

```
src/ws.test.ts(16,3): error TS2741: Property 'updateCheck' is missing in type '{ view: "focus"; ... }' but required in type 'Prefs'.
src/ws.test.ts(22,3): error TS2741: Property 'updateCheck' is missing in type '{ view: "tiles"; ... }' but required in type 'Prefs'.
```

This is a test-fixture change, not an import-path fix, so it is outside what I may edit. **Exact fix needed** (web-tests):
- `web/src/ws.test.ts:16` — the `snapshot: Snapshot` literal's `prefs` object needs `updateCheck: true` added.
- `web/src/ws.test.ts:22` — the `prefsMessage: PrefsMessage` literal's `prefs` object needs `updateCheck: true` (or `false`, if a test wants to exercise the other value — none currently does) added.
- `web/src/ws.test.ts:12` — the `snapshot: Snapshot` literal itself is **also** missing the new top-level `update: UpdateInfo | null` field entirely (TypeScript only reports the first nested mismatch per literal, so `tsc` doesn't surface this one on its own — verified with a minimal repro). Needs `update: null` added alongside the other top-level fields.

Once those three edits land, `npx tsc --noEmit` passes against my code (confirmed: with only my own source files, `tsc --noEmit` reports zero errors — the two above are the entire remaining list).

`vite build` alone (bypassing the `tsc` step) already succeeds cleanly and produces a valid embedded dashboard — verified: `npx vite build` from `web/` built without error, and `make build` from the project root produced a working `bin/musterd` from that output.

`web/src/protocol.test.ts` also constructs `Prefs`-shaped object literals with `railSort`/`theme` but **without** a type annotation (`const validSnapshot = {...}`, passed into `parseMessage(unknown)`), so it does not fail `tsc`. It will, however, fail at **runtime** under Vitest: several `toEqual(...)` assertions (e.g. the "defaults a missing railSort" test) compare against an expected object that lacks the now-always-present `prefs.updateCheck: true` and top-level `update: null` fields my `parseMessage`/`parseSnapshot` changes add. This is sanctioned breakage for web-tests, same root cause as the `ws.test.ts` fixtures above — not something I'm permitted to touch (assertion content, not an import).

**Other gates — all clean**:
- `make contrast`: `instrument: 43 pairs, 0 failures`; `dark: 43 pairs, 0 failures`; `light: 43 pairs, 0 failures`.
- `make e2e-lint`: `e2e-lint: clean`.
- `npx playwright test --list` (from `web/`): all 302 tests across 27 files collect, including all 15 `update.spec.ts` tests (E1–E15) — confirms `buildVersionedMusterd`/`stageBinary` now resolve and match the spec's call shapes.
- Manually verified (real browser via `playwright-core` against a locally built `bin/musterd`, no `-update-*` flags — today's pre-daemon-impl state): the Settings-button badge dot and both apply buttons start `hidden` (`display: none`, confirmed via `getComputedStyle`) and become `display: block` the instant `hidden` is cleared — proves the `[hidden]` CSS companions actually pair with the JS toggle, not just that the attribute is set. Opening the Settings dialog against this daemon (which sends no `update` key at all, i.e. `update === null`) renders `Running: unknown`, `Available: not checked yet`, toggle checked+disabled, legend `Updates`, no `aria-busy` — matching the edge-case-32 branch, no throw.

**E2E run**: ran `update.spec.ts` for real against the freshly built `bin/musterd`. Every test that reaches `startDaemon(...)` fails identically at daemon spawn:
```
musterd: flag provided but not defined: -update-base-url
```
This is `cmd/musterd`'s flags not existing yet — confirmed the binary's `-h` output has no `-update-*` flags, even though `internal/selfupdate/*.go` and `internal/server/update.go` already exist on disk (daemon-impl in progress, per the team lead's note). Not a defect in the web harness or the dashboard code: `ScratchDaemonOptions` builds and passes the documented flags exactly as the plan specifies, and `npx playwright test --list` already confirmed every spec's imports/call shapes resolve. This run is the smoke check the web-impl role owns, not the E2E gate — re-run once daemon-impl lands the flags.

**No `any` types** in any new/changed web file (checked via grep — only prose comments contain the word "any").
