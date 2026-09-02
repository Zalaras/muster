# E2E Test Specs: new-ui-design-colors

**Plan**: new-ui-design-colors
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 17 (web/e2e/theme.spec.ts)
**Live run**: 191/191 passing (full suite, `make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/theme.spec.ts | clicking Settings opens a dialog named Settings with exactly four radios in Follow/Instrument/Dark/Light order (E2) | E2, REQ-9 | Dialog opens, legend text, radio count/order/accessible names |
| web/e2e/theme.spec.ts | a fresh daemon with no config file paints Instrument/unknown and checks Follow Claude Code (E3) | E3 | `data-theme=instrument`, `data-claude-family=unknown`, Follow radio checked |
| web/e2e/theme.spec.ts | choosing Dark sets html[data-theme=dark] without a reload and changes body's background from Instrument (E4) | E4, REQ-9 | Instant attribute + body repaint, server-side `prefs.theme` persisted |
| web/e2e/theme.spec.ts | after choosing Dark, a reload shows data-theme=dark on the very first paint via the head hint script (E5) | E5, REQ-11 | `data-theme` captured at `DOMContentLoaded` via `addInitScript`, before any WS round trip |
| web/e2e/theme.spec.ts | after choosing Dark, a daemon restart plus reload still shows dark with the Dark radio checked (E6) | E6, REQ-10 | Survives daemon restart + reload |
| web/e2e/theme.spec.ts | Focus: choosing Light re-themes the chrome and the live pane ground within one render, no reload (E7, INV-3 Focus) | E7, INV-3 | Body + `.terminal-surface` (Focus) re-ground instantly, cross-checked against resolved `--term` |
| web/e2e/theme.spec.ts | Tiles: choosing a theme re-themes both live tiles' grounds (E8, INV-3 Tiles multi-instance) | E8, INV-3 | Two simultaneously-live tiles both re-ground |
| web/e2e/theme.spec.ts | with a fast poll, flipping the Claude config from dark to light changes data-claude-family within 2s; data-theme stays fixed under an explicit pref, then switches under Follow (E9) | E9, INV-1, INV-2 | Both named branches: pinned pref unaffected by family; Follow re-resolves once family changes |
| web/e2e/theme.spec.ts | with pref pinned to Dark, flipping the Claude config to light changes only the pane ground, not data-theme (E10, INV-2) | E10, INV-2 | Pane ground changes, chrome theme frozen |
| web/e2e/theme.spec.ts | choosing Follow after Dark, with family light, resolves to light and persists follow across a reload (E11) | E11 | Immediate re-resolution + persisted `"follow"` pref survives reload |
| web/e2e/theme.spec.ts | killing the daemon leaves both theme attributes unchanged while the banner shows; restarting re-applies them (E12, INV-4) | E12, INV-4 | Both attributes frozen across an outage, restart re-applies |
| web/e2e/theme.spec.ts | masthead Resume is disabled and its computed style differs from the enabled End button, in each theme (E13) | E13 | color/border-color/cursor differences across all 3 themes |
| web/e2e/theme.spec.ts | badge colors for Needs-Input, Failed, Planning and Working cards match their theme's token, in every theme (E14) | E14 | Four states' badge `color` cross-checked against resolved `--amber`/`--rose`/`--violet`/`--teal`, across all 3 themes |
| web/e2e/theme.spec.ts | a scratch Claude config with malformed JSON yields data-claude-family=unknown with no error banner or console error (E15) | E15, edge case 4 | Torn/invalid JSON degrades silently |
| web/e2e/theme.spec.ts | theme resolution walks follow×dark -> dark×dark -> follow×light -> light×dark (INV-1) | INV-1 | The four named transition cells from the plan's own text, in sequence, including the "explicit name always wins over family" cell |
| web/e2e/theme.spec.ts | a radio clicked while the daemon is down does not persist; reconnect re-syncs the checked radio from the broadcast (INV-7) | INV-7, INV-4 | No optimistic local theme state; broadcast is the only source of the checked radio |
| web/e2e/theme.spec.ts | GET /api/state always carries prefs.theme and claudeTheme.family (REQ-10, REQ-15) | REQ-10, REQ-15 | Wire shape sanity on a fresh daemon |

## Fixture Changes

- `web/e2e/helpers/daemon.ts` (REQ-18, `Affected Files > E2E harness`): added `claudeThemePoll?` and `claudeConfigContent?` to `ScratchDaemonOptions`; added `readonly claudeConfigPath` (always inside the scratch `dataDir`); `-claude-config-file` is now passed **unconditionally** on every scratch daemon spawn (mirrors `-usage-token-file`'s INV-5 discipline); `-claude-theme-poll` is passed only when `claudeThemePoll` is supplied (mirrors `-usage-poll`); added `writeClaudeConfig(content)` for mid-test flips (E9/E10/INV-1's poller-flip fixtures).
- `web/e2e/helpers/theme.ts` (new): locators for the Settings button/dialog/legend/radios/Close (mirrors `helpers/issue.ts`'s structure), `htmlTheme`/`htmlClaudeFamily` attribute readers, `resolvedCssVar` (a throwaway-probe oracle that lets a test compare a real element's computed `color`/`background-color` against a CSS custom property's browser-normalized value without hand-converting hex to rgb()), `readThemeHintStorage`, and `claudeConfigJSON` (the scratch config-file fixture builder — see Notes below for its flagged limitation).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-9 | E2, E3, E4, E12, INV-7 test |
| REQ-10 | E6, E11, REQ-10/REQ-15 sanity test |
| REQ-11 | E5 |
| REQ-12 | E7, E8 |
| REQ-13/REQ-14 (poller mechanics observed via wire effects) | E9, E10, INV-1 test, E15 |
| REQ-15 | REQ-10/REQ-15 sanity test |
| INV-1 | E9 (both branches), dedicated INV-1 4-cell transition test |
| INV-2 | E9, E10, dedicated INV-1 test |
| INV-3 | E7 (Focus), E8 (Tiles, multi-instance) |
| INV-4 | E12, INV-7 test |
| INV-7 | dedicated INV-7 test |
| REQ-8 (disabled affordance, badge-adjacent) | E13, E14 |

E1 (`make e2e`) and every W* criterion are out of this file's scope per the plan's own Affected Files section (E1 is the suite itself; W* is Vitest's job).

## Notes

**Unmeasured wire shape — flagged per authoring-mode rules, not guessed silently.** REQ-13
deliberately confines the real Claude Code global config file's name and its JSON key text
to `internal/claudecode/theme.go` — the plan's own D4 scope note says the plan mentions the
file "by name in prose only, never inside a Go snippet," and no capture in `spikes/`
exercises this file (grepped `canary-fields.md`/`FINDINGS.md` for "theme": no hits). There is
therefore nothing measured to transcribe for the scratch config-file fixture content. I
centralized this into one function, `claudeConfigJSON(theme?)` in `web/e2e/helpers/theme.ts`,
using `"theme"` as the JSON key (a best-effort placeholder — REQ-13 names the Go field
`Theme`, and the sibling `prefs.theme` PUT field uses the same word) with the limitation
documented prominently in its JSDoc. **This needs an `/interface-probe` or, more simply, a
one-line check against daemon-impl's actual `theme.go` struct tag during validate mode** —
if the real key differs, only `claudeConfigJSON` needs to change; every test that uses
`claudeConfigContent`/`writeClaudeConfig` goes through it. Every test using this fixture
(E9, E10, E11, E15, the INV-1 test) is downstream of this one assumption.

**D4's negative grep is unaffected.** `D4 ! rg -n --fixed-strings ".claude.json" cmd/ internal/ --glob '!internal/claudecode/**'` only scans `cmd/` and `internal/` — this spec file lives under `web/`, so nothing here can trip it, and I never wrote the literal filename anywhere in the TypeScript (only the flag name `-claude-config-file`, which the daemon itself defines).

**E9's "assert both branches" instruction** (plan acceptance criteria) is satisfied within a
single test: branch 1 pins the pref to Instrument before flipping the family (data-theme
stays fixed); branch 2 then switches the same run's pref to Follow with family already
"light" (data-theme re-resolves). E10 is the same mechanic under an explicit "Dark" pref,
per its own acceptance ID.

**Badge-color oracle (E14)** reuses the exact hook sequence already established in
`sessions.spec.ts`'s sort-order test (SessionStart → UserPromptSubmit → Notification/
StopFailure, or SessionStart → UserPromptSubmit alone for Working, or a `permissionMode:
"plan"` launch + turn-activity for Planning) rather than inventing a new one — this sequence
is already proven correct by that existing, passing suite.

**Resume/End computed-style oracle (E13)** deliberately does not assert *which* specific
color each button carries (that's `--disabled-fg`/`--disabled-line` vs the enabled `.btn`
colors, a token-naming detail this plan settles in `style.css`, not in the wire contract) —
only that the disabled Resume's `color`/`border-color` differ from the enabled End's, and
that its `cursor` is `not-allowed` (REQ-8's own literal text), in every theme.

**INV-7 test** mirrors `rail-order.spec.ts`'s existing E16 (Pin button, daemon down) pattern,
adapted for a native `<input type="radio">`: since a browser sets a radio's own `checked`
DOM state synchronously on click regardless of any app JS, the invariant is observed by
what happens *after* — the reconnect snapshot must re-sync the radio back to the actually-
persisted pref ("follow"), not leave it on the clicked-but-never-persisted "Dark".

No test in this file launches a real `claude` binary — every session uses the existing
`-claude-bin` stub via `launchSession`, and every Claude Code theme signal is the scratch
`-claude-config-file` fixture (REQ-18/INV-5), never the real file.

## Validate Attempt 1

**Two items closed out from daemon-impl/web-impl before running anything:**

1. Confirmed `internal/claudecode/theme.go`'s `claudeConfig` struct tag is
   `Theme *string \`json:"theme"\``, measured by daemon-impl directly against the real
   pinned binary (2.1.258) and the real config file's key list. Dropped the
   "unmeasured/best-effort" caveat from `web/e2e/helpers/theme.ts`'s `claudeConfigJSON`
   JSDoc — the `"theme"` key was already correct, now stated as fact rather than flagged.
2. Fixed the one remaining W4 hit outside my own file: `web/e2e/sessions.spec.ts:351`'s
   prose comment said `--dim`; renamed to `--fg-dim`. Comment-only, no assertion touched.
   `W4 ! rg -n -e "--(ink|panel2?|paper|muted|dim|line2|border-(blocked|failed|plan|work)|note-fg-(amber|rose)|panel-95)\b" web/ --glob '!web/node_modules/**'` now passes (exit 1,
   no hits).

Rebuilt with `make web-build build` (in that order — `tsc --noEmit` inside `web-build`
covers `web/e2e/` too and passed cleanly on both edits above before the Go binary
re-embedded the assets).

### theme.spec.ts, first live run

16/17 passed. One failure:

`a radio clicked while the daemon is down does not persist; reconnect re-syncs the checked
radio from the broadcast (INV-7)` timed out (30s) on
`themeRadio(dialog, "Dark").click()` — `locator.click: Test timeout of 30000ms exceeded ...
waiting for getByRole('dialog', { name: 'Settings' }).getByRole('radio', { name: 'Dark' })`.

**Root cause — my defect, not the implementation's.** The plan's own States section pins:
"Daemon down ... The Settings dialog closes with the other dialogs ... since a PUT cannot
land." `web/src/main.ts:236` (`if (status !== "connected") settingsDialog.close();`)
implements exactly that. My test's premise — open the dialog, kill the daemon, then click a
radio *inside* the now-closed dialog — is impossible to execute through the real UI: the
dialog is gone before the click, which is why Playwright timed out waiting for a radio that
no longer renders. The implementation is correct; the test's scenario contradicted the
plan's own pinned behaviour.

**Repair:** rewrote the test (see `## Repairs` below) to isolate "a click whose PUT never
reaches the daemon" from "the daemon going down" — `page.route("**/api/prefs").abort()`
blocks just the PUT while the WebSocket (and therefore the dialog) stays up, so the radio
is actually clickable, then a separate `daemon.kill()` phase exercises INV-4 and the new
dialog-auto-close behaviour together. Every original assertion is preserved (theme
attribute never moves from a click that isn't broadcast; the reconnect snapshot re-syncs
the radio to "follow", never to "dark"; the persisted `prefs.theme` server-side is
"follow") plus one new assertion for the dialog closing on disconnect, which is real,
plan-pinned behaviour with no prior coverage.

### theme.spec.ts, second live run

17/17 passed, including the repaired INV-7 test (1.5s).

### Suite-wide collection re-check

`npx playwright test --list` from `web/`: clean, 191 tests in 17 files (no duplicate
titles, no syntax/import errors from the theme.spec.ts or actions.spec.ts edits).

### Full suite sweep (`make e2e`)

First run: 188 passed, 3 failed — all three are sanctioned breakage from this plan's own
approved protocol delta and palette table, not implementation bugs:

1. **`shell.spec.ts:52` — "GET /api/state returns exactly the M0 snapshot object once
   authenticated".** Failed a `toEqual` deep-equality check missing `claudeTheme` and
   `prefs.theme`. This file already carries the established pattern of updating this
   exact assertion every time a later plan's protocol delta adds a `prefs`/snapshot
   field (density, usageModel, railSort each have their own dated comment there). Added
   the same pattern for `theme`/`claudeTheme` citing the plan's protocol §3.3/§5.2 delta,
   and extended the expected object with `theme: "follow"` and
   `claudeTheme: { family: "unknown" }` — both positive assertions of the new merged
   contract, nothing removed.
2. **`views.spec.ts:482` — "GET /api/state's prefs snapshot carries both view and
   density (M2 protocol delta)".** Same shape, same fix: `theme: "follow"` added to both
   the before- and after-PUT expected `prefs` objects, with the same dated-comment
   pattern this file already uses for `usageModel`/`railSort`.
3. **`actions.spec.ts:544` — "Removing a live session ends it first, warns in the dialog
   copy, and moves focus to the top card (E9)".** Failed a `toHaveCSS("background-color",
   "rgb(201, 79, 79)")` — a hardcoded literal for the *old* `--danger` fill (`#C94F4F`).
   This plan's REQ-2 explicitly lists `--danger` among the Instrument shades adjusted for
   AA (Implementation Notes → Palettes: Instrument `--danger` is now `#c24646` =
   `rgb(194, 70, 70)`). Rather than swap in the new hex literal (which would only go
   stale again at the next palette tweak), repaired by resolving `--danger`/`--rose`
   live via `resolvedCssVar` (imported from `helpers/theme.ts`) and asserting against
   those computed values — strictly stronger than a hardcoded literal, and it still
   asserts both "is the danger fill" and "is not the rose fill" (the same distinction the
   original comment cared about, m4-reconcile Fix Attempt 3).

