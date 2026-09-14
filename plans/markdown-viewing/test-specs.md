# E2E Test Specs: Markdown viewing

**Plan**: markdown-viewing
**Mode**: fix (attempt 5, review cycle 5)
**Pack**: `kb pack --plan markdown-viewing --role e2e-specs` — features reader, surfaces, lifecycle, ingest; 23791 words (over the 8000-word budget, logged by `kb` itself — no action needed from this role)
**Verdict**: pass
**Tests created**: 42 (1 new this cycle: pop-out status-line coverage across healthy/file-gone/daemon-down; see Fix Attempt 5)
**Live run**: 1/1 passing (`e2e/reader.spec.ts -g "E30"` alone, rebuilt binary); 341/341 passing full
suite (`make e2e`). Prior-cycle numbers: 38/38 at Fix Attempt 4; 340/340 full-suite at Fix Attempt 4;
37/37 at Fix Attempt 3; 339/339 full-suite at Fix Attempt 3;
34/34 at Fix Attempt 2; 336/336 full-suite at Fix Attempt 2;
33/34 at Fix Attempt 1 (one genuine implementation-bug red); 32/32 at Validate Attempt 2; 334/334
full-suite at Validate Attempt 2.

## Fix Attempt 5 (review cycle 5)

**Issue addressed**: review cycle 5's Major 1 (`[e2e-specs]`, `plans/markdown-viewing/review.md`) —
no spec had ever read the pop-out's own status line (`.reader-notice`); E24/E25/E26 all assert it
only on the dashboard host, and the three existing pop-out tests (E21, cycle-3's layout test, cycle-4's
arrow-focus test) assert body/bar/nav/geometry/focus but never the notice. That gap is exactly why
review cycle 5's Critical 1 — `/doc.html` permanently showing `musterd unreachable — showing last
render` because `doc.ts` wired none of `WsClient`'s connection callbacks — survived four review
cycles undetected.

Rebuilt first (`make web-build build`, clean, exit 0) against `web-impl-fix1`'s commit 4e2c291, which
landed `createConnectionState` (extracted from `initConnection` into `web/src/features/connection.ts`)
and wired it into `doc.ts`'s `onConnecting`/`onHello`/`onDisconnected`.

**New test**: `the pop-out's own status line is hidden while healthy, shows file-gone on a routed
delete, and then genuinely unreachable once the daemon dies (E30, REQ-8, REQ-27, REQ-28)`, appended
after E26 in `web/e2e/reader.spec.ts`. One session sequence, three states read off the SAME pop-out
page/status-line locator (`readerStatusLine`, already existed in `helpers/reader.ts` — this was
missing coverage, not a missing locator):
1. Healthy, file open: `.reader-notice` is `toBeHidden()` and its text is `""` — the Major 1 fix's
   own healthy-state assertion, and also the one that would have caught Critical 1 (before the fix
   this element was visible with `musterd unreachable…` on every load).
2. Delete the open file + a routed `Write` hook for it (mirrors E25's dashboard version exactly):
   `.reader-notice` reads `file no longer exists — <path>` with the body still showing the stale
   `TODO` render.
3. Kill the daemon for real (`daemon.kill()`, same call E24 uses on the dashboard): `.reader-notice`
   now reads the literal `musterd unreachable — showing last render` — the state the pop-out could
   never previously report truthfully, per the team lead's added instruction to cover this third
   state alongside the two the review named.

**Proved load-bearing.** Reverted `web/src/doc.ts` and `web/src/features/connection.ts` to their
pre-4e2c291 content (`git show 4e2c291^:<path> > <path>` for both, not `git stash` — this repo's
rules forbid it), rebuilt, and ran the new test alone: it failed on the very first assertion,
`expect(popStatus).toBeHidden()`, with Playwright reporting the element `visible` and its text
`"musterd unreachable — showing last render"` throughout the 15s retry window — i.e. exactly Critical
1's symptom, on the healthy-state check. Restored both files with `git checkout -- <path>` (confirmed
`git diff --stat` against HEAD showed no difference — byte-identical), rebuilt again, reran the new
test alone (green), then `npx playwright test --list` (341 tests, clean) and the full `make e2e`
(341/341).

Because the test runs its three assertions in one linear sequence and the broken build already fails
at step 1, the kill-daemon assertion in step 3 is never vacuously exercised against the broken
build — it only ever runs once step 1 and step 2 have first passed for real, so a build that fakes
the outage message from the start (the exact failure mode Critical 1 was) cannot reach step 3 and
pass by coincidence. I did not additionally break *only* step 3 in isolation, since the one change
under review (wiring the three connection callbacks) is a single unit — reverting it fails the
earliest assertion it touches, which is sufficient proof the whole chain is load-bearing.

`make web-lint` exit 0, `web/scripts/e2e-lint.sh` clean, `make web-fmt` made no changes.

No assertion was deleted, skipped, or weakened.

## Fix Attempt 4 (review cycle 4)

**Failure addressed**: review cycle 4's Major 2 (`[e2e-specs]`, `plans/markdown-viewing/review.md`)
— the nav arrow pair (`Hide files`/`Show files`) is the reader's fourth interactive control kind,
and the only one whose own activation makes the activated element disappear (`hidden`, not rebuilt
— cycle 4's Major 1, fixed in `web-implementation.md` Fix Attempt 5's `prepareNavArrowFocusRestore`).
The cycle-3 focus-survival sweep (plan slot, tree file, outline entry) covers only *reused* nodes,
so it could not see this; E18 drives both arrows with `.click()`, which never reveals where focus
lands.

Rebuilt first (`make web-build build`, clean, exit 0) against `web-impl-fix1`'s commit a995f6f, which
landed `prepareNavArrowFocusRestore`.

**New test**: `keyboard-activating the nav arrow keeps focus on its counterpart, both directions, on
the Focus host and on the pop-out (review cycle 4 Major 2)`. Real `focus()` + `Enter` on `Hide files`
→ asserts `Show files` holds focus (element-handle identity, not just a matching locator), then the
reverse, then pops out (REQ-8) and repeats both directions there. Two new helper locators added to
`web/e2e/helpers/reader.ts`: `navArrowOpenNode`/`navArrowCollapsedNode`, plain `[data-role="arr-…"]`
attribute locators — needed because the existing `navArrowHide`/`navArrowShow` use `getByRole`, which
excludes a `hidden` element from the accessibility tree, so the counterpart arrow's handle must be
captured *before* the toggle that unhides it, through a locator that doesn't care about visibility.

**Proved load-bearing**: temporarily neutralized `prepareNavArrowFocusRestore` in
`web/src/render/reader.ts` to an unconditional no-op (kept both parameters referenced via `void` to
satisfy `tsc --noEmit`), rebuilt, reran the new test alone — it failed exactly on the focus check:
`expect(navArrowShow(region)).toBeFocused()` received `"inactive"` (`document.activeElement` was
`BODY`), everything before that line still passed. Restored the file from git (`git diff --stat --
web/src/render/reader.ts` empty afterward, confirming byte-identical to the wave-1 commit), rebuilt
again, and reran: the test passed, 38/38 (`reader.spec.ts` alone), 340/340 (`make e2e`).

**"Also assert the negative"**: the review asked that toggling the nav from something other than the
arrow itself must not focus-steal to an arrow. There is no such runtime path — `navCollapsed`
(`web/src/features/reader.ts`) is set once at mount (the compact-3×2 default) and thereafter flipped
only by `toggleNav()`, which only the two arrows' own `onToggleNav` click handler calls; no shortcut,
other control, or hook-driven re-render ever changes it (confirmed by grepping every reference to
`toggleNav`/`navCollapsed` in `web/src/`). The closest real analogue — an unrelated re-render firing
`prepareNavArrowFocusRestore` while focus sits on a non-arrow control — is already pinned by the
cycle-3 focus-survival test (a routed `docChanged` and a `sessionUpsert` both re-render the reader
while a tree file is focused, asserting focus stays exactly there, i.e. never stolen onto either
arrow). No test was invented for a non-arrow nav-toggle path that doesn't exist in the product; this
is recorded as a Note, not a repair, per the fix-wave instructions.

**Gates this attempt**: `npx playwright test --list` — 340 tests in 30 files, 0 errors.
`npx playwright test reader.spec.ts` — 38/38. `make e2e` — 340/340. `make web-fmt` — fixed 1 file
(unrelated to this attempt's edits; `git diff --stat` shows only `web/e2e/reader.spec.ts` and
`web/e2e/helpers/reader.ts` touched). `make web-lint` — "Checked 148 files … No fixes applied."
`sh web/scripts/e2e-lint.sh` — "e2e-lint: clean". `python3
.claude/skills/orchestrate/scripts/dead-refs.py` — 943 references checked, 0 missing.

No assertion was deleted, skipped, or weakened.

## Fix Attempt 3 (review cycle 3)

**Failures addressed**: review cycle 3's Major 2 (`[e2e-specs]`, `plans/markdown-viewing/review.md`)
— no spec measured either of that cycle's own findings (Critical 1: `/doc.html` unbounded; Major 1:
every tree/outline button destroyed and rebuilt on any `current`/`dirty` change, dropping keyboard
focus to `<body>`), which is how both survived three green cycles. Rebuilt first (`make web-build
build`, clean, exit 0) against `web-impl-cycle3`'s commit 754c507, which landed both fixes described
in `plans/markdown-viewing/web-implementation.md`'s `## Fix Attempt 4`.

The orchestrator's wave-3 prompt asked specifically for coverage of the *sweep*, not only the two
named findings — Major 1's fix also touched `renderPlanSlot` (found by web-impl's own sweep, never
named in the review) and added a stable-key focus-restore path for genuinely structural rebuilds,
neither of which the two named additions alone would exercise. Three additions:

