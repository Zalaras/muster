# E2E Test Specs: claude-tmp-files

**Plan**: claude-tmp-files
**Mode**: validate (attempt 1)
**Pack**: kb: pack 25446 words (budget 30000)
**Verdict**: pass
**Tests created**: 17 new (`web/e2e/reader-scratch.spec.ts`), 4 existing `web/e2e/reader.spec.ts` tests edited for the approved delta
**Live run**: 17/17 reader-scratch.spec.ts and 33/33 reader.spec.ts passing; soaks 170/170 and 340/340 (N=10). Authoring collection: `npx playwright test --list`: Total: 691 tests in 62 files, no error; `sh scripts/e2e-lint.sh`: clean (biome included)

## Tests

Every row is `collection-only`. No test in the new file is a regression pin: each one asserts a claude-section element, the `scratchpadDir` key or the `scratch` block, none of which exist in the current tree. The first failing assertion today is named per row. The four edited `reader.spec.ts` tests now unfold the claude section first, so they also fail today at `claudeSummary(...)` and are collection-only. The remaining tests in that file are untouched and were not re-run.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/reader-scratch.spec.ts | a SessionStart naming a well-formed scratchpad folder shows 1 tmp on a folded claude row, and unfolding then clicking the row opens the file with a tmp badge (E1…) | E1, REQ-1/3/4/7/8/9/10, INV-1/3 | `SessionStart` with a measured-shape `scratchpad_dir` → state `scratchpadDir` equals it, listing `scratch.files`, folded summary row (`aria-expanded=false`, `no plan` + `1 tmp` chips, no rows in DOM), unfold shows `no plan yet` + `tmp` row with absolute path in `title`, click opens file, docbar badge `tmp`, abs path, `aria-current` | collection-only (fails first at `scratchpadDir` oracle) |
| web/e2e/reader-scratch.spec.ts | a routed Write hook naming a new .md in the scratchpad moves the chip from 1 tmp to 2 tmp with one silent listing re-fetch… (E2…) | E2, REQ-6/9/11 | Write hook → `2 tmp`, new row first (explicit older mtime on the first file), age `now`, exactly 1 listing GET and 0 file GETs, open file untouched | collection-only (fails first at `2 tmp`) |
| web/e2e/reader-scratch.spec.ts | a routed Write hook naming a non-markdown file in the scratchpad adds no row and causes no re-fetch… (D7…) | D7, edge 11 | `.json` Write then `.md` Write: only the `.md` counts; 1 listing GET total | collection-only |
| web/e2e/reader-scratch.spec.ts | a /clear pair naming a new empty scratchpad drops the tmp chip while the open scratch file stays open, and a straggler… (E3…) | E3, REQ-2/11, D2, D3, INV-1/2 | SessionEnd{clear}+SessionStart{clear} → dir moves, chip gone, open file stays, 1 re-fetch, old file now 404; enveloped straggler from the left id leaves the dir | collection-only |
| web/e2e/reader-scratch.spec.ts | a /clear pair reordered, with the SessionStart applied before the late SessionEnd… (D3…) | D3, edge 4 | late `SessionEnd` naming the old folder does not move it back | collection-only |
| web/e2e/reader-scratch.spec.ts | ending a session keeps its claude section with the plan and scratch rows openable while a second live session's scratchpad is untouched (E4…) | E4, REQ-12, D4 | two sessions; End one → section, `plan`/`1 tmp` chips, plan row and scratch row open (`plan`/`tmp` badges); other session's dir, listing and UI unaffected | collection-only |
| web/e2e/reader-scratch.spec.ts | after a daemon restart an ended session keeps its scratchpad folder… (D4…) | D4, REQ-2, REQ-12, edge 7 | End, `daemon.restart()`, reload → `scratchpadDir`, listing, `1 tmp`, file opens | collection-only |
| web/e2e/reader-scratch.spec.ts | the file route serves a session's own scratch .md and answers 404 not_found for … (D6…) | D6, REQ-5, INV-2, edges 9-12 | 200 for own (incl. nested); 404 `not_found` for `.json`, `tasks/` sibling, `..` path, escaping symlink, other session's file (both directions), with both sessions live | collection-only |
| web/e2e/reader-scratch.spec.ts | a malformed, relative, wrong-parent or null scratchpad_dir leaves the scratchpad unset… (D1…) | D1, REQ-1, INV-1 | seven malformed variants each followed by an applied-marker: state stays null, `scratch` null, no tmp chip; then a well-formed one sets it | collection-only |
| web/e2e/reader-scratch.spec.ts | a null scratchpad_dir arriving after a well-formed one never clears the folder or the chip (REQ-2…) | REQ-2 | `-p`-style null after set changes nothing | collection-only |
| web/e2e/reader-scratch.spec.ts | with a plan and scratch files the folded row carries the plan and 3 tmp chips and unfolding lists … (REQ-4…) | REQ-4/7/9/10/13, D5, INV-3 | chips vs rows; listing order and exact mtimes (fixed dates); DOM order `plan`, then newest first; `.MD`/nested included; hidden, `.json`, `tasks/` excluded; plan age; docbar badge absent for a dir file, `tmp` for scratch, `plan` for plan; `aria-current` exclusive | collection-only |
| web/e2e/reader-scratch.spec.ts | the unfolded claude section is toggled by Enter and Space, and the summary row and a scratch row keep focus on the same node… (focus identity…) | REQ-8, REQ-10 | focus + Enter / Space on summary and Enter on row; `activeElement` and node identity survive a >1 s tick and an unrelated session update | collection-only |
| web/e2e/reader-scratch.spec.ts | a focused scratch row keeps focus on the same node when a new scratch file makes the listing re-fetch (focus identity, REQ-11) | REQ-11 | node identity across the silent listing re-fetch that inserts a row | collection-only |
| web/e2e/reader-scratch.spec.ts | the fold is remembered per session across a page reload, and another session still starts folded (REQ-8, W1) | REQ-8, W1 | per-session fold memory across `page.reload()`; default folded | collection-only |
| web/e2e/reader-scratch.spec.ts | a plan named after the reader opened flips the plan chip from no plan to plan with no listing re-fetch (REQ-7, edge case 15) | REQ-7, edge 15 | rebind to a transcript naming a plan: chip flips, 0 listing GETs | collection-only |
| web/e2e/reader-scratch.spec.ts | in Tiles, the docs reader of a tile shows the claude summary row and unfolding then clicking a scratch row opens the file in that tile (…host view) | REQ-7/8/10 | Tiles host input round-trip | collection-only |
| web/e2e/reader-scratch.spec.ts | the pop-out of an open scratch file shows the claude section with its row current, and a scratch write re-fetches the listing there too (…host view) | REQ-9/10/11 | pop-out host: chip, current row, live re-fetch | collection-only |
| web/e2e/reader.spec.ts | after a /clear pair naming a planless transcript, the plan slot still shows the pre-clear plan and its badge (plan frontmatter E1…) | REQ-8 (existing), REQ-12 delta | edited: unfold the claude section first so `noPlanText` absence is checked on an open section | collection-only |
| web/e2e/reader.spec.ts | after a /clear pair naming a planless transcript, a straggler Write hook … (plan frontmatter E2…) | existing, delta | edited: same unfold | collection-only |
| web/e2e/reader.spec.ts | leaving plan mode fires a scan that fills the plan slot (REQ-16, edge case 4) | existing, delta | edited: unfold before `no plan yet` | collection-only |
| web/e2e/reader.spec.ts | keyboard-activating the plan slot, a tree file and an outline entry keeps focus … (review cycle 3 Major 1/2) | existing, delta (plan "Existing tests this breaks": `reader.spec.ts:970`) | edited: unfold the section (real click) before focusing the plan row | collection-only |

