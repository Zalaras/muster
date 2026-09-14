# Web Implementation: Session lifecycle robustness

**Plan**: session-lifecycle
**Mode**: initial
**Pack**: `kb: pack 21907 words` / `kb: WARN pack exceeds budget of 8000 words` (features=lifecycle,actions,launch,surfaces,ingest)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/render/actionerror.ts` | created | `renderActionError(el, message)` — W2's pure toggle for `#action-error`, signature mirrors `render/banner.ts`'s `renderBanner(el, visible)` per the plan's Placement note |
| `web/index.html` | edited | `<p id="action-error" class="action-error" role="alert" hidden>` immediately after `#banner` (line 50), global markup — not scoped to a surface |
| `web/src/style.css` | edited | `.action-error` rule reusing `--banner-bg`/`--banner-line`/`--banner-fg` (no new colour tokens, `kb:adr/theme-danger-tokens-not-rose`), plus its `[hidden] { display: none; }` companion |
| `web/src/features/actions.ts` | edited | `requireElement("#action-error")` + `showActionError(message)`; `doEnd`/`doResume`/`doRemove` now call it with `result.error.message` on failure and `null` on success (in addition to the existing `console.error`); `handleRemoved` now calls `forget(window.localStorage, id)` |
| `web/src/reader/memory.ts` | edited | `StorageLike` gains `removeItem` (only consumer is this file + its test, which already implements it in every fixture); new `forget(storage, sessionId)` — same try/catch-to-no-op contract as `loadMemory`/`saveMemory` |
| `web/src/sessions/card.ts` | edited | new `resumeDisabledReason(session): string | null`, shared by `mainhead.ts` and `dead.ts` so the two surfaces' wording can't drift (same pattern as `stateBadgeText` above it) |
| `web/src/render/mainhead.ts` | edited | `elements.resumeBtn.title = resumeDisabledReason(session) ?? ""` alongside the existing (pre-existing, unchanged) `disabled` line |
| `web/src/render/dead.ts` | edited | same one-line addition on `refs.resumeBtn.title` |

## Decisions

- **Mechanism chosen for W3: `.title`, not `aria-description`.** Both test files' `resumeDisabledReason()` helper accept either; `.title` is the simpler native property and both surfaces' buttons are plain `<button>` elements with no existing `title` use to conflict with.
- **`StorageLike` widened to include `removeItem` directly**, rather than introducing a separate `StorageLikeWithRemove` export from `memory.ts`. Verified the only consumers are `memory.ts` and `memory.test.ts` (`grep -rln "StorageLike\b" web/src` → exactly those two files), and `memory.test.ts`'s own `fakeStorage()`/`throwingStorage()` fixtures already implement `removeItem`, so every existing `loadMemory`/`saveMemory` test still satisfies the widened interface unchanged. `window.localStorage` (the one real caller, in `features/reader.ts` and now `features/actions.ts`) has `removeItem` natively.
- **doPin left untouched.** REQ-17's UI Specifications and W2 name End/Resume/Remove only; `doPin`'s `console.error`-only handling is out of this REQ's scope and wasn't touched.
- **E2E not run.** `plans/session-lifecycle/test-specs.md` does not exist in this plan directory (the plan's own header describes the E2E work as "extend-specs" against `launch.spec.ts`/`reconcile.spec.ts`/`actions.spec.ts`, not a fresh authoring pass with its own log), and `git log`/`git status` show no e2e-spec changes have landed yet for this plan. `rg -n "action-error|resumeDisabledReason|aria-description" web/e2e` finds no existing spec exercising the new markup or the resume-reason attribute — E7 ("a session with no bound Claude id shows a disabled Resume control") is covered by a pre-existing assertion on `.disabled`, not the new reason text. Ran the harness's three explicitly-requested gates instead (tsc, build, web-test); flagging this rather than guessing at e2e coverage that doesn't exist yet.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files were touched. Nothing needing changes was found.