**1. Pop-out layout** (new test, `"the pop-out reader bounds itself to the viewport…"`). Reached via
the `pop out ↗` link (never a hand-built `/doc.html?…` URL — the review's own note: that drops the
dashboard token and lands on "Muster is not running here"), using `buildLargeMarkdownFixtureTree`'s
30-heading file. Asserts, on the popup page: `article.md`'s `scrollHeight > clientHeight` (it is the
scroller) while `document.documentElement`'s `scrollHeight === clientHeight` (the page is not);
`.docbar`'s `boundingBox().y` unchanged after scrolling `article.md` (never the window); and
scrolling `article.md` moves `aria-current` off the outline's first entry. That first entry turned
out to be `"Outline"` — the fixture's own `# Outline` h1, since REQ-14's outline includes h1–h6 and
`ReaderInstance.openFile` resets `currentHeadingId` to `outline[0]`, not to the first `## Section`
— matching the review's own repro line ("`aria-current` after `window.scrollTo(0, 1200)`: `'Outline'`");
first-drafted against `"Section 1"` and corrected after a real run showed the attribute was never set
on it at all (see Repairs-style note below — this was caught before commit, not a repair of a landed
assertion).

**2. Keyboard-focus-survival sweep** (new test, `"keyboard-activating the plan slot, a tree file and
an outline entry keeps focus on that exact node…"`). Covers all three interactive control kinds the
sweep touched (plan slot, tree, outline — `renderPlanSlot`/`renderTree`/`renderOutline` all shared
the same defect and fix shape), each via real `focus()` + `Enter` (never `.click()`, which is exactly
why E8/E17/E18 couldn't see this). Identity is asserted by element handle, not merely `toBeFocused()`
— `document.activeElement === <handle captured before the action>` — the shape
kb:lesson/select-rebuilt-every-tick-passed-selectoption mandates, so a coincidentally-matching
replacement node can't pass. Per the orchestrator's explicit ask, also drives the two named
non-structural re-render triggers on the already-focused tree button: a routed `docChanged` Write
hook for a *different* file (lights that file's dot — an attribute patch on a sibling, not this
button) and an unrelated `sessionUpsert` (`rawUserPromptSubmit`, a turn-activity hook touching no
document) — focus and node identity survive both.

**3. Structural-rebuild focus restore** (new test, `"expanding a tree folder rebuilds the section
structurally…"`). Expanding a folder changes the flattened entry list (kind/path/name/depth/expanded/
count all feed `treeStructOf`'s structural signature), which is a genuine full rebuild via
`replaceChildren` — the sweep's other new code path (`focusedKeyWithin`/`restoreFocusByKey`), with no
existing coverage. Proven three ways on one element-handle capture, not just "a button with the same
name is focused afterwards": the *old* node is confirmed detached (`!document.contains(old)`),
`document.activeElement` is confirmed **not** the old node, and the *new* `folderEntry(region,
"docs")` locator is confirmed focused with `aria-expanded="true"`. This is what tells a genuine
rebuild-and-restore apart from an implementation that never destroyed the node in the first place.

**Fixture change**: `web/e2e/helpers/reader.ts`'s `outlineEntry` gained `exact: true` — a latent
correctness gap the pop-out test exposed immediately (`buildLargeMarkdownFixtureTree`'s headings are
`Section 1`..`Section 30`, and Playwright's default substring name match made `"Section 1"` also
match `Section 10`..`Section 19`; no existing caller's search string was a prefix of another
heading's text, so this had never been exercised before). Purely additive/stricter — every existing
`outlineEntry` call already passed an exact full heading string, so behaviour for them is unchanged.

**Setup finding, fixed before the first run, not a repair of a landed assertion**: the
keyboard-focus-survival test's docChanged step originally targeted the confinement fixture's nested
`docs/adr/x.md` without first expanding those folders — per REQ-10, folder children render only
while expanded, so the target button didn't exist and `changedDot(fileEntry(...))` timed out on zero
elements, not on a missing dot. Fixed by expanding `docs`/`adr` up front (a one-time setup click,
before any focus-sensitive assertion begins) so the button exists for the later attribute-patch
check.

**Proved all three additions are load-bearing** (the same deliberate-breakage discipline used for
cycle 2's additions): reverted `web/src/style.css` and `web/src/render/reader.ts` to their
pre-754c507 content (`git show 754c507~1:<path>`), rebuilt (`make web-build build`), and ran just the
three new tests —

```
✘ the pop-out reader bounds itself to the viewport…        → expect(scrollHeight).toBeGreaterThan(clientHeight) — Received: 2511 (not > 2511)
✘ keyboard-activating the plan slot, a tree file…            → expect(treeEntry).toBeFocused() — Received: "inactive"
✘ expanding a tree folder rebuilds the section structurally… → expect(newFolder).toBeFocused() — Received: "inactive"
```

— all three fail exactly on the new assertion, for exactly the reason cycle 3 named (the pop-out
test on Critical 1's own symptom; the two focus tests on Major 1's own symptom). Restored both files
from `git show`, confirmed `git diff --stat` against HEAD showed nothing (byte-identical to the fixed
tree), rebuilt again, and re-ran: `reader.spec.ts` 37/37, full suite `make e2e` 339/339.

**Not touched**: no existing test title, locator or assertion changed or removed this cycle
(`outlineEntry`'s `exact: true` is additive, not a narrowing of what it used to accept for any real
caller). Only new tests, one new fixture correctness fix, and the pre-run setup fix above.

**Gate**: `sh web/scripts/e2e-lint.sh` clean. `npx playwright test --list` — 339 tests, 0 errors
(checked before and after edits). `npm run e2e -- e2e/reader.spec.ts` (from `web/`, after `make
web-build build`): 37/37. `make e2e` (project root): 339/339. `make web-lint`: clean (`make web-fmt`
run once to fix a formatter disagreement in the new pop-out test before this commit).

No assertion was deleted, skipped, or weakened.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: review cycle 2's Major 2 (`[e2e-specs]`, `plans/markdown-viewing/review.md`)
— the two review-cycle-1 tests I added (nav placement, live compact) were each blind to one of that
cycle's own findings (Critical 1, Major 1), which is how both shipped past a green 336/336 sweep.
Rebuilt first (`make web-build build`, clean, exit 0) against `web-impl-fix1`'s commit 7d69d8e,
which landed both fixes described in `plans/markdown-viewing/web-implementation.md`'s `## Fix
Attempt 3`.

**Fixture Changes** below has the new `buildLargeMarkdownFixtureTree` builder and the two new
`navTreeSection`/`navOutlineSection` locators this required.

**1. Live compact (`"compact follows the current host…"`, `web/e2e/reader.spec.ts`).** Added an
`envelopedSessionStart` bind plus a routed `rawPostToolUse` Write hook for the open file right after
it's opened in Focus, before the Focus→Tiles→Focus round trip — without a real write hook `.chg`
never exists and the ordering combination review cycle 2 Major 1 measured (`.path` re-inserted while
`.chg` was already connected) never occurs. Asserted:
- `freshnessCue(focusRegion)` visible and `docBar(focusRegion).locator(".path ~ .chg")` count 1
  (REQ-4 order) right after the write, before any view switch.
- `freshnessCue(tileRegion)` stays visible in compact (only `.path` depends on compact, not `.chg` —
  `features/reader.ts:334-335`), where previously only `.path`'s absence was checked.
- On the return leg (`focusRegionAgain`), `freshnessCue` visible AND
  `docBar(focusRegionAgain).locator(".path ~ .chg")` count 1 — the actual assertion the review asked
  for: `.path` before `.chg` in DOM order, not just both present. `.path ~ .chg` is a CSS
  general-sibling selector, so it only matches when `.chg` is a *later* sibling of `.path` under the
  same `.docbar` parent — a direct, locator-only encoding of left-to-right order with no
  `page.evaluate` needed.

**2. Nav placement (`"the reader nav sits beside the body…"`, same file).** Swapped
`buildMarkdownFixtureTree` (4 files, none deep enough to overflow the nav) for the new
`buildLargeMarkdownFixtureTree` (20 top-level files + a 30-heading file — the same sizes web-impl's
own cycle-2 verification used). Opened the 30-heading file in Focus (the tree needs no file open,
but the outline reflects only the currently-open one), then added, after the existing outer-box
assertions:
- A genuine-overflow check first, so the reachability check below can't pass vacuously against
  content that already fit: `getComputedStyle(el).overflowY === "auto"` and `scrollHeight >
  clientHeight` on both `navTreeSection(focusRegion)` and `navOutlineSection(focusRegion)`.
- The reachability check itself, exactly as the review named it for Critical 1: scroll the *owning*
  element (`.rnav .tree` / `.rnav .outline`, never `.rnav` itself, which the fixed model leaves
  unscrolled by design) to its own `scrollHeight`, then assert the last row's bottom edge is
  `<=` the container's own bottom edge (+1px tolerance) — done for both `fx.lastFileName`
  (`file-20.md`) and `fx.lastHeading` (`"Section 30"`).

**Proved both repaired assertions are the ones that catch the regression** (not a repair that
passes regardless): copied `web/src/style.css` and `web/src/render/reader.ts` back to their
pre-7d69d8e content (`git show 7d69d8e~1:<path>`), rebuilt (`make web-build build`), and ran just
these two tests —

```
✘ the reader nav sits beside the body … → expect(overflowY).toBe("auto") — Received: "hidden"
✘ compact follows the current host …    → docBar(...).locator(".path ~ .chg") — Expected: 1, Received: 0
```

— both fail exactly on the new assertion, for exactly the reason cycle 2 named. Restored both files
from the saved copies (`git diff --stat` against HEAD showed nothing — byte-identical to the fixed
tree), rebuilt again, and re-ran: full `reader.spec.ts` 34/34, full suite `make e2e` 336/336.

**Not touched**: no new spec file, no test title changed or removed, no assertion weakened or
deleted — every pre-existing assertion in both tests is intact; only new assertions and the fixture
swap were added.

**Gate**: `npx playwright test --list` from `web/` — 336 tests, 0 errors (checked before and after
the fixture-swap/locator additions). `npm run e2e -- e2e/reader.spec.ts` (from `web/`, after `make
web-build build`): 34/34. `make e2e` (project root): 336/336.

## Fix Attempt 1 (review cycle 1)

Rebuilt (`make web-build build`, clean, exit 0) against `web-impl-fix1`'s Fix Attempt 1 (Critical 1,
Major 1, Major 2 in `plans/markdown-viewing/review.md`) and `web-tests`' companion fix to Major 3.

**Task 1 — Major 4 (mine).** Widened `web/e2e/reader.spec.ts`'s E10 assertion from
`toHaveText(/^changed .+ ago$/)` to `toHaveText(/^changed (now|.+ ago)$/)` — the only change needed:
Major 2's `agoSuffix` fix (`web/src/sessions/format.ts`, `web/src/reader/freshness.ts`) makes the
sub-minute bucket render bare `"changed now"`, which the old regex's mandatory `.+ ago` tail could
never match. The widened pattern still requires a real `changed` cue with real freshness text — it
does not accept an empty or missing cue — so REQ-18's assertion is unchanged in strength, only in
which of the two grammatically-correct shapes it accepts.

**Task 2 — new coverage for this cycle's behaviour change, not a repair.** Added two tests reading
`web-implementation.md`'s `## Fix Attempt 1` measurements (Critical 1's grid layout, Major 1's
per-render `compact` parameter) and asserting them directly rather than trusting the log's own
throwaway repro:

1. *Nav placement* (Critical 1) — `the reader nav sits beside the body as a right-hand column
   bounded by its host, in Focus and in a tile`. Measures `boundingBox()` on the body
   (`article.md`), the nav (`nav.rnav`) and each host (`#main-terminal-slot` in Focus, the live tile
   element in Tiles) for the *same* session across a Focus→Tiles switch, and asserts `nav.x >=
   body.x + body.width` (beside, never below) and `nav.y + nav.height <= host.y + host.height + 1`
   (bounded, never overflowing) in both hosts. Passes.
2. *Live compact* (Major 1) — `compact follows the current host across a Focus/Tiles switch, not the
   mount moment`. Opens `docs` in Focus (not compact: `.path` visible, `.n` visible, after opening a
   file so `.path` carries real text — an empty `.path` measures zero-size and reads "hidden"
   regardless of `pathVisible`, so the test opens `TODO.md` first), switches to Tiles and asserts the
   *same* session's reader reads `compact` (`.path`/`.n` both absent), then switches back to Focus
   and asserts it reverts. The forward half (Focus→Tiles) passes. The return half
   (Tiles→Focus) is genuinely red — see below; this is exactly the "reverse direction" case the
   review's own Major 1 report named as broken pre-fix and that Fix Attempt 1's measurement never
   re-checked (its throwaway repro only drove Focus→Tiles once).

**Root-caused the red return-half assertion before reporting it**, per the "never repair by
weakening" rule: added a temporary `console.log` of the `.docbar`'s `outerHTML` at the failure point
(reverted before this commit — `git diff --stat -- web/e2e/` shows only `reader.spec.ts`, the spec
file itself). It showed `.path` and `.chg` both entirely absent from `.docbar`'s children after the
Tiles→Focus switch, even though `compact` had correctly gone back to `false`
(`toHaveClass(/compact/)` had already passed by that point). Read `web/src/render/reader.ts`'s
`setPresence`/`renderBar` to find why:

- `setPresence(el, anchor, present)` removes `el` when `!present`, and re-`insertBefore(el, anchor)`
  when `present` and `el` is currently disconnected — but only via `anchor.parentElement`. If `anchor`
  itself is disconnected, the branch's optional-chain silently no-ops: `el` never comes back.
- `renderBar` (`render/reader.ts:155-166`) calls `setPresence(refs.path, refs.chg, vm.pathVisible)` —
  `.path`'s reinsertion anchor is `.chg`, the freshness-cue element.
- `.chg` is itself gated by `setPresence(refs.chg, refs.popOut, vm.freshness !== null)` — REQ-24's own
  rule, "absent until a write is seen". My test never posts a write hook (freshness stays `null`
  throughout, the overwhelmingly common case per the review's own Major 2 fix rationale), so `.chg`
  is disconnected from its very first render and stays that way for the rest of the test.
- Once `.chg` is disconnected, `.path`'s anchor has no parent, so `setPresence(refs.path, refs.chg,
  true)` on the Tiles→Focus return can never re-run its `insertBefore` — `.path` is gone for good,
  regardless of how many further renders occur. `.chg`'s own anchor (`refs.popOut`) never has this
  problem, because `popOut`'s visibility is a `.hidden` toggle, not a `setPresence` detach — an
  asymmetry between the two elements that only bites once something toggles `.path`'s presence at
  runtime, which is exactly what Major 1 introduced.

This is a real defect in `web/src/render/reader.ts`, not a locator problem in my spec: the assertion
is exactly what REQ-15 and Major 1's own fix intent require (compact is "a property of the host…,
not of the mount moment", in both directions), and the plan/review both name the reverse direction
explicitly. I did not weaken, retitle, or drop the assertion — see E2E Implementation Bugs.

Re-ran `npx playwright test --list`: 336 tests, 30 files, no new duplicates (334 prior + 2 new).
Did not run the full-suite `make e2e` sweep this attempt — that step is for a spec file that passes
outright, and mine has one test red for a real product defect (see harness rules for `e2e-specs`).

## Validate Attempt 2

Rebuilt (`make web-build build`, clean, exit 0) against `web-impl-fix1`'s commit ac4137e, which added
`ReaderInstance.maybeAutoOpenPlan(session)` (called at the top of `render()`, gated on
`this.listing !== null && this.openPath === null`) to close the User Flow 4 gap Attempt 1 root-caused
(a plan that becomes known after the reader is already mounted with nothing open never auto-opened).

Ran `web/e2e/reader.spec.ts` live: **32/32 passing**, including the previously-red
`leaving plan mode fires a scan that fills the plan slot (REQ-16, edge case 4)` test — no repair
needed on my side this attempt, since Attempt 1's two locator repairs (E2/INV-6 tracker-before-goto,
E18 `exact: true`) are already committed and still hold.

Re-ran `npx playwright test --list`: 334 tests, 30 files, no new duplicates. Full-suite sweep via
`make e2e`: **334/334 passing**, run twice back-to-back for confidence — no regression in E5/E29
(the /clear-then-stale-write neighbours) or E14 (INV-5's zero-poll assertion), which were the
regression-sensitive neighbours flagged for this fix.

Ran the remaining gates: `sh web/scripts/e2e-lint.sh` clean, `npx tsc --noEmit -p web/tsconfig.json`
clean, `npx biome check` on the four files Attempt 1 touched (no further edits, so unchanged),
`dead-refs.py --all` 2530/2530, 0 missing.

No spec edits were made this attempt — `git status --short -- web/e2e/` is empty relative to the
Attempt 1 commit (afbd529).

## Validate Attempt 1

Rebuilt (`make web-build build`) — `npx tsc --noEmit` is now clean (web-tests' 769e5e5 landed the
`plan`/`docsBtn` fixture repairs the web-impl handoff asked for), so the real `make web-build build`
ran, unlike web-impl's smoke run which had to fall back to a bare `vite build`.

Ran `web/e2e/reader.spec.ts` live against the rebuilt `bin/musterd`, confirmed web-impl's head-start
report by measurement, repaired the two that were mine, and root-caused the third as a genuine
implementation gap (see Repairs and E2E Implementation Bugs below). Re-ran `npx playwright test
--list` after the edits (334 tests, 30 files, no new duplicates). Full-suite sweep via `make e2e`:
333/334 passing, the one red being `reader.spec.ts`'s own REQ-16 test — no other spec regressed.

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/reader.spec.ts | Focus mainhead gains a docs segment; selecting it shows the reader and hides the Claude terminal, and selecting claude restores it (E1, REQ-1, REQ-2) | REQ-1, REQ-2 | `docs` button exists and is pressable; selecting it mounts the reader and unmounts the Claude terminal region; `claude` restores it |
| web/e2e/reader.spec.ts | in Tiles, selecting docs in one tile shows the reader there only and leaves the other tile's terminal socket and geometry untouched (E2, INV-6) | REQ-2, INV-6 | two live tiles; selecting `docs` in one closes only that tile's terminal socket (tracker count 2→1) and leaves the other's tmux geometry byte-identical |
| web/e2e/reader.spec.ts | a session whose transcript names an existing plan file opens it automatically with the plan badge and full path (E3, REQ-7, REQ-9, REQ-4) | REQ-4, REQ-7, REQ-9 | fake transcript naming an existing plan → auto-opens; badge, basename, absolute path, `aria-current` on the plan slot |
| web/e2e/reader.spec.ts | a session whose transcript names no plan shows no plan yet and lists the directory's files (E4, REQ-9) | REQ-9 | no transcript recorded → `no plan yet`; tree still lists the directory |
| web/e2e/reader.spec.ts | after a /clear pair naming a planless transcript, the slot returns to no plan yet (E5, edge case 3) | REQ-16, REQ-17 | SessionEnd(clear) + SessionStart(clear, new planless transcript) → badge disappears, `no plan yet` returns |
| web/e2e/reader.spec.ts | the tree lists exactly the fixture's markdown files, folders collapsed with counts, and expanding reveals children (E6, REQ-10) | REQ-10 | `.md` files listed, non-`.md` and dot-directory file absent, folders collapsed then expandable |
| web/e2e/reader.spec.ts | typing in the filter narrows the tree to matching files with ancestors expanded, and clearing restores the collapsed tree (E7, REQ-11) | REQ-11 | filter narrows + expands ancestors; clearing restores the collapsed tree |
| web/e2e/reader.spec.ts | the open file carries aria-current, moving to whichever file is opened (E8, REQ-12) | REQ-12 | `aria-current` moves between tree entries as files are opened |
| web/e2e/reader.spec.ts | a routed Write hook for an unopened file lights its changed dot, cleared by opening it (E9, REQ-13) | REQ-13 | `docChanged`-driven dot appears, then clears on open |
| web/e2e/reader.spec.ts | rewriting the open file on disk and posting a Write hook for it re-renders the new content with a changed cue (E10, REQ-18) | REQ-18 | re-fetch + re-render + freshness cue on a routed write for the OPEN file |
| web/e2e/reader.spec.ts | before any write hook for the open file, no freshness cue element exists (E11, REQ-24) | REQ-24 | cue element absent (not merely hidden) until a write hook is seen |
| web/e2e/reader.spec.ts | rewriting the plan on disk and switching away and back to docs shows the new content (E12, REQ-19) | REQ-19 | re-fetch on surface re-open |
| web/e2e/reader.spec.ts | rewriting the plan on disk and dispatching a window focus event shows the new content (E13, REQ-19) | REQ-19 | re-fetch on window `focus` for the plan specifically |
| web/e2e/reader.spec.ts | with a reader open and nothing happening, no further requests reach /reader or /reader/file (E14, INV-5) | INV-5 | zero-poll assertion over a 3s settle window |
| web/e2e/reader.spec.ts | a file with a GFM table, task list and fenced code renders a table, disabled checkboxes and a code block (E15, REQ-5) | REQ-5 | GFM rendering: `<table>`, two disabled checkboxes, `<pre><code>` |
| web/e2e/reader.spec.ts | a file containing a script element, an onerror attribute and a javascript: link renders with none of them present (E16, REQ-22) | REQ-22 | sanitizer removes `<script>`, `onerror`, `javascript:` href; no `window.__readerXss` side effect |
| web/e2e/reader.spec.ts | the outline lists the file's headings, clicking one scrolls the body, and scrolling moves aria-current (E17, REQ-14) | REQ-14 | outline click scrolls; manual scroll-to-top moves `aria-current` to the top heading |
| web/e2e/reader.spec.ts | a repeated heading gets deduplicated ids so each outline entry scrolls to its own heading (edge case 26, REQ-14) | REQ-14 | two `id="notes"`/`id="notes-2"` headings both rendered; two outline entries |
| web/e2e/reader.spec.ts | the Files and Outline header toggles fold independently, and the nav arrow hides and restores the whole nav (E18, REQ-14, REQ-4) | REQ-4, REQ-14 | independent fold of Files/Outline; nav arrow hide/show round-trip |
| web/e2e/reader.spec.ts | the last opened file is remembered across a reload (E19, REQ-7) | REQ-7 | localStorage memory survives a reload |
| web/e2e/reader.spec.ts | reader/file returns 404 for .. traversal, an outside symlink and the plan's -agent- sibling (E20, REQ-20) | REQ-20, INV-2 | three confinement-boundary requests, all 404, against the running daemon |
| web/e2e/reader.spec.ts | the pop out link opens a second page with the reader for the same file, and a docChanged re-renders it there too (E21, REQ-8, REQ-27) | REQ-8, REQ-27 | real `target="_blank"` link → second page, same file, no pop-out link there, `docChanged` reaches both pages |
| web/e2e/reader.spec.ts | on an ended session the plan block is absent and opening a tree file still renders it (E22, REQ-3) | REQ-3 | dead session: plan slot and "no plan yet" both absent; tree still serves |
| web/e2e/reader.spec.ts | on an ended session whose directory was removed, the status line shows the directory_missing message (E23, edge case 12) | REQ-20 | 409 `directory_missing` surfaced in the reader's status line |
| web/e2e/reader.spec.ts | stopping the daemon disables the docs segment and shows the unreachable status while keeping the render, and restarting restores it (E24, edge case 13) | (daemon-down UX) | segment disabled + status line message while down; both clear on restart |
| web/e2e/reader.spec.ts | deleting the open file and posting a Write hook for it shows file no longer exists while keeping the last render (E25, REQ-28) | REQ-28 | 404-on-fetch → status line message; body keeps the stale render |
| web/e2e/reader.spec.ts | opening a file over 10 MiB shows the too_large message and leaves the body unchanged (E26, REQ-6) | REQ-6 | 413 → status line message; body unchanged |
| web/e2e/reader.spec.ts | in Tiles at 3x2 the reader nav starts collapsed and the bar has no path; at 2x2 it starts open (E27, REQ-15) | REQ-15 | per-density initial nav/collapse state, one fresh session per density to avoid remount ambiguity |
| web/e2e/reader.spec.ts | the reader nav sits beside the body as a right-hand column bounded by its host, in Focus and in a tile (review cycle 1 Critical 1, REQ-4/REQ-9/REQ-10/REQ-14) | REQ-4, REQ-9, REQ-10, REQ-14 | `boundingBox()` on body/nav/host in both Focus (`#main-terminal-slot`) and a tile: nav starts at or past the body's right edge (never below it) and stays within its host's bottom edge (never overflowing); **cycle 2 addition**: with `buildLargeMarkdownFixtureTree` (20 files + a 30-heading file), `.rnav .tree`/`.rnav .outline` are each confirmed genuinely overflowing (`overflow-y:auto`, `scrollHeight > clientHeight`) and, after scrolling each to its own `scrollHeight`, the last tree row and last outline row are reachable (row bottom `<=` container bottom) |
| web/e2e/reader.spec.ts | compact follows the current host across a Focus/Tiles switch, not the mount moment (review cycle 1 Major 1, REQ-15) | REQ-15 | the SAME session's reader: not compact in Focus (`.path`/`.n` visible), compact in Tiles (`.path`/`.n` absent), reverts back in Focus; **cycle 2 addition**: a routed Write hook before the round trip, and on the return leg `docBar(...).locator(".path ~ .chg")` count 1 — `.path` still precedes `.chg` in DOM order (REQ-4), not just both present |
| web/e2e/reader.spec.ts | after a daemon restart and reload, switching to docs shows the plan in the slot (E28, INV-3) | INV-3 | `transcript_file`/`plan_path`/`plan_exists` survive a restart |
| web/e2e/reader.spec.ts | after a /clear pair, a straggler Write hook carrying the old claude id and transcript leaves the slot at no plan yet (E29, INV-8) | INV-8 | a straggler enveloped-bind-wise stale write never moves the transcript/plan backwards |
| web/e2e/reader.spec.ts | leaving plan mode fires a scan that fills the plan slot (REQ-16, edge case 4) | REQ-16 | `PreToolUse`/`PostToolUse{ExitPlanMode}` scan trigger, independent of the SessionStart trigger E3-E5/E28/E29 exercise |
| web/e2e/reader.spec.ts | no terminal exists for the docs surface from every switch direction, and ending a running shell while docs is selected keeps the docs selection (INV-1) | INV-1 | shell→docs, docs→shell, and the shell dying while docs is selected (pip clears, selection stays `docs`) |
| web/e2e/reader.spec.ts | the pop-out reader bounds itself to the viewport so the body scrolls, the docbar stays fixed and scroll-spy tracks it (review cycle 3 Critical 1) | REQ-8, REQ-14, REQ-27 | on `/doc.html` with a 30-heading file: `article.md.scrollHeight > clientHeight`, `documentElement.scrollHeight === clientHeight`, `.docbar` `boundingBox().y` unchanged after scrolling `article.md`, and scrolling it moves `aria-current` off the outline's first entry |
| web/e2e/reader.spec.ts | keyboard-activating the plan slot, a tree file and an outline entry keeps focus on that exact node across a render tick, a routed docChanged write and an unrelated sessionUpsert (review cycle 3 Major 1/2) | REQ-4, REQ-9, REQ-12, REQ-13, REQ-14 | real `focus()` + `Enter` on the plan slot, a tree file and an outline entry; `document.activeElement` checked against an element handle captured before each action, surviving a 1.1s tick, a routed `docChanged` for a different file, and a `sessionUpsert` (`rawUserPromptSubmit`) |
| web/e2e/reader.spec.ts | expanding a tree folder rebuilds the section structurally and restores focus onto the new equivalent button, not the destroyed old node (review cycle 3 Major 1 sweep) | REQ-10, REQ-12 | old folder-button handle confirmed detached and NOT `document.activeElement` after expansion; the freshly-queried same-name button is focused with `aria-expanded="true"` |
| web/e2e/reader.spec.ts | keyboard-activating the nav arrow keeps focus on its counterpart, both directions, on the Focus host and on the pop-out (review cycle 4 Major 2) | REQ-4, REQ-8, REQ-14, REQ-27 | real `focus()` + `Enter` on `Hide files`/`Show files`, both directions, element-handle identity check on the counterpart (captured before the toggle that unhides it), repeated on `/doc.html` |
| web/e2e/reader.spec.ts | the pop-out's own status line is hidden while healthy, shows file-gone on a routed delete, and then genuinely unreachable once the daemon dies (E30, REQ-8, REQ-27, REQ-28) | REQ-8, REQ-27, REQ-28 | `/doc.html`'s own `readerStatusLine`, never asserted before: hidden/empty while healthy, `file no longer exists — <path>` after a routed delete (mirrors E25), then the literal unreachable text after `daemon.kill()` (mirrors E24) — all three read off the same pop-out page |

## Fixture Changes

- **`web/e2e/helpers/reader.ts`** (new) — every locator in the plan's Testable UI Elements
  table (`readerRegion`/`readerRegionInTile`, `docBar` and its children, `readerNav` and its
  children, tree/outline entries, status line); `writeFakeTranscript` (synthesizes the two
  transcript-line shapes `kb:fact/plan-file-path-in-transcript` measured — a `plan_mode`/
  `plan_mode_exit`/`plan_mode_reentry` attachment line carrying `planFilePath`+`planExists`,
  or a slug-only fallback line); `buildMarkdownFixtureTree` (the E6/D8 tree: a top-level
  `.md`, a two-deep nested `.md`, a non-`.md` sibling, a `.md` inside a dot-directory);
  `buildConfinementFixtures` (INV-2/D11/E20: an outside `.md`, a symlink inside pointing at
  it, an `-agent-` and a `.workshop.md` sibling of the plan); `ReaderRequestTracker`
  (INV-5's zero-poll oracle, mirroring `TerminalSocketTracker`'s shape); `getReaderListing`/
  `getReaderFile` (direct HTTP oracles for the two GETs, mirroring `helpers/session.ts`'s
  `getState`); `popOutURL`.
- **`web/e2e/helpers/payloads.ts`** — added `transcriptPath` (default unchanged,
  `/tmp/t.jsonl`) to `SessionStartOpts`/`envelopedSessionStart`/`unboundSessionStart` and to
  `TurnActivityOpts`/`rawUserPromptSubmit`; introduced `ToolUseOpts` (`toolName`, `filePath`,
  `transcriptPath`) shared by `rawPostToolUse` (now also builds `Edit`/`MultiEdit`/arbitrary
  tool names, not just the fixed `Write /tmp/x.txt` shape) and the new `rawPreToolUse`
  builder (`ExitPlanMode`'s `PreToolUse` scan trigger, `permission_mode:"plan"` per
  `kb:fact/plan-mode-hook-sequence`). Scoped to the builders the reader's scan/`docChanged`
  triggers actually touch (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit) rather
  than literally every builder in the file — `Stop`/`StopFailure`/`Notification`/
  `PermissionRequest`/`PreCompact`/`SessionEnd`/the status-line builders have no scan
  trigger and no existing reader test needed one, so they were left unchanged to keep the
  diff honest about what it's for.
- **`web/e2e/helpers/shell.ts`** — widened `SurfaceKind` from `"claude" | "shell"` to
  `"claude" | "shell" | "docs"`. `mainheadSurfaceButton`/`tileSurfaceButton` already take
  `kind: SurfaceKind` generically, so this one-line change is what makes `docs` locatable
  through the same two functions every other surface-switch test already uses — no new
  locator function needed for the segment button itself.
- **`web/e2e/CLAUDE.md`** — added `reader` to the hand-written head's **Features** list.
- **`web/e2e/helpers/reader.ts`** (review cycle 2) — added `buildLargeMarkdownFixtureTree` (20
  top-level `.md` files named `file-01.md`..`file-20.md`, plus `0-outline.md` carrying 30 `##`
  headings — sizes mirror `web-implementation.md`'s own cycle-2 verification; `0-outline.md`
  sorts alphabetically first so `file-20.md` is reliably the tree's last row regardless of
  which file is open) and two locators, `navTreeSection`/`navOutlineSection` (`.rnav .tree`/
  `.rnav .outline` themselves — the scroll-reachability oracle for Critical 1), reusing them
  inside `fileEntry`/`folderEntry`/`outlineEntry` rather than duplicating the selector string.
- **`web/e2e/helpers/reader.ts`** (review cycle 3) — `outlineEntry` gained `exact: true`
  (`buildLargeMarkdownFixtureTree`'s `Section 1`..`Section 30` headings otherwise collide
  under Playwright's default substring name match; no existing caller's search string was a
  prefix of another heading, so this had never surfaced before the pop-out test used
  `"Section 1"`/`"Outline"` against a 30-heading fixture).
- **`web/e2e/helpers/reader.ts`** (review cycle 4) — added `navArrowOpenNode`/
  `navArrowCollapsedNode`, plain `[data-role="arr-open"]`/`[data-role="arr-collapsed"]`
  attribute locators (`web/index.html`, `web/doc.html`) that resolve regardless of the
  `hidden` attribute, unlike `navArrowHide`/`navArrowShow`'s `getByRole` (which excludes a
  `hidden` element from the accessibility tree) — needed to capture the counterpart arrow's
  element handle before the toggle that unhides it.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E1 |
| REQ-2 | E1, E2 |
| REQ-3 | E22 |
| REQ-4 | E3, E18, nav-placement (review cycle 1 Critical 1), keyboard-focus-sweep (review cycle 3), nav-arrow-focus (review cycle 4) |
| REQ-5 | E15 |
| REQ-6 | E26 |
| REQ-7 | E3, E19 |
| REQ-8 | E21, pop-out-layout (review cycle 3 Critical 1), nav-arrow-focus (review cycle 4), E30 (review cycle 5) |
| REQ-9 | E3, E4, nav-placement (review cycle 1 Critical 1), keyboard-focus-sweep (review cycle 3) |
| REQ-10 | E6, nav-placement (review cycle 1 Critical 1, cycle 2 reachability), folder-toggle-focus-restore (review cycle 3) |
| REQ-11 | E7 |
| REQ-12 | E8, keyboard-focus-sweep, folder-toggle-focus-restore (both review cycle 3) |
| REQ-13 | E9, keyboard-focus-sweep (review cycle 3) |
| REQ-14 | E17, E18, edge-case-26, nav-placement (review cycle 1 Critical 1, cycle 2 reachability), pop-out-layout, keyboard-focus-sweep (both review cycle 3), nav-arrow-focus (review cycle 4) |
| REQ-15 | E27, nav-placement (review cycle 1 Critical 1), live-compact (review cycle 1 Major 1, cycle 2 docbar-order) |
| REQ-16 | E5, E29, REQ-16 test |
| REQ-17 | E5 (via `plan` field flip) |
| REQ-18 | E9, E10 |
| REQ-19 | E12, E13 |
| REQ-20 | E20, E23 |
| REQ-21 | not directly E2E-tested — a static grep (D4/Automated Check) over Go/TS source; no dashboard-observable behaviour |
| REQ-22 | E16 |
| REQ-24 | E11 |
| REQ-27 | E21, pop-out-layout (review cycle 3 Critical 1), nav-arrow-focus (review cycle 4), E30 (review cycle 5) |
| REQ-28 | E25, E30 (review cycle 5) |
| REQ-23, REQ-25, REQ-26 | not directly E2E — REQ-23 is an ADR-writing requirement, REQ-25 is the non-git 20,000-file cap (D8, Go-only fixture at that scale), REQ-26 is exercised indirectly through E29/INV-8 |
| INV-1 | dedicated INV-1 test, plus E1 (claude↔docs) |
| INV-2 | E20 |
| INV-3 | E28 |
| INV-4 | not E2E — a static grep (D4) |
| INV-5 | E14 |
| INV-6 | E2 |
| INV-7 | not E2E — D17 asserts no mutating route exists, a routing-table fact |
| INV-8 | E29 |

## Repairs (validate / fix modes only)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | in Tiles, selecting docs in one tile shows the reader there only… (E2, INV-6) | `expect.poll(() => tracker.liveCount).toBe(2)` never reached 2 within the timeout | `TerminalSocketTracker` was constructed after `page.goto`/`launchSession` — both sessions' initial Focus-view render opens a terminal socket during `launchSession`, before the `page.on("websocket", …)` listener existed to see it (Playwright only fires that event for connections opened after the listener attaches; `tiles.spec.ts:717`'s own comment already documents this exact fix) | moved `const tracker = new TerminalSocketTracker(page)` to before `page.goto` | REQ-2/INV-6 still asserted exactly as before: only session A's terminal socket closes (2→1) and session B's tmux geometry is byte-identical; reran alone and full-suite, both green |
| 2 | the Files and Outline header toggles fold independently… (E18, REQ-14/REQ-4) | `filesHeaderToggle` resolved to 2 elements (strict-mode violation / wrong element clicked) | `readerNav(region).getByRole("button", { name: "Files" })` had no `exact: true`; Playwright's default name match is substring/case-insensitive, and the nav-open arrow's real accessible name is `aria-label="Hide files"` (`web/index.html:339`), which contains "Files" | added `exact: true` to the locator in `helpers/reader.ts` | REQ-14/REQ-4's independent-fold assertion is unchanged — it now clicks the actual `data-role="files-toggle"` button (`aria-label="Files"`, `web/index.html:343`) instead of colliding with the arrow; confirmed by deliberately reverting the fix (removing `exact: true`) and observing the same failure mode before restoring it |

No assertion was deleted, skipped, or weakened.

**Cycle 2 (review cycle 2 Major 2, `[e2e-specs]`)**: these are coverage additions the review asked
for, not repairs of a broken locator — both tests were green before and after; they simply couldn't
see the two bugs cycle 2 found. Listed here anyway because the same "prove it would have caught the
regression" discipline the Repairs table exists for applies:

| # | Test | Gap the review named | Addition | Assertion strength |
|---|------|-----------------------|----------|---------------------|
| 3 | compact follows the current host… (REQ-15) | ran on a session that never received a write hook, so `.chg` never existed and the `.path`/`.chg` ordering combination never occurred | added an `envelopedSessionStart` bind + routed `rawPostToolUse` Write for the open file before the Focus→Tiles→Focus round trip; asserted `docBar(...).locator(".path ~ .chg")` count 1 on the return leg (path before chg in DOM order) instead of only `.path`'s presence | strictly stronger — every prior assertion (`barPath`, `fileCount`, class toggling) is unchanged; new assertions added, none removed |
| 4 | the reader nav sits beside the body… (REQ-4/9/10/14) | measured the nav's outer box but nothing about reaching its own content | swapped in `buildLargeMarkdownFixtureTree` (20 files + 30-heading file) and added: genuine-overflow checks (`overflow-y:auto`, `scrollHeight>clientHeight`) on `.rnav .tree`/`.rnav .outline`, then scroll-to-`scrollHeight` + last-row-reachable checks on both | strictly stronger — the existing outer-box (Focus and tile) assertions are unchanged; new assertions added, none removed |

**Proof both additions are load-bearing, not vacuous** (the same deliberate-breakage discipline the
harness requires for a repaired absence assertion): reverted `web/src/style.css` and
`web/src/render/reader.ts` to their pre-7d69d8e content, rebuilt (`make web-build build`), and ran
just these two tests — both failed, each on the new assertion specifically:
`expect(overflowY).toBe("auto")` received `"hidden"` for test 4, and
`docBar(...).locator(".path ~ .chg")` received count 0 (expected 1) for test 3. Restored both files
from saved copies, confirmed `git diff --stat` against HEAD showed no difference (byte-identical to
the fixed tree), rebuilt again, and reran: 34/34 (`reader.spec.ts`), 336/336 (`make e2e`).

No assertion was deleted, skipped, or weakened.

The third head-start report (`leaving plan mode fires a scan…`, REQ-16/edge case 4) is **not** a
repair — see E2E Implementation Bugs below. I measured it directly (temporary debug instrumentation,
reverted before this commit — `git diff --stat` on `web/e2e/` shows only the two repairs above) to
confirm which side owns it:
- `GET /api/state` after the two hooks shows `session.plan == {path: …, exists: true}` — the daemon
  persisted the scan result correctly.
- A WS frame dump (`page.on("websocket", …)` attached before `page.goto`, so before the dashboard's
  own `/ws` opens) shows a real-time `sessionUpsert` carrying that same correct `plan` object arrives
  at the browser within the test's window — the daemon also broadcast it correctly, live, not just on
  reload.
- So the daemon side (`internal/server/reader.go`'s `Observe`/`scanPlan`, `internal/session/manager.go`'s
  `SetPlan`) is not at fault; `TestInterpretFiles`'s daemon-tests green result was the right signal.
- The plan's own **User Flow 4** (plan.md:341-343) is explicit: "…leaves plan mode → scan on
  `ExitPlanMode` … → `sessionUpsert` with `plan` → the slot fills; **if nothing is open the plan
  opens**." `web/src/features/reader.ts`'s `decideInitialOpen` (auto-open the plan when it exists)
  runs only once, from `loadListing` at mount (`ReaderInstance` constructor path) — there is no
  equivalent check in `render()` or any `sessionUpsert`/render-tick handler for a plan that transitions
  from absent to present *after* the reader is already mounted with nothing open. The docbar badge
  itself is gated on `this.openPath === planPath` (`buildBarVM`, reader.ts:308-311), so nothing opens
  and the badge never appears.
- This is why every other plan-related test passes without hitting the gap: E3/E4 have the plan
  already known before the reader ever mounts (no live transition at all); E28 reloads the page,
  which reconstructs the `ReaderInstance` and re-runs `decideInitialOpen` fresh; E5/E29 only exercise
  the *removal* direction (plan → no plan, or "never flip back"), which needs no `openFile` call —
  `buildBarVM` recomputes `planPath` as null every render tick and the badge disappears reactively.
  REQ-16's `ExitPlanMode` trigger is the one path that adds a plan to an *already-mounted,
  nothing-open* instance without a page reload — the one case nothing calls `openFile` for.

**Attempt 2: no repairs.** Neither of Attempt 1's two locator repairs needed further changes — both
still pass unmodified against the rebuilt tree. Nothing else in `web/e2e/` needed touching this
attempt.

No assertion was deleted, skipped, or weakened.

**Cycle 3 (review cycle 3 Major 2, `[e2e-specs]`)**: three new tests, not repairs of existing ones —
review cycle 3's Critical 1 and Major 1 were both real product defects with zero coverage before
this attempt, so there was no locator to repair.

| # | Test | Gap the review named | Addition | Proof it's load-bearing |
|---|------|-----------------------|----------|--------------------------|
| 5 | the pop-out reader bounds itself to the viewport… (REQ-8/14/27) | no spec measured `/doc.html`'s own layout at all | `scrollHeight`/`clientHeight` on `article.md` and `documentElement`, `.docbar` `boundingBox().y` stability, `aria-current` moving off the outline's first entry after scrolling `article.md` | reverted style.css/reader.ts to pre-754c507, rebuilt: `expect(scrollHeight).toBeGreaterThan(clientHeight)` received `2511` (not `>2511`) |
| 6 | keyboard-activating the plan slot, a tree file and an outline entry… (REQ-4/9/12/13/14) | no reader spec used focus + keys anywhere; E8/E17/E18 all `.click()` | real `focus()` + `Enter` on all three control kinds, element-handle identity check across a tick, a routed `docChanged` and a `sessionUpsert` | same revert: `expect(treeEntry).toBeFocused()` received `"inactive"` |
| 7 | expanding a tree folder rebuilds the section structurally… (REQ-10/12) | the fix's own stable-key focus-restore path (for a genuinely structural rebuild, distinct from the attribute-only case above) had no coverage at all | element-handle capture before expansion; old node confirmed detached and not `document.activeElement`; new same-name button confirmed focused | same revert: `expect(newFolder).toBeFocused()` received `"inactive"` |

All three reverts were done together (one revert of both files, one rebuild, one targeted run of all
three new tests), restored, and re-verified: `reader.spec.ts` 37/37, `make e2e` 339/339.

No assertion was deleted, skipped, or weakened.

**Cycle 4 (review cycle 4 Major 2, `[e2e-specs]`)**: one new test, not a repair of an existing one —
the arrow pair had zero focus coverage before this attempt (E18 only `.click()`s it), so there was no
locator to repair.

| # | Test | Gap the review named | Addition | Proof it's load-bearing |
|---|------|-----------------------|----------|--------------------------|
| 8 | keyboard-activating the nav arrow keeps focus on its counterpart… (REQ-4/8/14/27) | the arrow pair is the fourth control kind and the only one whose activation hides the activated element; no spec drove it with focus + `Enter` | real `focus()` + `Enter` on both arrows, both directions, element-handle identity check on the counterpart (captured via a `hidden`-tolerant attribute locator before the toggle), repeated on the Focus host and the pop-out | reverted `prepareNavArrowFocusRestore` to a no-op in `web/src/render/reader.ts`, rebuilt: `expect(navArrowShow(region)).toBeFocused()` received `"inactive"` (`document.activeElement` was `BODY`) |

Reverted, rebuilt, ran the new test alone (red on the focus check as above), restored from git
(`git diff --stat -- web/src/render/reader.ts` empty), rebuilt again, and re-verified:
`reader.spec.ts` 38/38, `make e2e` 340/340.

No assertion was deleted, skipped, or weakened.

**Cycle 5 (review cycle 5 Major 1, `[e2e-specs]`)**: one new test, not a repair of an existing one —
no pop-out test had ever touched `readerStatusLine` before this attempt, so there was no locator to
repair.

| # | Test | Gap the review named | Addition | Proof it's load-bearing |
|---|------|-----------------------|----------|--------------------------|
| 9 | the pop-out's own status line is hidden while healthy… (E30, REQ-8/27/28) | E24 (daemon-down)/E25 (file-gone)/E26 (too_large) all assert `readerStatusLine` on the dashboard only; the pop-out was untested on this axis, which is why Critical 1 survived four cycles | healthy hidden/empty check, then E25's file-gone sequence, then E24's daemon-kill sequence, all three read off the SAME `/doc.html` page's own status line | reverted `web/src/doc.ts` + `web/src/features/connection.ts` to pre-4e2c291 (`git show 4e2c291^:<path> > <path>`, not stash), rebuilt: `expect(popStatus).toBeHidden()` failed immediately — element `visible`, text `"musterd unreachable — showing last render"` |

Restored both files with `git checkout -- web/src/doc.ts web/src/features/connection.ts` (confirmed
byte-identical via `git diff --stat`), rebuilt again, and re-verified: `reader.spec.ts` E30 alone
green, `npx playwright test --list` 341 tests clean, `make e2e` 341/341.

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs

**One bug open as of Fix Attempt 1** (row 2 below). Row 1 (from Attempt 1) is resolved as of commit
ac4137e (`web/src/features/reader.ts`'s new `maybeAutoOpenPlan`, called from `render()`); re-run at
Attempt 2, `leaving plan mode fires a scan that fills the plan slot (REQ-16, edge case 4)` passes,
alone and in the full-suite sweep. Kept for history.

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| A plan that becomes known after the reader is already mounted with nothing open never auto-opens | `[web-impl]` | plan.md User Flow 4 (line 341-343): "…leaves plan mode → scan on `ExitPlanMode` … → `sessionUpsert` with `plan` → the slot fills; **if nothing is open the plan opens**" | The plan file opens automatically (`openFile(plan.path)`), making `openPath === planPath` true so the docbar badge (`barPlanBadge`) appears | `web/src/features/reader.ts`'s only auto-open call is `decideInitialOpen` (line 176), invoked once from `loadListing` at mount; `render()` (line 323) never re-checks "is anything open" against a newly-arrived `session.plan`, so nothing opens and the badge never appears — daemon side confirmed correct: `GET /api/state` shows `plan:{path,exists:true}` persisted, and a WS frame dump shows the matching `sessionUpsert` arrives at the browser in real time (see Repairs) | ~~`leaving plan mode fires a scan that fills the plan slot (REQ-16, edge case 4)` (`web/e2e/reader.spec.ts:1031`)~~ — now passing (Attempt 2) |
| `.path` never reappears in the docbar after a compact→uncompact transition, once the freshness cue (`.chg`) has ever been absent | `[web-impl]` | REQ-15 ("In a tile the reader renders compact" — a property of the host, reversible both ways) and review cycle 1 Major 1's own fix intent/measurement ("The reverse direction leaves … no path in the full Focus pane", which Fix Attempt 1's repro measured only Focus→Tiles, never the round trip back) | Opening `docs` in Focus with a file open, switching to Tiles (compact) and back to Focus restores `.path` (`pathVisible` is `!compact`, now correctly `true` again after the fix) | `render/reader.ts`'s `setPresence(refs.path, refs.chg, vm.pathVisible)` reinserts `.path` via `refs.chg.parentElement?.insertBefore(...)` — but `.chg` is itself removed from the DOM via `setPresence(refs.chg, refs.popOut, freshness !== null)` whenever no write has been seen yet (REQ-24's default state, true for the overwhelming majority of sessions). Once `.chg` is disconnected, `.path`'s insertion anchor has no parent, so the optional-chained `insertBefore` silently no-ops forever — `.path` never comes back, regardless of how many further renders occur. `.chg`'s own anchor (`refs.popOut`) doesn't have this problem, because `popOut` toggles via `.hidden`, not `setPresence`; fix by giving `.path` a stable (never-detached) anchor, e.g. `refs.fname` or a dedicated marker node, instead of `.chg` | `compact follows the current host across a Focus/Tiles switch, not the mount moment (review cycle 1 Major 1, REQ-15)` (`web/e2e/reader.spec.ts:1003`) |

## Test Run Output

```
$ sh web/scripts/e2e-lint.sh
e2e-lint: clean

$ npx tsc --noEmit -p web/tsconfig.json
(clean, exit 0)

$ npx biome check web/e2e/reader.spec.ts web/e2e/helpers/reader.ts web/e2e/helpers/payloads.ts web/e2e/helpers/shell.ts
Checked 4 files in 30ms. No fixes applied.

$ npx playwright test --list   # from web/
Total: 334 tests in 30 files   (32 of them web/e2e/reader.spec.ts; no duplicate titles, no load errors)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py --all   # from repo root
dead-refs: 2498 references checked, 0 missing
```

### Validate Attempt 1

```
$ make web-build build   # from repo root
tsc --noEmit && vite build   → clean, exit 0
go build … -o bin/musterd   → clean, exit 0

$ npx playwright test e2e/reader.spec.ts --reporter=list   # from web/, before repairs
31 passed, 1 failed (matches web-impl's own head-start report: E2/INV-6 and E18 failing on my
locators, REQ-16/edge-case-4 failing for real)

$ npx playwright test e2e/reader.spec.ts --reporter=list   # after repairing E2/INV-6 and E18
31 passed
1 failed — reader.spec.ts:1031 "leaving plan mode fires a scan that fills the plan slot (REQ-16, edge case 4)"
  Error: expect(locator).toBeVisible() failed
  Locator: locator('[aria-label="Reader: reader-req16"]').locator('.docbar').locator('.badge')
  Timeout: 15000ms — element(s) not found

$ npx playwright test --list   # from web/, re-verify collection after edits
Total: 334 tests in 30 files

$ make e2e   # from repo root, full-suite sweep
333 passed
1 failed — the same reader.spec.ts:1031 test, no other spec regressed

$ sh web/scripts/e2e-lint.sh && npx biome check e2e/reader.spec.ts e2e/helpers/reader.ts
e2e-lint: clean
Checked 2 files in 45ms. No fixes applied.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py --all   # from repo root
dead-refs: 2530 references checked, 0 missing

$ git diff --stat -- web/e2e/reader.spec.ts web/e2e/helpers/reader.ts
 web/e2e/helpers/reader.ts | 2 +-
 web/e2e/reader.spec.ts    | 5 ++++-
 2 files changed, 5 insertions(+), 2 deletions(-)
```

### Validate Attempt 2

```
$ make web-build build   # from repo root, against web-impl-fix1's commit ac4137e
tsc --noEmit && vite build   → clean, exit 0
go build … -o bin/musterd   → clean, exit 0

$ npx playwright test e2e/reader.spec.ts --reporter=list   # from web/
32 passed (11.0s)   — including "leaving plan mode fires a scan that fills the plan slot
(REQ-16, edge case 4)", previously red

$ npx playwright test --list   # from web/, re-verify collection
Total: 334 tests in 30 files

$ make e2e   # from repo root, full-suite sweep, run twice
334 passed (1.8m)
334 passed (1.7m)

$ sh web/scripts/e2e-lint.sh
e2e-lint: clean

$ npx tsc --noEmit -p web/tsconfig.json
(clean, exit 0)

$ npx biome check e2e/reader.spec.ts e2e/helpers/reader.ts e2e/helpers/payloads.ts e2e/helpers/shell.ts
Checked 4 files in 45ms. No fixes applied.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py --all   # from repo root
dead-refs: 2530 references checked, 0 missing

$ git status --short -- web/e2e/
(empty — no spec changes this attempt)
```

### Fix Attempt 1

```
$ make web-build build   # from repo root, against web-impl-fix1's Fix Attempt 1
tsc --noEmit && vite build   → clean, exit 0
go build … -o bin/musterd   → clean, exit 0

$ npx playwright test --list   # from web/, before edits (sanity)
Total: 334 tests in 30 files

$ npx playwright test e2e/reader.spec.ts --reporter=list   # from web/, after the Major 4 regex fix
  + the two new tests
33 passed
1 failed — reader.spec.ts:1003 "compact follows the current host across a Focus/Tiles switch,
  not the mount moment (review cycle 1 Major 1, REQ-15)"
  Error: expect(locator).toBeVisible() failed
  Locator: locator('[aria-label="Reader: reader-live-compact"]').locator('.docbar').locator('.path')
  Timeout: 15000ms — element(s) not found

$ npx playwright test --list   # from web/, re-verify collection after edits
Total: 336 tests in 30 files   (34 of them web/e2e/reader.spec.ts; no duplicate titles, no load errors)

$ git diff --stat -- web/e2e/
 web/e2e/reader.spec.ts | 114 ++++++++++++++++++++++++++++++++++++++++++++++++-
 1 file changed, 113 insertions(+), 1 deletion(-)
```

### Fix Attempt 2

```
$ make web-build build   # from repo root, against web-impl-fix1's commit 7d69d8e (cycle 2 fix)
tsc --noEmit && vite build   → clean, exit 0
go build … -o bin/musterd   → clean, exit 0

$ npx playwright test --list   # from web/, before edits (sanity)
Total: 336 tests in 30 files

  [after adding buildLargeMarkdownFixtureTree/navTreeSection/navOutlineSection to
   helpers/reader.ts and editing the two review-cycle-1 tests in reader.spec.ts]

$ npx playwright test --list   # re-verify collection after edits
Total: 336 tests in 30 files   (no new files, no duplicate titles, no load errors)

$ npm run e2e -- e2e/reader.spec.ts   # from web/, rebuilt binary
e2e-lint: clean
34 passed (11.5s)

$ make e2e   # from repo root, full suite sweep
336 passed (1.7m)

  # Deliberate-breakage proof (both files reverted to pre-7d69d8e content, rebuilt, targeted run):
$ npx playwright test e2e/reader.spec.ts -g "compact follows the current host|the reader nav sits beside the body"
  ✘ the reader nav sits beside the body …
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: "auto"
    Received: "hidden"
      at reader.spec.ts:997 — expect(await treeSection.evaluate(...)).toBe("auto")
  ✘ compact follows the current host …
    Error: expect(locator).toHaveCount(expected) failed
    Locator: …locator('.docbar').locator('.path ~ .chg')
    Expected: 1
    Received: 0
      at reader.spec.ts:1130
  2 failed

  # Files restored from saved copies, confirmed byte-identical to the fixed tree, rebuilt, reran:
$ git diff --stat -- web/src/style.css web/src/render/reader.ts
(empty)
$ npm run e2e -- e2e/reader.spec.ts
34 passed
$ make e2e
336 passed

$ git diff --stat -- web/e2e/
 web/e2e/helpers/reader.ts | 62 +++++++++++++++++++++++++++++----
 web/e2e/reader.spec.ts    | 89 +++++++++++++++++++++++++++++++++++++++++++++--
 2 files changed, 141 insertions(+), 10 deletions(-)
```

### Fix Attempt 3

```
$ make web-build build   # from repo root, against web-impl-cycle3's commit 754c507 (cycle 3 fix)
tsc --noEmit && vite build   → clean, exit 0
go build … -o bin/musterd   → clean, exit 0

$ npx playwright test --list   # from web/, before edits (sanity)
Total: 336 tests in 30 files

  [after adding the three new tests to reader.spec.ts and `exact: true` to outlineEntry in
   helpers/reader.ts]

$ npx playwright test --list   # re-verify collection after edits
Total: 339 tests in 30 files   (3 new, no duplicates, no load errors)

$ npm run e2e -- e2e/reader.spec.ts   # from web/, rebuilt binary
e2e-lint: clean
37 passed (15.6s)

$ make web-lint
e2e/reader.spec.ts format — 1 formatter disagreement in the new pop-out test
Found 1 error.
$ make web-fmt   # fixed
Checked 148 files in 222ms. Fixed 1 file.
$ make web-lint
Checked 148 files in 143ms. No fixes applied.   (clean)

$ npx playwright test --list   # re-verify collection after web-fmt
Total: 339 tests in 30 files

$ make e2e   # from repo root, full suite sweep
339 passed (1.7m)

  # Deliberate-breakage proof (both files reverted to pre-754c507 content, rebuilt, targeted run
  # of just the three new tests):
$ npx playwright test e2e/reader.spec.ts -g "the pop-out reader bounds itself|keyboard-activating the plan slot|expanding a tree folder rebuilds"
  ✘ the pop-out reader bounds itself to the viewport …
    Error: expect(received).toBeGreaterThan(expected)
    Expected: > 2511
    Received:   2511
      at reader.spec.ts:1343 — expect(bodyOverflow.scrollHeight).toBeGreaterThan(bodyOverflow.clientHeight)
  ✘ keyboard-activating the plan slot, a tree file and an outline entry …
    Error: expect(locator).toBeFocused() failed
    Locator: …locator('.tree').getByRole('button', { name: 'TODO.md', exact: true })
    Received: "inactive"
      at reader.spec.ts:1443
  ✘ expanding a tree folder rebuilds the section structurally …
    Error: expect(locator).toBeFocused() failed
    Locator: …locator('.tree').getByRole('button', { name: 'docs/', exact: true })
    Received: "inactive"
      at reader.spec.ts:1522
  3 failed

  # Files restored from saved copies, confirmed byte-identical to the fixed tree, rebuilt, reran:
$ git diff --stat -- web/src/style.css web/src/render/reader.ts
(empty)
$ npm run e2e -- e2e/reader.spec.ts
37 passed (15.9s)
$ make e2e
339 passed (1.7m)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
dead-refs: 2550 references checked, 0 missing

$ git diff --stat -- web/e2e/
 web/e2e/helpers/reader.ts |   7 +-
 web/e2e/reader.spec.ts    | 215 ++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 221 insertions(+), 1 deletion(-)
```

### Fix Attempt 4 (review cycle 4)

```
$ make web-build build   # from repo root
tsc --noEmit && vite build   → clean, exit 0
go build … -o bin/musterd   → clean, exit 0

$ npx playwright test --list   # from web/
Total: 340 tests in 30 files   (no duplicate titles, no load errors)

$ npx playwright test reader.spec.ts -g "review cycle 4 Major 2"   # new test alone, first run
1 passed (5.4s)

# Deliberate breakage: prepareNavArrowFocusRestore in web/src/render/reader.ts reduced to
# `void refs; void navCollapsed; return () => {};`
$ make web-build build
(clean, exit 0)
$ npx playwright test reader.spec.ts -g "review cycle 4 Major 2"
✘ keyboard-activating the nav arrow keeps focus on its counterpart…
  Error: expect(locator).toBeFocused() failed
  Locator: …getByRole('button', { name: 'Show files' })
  Received: "inactive"
    at reader.spec.ts:1551
1 failed

# Restored from git, rebuilt, reran:
$ git diff --stat -- web/src/render/reader.ts
(empty)
$ make web-build build
(clean, exit 0)
$ npx playwright test reader.spec.ts -g "review cycle 4 Major 2"
1 passed (6.1s)

$ npx playwright test reader.spec.ts   # full file
38 passed (16.7s)

$ npx playwright test --list
Total: 340 tests in 30 files

$ make e2e
340 passed (1.7m)

$ make web-fmt
Checked 148 files in 220ms. Fixed 1 file.
$ make web-lint
Checked 148 files in 151ms. No fixes applied.

$ sh web/scripts/e2e-lint.sh
e2e-lint: clean

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 943 references checked, 0 missing

$ git status
 modified:   web/e2e/helpers/reader.ts
 modified:   web/e2e/reader.spec.ts
(plus pre-existing plans/markdown-viewing/orchestration-state.json and review.cycle3.md, not mine)
```

## Notes

- **Every test in this file is collection-only.** The plan's Fixture plan / Work Type
  ("full-stack", `E2E Scope: new-specs`) and every REQ/INV/E-criterion describe the new
  `docs` surface end to end — none is phrased "still"/"unaffected"/"does not", none pins an
  existing INV source state, and no control here is marked *Existing* in the Testable UI
  Elements table. There is therefore nothing in this file eligible to "run green at
  authoring" per the regression-pins rule; the authoring gate is collection alone, which is
  clean (see Test Run Output).
- **`rawPreToolUse` and the REQ-16 test are additions beyond the acceptance table's own
  E-numbering.** E3/E4/E5/E28/E29 all exercise the plan-scan trigger via `SessionStart`
  only; REQ-16 also names `PreToolUse`/`PostToolUse{ExitPlanMode}` and a write under the
  plans directory as triggers. The `ExitPlanMode` path had no assigned E-number but is a
  Must-Have requirement with no other E2E coverage, so one test was added for it. The
  "write under the plans directory" trigger is not separately covered by E2E (it collapses
  to the same `docChanged`/rescan path E9/E10 already exercise for an arbitrary `.md`); a
  reviewer who wants it distinguished can ask for it as a fix-cycle addition.
- **E27's two starting-density sessions instead of one changing density.** REQ-15 only says
  a session's nav starts collapsed at 3×2 and open at 2×2; the Implementation Notes describe
  the collapsed state as passed in "by the host from `app.state.density`" at mount time, not
  as a live-updating property of an already-mounted `ReaderInstance`. Testing one session
  across a live 3×2→2×2 density change would assert an unspecified remount behaviour, so the
  test instead opens two fresh sessions' docs surfaces, one at each density, and checks each
  one's own starting state — a narrower, honest claim.
- **No `[web-impl]`/`[daemon-impl]` bugs to report** — nothing has been implemented yet.
- **`getReaderListing`, `fileCount`, `bodyPlaceholder` exported but unused by this spec** —
  built per the plan's Affected Files list / Testable UI Elements table for validate-mode
  and any follow-on test; not forced into a test just to use them.
- Handoff for daemon-impl/web-impl: the plan's Testable UI Elements table is the locator
  contract this spec already assumes verbatim (roles, exact accessible names, `aria-hidden`
  caret/count/dot). If the real markup can't carry a role/name this table pins (the
  `<details><summary>` lesson, `kb:lesson/authored-tests-never-run-before-validate`), that
  surfaces at E2E-validate as my defect to repair, not yours to guess around now.

