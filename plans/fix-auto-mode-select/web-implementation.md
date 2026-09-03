# Web Implementation: fix-auto-mode-select

**Plan**: fix-auto-mode-select
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/index.html` | modified | "Start in" radiogroup: 4 radios in order `manual`(`default`, checked) / `accept edits`(`acceptEdits`) / `plan`(`plan`) / `auto`(`auto`), replacing the 3-radio `default`/`plan`/`auto-accept` set (REQ-1). |
| `web/src/api.ts` | modified | Added exported `PERMISSION_MODES` tuple (`["default","acceptEdits","plan","auto"]`) and derived `PermissionMode` type; `LaunchRequest.permissionMode` now typed as `PermissionMode` (widens to include `"auto"`). |
| `web/src/render/launch.ts` | modified | Imported `PERMISSION_MODES`/`PermissionMode` from `api.ts`. `selectedPermissionMode()` now returns `PermissionMode`, computed by checking membership in `PERMISSION_MODES` instead of a hand-written `"plan" \| "acceptEdits"` check, so `"auto"` is included automatically and any unmatched value falls back to `"default"`. `setPermissionMode()` now falls back to checking `default` when `checkRadio` reports no match (REQ-6) — mirrors `setModel`'s existing fallback-to-known-value pattern. |

## Decisions

- Followed the plan's suggestion literally: introduced one `PERMISSION_MODES` tuple in `api.ts` as the single source for both the `LaunchRequest` union and `render/launch.ts`'s radio guard (Implementation Notes — "Web pattern"), rather than duplicating the four-item literal list.
- `protocol.ts`'s `PermissionModeInfo.value: string` and `api.ts`'s `Repo.lastPermissionMode: string | null` were left untouched — both are already open strings per the plan ("an open string, last-known, never authoritative"), so no widening was needed there.
- Verified in a real browser (Playwright, vite dev server on port 5183, `#launch-dialog.showModal()`) that all four segments render on one line at the 720px dialog width, no wrap: `.seg-track` bounding box was `249.4px` wide, well under the dialog's content width; each label's bounding box shared the same `y` (624.75), confirming a single row. Screenshot taken (not committed) shows `manual │ accept edits │ plan │ auto` with `manual` checked by default. This satisfies the plan's "web-impl verifies the four labels fit the existing `.seg-track` at the dialog's width without wrapping" and the Reviewer-Verified `.seg-track` line.
- Confirmed `web/e2e/helpers/payloads.ts`, `web/e2e/helpers/session.ts`, and `web/e2e/launch.spec.ts` (locators `manual` / `accept edits` at lines 183, 332, 399) were already updated by e2e-specs before this step ran — no web-impl action needed there, per the team-lead's instruction not to touch `web/e2e/*`.
- All Testable UI Elements table rows (Start-in radiogroup, Manual/Accept-edits/Plan/Auto radios) implemented exactly as specified — no unimplementable rows.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
`npx vitest run` (pre-existing web-tests suite, ahead of the web-tests step): 24 files / 711 tests, all passing — nothing broken by this change.
No test files needed changes. None.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md's one `[web-impl]` Major — REQ-6's fallback lived in an
unexported closure (`render/launch.ts:103-106`), leaving it untestable, and did the
uncheck-then-recheck two-pass dance the reviewer called out.

**Changes made**:

- Added an exported pure function `permissionModeToCheck(stored: string | null): PermissionMode`
  to `web/src/api.ts:59` (next to `PERMISSION_MODES`) — the single decision point for
  "which radio should be checked for this stored value," returning the stored value if
  it's one of `PERMISSION_MODES`, else `"default"`. Unit-testable with no DOM.
- `render/launch.ts`: `setPermissionMode` now takes `string | null` and is a one-liner —
  `checkRadio(elements.permissionModeRadios, permissionModeToCheck(value))` — no `matched`
  check, no fallback branch, no uncheck-then-recheck transient (`checkRadio` unconditionally
  writes every radio's `.checked` in one pass, so calling it once with an already-valid
  value is equivalent to what two passes used to produce).
