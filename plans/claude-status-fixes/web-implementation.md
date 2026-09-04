# Web Implementation: claude-status-fixes

**Plan**: claude-status-fixes
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/main.ts` | modified | REQ-6/REQ-7: guarded the `viewFocusBtn`/`viewTilesBtn` `mousedown` listeners (`:884-885` in the pre-change file) to only call `cancelOpenRenames()` for a primary-button press (`e.button === 0`) whose target view differs from the current `view` — previously they cancelled unconditionally. Also guarded the paired `click` listeners (`:886-887`) with the same "differs from current view" check before calling `requestView(...)`, so clicking the already-active segment sends no `PUT /api/prefs` for the view, per REQ-6's own wording ("no prefs request... for the view"). Updated the header comment above the block to explain both guards. |

## Decisions

- **Affected Files understated the listener set.** The plan's Affected Files section for
  Web names only the two `mousedown` listeners at `web/src/main.ts:884-885`, and its
  Implementation Notes says "Keep the existing `click` → `requestView` listeners
  untouched." REQ-6 as written says clicking the already-active segment sends "no prefs
  request... for the view," but the `click` listeners called `requestView(...)`
  unconditionally, which unconditionally `PUT /api/prefs`'d the view regardless of
  whether it changed. Leaving them untouched would satisfy the plan's own **E5**
  acceptance criterion (which doesn't assert on prefs requests — flagged by e2e-specs in
  `test-specs.md`'s Notes) but not REQ-6 as written. Per the orchestrator's explicit
  instruction, I guarded the `click` listeners too, inside the same block, so a same-view
  click sends no view-prefs PUT. This is a superset of the plan's stated scope, not a
  deviation from REQ-6/REQ-7's behaviour.
- The ⌘\ keyboard toggle (`window.addEventListener("keydown", ...)` at `:960` in the
  pre-change file) always calls `requestView(view === "focus" ? "tiles" : "focus")` — it
  can never target the currently-active view by construction, so it needed no guard and
  was left untouched.
- No other web files needed changes; the plan's Web Affected Files list only `main.ts`,
  and no web unit tests exist for this plan (REQ-6/REQ-7 are E2E-only per the plan's own
  note in Affected Files → Tests).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` (`web/`) both exit 0.

**Plan E2E specs run** (`npx playwright test e2e/subagent-status.spec.ts e2e/rename.spec.ts`
from `web/`, after `make web-build build` from the project root): 17 passed, 2 failed.

- `rename.spec.ts`: **15/15 passed**, including the two new REQ-6/REQ-7 tests (E5 "clicking
  the pressed view segment... commits instead of cancelling" and E6 "a right-click on the
  inactive Tiles segment... does not cancel it"). This is my full scope for this plan and
  it is green.
- `subagent-status.spec.ts`: **2/4 failed** — "a failed turn's note is cleared..." (E7) and
  "subagent tool activity past the parent Stop..." (E8), both on `stateSince`/timestamp-
  ordering assertions read from the session-state API. Both failures are entirely daemon
  state-machine behaviour (REQ-2/REQ-4, `internal/session/machine.go`), not anything in
  `web/`. `git status` at the time of this run showed `internal/claudecode/interpret.go`,
  `internal/session/machine.go` and `internal/claudecode/doc.go` still uncommitted
  (daemon-impl's parallel-track work in progress), which explains the failures — not a
  defect in my change. Not mine to fix; not a spec locator defect either, so nothing to
  hand off to e2e-specs. Re-run this pair once daemon-impl's track lands.

No test files needing changes I wasn't allowed to make.