Second run: 191/191 passed (`make e2e`'s output, tail captured below).

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `web/e2e/theme.spec.ts` — INV-7 test | `locator.click` timed out (30s) waiting for a radio inside the Settings dialog after `daemon.kill()` | Scenario assumed the dialog stays open after the daemon goes down; the plan's own States section (and `main.ts:236`) close it on disconnect, so the radio never renders to click | Split into two phases: `page.route("**/api/prefs").abort()` blocks the PUT while the dialog stays open (WS untouched) to exercise "a click that never persists"; a separate `daemon.kill()`/`restart()` phase exercises INV-4 and asserts the dialog is hidden while down | REQ-9/INV-7 (checked radio only ever reflects the broadcast; `prefs.theme` stays "follow" server-side after both the blocked click and the outage), INV-4 (both theme attributes frozen across the outage) — plus a new assertion for the dialog auto-closing on disconnect (real, plan-pinned behaviour, previously untested) |
| 2 | `web/e2e/shell.spec.ts` — "GET /api/state returns exactly the M0 snapshot object once authenticated" | `toEqual` failed: received object had extra `claudeTheme` and `prefs.theme` keys | Pre-existing test's expected object predates this plan's merged protocol delta (sanctioned breakage, not my authoring) | Added `theme: "follow"` to the expected `prefs` object and `claudeTheme: { family: "unknown" }` to the expected top-level object, with a dated comment matching the file's existing per-plan-delta pattern | Same M0 snapshot-shape assertion, now covering the full merged `GET /api/state` contract including this plan's fields — nothing removed or weakened |
| 3 | `web/e2e/views.spec.ts` — "GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)" | `toEqual` failed: both before- and after-PUT `prefs` objects were missing `theme` | Same as #2 — pre-existing assertion predates this plan's protocol delta | Added `theme: "follow"` to both expected `prefs` objects, same dated-comment pattern the file already uses for `usageModel`/`railSort` | Same view/density-survives-a-PUT assertion, now also covering `theme`'s presence across the same round trip — nothing removed |
| 4 | `web/e2e/actions.spec.ts` — "Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9)" | `toHaveCSS("background-color", "rgb(201, 79, 79)")` failed — literal was the pre-plan `--danger` value | This plan's REQ-2 adjusted `--danger`'s Instrument shade for AA contrast; the hardcoded hex predates that change | Replaced the two hardcoded literals with `resolvedCssVar(page, "--danger"/"--rose", "background-color")` (imported from `helpers/theme.ts`) and asserted the button matches the live `--danger` value and not `--rose` | The exact same distinction the original comment documented (danger fill, explicitly not the rose fill it was repointed from) — now token-driven instead of a literal that will re-drift on the next palette edit |

`No assertion was deleted, skipped, or weakened.`

## Test Run Output

```
$ cd web && npm run e2e -- e2e/theme.spec.ts
Running 17 tests using 6 workers
  17 passed (6.3s)

$ npx playwright test --list
Total: 191 tests in 17 files

$ make e2e   (second run, after all repairs)
Running 191 tests using 6 workers
  ...
  191 passed (46.0s)
```

## Notes (validate attempt 1)

- W4/W5 negative greps re-run manually and both pass (exit 1, no hits) after the
  `sessions.spec.ts` comment fix and the `theme.spec.ts`/`actions.spec.ts` edits — neither
  introduced a stale token name or a hex literal under `web/src`.
- The scratch config JSON key (`"theme"`) is now confirmed fact, not a flagged
  assumption — see the dated note at the top of this section. Every test using
  `claudeConfigContent`/`writeClaudeConfig` (E9, E10, E11, E15, the INV-1 test) was
  already correct; nothing needed to change in those tests themselves.
- No implementation code was touched. Only `web/e2e/theme.spec.ts`,
  `web/e2e/helpers/theme.ts`, `web/e2e/sessions.spec.ts`, `web/e2e/shell.spec.ts`,
  `web/e2e/views.spec.ts`, and `web/e2e/actions.spec.ts` changed in this pass.