- `selectedPermissionMode()` (used by `submit()` to build the launch request body) now also
  goes through `permissionModeToCheck(checkedValue(elements.permissionModeRadios))` instead
  of its own hand-rolled membership check — one function now owns the fallback decision on
  both the "set a radio from a stored string" and "read a radio back out as a `PermissionMode`"
  sides, matching the review's optional suggestion.
- Swept every call site that turns a stored `lastPermissionMode` into a checked radio
  (`grep -rn "lastPermissionMode\|permissionModeRadios\|PERMISSION_MODES\|checkRadio" web/src --include="*.ts" | grep -v test` — pasted below) and dropped the now-redundant
  `?? "default"` at both, since the pure function already treats `null` as "no match":
  - `render/launch.ts:162` — `buildRecentButton`'s click handler: `setPermissionMode(repo.lastPermissionMode)`
  - `render/launch.ts:325` — `initOpen`'s first-recent auto-select: `setPermissionMode(first.lastPermissionMode)`
  - `render/launch.ts:344` — `resetForm`: `setPermissionMode("default")` (literal, already valid, unchanged)
  - `main.ts:890` only wires the radio *elements* (`requireElements` selecting `input[name="permission-mode"]`) — it never decides which one is checked, so it's not a call site of this decision and needed no change.

  Grep output confirming no other production call site exists:
  ```
  web/src/api.ts:29:  lastPermissionMode: string | null;
  web/src/api.ts:48:export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto"] as const;
  web/src/api.ts:49:export type PermissionMode = (typeof PERMISSION_MODES)[number];
  web/src/api.ts:59:  return (PERMISSION_MODES as readonly string[]).includes(stored ?? "") ? (stored as PermissionMode) : "default";
  web/src/api.ts:112:  const lastPermissionMode = value["lastPermissionMode"];
  web/src/api.ts:122:  if (lastPermissionMode !== null && typeof lastPermissionMode !== "string") return null;
  web/src/api.ts:123:  return { id, path, name, isGit, branch, pinned, lastLaunchedAt, launchCount, lastModel, lastPermissionMode };
  web/src/main.ts:890:  permissionModeRadios: requireElements<HTMLInputElement>('input[name="permission-mode"]'),
  web/src/render/launch.ts:43:  permissionModeRadios: HTMLInputElement[];
  web/src/render/launch.ts:55:function checkRadio(radios: readonly HTMLInputElement[], value: string): boolean {
  web/src/render/launch.ts:92:    const matched = MODEL_PRESETS.includes(...) && checkRadio(elements.modelRadios, value);
  web/src/render/launch.ts:94:      checkRadio(elements.modelRadios, "other");
  web/src/render/launch.ts:105:    checkRadio(elements.permissionModeRadios, permissionModeToCheck(value));
  web/src/render/launch.ts:116:    return permissionModeToCheck(checkedValue(elements.permissionModeRadios));
  web/src/render/launch.ts:162:          setPermissionMode(repo.lastPermissionMode);
  web/src/render/launch.ts:325:        setPermissionMode(first.lastPermissionMode);
  ```
  `checkRadio` itself is unchanged and still used generically by `setModel` (a different
  decision, with its own `MODEL_PRESETS`/"other" fallback — out of scope for this fix).

**For web-tests**: unit-test `permissionModeToCheck` directly from `web/src/api.ts` — no
DOM needed. Cases to cover: each of the four `PERMISSION_MODES` values round-trips to
itself; an unrecognised string (e.g. `"planMode"` or a future Claude Code mode) falls back
to `"default"`; `null` falls back to `"default"`; the empty string falls back to
`"default"`.

**Verification**:
```
$ cd web && npx tsc --noEmit && echo TSC_OK
TSC_OK
$ npm run build
✓ built in 236ms
$ cd .. && make web-build
✓ built in 189ms
```
No `any` introduced (`git diff main...HEAD -- web/src | grep '^+' | grep -w any` → no hits).