### Fix Attempt 1 notes

- Handoff for web-impl: the `.path`-anchor bug (E2E Implementation Bugs row 2) only stays dodged for
  a session that has already seen a routed write for its open file *before* its first compact
  round trip — `.chg`'s own presence is gated the same way (`setPresence` on `freshness !== null`),
  so it only stays connected once a write has actually landed. REQ-24's default (no write yet) is
  the common path, so this is not a narrow edge case. The nav-placement test (Critical 1) needed no
  repair and required no density click: the reader mounted in Focus, so `navCollapsedDefault` is
  `false` regardless of the tile's density (mount-time-only per the review's own note), keeping the
  nav open in both hosts without extra setup.
- I did not touch `web/src/render/reader.ts` or any other file under `web/src/` — routed the bug
  above instead, per the e2e-specs boundary (`web/e2e/**` only).

### Validate Attempt 1 notes

- web-impl's head-start report (in `plans/markdown-viewing/web-implementation.md`'s Handoff)
  was confirmed accurate on all three counts by measurement, not assumption: two were my own
  spec defects (repaired, see Repairs table) and the third is a real implementation gap
  (routed `[web-impl]`, see E2E Implementation Bugs), not daemon-side as its own writeup
  guessed — it could not root-cause further "without reading daemon-owned files"; I could and
  did (`internal/server/reader.go`, `internal/session/manager.go`), plus a live WS-frame dump,
  which is what showed the daemon broadcasts the correct `sessionUpsert` and the client simply
  never opens the file to make the badge appear.
