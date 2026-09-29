# Web Implementation: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Mode**: initial
**Pack**: `kb: pack 38113 words (budget 20000)` — WARN exceeds budget (sections: rules 1117 · features 13192 · decisions 12682 · facts 7359 · lessons 3755 · runbooks 2)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | changed | `PERMISSION_MODES` gains `bypassPermissions`; `SessionModelInfo.displayName` widened to `string \| null` and `parseModelInfo` accepts `null` (REQ-10's resumed-session response shape) |
| `web/src/sessions/permission.ts` | changed | `permissionModeToCheck` never restores bypass (REQ-3/INV-3/W2); new `LaunchTab`/`LaunchPrimaryFace`/`launchPrimaryFace` (INV-2/W1) |
| `web/src/sessions/card.ts` | changed | `bypassChip(session)` (INV-1/W3); `CardViewModel.bypassChip`; `firstLaunchNote` gains the bypass-warning text with/without `firstLaunchHere` (REQ-5/W4) |
| `web/src/api/launch.ts` | changed | `ResumeListRequest`, `PastSession`/`PastSessionsResult` + `parsePastSessions` (W6), `resumeFromList`, `fetchPastSessions` |
| `web/src/features/launchpastlist.ts` | created | Pure `filterPastSessions` (W5), `defaultSelection` (W7) |
| `web/src/render/launchpast.ts` | created | `renderPastHead`, `renderPastLoading`, `renderPastError`, `renderPastList` (rows + empty/no-match/truncation states) |
| `web/src/features/launchresume.ts` | created | Resume tab controller: tab pair, fetch-on-directory-change (REQ-8/W8), filter, selection, submit |
| `web/src/render/launch.ts` | changed | `renderResumeFooter`, `renderLaunchButtonFace`; `renderLaunchFooter` untouched (signature/behavior identical to its existing test) |
| `web/src/features/launch.ts` | changed | Fifth Start-in mode wiring, `#bypass-warning`, the tab-aware `refreshDialogFace`/`updateFooter` recompute, `submit()` dispatch to the Resume tab, `resume.onDirectoryChanged` wired into `navigate()` |
| `web/src/render/sessions.ts` | changed | `.chip-danger` toggle in a rail card's title row |
| `web/src/render/mainhead.ts` | changed | `.chip-danger` toggle in `#mainhead`, looked up via `requireElement` on `elements.root` (no new interface field — see Decisions) |
| `web/src/render/tiles.ts` | changed | `.chip-danger` toggle in a tile's `.thead` |
| `web/index.html` | changed | New\|Resume tab pair, `#past-sessions` section, fifth `bypass` radio + `#bypass-warning`, `.chip-danger` slots (card/mainhead/tile templates), `#launch-target` restructured into `.tlabel`/`<b>`/`.suffix` |
| `web/src/style.css` | changed | `.head-tabs`, `.picker.resume`, `#past-sessions`/`.past-list` rows, `.seg-track label.bypass`, `.bypass-warn`, `.chip-danger`, `#launch-form .fields[hidden]` companion, `#launch-target .suffix[hidden]` (renamed from `.branch[hidden]`) |

## Decisions

- **`.branch` renamed to `.suffix` in `#launch-target`** — the same `<b>`/suffix pair is now reused by both tabs (`renderLaunchFooter` for New, `renderResumeFooter` for Resume; only one is ever showing), so the class can't stay named for New's own git-branch meaning. `renderLaunchFooter`'s exported signature and behavior are unchanged (`render/launch.test.ts` still passes unmodified).
- **`MainheadElements` gains no `chipEl` field.** `render/mainhead.ts`'s chip toggle uses `requireElement<HTMLElement>(".chip-danger", elements.root)` inline, matching `render/tiles.ts`'s existing convention (a `requireElement` lookup per chrome slot, not a dedicated field for every slot) rather than `render/sessions.ts`'s per-instance-cloned-template convention. This was a deliberate choice to avoid a compile break: `rg -n "MainheadElements" web/src` shows `render/mainhead.test.ts`'s `fakeMainheadElements()` builds this interface's object literal directly with no `chipEl` property, and no test file may be edited beyond import-path repairs. A dedicated field would be architecturally tidier but forces either an unauthorized test edit or an optional field with no real production reason to be optional; the inline lookup keeps the interface, and the existing test's compilation, untouched.
- **Sanctioned test breakage — `.chip-danger` is a real, required template slot, never optional.** `render/sessions.ts`'s `applyCardText` and `render/tiles.ts`'s `updateTileChrome` both `requireElement(".chip-danger", ...)` unconditionally, matching every other slot in those two functions ("every slot is required" — sessions.ts's own header comment). `render/sessions.test.ts`'s `fakeTemplate()`/`buildCardTemplateFragment()` and `render/tiles.test.ts`'s `fakeTileRoot()` are hand-built fake DOM trees that predate this plan and don't carry `.chip-danger`; they now throw `missing required element: .chip-danger` for every test that exercises the non-empty render path (`rg -c 'FAIL' ` on a `vitest run` gives 46 failing tests across exactly these two files plus `render/mainhead.test.ts`'s two session-branch tests — see Handoff). Per kb:lesson/stale-fixture-reshaped-the-wire and the constraint on test-double limitations never dictating shipped markup, the markup ships as specified; the fixture upgrade is web-tests'.
- **`sessions/permission.test.ts`'s two frozen assertions are sanctioned breakage, not a defect.** `PERMISSION_MODES` "is exactly the four accepted wire values" and `permissionModeToCheck` "round-trips `bypassPermissions` to itself" are both directly contradicted by this plan's approved delta (REQ-1's fifth mode; REQ-3/INV-3/W2's "bypass is never restored" — `permissionModeToCheck("bypassPermissions")` must return `"auto"`, not itself). Verified via `npx vitest run`: these are the only two `sessions/permission.test.ts` failures, and match the plan's own W2 acceptance criterion word for word.
- **`SessionModelInfo.displayName` widened to `string | null`, shared with `Usage.model`.** The Protocol Contract says a resumed-from-list session's `model.displayName` is `null` until the status line confirms it; `SessionModelInfo`/`parseModelInfo` are shared verbatim by `Usage.model` (`protocol/usage.ts`'s own comment: "the same shape ... rather than keeping its own copy"), so the widening is shared too. The one real consumer incompatible with `string | null` was `render/masthead.ts`'s `renderUsageModel` (`el.title` is non-nullable `string`); fixed with a `model.displayName ?? model.id` fallback — Usage's own model in practice never sends null, so this is a defensive-only branch, never observed live. `sessions/card.ts`'s `mainheadMeta` was changed from `if (session.model)` to `if (session.model?.displayName)`, so a resumed session with an unconfirmed display name reads the same as any null model does today (omits the clause) rather than inventing a literal "unknown" the plan's States row didn't ask for. Discovered live: the real `resumeFromList` E2E run showed `parseSession` would have silently rejected a wire `displayName: null` and dropped the whole session (caught before it shipped, not after).
- **`#launch-form .fields[hidden]` companion added** (kb:lesson/display-rule-overrides-hidden-attribute) — `elements.fieldsEl.hidden = true` (Resume tab) was losing to `#launch-form .fields { display: grid; }`'s higher specificity than the UA `[hidden]` default; the pre-existing `.fields [hidden]` rule is a *descendant* selector (covers `#model-error`/`#bypass-warning`, children of `.fields`) and never matched `.fields` hiding itself. Found live via the plan's own `past-sessions.spec.ts` "switching to Resume and back to New" test (`#launch-form .fields` stayed visible after clicking Resume); fixed and re-verified green.
- **Resume-tab `findSelected()` searches the filtered (visible) list, not the full fetched one.** A selection the filter has since hidden must stop counting as a selection (States: "filter excludes everything ... button disabled") — found live via `past-sessions.spec.ts`'s filter/no-match test (`#launch-button` stayed enabled reading "Resume" after a no-match filter); fixed and re-verified green.
- **Resume-tab fetch fires even with `directory === null` (an empty-string request), not gated behind a resolved browse.** E9/edge case 20 (daemon down) needs the Resume tab's own fetch failure, but with the daemon down the New tab's own picker browse never resolves either, so a directory-gated fetch would never fire the request the test waits on. A healthy daemon just answers the empty path with `400 invalid_request`, self-corrected moments later once the picker's own browse lands and calls `onDirectoryChanged`. Found live via `past-sessions.spec.ts`'s E9 test (60s timeout waiting on a `/api/past-sessions` request that never fired); fixed and re-verified green.
- **`web/src/features/launch.ts` is 713 lines** (`make size-warn`), over the 500-line threshold both before this plan (607 lines pre-existing) and now. Kept as one file: the tab-aware `refreshDialogFace`/`updateFooter` recompute genuinely needs both tabs' state in one place (the New tab's model-verdict-driven disabling and the Resume tab's selection-driven disabling are two branches of the same "what does `#launch-button` look like right now" decision) — splitting it further would fragment that one invariant across files the way `docs/conventions.md`'s "one recompute" rule warns against. `submitNew()` was already extracted once to keep `submit()` under the cognitive-complexity ceiling; no further split reads as an improvement rather than churn.
- **REQ-1's second clause** ("the existing Resume action passes a latched `bypassPermissions` like any other mode") needed no web change: `api/sessions.ts`'s `resumeSession(id)` already sends no request body — the daemon reads the session's own latched `permissionMode` when it resumes. Recorded here so the REQ doesn't read as silently skipped.
- Every REQ/W/INV this plan lists for web appears above or in this list; none silently dropped.

## Doc Delta

- `doc-delta:` no departure from the plan's own Doc Delta — every "becomes true" bullet for `launch`/`rail`/`focus`/`tiles`/`lifecycle` matches what shipped. The `past-sessions` spec's own doc-reconcile pass should additionally note `render/launch.ts`'s `#launch-target` restructuring (`.tlabel`/`.suffix`) if the launch feature spec's DOM prose quotes the old `Launch in <b>…</b><span class="branch">` shape verbatim anywhere.
- `doc-delta:` `SessionModelInfo.displayName`'s nullability is additive to `docs/protocol.md`'s `kb:anchor/ws.session`/`kb:anchor/ws.usage` — the Protocol Contract text already states this ("model.displayName may be null on a resumed-from-list session"), so no correction is needed there; flagging only because it's a genuine wire-shape widening a reader of `ws.usage` might not expect.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 (clean, re-verified after every fix below). `make web-build build` (full binary) also builds clean against the daemon-impl code present at hand-off time.

**Test files needing changes — not mine to make:**
- `web/src/render/sessions.test.ts` — `buildCardTemplateFragment()`'s fake `.card` tree needs a `.chip-danger` node inside `.r1` (sibling of `.name`), matching `index.html`'s real `#session-card-template`.
- `web/src/render/tiles.test.ts` — `fakeTileRoot()`'s `byClass` map needs a `.chip-danger` entry, matching `#tile-template`'s real `.thead`.
- `web/src/render/mainhead.test.ts` — `fakeMainheadElements()`'s `root: fakeElement()` needs a real `querySelector` (or a `.chip-danger` child it can resolve) for its two "Resume disabled reason" tests, which exercise the session-present branch that now looks up `.chip-danger` on `elements.root`.
- `web/src/sessions/permission.test.ts` — "PERMISSION_MODES is exactly the four accepted wire values" and "`permissionModeToCheck` round-trips `bypassPermissions` to itself" are now wrong per the plan's own contract (REQ-1, REQ-3/INV-3/W2); both need updating to assert the five-value set and the `bypassPermissions → auto` fallback.

Ran `npx vitest run` after every fix above: **46 tests failing, all four files above, 1810 passing** — no other file regressed.

**Smoke run of the plan's own E2E specs** (`make web-build build` from the project root, then `npx playwright test bypass.spec.ts past-sessions.spec.ts` from `web/`, against the daemon-impl code present at hand-off — this is a smoke check, not a verdict):

Final tally: **15 passed, 5 failed.**

Failures believed daemon-side (not web's, and not mine to fix):
- **`bypass.spec.ts`: E2, E3, E12, INV-1 (4 tests)** — after a raw hook reports `permission_mode: "default"`, the rail card / mainhead / tile chip stays visible (`.chip-danger` `toHaveCount(0)` times out at 1). Verified this isn't a web bug: `bypassChip(session)`/the chip toggle are pure, uncached reads of `session.permissionMode.value` on every render tick, `sessions/store.ts`'s `upsert` is a whole-object replace with no field-level special-casing, and the SAME test's earlier `stateBadge(card)` assertion (which depends on the identical `sessionUpsert` chain) passes — i.e., an update does land and re-render, but its `permissionMode.value` apparently never reflects the "default" hook. Points at `internal/session/machine.go`'s `latchPermissionMode`/the raw (non-enveloped) hook corroboration path, not web code.
- **`past-sessions.spec.ts`: E6** — `session.model` comes back `{id: "claude-opus-4-1-20250805", displayName: "claude-opus-4-1-20250805"}`; the Protocol Contract and the test both expect `displayName: null`. Web's parser now correctly *accepts* either shape (see Decisions) — this is the daemon's response construction sending the id as the display name instead of `null`.
- **`bypass.spec.ts` E2's exact regex may also be a spec-authoring mismatch**, independent of the above: the test's own comment says the directory is a genuine first launch (so `firstLaunchHere` is true) and expects the *combined* note, but asserts `card.getByText(/likely waiting on Claude Code's bypass warning/)` — a substring that isn't contiguous in the plan's own combined-text literal ("...Claude Code's **trust prompt, then its** bypass warning" breaks the substring "Claude Code's bypass warning"). Not confirmed independently of the daemon issue above (the test never got past the chip), so this is flagged for validate mode's attention rather than asserted as the sole cause.

None of the four bypass-chip failures or the model-name failure were touched by workarounds — they're named here per the task's instruction to report daemon-side gaps rather than route around them, and because `-claude-projects-dir` and the rest of daemon-impl's work were present and mostly exercised successfully by this same run (15 of 20 collected rows passed), so this isn't the wholesale "nothing can run yet" blocker e2e-specs measured at authoring time.

Real web bugs found and fixed during this same smoke run (all re-verified green): the `.fields[hidden]` CSS specificity bug, the Resume-tab filtered-selection bug, and the Resume-tab null-directory fetch-gating bug — see Decisions for each.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: `python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates` flagged 28 lines across 9 files for plan-ID citations (`REQ-N`/`INV-N`/`W-N`/`E-N`/`edge case N`) in code comments, against `docs/conventions.md` § Comments ("keep only a non-obvious why, citing `kb:<type>/<slug>` where a record exists" — plan IDs don't belong in shipped code, only in the plan itself and in commit/log prose).

**Changes made**: comment text only, no code/behavior changes, in `web/src/api/launch.ts` (lines 39, 47, 146, 200, 207), `web/src/features/launch.ts` (69, 232, 334, 383, 465), `web/src/features/launchpastlist.ts` (7, 20), `web/src/features/launchresume.ts` (129, 132, 224), `web/src/render/launch.ts` (277), `web/src/render/mainhead.ts` (85), `web/src/render/sessions.ts` (115), `web/src/render/tiles.ts` (95), `web/src/sessions/card.ts` (51, 84, 248), `web/src/sessions/permission.ts` (19, 34), `web/src/style.css` (2416, 2997, 3107, 3139 as originally reported — one line shorter than reported after the first edit removed a stray line, so the later three shifted to 2996/3106/3138; found and fixed by content grep, not by stale line number). Every flagged comment's *substance* (the actual non-obvious why, and every existing `kb:<type>/<slug>` citation) was kept verbatim; only the bare plan-ID prefix/suffix was stripped (e.g. `REQ-3/INV-3 (kb:adr/…)` → `kb:adr/…`; `INV-1: the danger …` → `The danger …`).

**Verification**:
- `python3 .claude/skills/orchestrate/scripts/comment-checks.py web-impl` → `comment-checks: clean`
- `make web-lint web-build` (foreground) → both exit 0; Biome "Checked 260 files … No fixes applied"; Vite build succeeds (same pre-existing >500kB mermaid-chunk warning as before, unrelated)
- `npx tsc --noEmit` → clean
- Swept the whole of every touched file with `rg -n "REQ-[0-9]|INV-[0-9]|W[0-9]\b|E[0-9]\b|edge case"` after editing (not just the 28 reported lines) to confirm no sibling occurrence was missed in the files I touched; `web/src/style.css`'s remaining hits are all pre-existing lines from earlier plans, none of them mine.

**Decisions**: none — comment-only fix, no `deviation:`/`doc-delta:` lines introduced.

## Fix Attempt 2 (e2e-validate attempt 1, implementation-bug)

**Failure addressed**: `web/e2e/launch.spec.ts:378` "launching with no interaction after open
relaunches the first recent's directory with its last model and mode" (REQ-8, E8) — validator's
repro: opening the dialog now puts default keyboard focus on `#launch-tab-new`
(`<button type="button" role="tab">`, now the first focusable element in the dialog once this
plan's tab pair was added inside `<h2>`), so Enter re-clicks the already-selected New tab
(`launchresume.ts`'s tab handler: `if (!active) return;` — a same-state no-op) instead of
implicitly submitting the form. Deterministic 5/5 in the validator's soak.

**Root-cause confirmed, not guessed**: `git diff main -- web/index.html` shows the pre-plan `<h2>`
had no focusable descendant (`New session <span class="kbd">…`); this plan's own diff is what
inserted `<span class="head-tabs">…<button id="launch-tab-new">…` before the rest of the dialog's
markup. Everything after the tab pair in DOM order — `.picker`'s `#mru-list`/`#browse-dirs` (empty
at `showModal()` time; populated later, asynchronously, by `initOpen()`), `#past-sessions`
(`hidden`, not focusable) — has no focusable node ahead of `#title-input`, so `#title-input` was
the dialog's actual pre-plan default-focus target. Confirmed by reading `resetForm()`
(`web/src/features/launch.ts:459`): it calls `resume.reset()` (always lands on the New tab, `.fields`
visible) before `showModal()` runs, so `#title-input` is present and focusable at the moment
`showModal()` is called on every open, with no race against `initOpen()`'s async work (`rg -n
"\.focus\(" web/src/features/launch.ts` — the only pre-existing `.focus()` calls are inside arrow-key
handlers triggered by user interaction, not by `initOpen`, so nothing else contends for focus on
open).

**Blast-radius check — is this pattern (a tab pair or other new control preceding the first form
field) introduced anywhere else by this plan?** `rg -n 'role="tab"|showModal\(\)' web/index.html
web/src/features/*.ts` → only `#launch-tab-new`/`#launch-tab-resume` (this dialog) and one other
`showModal()` call in `web/src/features/issue.ts` (the pre-existing, unrelated issue dialog, not
touched by this plan and not preceded by any new markup). One instance, one fix.

**Change made**: `web/src/features/launch.ts`'s `openModal()` — added
`elements.titleInput.focus()` immediately after `elements.dialog.showModal()` (before the
fire-and-forget `void initOpen()`), restoring the exact pre-plan default-focus target explicitly
rather than relying on the browser's now-changed default-focus descendant search. The tab buttons
keep plain default `tabindex` (no markup change) — still reachable via Tab in both directions from
`#title-input`; only the dialog's *default* focus-on-open target changed back.

**Verification**:
- `npx tsc --noEmit` → clean; `npm run build` → exit 0 (same pre-existing >500kB mermaid-chunk
  warning, unrelated); `npm run -s lint` → "Checked 262 files … No fixes applied"
- `make web-build build` (project root) → both build clean
- `npx playwright test launch.spec.ts past-sessions.spec.ts bypass.spec.ts` (from `web/`) → **50
  passed** (22.0s), including the previously-failing `launch.spec.ts:378` row
- Re-ran the reviewer's exact repro test 5 more times in isolation
  (`npx playwright test launch.spec.ts -g "launching with no interaction after open"`, one worker
  each) → 5/5 passed, matching the validator's own soak cadence in reverse (was 5/5 red, now 5/5
  green)

**Decisions**: none — restores pre-existing behavior; no `deviation:`/`doc-delta:` line. Nothing in
the plan licensed the dialog's default-focus target to move, so this is a straight defect fix, not
a scope change.

## Fix Attempt 3 (review cycle 1)

**Failures addressed** (all `[web-impl]` from `review.md` cycle 1, plus the settled
`[orchestrator:decision]` on browser Minor 1):

- Correctness Major 3 — three comments stating the pre-amendment null-`displayName` contract
- Correctness Minor 1 — `.bypass-warn b` unreadable on `--banner-bg`
- Browser Major 1 — Resume footer claims `(untitled)` with no selection
- Browser Major 2 — long-titled bypass row's chip clipped by `.t`'s ellipsis
- Browser Major 3 — keyboard row selection loses focus to `<body>`
- Browser Minor 2 — `#launch-error` outlives its cause
- Browser Minor 3 — danger button label wraps to two lines
- Browser Minor 4 — tab pair has no arrow-key behaviour; dialog's accessible name leaks tab text
- Maintainability Minor 3 — no `design:` lines for the Resume-tab's new modules/seams
- Maintainability Minor 4 — `render/` making view decisions (title fallback, bypass condition)
- Maintainability Minor 5 — five separate `=== "bypassPermissions"` literals
- `[orchestrator:decision]` browser Minor 1, Option A (kb:adr/launch-resume-null-model-reads-unknown)
  — the mainhead meta reads the word "unknown" for a null model

**Changes made**:

| File | What |
|------|------|
| `web/src/protocol/session.ts` | Reverted `SessionModelInfo.displayName` to non-null `string`; `parseModelInfo` rejects a null `displayName` again. Per kb:adr/launch-resume-display-name-falls-back-to-id, the wire never sends null there any more, so the widening's only reason is gone. Removed the now-false comment. |
| `web/src/render/masthead.ts` | Reverted `renderUsageModel`'s `?? model.id` fallback — `model.displayName` is trusted verbatim again, matching pre-plan behavior. |
| `web/src/sessions/card.ts` | `mainheadMeta`: a null `session.model` now pushes the word `"unknown"` (kb:adr/launch-resume-null-model-reads-unknown, the developer's Option A) instead of omitting the clause. `bypassChip` now calls the new `isBypassMode` (Minor 5). Added the `sessions/permission` import. |
| `web/src/style.css` | `.bypass-warn b` now inherits `--banner-fg` (the warning's own contrast-checked pair) instead of `--danger-fg` on `--banner-bg` (~1.2:1, invisible in light theme). Added `.past-list .tw`/`.t`/`.chip-danger` flex rules (Major 2) and `#launch-button { flex-shrink: 0; white-space: nowrap; }` (Minor 3). |
| `web/src/render/launch.ts` | `renderResumeFooter`: `title === null` now means, and only means, "nothing selected" — the function no longer substitutes its own `"(untitled)"` fallback (that ambiguity was Major 1's bug). The caller now supplies the already-resolved title. |
| `web/src/render/launchpast.ts` | `buildPastRow` takes a `PastRow` (title/bypassChip already derived, structurally matching `features/launchpastlist.ts`'s `PastRowView` — no import, to keep render/'s dependency direction). The title and an optional chip are now built inside a new `.tw` flex wrapper as siblings, not chip-inside-title (Major 2). `renderPastList` captures/restores focus by `data-claude-session-id` around its `replaceChildren` rebuild, via `render/focuskeep.ts`'s existing `captureFocusedKey`/`restoreFocusedKey` (Major 3) — the same primitive `render/reader.ts`'s tree/outline already use for the identical problem. |
| `web/src/features/launchpastlist.ts` | New `pastRowView(session): PastRowView` — the one place that derives a row's display title (`"(untitled)"` fallback) and its bypass-chip flag, replacing two separate copies (Minor 4). Uses the new `isBypassMode`. |
| `web/src/features/launchresume.ts` | `selectedTitle()` now returns `null` strictly for "no selection" (resolves the fallback itself via `pastRowView`, never leaves it for the footer to guess). `renderPastList` is now called with `visibleSessions().map(pastRowView)`. New `LaunchResumeHandlers.onUserAction` hook, fired only from an explicit tab switch or row selection (not from a fetch landing or filter keystroke) — `features/launch.ts` wires it to `clearError()` (Minor 2). Added ArrowLeft/ArrowRight keydown handling on both tab buttons, toggling the active tab and moving focus (Minor 4). |
| `web/src/features/launch.ts` | Wired `onUserAction: () => clearError()` into `initLaunchResume`'s handlers. `refreshDialogFace`'s `#bypass-warning` visibility now reads `face.danger` (already computed two lines above) instead of a second `mode === "bypassPermissions"` comparison (Minor 5). |
| `web/src/sessions/permission.ts` | New `isBypassMode(value: string \| null): boolean` — the one owner for "is this mode bypass?", now used by `permissionModeToCheck`, `launchPrimaryFace` (both here), `sessions/card.ts`'s `bypassChip`, and `features/launchpastlist.ts`'s `pastRowView` (Minor 5). |
| `web/index.html` | The dialog's `aria-labelledby` now points at a new `<span id="launch-dialog-name">New session</span>` instead of the whole `<h2 id="launch-dialog-title">`, which also contains the tablist and the `⌥⌘N` kbd hint — the dialog's accessible name is now exactly "New session" (Minor 4). `#launch-dialog-title`'s id is unchanged, so `shortcuts.spec.ts`'s `#launch-dialog-title .kbd` locator still resolves. |

**Blast-radius checks**:
- `.chip-danger` is shared by the rail card, mainhead and tile — I did not touch its base rules,
  only added `.past-list .chip-danger { flex: 0 0 auto; }` scoped under `.past-list`, so the other
  three hosts are unaffected (`rg -n "\.chip-danger" web/src/style.css` shows the new rule is
  scoped, not a redefinition of the shared block).
- `refreshDialogFace()` is called from four places (`renderAll`, the New tab's permission-mode
  radio change, and twice via `resume`'s `onFaceChange`/`onUserAction` split). I traced each one:
  `onUserAction` fires only from `selectRow`/`switchToNew`/`switchToResume` in
  `launchresume.ts`, never from `fetchList`'s loading/landing renders — verified against
  `past-sessions.spec.ts`'s "resuming a fixture deleted after listing" test (which resumes, gets a
  404, and its own refetch must not wipe the message): it still passes (see Verification).
- `isBypassMode`'s new cross-directory imports (`sessions/card.ts` → `sessions/permission.ts`,
  `features/launchpastlist.ts` → `sessions/permission.ts`) follow the existing dependency
  direction (`features/` → `sessions/`, and within `sessions/` siblings already reference each
  other in comments); neither is a new layer crossing.

**Verification**:
- `make web-lint web-build contrast` — `web-lint` clean; `contrast`: `instrument: 43 pairs, 0
  failures` / `dark: 43 pairs, 0 failures` / `light: 43 pairs, 0 failures`; `web-build` **fails**,
  but only at `tsc --noEmit` on `src/api/launch.test.ts(766,48): error TS2322: Type 'null' is not
  assignable to type 'string'` — see Handoff, this is the sanctioned test-fixture breakage Major 4
  already named, made real by Major 3's revert. `npx vite build` run directly (bypassing the test
  files) succeeds clean (same pre-existing >500kB mermaid-chunk warning, unrelated).
- `npx tsc --noEmit` in `web/` — same single error as above, no other file affected.
- `python3 .claude/skills/orchestrate/scripts/comment-checks.py web-impl` → `comment-checks: clean`
  (stripped every "review cycle 1 Major/Minor N" label this fix wave's comments had carried,
  keeping the substantive why).
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` → `829 references checked, 0 missing`.
- `npx vitest run` → **7 failed, 1913 passed (1920)** — every failure is sanctioned:
  - `api/launch.test.ts`, `protocol/session.test.ts`, `protocol/usage.test.ts` (3 tests) — the
    exact three Major 4 named, pinning the superseded null-`displayName` wire fixture.
  - `render/launch.test.ts` — "falls back to '(untitled)' for a selected row with no title" (1
    test) directly encoded Major 1's bug (conflating "no selection" with "selected-but-untitled"
    via one `null`); the fixed contract makes this case unrepresentable at this function's
    boundary by design.
  - `sessions/card.test.ts` — three `mainheadMeta` tests asserting the old "omit the clause"
    behaviour for a null model, now superseded by kb:adr/launch-resume-null-model-reads-unknown.
- `make build` (daemon, from the built assets `npx vite build` just produced) → clean.
- `npx playwright test launch.spec.ts past-sessions.spec.ts bypass.spec.ts` (from `web/`, against
  the daemon just rebuilt) → **50 passed** (21.5s), including the exact 404-persistence test
  (`past-sessions.spec.ts:268`) the narrow `onUserAction` scoping was designed not to regress, and
  every bypass-chip test (now exercising a daemon that already implements the amended
  `displayName`-falls-back-to-id contract).

**Decisions**:

- design: `features/launchresume.ts`'s `initLaunchResume` is a sub-controller handed elements/
  handlers by its one caller, `features/launch.ts` — a seam no other `features/` module has,
  because the Resume tab's fetch/filter/selection state machine is large enough to want its own
  file (`docs/conventions.md` § Composition roots: a pure decision with one caller lives beside its
  controller; this one outgrew "pure" once it needed its own daemon call, so it took the
  controller shape instead, matching `updaterestart.ts`'s precedent as the one other
  controller-not-pure-decision file in `features/`). `LaunchResumeElements` is the element lookup
  table; `LaunchResumeHandlers` is the two outward callbacks (`onFaceChange` recompute,
  `onUserAction` error-clear) `features/launch.ts` implements; `LaunchResumeHandle` is what it
  hands back. `onFaceChange`/`onUserAction` are deliberately two callbacks, not one, because they
  fire on different (overlapping but not identical) event sets — folding them into one would have
  cleared `#launch-error` on a fetch landing, which `past-sessions.spec.ts`'s 404 test forbids
  (see Blast-radius above).
- design: `features/launchpastlist.ts` holds `filterPastSessions`/`defaultSelection` (pre-existing)
  plus the new `pastRowView` — all pure, no DOM, one caller (`launchresume.ts`), same shape as
  `launchmodels.ts`/`launchrestore.ts` (`rg -n "from \"\.\./features" web/src/render` found no
  production render/ file already importing a features/ type, confirming render/ must take
  `pastRowView`'s output structurally rather than import its type).
- design: `render/launchpast.ts`'s local `PastRow` interface deliberately duplicates
  `PastRowView`'s shape rather than importing it, so `render/` keeps depending only on `sessions/`
  and `api/` (never `features/`) — the same direction every other `render/` file already follows
  (`rg -n "from \"\.\./features" web/src/render/*.ts | grep -v test` → 0 hits in production code).
- design: `sessions/permission.ts`'s `LaunchTab`/`LaunchPrimaryFace`/`launchPrimaryFace` (pre-
  existing, from the initial implementation) are the New/Resume-tab-agnostic "what should
  `#launch-button` look like" derivation — pure, sits beside `permissionModeToCheck` since both are
  permission-mode decisions with no DOM. The new `isBypassMode` joins them as the third: one
  predicate, five call sites, all through `sessions/permission.ts` or a same-directory/
  `features/`→`sessions/` import.
- design: `render/launch.ts`'s `renderResumeFooter`/`renderLaunchButtonFace` (pre-existing) stay in
  `render/launch.ts` rather than a separate file — they're the Resume-tab-specific halves of the
  same footer/button `render/launch.ts` already owns for the New tab (`renderLaunchFooter` is
  their direct sibling), so splitting them out would separate three functions that read as one
  concept (the dialog's bottom bar) across two files for no gain.
- design: `api/launch.ts`'s `resumeFromList`/`fetchPastSessions` (pre-existing) are two more
  daemon-call wrappers in the file that already holds every other launch-dialog endpoint call
  (`browse`, `launchSession`, the model-verdict calls) — one file per feature's daemon surface,
  matching `docs/conventions.md`'s "every daemon call goes through `../api/`".
- No `deviation:`/`doc-delta:` lines this wave — every change implements an already-approved
  contract amendment (kb:adr/launch-resume-display-name-falls-back-to-id,
  kb:adr/launch-resume-null-model-reads-unknown) or fixes a defect against the existing plan/
  contract; nothing here departs from either.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` **fail**, but only on
`src/api/launch.test.ts(766,48): error TS2322: Type 'null' is not assignable to type 'string'` —
this is the test file Correctness review Major 4 named as needing its fixture updated
(`displayName: null` no longer matches the amended contract; it should be
`displayName: "claude-opus-4-1-20250805"`, the model id, per
kb:adr/launch-resume-display-name-falls-back-to-id). Not mine to edit (assertion/fixture content,
not an import path). `npx vite build` run directly (skipping the test-inclusive `tsc` gate)
succeeds clean, and `make build` against those assets succeeds, so the shipped artifact itself is
sound — only the whole-tree type-check gate is red, and only because of this one test file.

**Test files needing changes — not mine to make** (in addition to the four already named in the
initial Handoff, which this wave did not touch):
- `web/src/api/launch.test.ts:762-770` ("decodes a 201 seeded Session — displayName null…") — the
  mocked response and its title/comment need `displayName` set to the model id, matching Response
  201's amended shape.
- `web/src/protocol/session.test.ts:137-146` ("parses a model with a null displayName…") — either
  drop this case (the wire never sends null any more) or repoint it to the id-fallback shape; the
  comment above it (lines 137-140) states the superseded contract and needs rewording either way.
- `web/src/protocol/usage.test.ts:38-47` ("parses a usage.model with a null displayName…") — same
  as above, `Usage.model` shares `parseModelInfo`.
- `web/src/render/launch.test.ts:78-84` ("falls back to '(untitled)' for a selected row with no
  title") — this exact case is what Major 1 fixed: `renderResumeFooter(pathEl, suffixEl, null,
  "/Users/bob/muster")` can no longer mean "selected, untitled" (that state doesn't reach this
  function any more; the caller resolves the fallback before calling). This test needs dropping or
  rewriting against the new two-argument contract (`title` non-null ⇒ shown verbatim, `title` null
  ⇒ the dash, full stop).
- `web/src/sessions/card.test.ts:596-603, 626-634` (three `mainheadMeta` tests) — each asserts the
  old "omit the model clause for a null model" behaviour; per
  kb:adr/launch-resume-null-model-reads-unknown they should now expect `"muster / main · unknown"`,
  `"muster · unknown"` and `"other · unknown"` respectively.

**Smoke run of the plan's own E2E specs**: `make build` (project root, against assets from a direct
`npx vite build`) succeeded; `npx playwright test launch.spec.ts past-sessions.spec.ts
bypass.spec.ts` (from `web/`) → **50 passed** (21.5s), 0 failed. This is a smoke check, not a
verdict, per the task's own instruction — no spec mismatch to name this time.

## Fix Attempt 4 (review cycle 2)

**Failures addressed**: Maintainability Minor 4 — `PastRow` (render/launchpast.ts:21-25) and
`PastRowView` (features/launchpastlist.ts:31-35) declared the same row-view shape twice. The prior
`design:` line justified the copy only against render/ never importing from features/, but missed
that this feature's own sibling (`launchmodels.ts:7`, `import type { ModelRowState, ModelSelection }
from "../render/launch"`) already runs the opposite direction: the view type lives once in
`render/`, and the pure `features/` derivation returns it. `rg -n 'from "\.\./render/'
web/src/features` confirms the same shape in `rename.ts`, `connectionversion.ts`, `tiles.ts`,
`surfaces.ts`.

**Changes made**:
- `web/src/render/launchpast.ts` — `PastRow` renamed to `PastRowView` and exported (the one
  declaration now); `buildPastRow`'s and `renderPastList`'s parameter types updated to reference it.
  Doc comment rewritten to state the ModelRowState-matching direction instead of the "declared
  structurally" rationale it's replacing.
- `web/src/features/launchpastlist.ts` — the local `PastRowView` interface deleted; `import type {
  PastRowView } from "../render/launchpast"` added; `pastRowView`'s doc comment updated to point at
  the new owner.
- No test file touched — `rg -n 'PastRowView' src/features/launchpastlist.test.ts
  src/render/launchpast.test.ts src/features/launchresume.ts src/render/launch.test.ts` returned
  nothing; the type name isn't referenced outside the two files above.

**Decisions**: design: the row-view shape now has exactly one declaration, in `render/launchpast.ts`,
with `features/launchpastlist.ts`'s `pastRowView` importing and returning it — same
features→render dependency direction as `launchmodels.ts`/`render/launch.ts`'s
`ModelRowState`/`ModelSelection` pair, so this feature's two view-shape modules (`ModelRowState` and
`PastRowView`) now follow one consistent rule rather than two. No new `deviation:` or `doc-delta:`
line — this is a same-behavior internal reshape, nothing user-observable or contract-facing changed.

**Verification**: `npx tsc --noEmit` — clean, exit 0. `npx vitest run` — 77 files / 1929 tests
passed. `make web-lint web-build` — Biome "Checked 262 files… No fixes applied", Vite build
succeeded. `python3 .claude/skills/orchestrate/scripts/comment-checks.py web-impl` — "comment-checks:
clean". `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — "836 references checked, 0
missing". The four test-file handoff items from the initial wave (`api/launch.test.ts`,
`protocol/session.test.ts`, `protocol/usage.test.ts`, `render/launch.test.ts`,
`sessions/card.test.ts`) are no longer outstanding — reading each file shows the fixtures already
updated to the amended contract (e.g. `api/launch.test.ts:768` now seeds `displayName:
"claude-opus-4-1-20250805"`, not `null`), so the whole-tree `tsc`/`build` gate is fully green this
wave, not just the two files this fix touched.

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