## Deleted Tests

None.

## Fixture Changes

- New `web/e2e/helpers/reader-scratch.ts` (additive; imports `./reader`, `./payloads`, `./session`):
  - `makeScratchpad(claudeSessionId)` lays the folder out in the measured shape `<tmp>/claude-501/-e2e-encoded-cwd/<session_id>/scratchpad` (kb:fact/scratchpad-dir-per-session-id), rooted in the resolved temp dir; explicit mtimes via `utimes`.
  - `withScratchpad(hook, dir | null)` sets `scratchpad_dir` on the existing `payloads.ts` builders (inside the envelope when enveloped). The key is measured on every hook of an interactive session and as `null` on `-p` hooks (fact record). `SessionEnd`, `PostToolUse`, `UserPromptSubmit` carrying it rests on the fact's "every hook".
  - `envelopeHook`, `postHook`, `launchWithScratchpad`, `awaitHooksApplied` (a `UserPromptSubmit` marker polled into `lastPrompt`, so "nothing changed" assertions follow a processed event), `getScratchpadDir` and `getScratchListing` (return `undefined` for an absent key, so a missing required key never passes as `null`), the claude-section locators and idempotent `unfoldClaudeSection`.
- I did not touch `payloads.ts`, `reader.ts` or the render helper (the plan names them as web-impl's for the caller-chosen-`scratchpad_dir` payload and new locators); the wrappers above stand alone, so web-impl's additions cannot collide.
- No change to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | well-formed SessionStart (E1); malformed/null variants (D1) |
| REQ-2 | /clear + straggler (E3); reordered /clear; null after set; restart |
| REQ-3 | E1 (`scratchpadDir` on the Session object); /clear (change broadcast shown by the chip moving) |
| REQ-4 | E1 listing; plan + 3 files listing (order, mtimes, exclusions) |
| REQ-5 | file route journey (D6) |
| REQ-6 | Write hook E2; non-markdown Write |
| REQ-7 | E1; plan + 3 files; plan-chip flip; Tiles |
| REQ-8 | E1; focus/Enter/Space; fold memory across reload; Tiles |
| REQ-9 | plan + 3 files (order, `tmp` badge, `now`); E2; pop-out |
| REQ-10 | E1; plan + 3 files (badges, `aria-current`); focus identity; Tiles; pop-out |
| REQ-11 | E2 (one silent re-fetch); non-markdown Write; /clear; focus-after-refetch; pop-out |
| REQ-12 | E4; restart |
| REQ-13 | plan + 3 files (plan row age `now`) |
| E1-E4 | the four named tests |
| INV-1 | E1, E3, reordered /clear, malformed |
| INV-2 | D6 route journey; E3 (old file 404 after the move) |
| INV-3 | E1, plan + 3 files |

W1-W4 and R1-R7 belong to the web-tests and render-tests agents. The ages' bucket text (`2m`, `1h`, `2d`), the teal badge and 3x2 ellipsis are render properties and are not asserted here.

## Handoff

- **Not covered at E2E, deliberately**: a resume `SessionStart` moving the folder back (edge case 6, D2): a same-id resume of a left id is a rebind whose acceptance the monotonic-rebind ADR governs, and the realistic path needs the launch dialog's Resume flow. D2/D3 daemon unit tests own it. The status line carrying `scratchpad_dir` (never a source, per the ADR) is likewise left to Go tests; the fact measured the key on the status line but this plan sends none from E2E.
- **Unmeasured**: none needed an `/interface-probe`. Every field shape added traces to kb:fact/scratchpad-dir-per-session-id. A subagent hook's `scratchpad_dir` is unmeasured and no test sends one.
- **Locator assumptions web-impl must meet** (all from the plan's Testable UI Elements unless marked): summary row `button` `aria-label="Claude"` with `aria-expanded`; chip text exactly `plan` / `no plan` / `<n> tmp` inside it; scratch row is a `button` whose accessible name contains the relative path and whose `title` is the absolute path (the table says `title` = absolute path); plan row stays `.f.plan` and the `no plan yet` text stays `.f.none` (existing locators, only in the DOM while unfolded); docbar badge stays `.docbar .badge` reading `tmp` (assumed: the table pins its text only); row age text contains `now` for a just-written file; changed dot stays `.dot`.
- **Behaviour asserted beyond the table (from the plan prose)**: a scratch write for a path the listing lacks causes exactly one listing GET and no file GET (REQ-11, edge case 13); a plan appearing via `sessionUpsert` causes no listing GET (edge case 15); the focused scratch row node survives a listing re-fetch that inserts a row. If web-impl disagrees on the last one it is a plan question, not a locator repair.
- **Plan note**: the plan's "Existing tests this breaks" lists only `reader.spec.ts:970`; three more tests asserted the plan row's absence or text (`noPlanText`) and would have passed vacuously on the folded section, so they now unfold first (edits above, strengthening only).
- No changes needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Test Run Output

```
$ npx playwright test --list
Total: 691 tests in 62 files
$ npx playwright test --list e2e/reader-scratch.spec.ts
Total: 17 tests in 1 file
$ sh scripts/e2e-lint.sh
e2e-lint: clean
$ npx tsc --noEmit -p .   (no output)
```

## Notes

- Fixture plan: all 17 tests use the test-scoped `daemon` fixture, per the plan header.
- Ordering and mtimes use fixed dates (`utimes`); the only wall-clock-relative text asserted is the age `now` of a just-written file.
- Absence assertions (`toHaveCount(0)` on chips and rows, "stays null" checks) each follow a positive assertion or an `awaitHooksApplied` marker, so none is true by construction before the feature exists.


## Validate Attempt 1

Rebuilt (`make web-build build`), ran both files: 50 passed, 1 failed.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | after a daemon restart an ended session keeps its scratchpad folder and its claude section still lists and opens the file (D4, REQ-2, REQ-12, edge case 7) | `getByRole('status')` strict-mode violation: matched `#connection-status` and the ended session's `<b role="status">session ended</b>` | locator too broad once an ended session is on screen | `page.locator("#connection-status")` | D4/REQ-12: still asserts the connection reads connected after restart before checking scratchpadDir, listing, chip and file open |

No assertion was deleted, skipped, or weakened.

### Results

- `npx playwright test --list`: Total: 691 tests in 62 files, no error.
- reader-scratch.spec.ts live: 17 passed; soak `make e2e-soak N=10`: 170 passed (1.6m).
- reader.spec.ts soak `N=10`: 340 passed (3.2m); the four delta-edited tests are among them.

### Handoff

None new.