- Debug instrumentation used to root-cause the third bug (a temporary `getState`/`findSession`
  call and a `page.on("websocket", …)` frame dump) was added, run, and fully reverted before
  this commit — `git diff --stat -- web/e2e/` shows only the two repaired locators, nothing
  else.
- `plan.md` User Flow 4's "if nothing is open the plan opens" clause is the load-bearing plan
  reference for this bug; it sits under "User Flows", not under REQ-16 itself, so a reader
  matching only requirement numbers to the E2E Implementation Bugs table could miss it — flagging
  here for review-work.

### Fix Attempt 4 notes

- No implementation bug found this cycle — `prepareNavArrowFocusRestore` (web-impl's Fix Attempt 5)
  behaves exactly as the plan and the review's ask require, on both hosts, both directions.
- **The negative ("toggled from something other than the arrow") was not given its own test.**
  I grepped every reference to `toggleNav`/`navCollapsed` in `web/src/` and confirmed `navCollapsed`
  changes at runtime only through the two arrows' own `onToggleNav` click handler (the compact-3×2
  mount default is a one-time initial value, not a live toggle from another control). Inventing a
  non-arrow nav-toggle path that doesn't exist in the product would not be an honest test
  (`.claude/agents/e2e-specs.md`'s "never invent a wire shape" principle applied to DOM behaviour,
  not just wire shape). The nearest real guarantee — an unrelated re-render (`docChanged`,
  `sessionUpsert`) never steals focus from a non-arrow control onto an arrow — is already pinned by
  the cycle-3 focus-survival test (`keyboard-activating the plan slot, a tree file and an outline
  entry…`), which asserts focus stays on the tree file across both event types; if it had moved onto
  either arrow, that test would already be red. This satisfies the review's ask in substance without
  a redundant new test.
