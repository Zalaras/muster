# Web Implementation: Status Inconsistencies

**Plan**: status-inconsistencies
**Mode**: initial
**Pack**: kb: pack 33180 words (budget 20000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | edited | `backgroundTasks: number`, validated as a non-negative integer (W4) |
| `web/src/sessions/card.ts` | edited | live `actions` is `[]`; new pure `backgroundLine(session)` and `CardViewModel.backgroundLine`; `CardAction` doc comment |
| `web/src/render/sessions.ts` | edited | writes `.bg-tasks` (text, title, hidden); `.acts-row` hidden when `actions` is empty |
| `web/index.html` | edited | `.bg-tasks` slot last in `session-card-template` |
| `web/src/style.css` | edited | `.card .bg-tasks` (mono, `--fs-xs`, `--fg-muted`, tabular-nums) plus its `[hidden]` companion |

REQ-1..5, 8, 9 are the daemon's. REQ-6 and REQ-7 are done here.

## Decisions

- design: `backgroundLine` sits beside `repoLine`/`activityLines` in `sessions/card.ts` (pure, no DOM), and `render/sessions.ts` only assigns it, like the note/activity slots. `rg "background" web/src` found nothing to reuse.
- design: the live `.acts-row` stays in the template, hidden and emptied by the existing `reconcileActsRow` (`[]` -> `replaceChildren()`); no new path. The ended card keeps the existing hover/focus reveal. Tile footer End (`renderTileFooterActions`) is untouched.
- The bg line is rebuilt by plain text assignment each tick (read-only readout, no focusable state); no memo cache.
- Observed: E5-E9 and E7/E8 (no End on rail or strip card, hidden empty acts row, line text/opacity) pass in a real browser.
- design: `backgroundTasks` alone is range-checked (integer >= 0) in `protocol/session.ts`, unlike the type-only `compactions`/`railPos`: the plan's contract types it "integer >= 0" and criterion W4 requires the validator to reject a missing, negative or non-integer value (pinned in `protocol/session.test.ts`). Loosening it to match the siblings would contradict the approved plan; a comment at the check says so.
- doc-delta: the `CardAction` comment now cites kb:adr/rail-live-card-offers-no-actions (proposed, the orchestrator writes it).

## Handoff

**Build status**: `tsc --noEmit` and `npm run build` fail on sanctioned test files only: every `Session` fixture in `src/**/*.test.ts` (api/launch, api/sessions, features/actionscopy, render/{dead,mainhead,sessions,tiles}, sessions/{card,live,sort,store}, ws) lacks `backgroundTasks`. They need `backgroundTasks: 0` added. Non-test code type-checks clean; Biome lint passes. Existing unit tests asserting live `actions` equal `["End"]` (card.test.ts, sessions.test.ts) must become `[]`.
**E2E smoke**: `npx playwright test e2e/rail-cards.spec.ts e2e/subagent-status.spec.ts` (vite build + make build, since `make web-build` stops at the test type errors): 24 passed, 1 failed. The failure is `subagent-status.spec.ts:561` (interrupt for tool use from `needs input` stays `needs input` for 10 s), which is daemon sweep behaviour (REQ-4 from needs_input), not web; daemon-impl was mid-edit. No locator mismatch found.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: maintainability Minor 5 (`backgroundTasks` range check unexplained).
**Changes made**: comment at the check in `web/src/protocol/session.ts`; Decisions line above. No behaviour change.
**Decisions**: none new.
