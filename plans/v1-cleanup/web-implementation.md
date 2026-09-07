# Web Implementation: v1 Cleanup

**Plan**: v1-cleanup
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/notice.ts` | created | REQ-12: extracted show/clear/auto-hide notice logic, shared by `terminal/pane.ts` and `render/dead.ts`. Operates on a minimal `{ hidden, textContent }` shape (`NoticeTarget`) so it needs no DOM. `showNotice(target, text, kind)` — `kind: "outcome"` (default) auto-hides after 5s, `kind: "inflight"` (REQ-13) never arms a timer. Per-target `WeakMap` timer keying preserves edge case 8 (two surfaces time out independently) — the property `dead.ts`'s own WeakMap already had. |
| `web/src/terminal/pane.ts` | modified | `TerminalSurface.showNotice` delegates to `notice.ts`; dropped the private `noticeTimer` field. Added a `kind` parameter (default `"outcome"`, backward compatible with `main.ts`'s existing one-arg call). The one in-flight caller (`locateAndPasteOne`'s `showNotice(locatingText(file.name), "inflight")`) is now the only caller passing `"inflight"` — REQ-13. `dispose()` now clears any pending timer via `showNoticeOn(this.noticeEl, null)` instead of `clearTimeout(this.noticeTimer)`. |
| `web/src/render/dead.ts` | modified | `showDeadSurfaceNotice` delegates to `notice.ts`'s `showNotice` (default `"outcome"` kind — every caller here is a failure outcome per the plan's Implementation Notes, so REQ-13's distinction never applies here). Deleted the module-local `noticeTimers` WeakMap (moved into `notice.ts`). Signature and behaviour unchanged. |
| `web/src/api.ts` | modified | REQ-14: corrected `permissionModeToCheck`'s doc comment — names both callers (`setPermissionMode` and `selectedPermissionMode`, not just the former) and says the function takes `null` directly rather than "callers coerce to the empty string". |
| `web/src/render/launch.ts` | modified | REQ-14: same correction on the comment above `setPermissionMode` — names both callers, says `permissionModeToCheck` takes `null` directly. |
| `web/src/style.css` | modified | REQ-15: `.card.pinned-last` and `.strip .card.pinned-last` now use `--edge` instead of `--line-control` for the pinned-block boundary rule, per design-system §1's documented role for `--edge` ("boundaries that must be seen on their own, ≥ 3:1"). No new token, no theme-block edits, thickness unchanged (1px). |

## Decisions

- `NoticeTarget.hidden` is typed `boolean | "until-found"` rather than plain `boolean` — TS's
  lib.dom.d.ts types `HTMLElement.hidden` as that union (the HTML content-visibility
  addition), and typing the interface as bare `boolean` failed `tsc --noEmit` with
  `Type 'string | boolean' is not assignable to type 'boolean'` at both `pane.ts`'s and
  `dead.ts`'s call sites (confirmed by running `npx tsc --noEmit` before this change and
  seeing exactly that error at `dead.ts:137`, `pane.ts:316`, `pane.ts:393`). `notice.ts`
  itself only ever assigns the two boolean literals, so this widening has no behavioural
  effect — it only relaxes the interface to admit a real `HTMLElement` without a cast, which
  is what lets `dead.test.ts`'s plain-object fakes (cast `as unknown as HTMLElement`) and a
  real DOM element both satisfy the same type.
- Testable UI Elements table: both listed rows (terminal pane notice, pinned-block
  separator) were honoured as written — no element added/removed/renamed, so no locator
  changes were needed on my side.
- Precedent check (docs/conventions.md): grepped for `noticeTimer`/`noticeTimers` after the
  extraction — zero hits outside `notice.ts`, confirming no third copy of this pattern was
  left behind or missed.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files needed changes I wasn't allowed to make.

**E2E smoke check** (per the plan's own affected specs — `drop.spec.ts` for REQ-13,
`rail-order.spec.ts` for REQ-15's `pinned-last` class (asserts only class presence, not
computed style, so untouched by the token swap), `plain-shell.spec.ts` for the dead-surface
notice path): ran `make web-build build` then
`npx playwright test drop.spec.ts rail-order.spec.ts plain-shell.spec.ts` from `web/` —
**52 passed (19.7s)**, no failures.

Full `web/` unit suite: `npx vitest run` — **28 files, 1041 tests passed**, including
`render/dead.test.ts`'s `showDeadSurfaceNotice` describe block unchanged (W5) and
`terminal/drop.test.ts`.