- Two new helper locators (`navArrowOpenNode`/`navArrowCollapsedNode` in `web/e2e/helpers/reader.ts`)
  were needed because the existing `getByRole`-based `navArrowHide`/`navArrowShow` cannot resolve a
  `hidden` element — an element-handle for the counterpart arrow has to be captured *before* the
  toggle that unhides it, and `getByRole` would find zero matches at that point. This is not a defect
  in the existing locators (they are exactly right for asserting the *visible* arrow's own focused
  state); it's a second, narrower locator for a different purpose (identity capture regardless of
  visibility).
- `make web-fmt`'s "Fixed 1 file" this run touched neither of my two files (confirmed by
  `git status`/`git diff --stat` immediately after); left uninvestigated as out of scope for this
  fix wave (`web/e2e/**` only).

### Fix Attempt 5 notes

- Not re-raised: the review's three `[note]` items (disabled-segment-button TODO follow-up,
  `onSessionRemoved`/`onProtocolMismatch` deliberately unwired on the pop-out, the tile-host
  arrow-focus/3×2-layout repetitions) — the review itself says none of these ask for a change.
- Placed the new test (E30) directly after E26 rather than at the end of the file — it belongs
  with the other status-line states (E23 directory_missing, E24 daemon-down, E25 file-gone, E26
  too_large) rather than after E27-E29, which are unrelated (density/restart/`/clear` plan-slot
  cases).
- Did not add a fourth, separate test for "healthy" alone — folding all three states into one
  ordered sequence on a single pop-out page is both the cheaper harness cost (one `launchSession`,
  one popup) and, per the team lead's brief, the only way the daemon-kill assertion has any
  earlier assertions to be conditioned on for the load-bearing proof.
