# Review: shortcut-fixes

**Plan**: shortcut-fixes
**Cycle**: 2 (delta re-review; cycle 1's full text is at commit `e86ab65`)
**Verdict**: approved

Cycle 1's single agent-tagged Major is fixed and verified. `563e12e` changes seven lines of
text in the two normative reference renders and nothing else — no markup, layout, colour or
token change, no file under `web/` touched — so REQ-11 now passes in full and no other
finding can have moved. I re-ran the whole gate set myself rather than trusting that: 262/262
E2E (full suite), 996/996 Vitest, all 13 Go packages, `go build`, `make lint`, `make
web-build`, and all 8 authored checks. I also rendered both edited mockups in a real browser
to confirm the reference renders still render and now show the new chords.

Two carried-forward items, neither blocking: Major 2 is `[orchestrator]` doc upkeep the plan
routes to the backstop by name, and Minor 1 is six stale comments in the E2E suite. The
orchestrator's disposition of both is correct — see **Carried-Forward Dispositions** below.

## Delta Verified (cycle 1 → cycle 2)

`git diff e86ab65..HEAD` outside `plans/` is exactly two files, 7 changed lines:

| File:line | Was | Now |
|---|---|---|
| `docs/design/mockups/a-instrument.html:541` | `New session ⌘N` | `New session ⌥⌘N` |
| `docs/design/mockups/d-tiled.html:334,360,382,404,427,453` | `⌘1 focus` … `⌘4 focus`, `⌘5 resume`, `⌘6 focus` | `⌥⌘1 focus` … `⌥⌘4 focus`, `⌥⌘5 resume`, `⌥⌘6 focus` |

- **REQ-11 now passes.** `grep -rnoP '(?<!⌥)⌘[0-9N]' docs/design/` returns exactly two hits:
  `b-editorial.html:308` and `c-terminal.html:265` — the two *rejected* directions from the
  2026-08-16 comparison, which cycle 1 explicitly excluded as a record of what was judged
  rather than a description of Muster. Nothing else stale survives in `docs/design/`.
- **REQ-10 intact.** `⌘\` still appears once in each edited mockup (`a-instrument.html:340`,
  `d-tiled.html:287`) — the character-class grep confirms the edit did not over-reach into
  the view-toggle chord.
- **No code path could regress.** No file under `web/`, `internal/`, or `cmd/` differs from
  the tree cycle 1 reviewed. The E2E/Vitest/Go results below are therefore a regression
  sweep, not a re-derivation.
- **The impl log's addendum is honest.** `web-implementation.md`'s "Fix Attempt 1" enumerates
  the same seven lines, states the same exclusion, and claims only that build status is
  unchanged — every claim matches the diff I read.

Cycle 1's other verdicts stand unchanged and are restated below with their original evidence.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (no browser-handled chord bound) | Yes — `web/src/shortcuts.ts:39-68` | INV-1 reviewer-verified vs `spikes/S5-key-probe.md`; W6 loop | pass |
| REQ-2 (⌘N no longer opens the modal, no `preventDefault`) | Yes — `render/launch.ts:389-403` | W4 (Vitest) + cycle 1 browser measurement | pass |
| REQ-3 (one pure module holds the table) | Yes — `web/src/shortcuts.ts`; neither dispatch site matches keys | reviewer-verified (grep) | pass |
| REQ-4 (`event.code` + exact 4-modifier signature) | Yes — `shortcuts.ts:74-87` | W6 (192-case loop), W16 | pass |
| REQ-5 (⌥⌘1–9 keeps `orderRail` behaviour) | Yes — `main.ts:420-423` | E4/E5 + 4 repointed `rail-order.spec.ts` tests | pass |
| REQ-6 (⌥⌘0 = SPEC §2.1 priority, ignores rail sort + pins) | Yes — `sessions/sort.ts:79-85`, `main.ts:430-433` | W7/W9, E6, INV-4; cycle 1 hand-check | pass |
| REQ-7 (alive-only, silent no-op) | Yes — `.filter(s => s.alive)` before the sort | W8 + edge-case-3/4 E2E | pass |
| REQ-8 (matched chord calls `preventDefault`) | Yes for all session/new-session chords | E8/INV-3 E2E + measurement | pass (one scoped-out exception — Note 1) |
| REQ-9 (three DOM chord strings) | Yes — `web/index.html:67,106,114` | E9/E10 | pass |
| REQ-10 (⌘\ and ⌘↑ untouched) | Yes — same chords, only the match site moved; `⌘\` also survives both mockup edits | Vitest REQ-10 cases; browser-verified | pass |
| REQ-11 (design docs name the new chords) | **Yes — fixed this cycle** (`563e12e`) | reviewer-verified by grep + browser render | **pass** |
| REQ-12 (binding table exported as data) | Yes — `SHORTCUT_HELP`, no overlay built | shape test | pass (Note 3) |

## Build & Tests

All re-run in this cycle, on the post-fix tree.

E2E tests: **pass** — 262/262, full suite (not just this plan's spec file), 1.1m
Daemon tests: **pass** — `make test`, all 13 packages `ok`, 0 failures
Web tests: **pass** — 996/996 across 27 files
Daemon build: **pass** — `go build ./...`
Web build: **pass** — `make web-build`
Lint: **pass** — `make lint`

## Acceptance Checks

Re-run via `.claude/skills/orchestrate/scripts/gates.sh shortcut-fixes --checks-only`
(8 lines, 0 failed).

| ID | Command | Result |
|----|---------|--------|
| W11 | `! rg -n 'event\.key\.toLowerCase\(\)' web/src/` | pass |
| W12 | `! rg -n 'Number\(event\.key\)' web/src/` | pass |
| W13 | `! rg -n 'press\("Meta\+n"\)' web/e2e/` | pass |
| W14 | `! rg -n 'press\("Meta\+[0-9]"\)' web/e2e/` | pass |
| W17 | `make web-build` | pass |
| W18 | `make web-test` | pass (996 tests) |
| W19 | `make lint` | pass |
| E11 | `make e2e` | pass (262 tests) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| INV-1 | no chord in the Binding Table is browser-reserved | pass | Cycle 1: read `spikes/S5-key-probe.md` row by row. Every adopted chord (⌥⌘N, ⌥⌘0, ⌥⌘1–⌥⌘9) and both kept chords (⌘\ `Backslash`, ⌘↑ `ArrowUp`) is **SAFE** in *both* Safari and Chrome, no caveat. The only BLOCKED rows are ⌘N and ⇧⌘N, neither of which the table binds. From the probe, **not** the Playwright run — per the plan's rule 2. Unchanged this cycle (no binding touched). |
| W10 | no `any` types in new web code | pass | Cycle 1 grep of `: any` / `as any` / `<any>` / `any[]` across every file in the impl log — only hit is the English word "any" in a `launch.ts:126` comment. `strict` and `noUncheckedIndexedAccess` intact. No `.ts` file changed since. |
| REQ-3 | no binding table left in `main.ts` / `render/launch.ts` | pass | Neither file reads `event.code`. Both dispatch sites switch on `action.type` only. Re-read `launch.ts:385-410` this cycle: the two `⌘N` mentions there are deliberate prose about the *browser-reserved bare* chord the plan is avoiding, not stale binding text. |
| REQ-2 | no `preventDefault()` on any path reachable from a bare ⌘N | pass | Cycle 1, measured in a real browser: with a probe listener appended to `window`, `Meta+n` gave `{code:"KeyN", meta:true, alt:false, defaultPrevented:false}` and `#launch-dialog.open === false`; same for `Meta+Shift+n` and `Meta+Digit1`. |
| Edge case 8 | session shortcuts no-op while a modal confirm is open | pass | Cycle 1, measured: with `#end-dialog` open, ⌥⌘1 and ⌥⌘0 both left `#mainhead .name` reading `bravo`. |
| REQ-11 | design docs name the new chords, no stale ⌘N/⌘1–9 in `docs/design/` | **pass** | `design-system.md` §4.1 and `ux-flows.md` §1/§3.7/§3.8/§4 were already correct; both reference renders are now correct too. Verified twice this cycle — by grep over `docs/design/` (only the two rejected directions remain) and by rendering both files in a browser (see Manual Verification). |

## Hard-Rule Checklist

The cycle-2 delta is two static HTML files under `docs/design/mockups/`; the full changeset
is `web/`, `docs/design/` and `plans/` only — **no Go file at any point**. Each rule was
still grepped over the full diff rather than assumed.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (Claude-Code formats outside `internal/claudecode/`) | pass — no `.go` file changed; no hook/status-line field name in any added line |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in the diff; state still comes from the store |
| 3 | No blocking hook handler | pass — no ingest code touched |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — no `tmux` string in any added line; cycle 1's manual run used `-tmux-socket mrvreview` and was torn down; this cycle started no daemon at all |
| 5 | No payload logging | pass — no logging added |
| 6 | No empty-gauge dishonesty | pass — no gauge/percentage rendering touched |
| 7 | Session identity keys on the tmux target | pass — no identity code touched |
| 8 | No `~/.claude/settings.json` / `CLAUDE_CONFIG_DIR` trespass | pass — neither string in the diff |
| 9 | No real `claude` outside canary/probes | pass — no `claude-bin`/`spawn` line added; `shortcuts.spec.ts` uses the harness's stub |

## Design System Compliance

No CSS file is in the changeset (`web/src/style.css` unchanged) and no colour literal, font
stack, spacing value, `innerHTML`, or `.hidden =` assignment appears in any added line —
all four greps empty. Token, web-font, state-colour, tabular-numeric and `[hidden]`-companion
rules have nothing to regress. Honesty rules (§6) and terminal rules (§7) untouched: no
gauge, no cost display, no second live client, no geometry change, no `resize-pane`, no pane
styling. `#main-empty` / `#tiles-empty` remain word-based.

**The cycle-1 defect is cleared.** `design-system.md` names `mockups/a-instrument.html` and
`d-tiled.html` as the authority four times (line 3, line 22, lines 134–135); those renders now
agree with the §4.1 line this plan rewrote instead of contradicting it. The fix touched only
text inside existing `<button>` and `<span class="sp">` nodes — I confirmed in-browser that
`a-instrument.html`'s `onclick` demo toggle still works after the edit, so the reference
render is still a working render and not just a correct string.

## Test Quality

Unchanged from cycle 1, re-confirmed against the current tree:

- `shortcuts.test.ts`'s `BOUND_CHORDS` is an *independent transcription* of the plan's Binding
  Table rather than an import of `BINDINGS` — the right call, since it lets the 192-case W6
  loop catch the implementation drifting from the plan.
- W16 sets `key` to `"˜"`/`"¡"`/`"º"` against the bound `code` — the only place in either
  suite that can prove the matcher is `code`-based.
- `pickNeediest`'s edge-case-4 test constructs the case where `sortSessions` *would* return
  the most-recently-ended session and asserts `null`.
- Nothing tests a platform guarantee. No `test.skip` / `test.fixme` anywhere in the diff.

**`## Repairs` table re-verified.** The single repair (edge case 6) swapped
`stateBadge(liveTile(...))` — a strip-card helper pointed at a live-tile locator, which can
never match because `render/tiles.ts:67` carries a live tile's state only in the `.sdot`
`title` — for `tileStateDot(...)` + `toHaveAttribute("title", /needs input/i)`. At
`e2e/shortcuts.spec.ts:246-290` the precondition oracle is still asserted (the target really
reached `needs_input` before the keypress) and the post-condition still asserts every tile
stays visible *and* the strip stays at count 0. Nothing deleted, skipped or weakened; no
fixture gained a field the real Claude Code does not send. The repair was made during E2E
Validate and recorded there — no locator defect reached review in either cycle.

## Manual Verification

**This cycle** — the delta is the two reference renders, so that is what I drove. Served
`docs/design/mockups/` over a throwaway local static server (port 8911, killed afterwards;
`file:` is blocked in the browser tool) and opened both edited files in a real browser:

1. `d-tiled.html` — the six tile footers read, in order: `⌥⌘1 focus`, `⌥⌘2 focus`,
   `⌥⌘3 focus`, `⌥⌘4 focus`, `End ⌥⌘5 resume`, `⌥⌘6 focus`. All 6 `.tfoot` nodes present, so
   no tile was lost. `document.body.innerText` matched against `(?<!⌥)⌘[0-9N]` returns **zero**
   hits — the render itself, not just the source, is free of stale chords.
2. `a-instrument.html` — the demo control reads `New session ⌥⌘N`; the other five demo
   buttons are unchanged. Clicking it still toggles `body.is-new` and clicking again restores
   the original class list, so the text edit did not break the render's interactivity.
   `innerText` again yields zero stale-chord matches, and `⌘\` is still present once.
3. Console across both pages: one error, mine — a `favicon.ico` 404 from the bare static
   server. Zero page errors.

**From cycle 1** (application UI, unchanged code, not re-driven): a purpose-built scratch
daemon — `bin/musterd -data-dir <scratchpad>/data -tmux-socket mrvreview -claude-bin <stub>
-open=false`, never the real data dir or the `muster` socket, torn down afterwards — with two
sessions launched via `POST /api/sessions`, one driven to `needs_input` through the real
`/ingest/<token>/hook` endpoints. Confirmed by hand there: the three DOM strings render
`⌥⌘N`; bare ⌘N leaves `defaultPrevented: false` with the dialog shut (REQ-2, the criterion
E2E is structurally forbidden to test); ⌥⌘N opens and does `preventDefault`; ⌥⌘2 then ⌥⌘1
round-trips focus; with `alpha` pinned to rail position 1 in `manual` sort and `bravo` the
only `needs_input` session, ⌥⌘1 focused `alpha` and ⌥⌘0 focused `bravo` (REQ-6/INV-4 jumping
both the pin block and the manual sort); ⌥⌘0 on an empty store was silent; ⌘\ still toggled
Focus → Tiles. I did not re-drive these, because no file under `web/` differs from the tree
those measurements were taken against.

**Not verifiable here, and not claimed:** INV-1 in real Safari/Chrome chrome. Chromium under
Playwright receives injected events below the browser chrome, so neither run says anything
about whether a chord is reserved — that is what `spikes/S5-key-probe.md` is for, and it is
the only thing I relied on for INV-1.

## Carried-Forward Dispositions

Both were put to me explicitly; both dispositions are correct as stated.

- **Major 2 `[orchestrator]` deferred to the Doc-Upkeep Backstop** — right, and I would not
  want it done earlier. It is doc upkeep the plan routes to the orchestrator by name, the
  verdict rules permit an `[orchestrator]` Major on an `approved` review, and writing
  "approved review cycle N" into `TODO.md` before the verdict exists would be asserting an
  outcome that does not yet exist. It stays filed below, unticked, and I have not treated it
  as blocking.
- **Minor 1 `[e2e-specs]` deferred to a `TODO.md` follow-up** — also right, and it follows the
  rule as written: e2e-specs drew no Critical or Major in cycle 1, so no wave was spawned for
  it, and Minors never block `approved`. The six comments are wrong-but-inert (each sits above
  an assertion that is itself correct, which is why the suite is green), so the cost of
  carrying them is a maintainer reading a stale comment, not a test that lies. Escalating
  would mean spawning an agent to edit six comment lines. I am leaving it a Minor.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** Doc upkeep the plan routes explicitly to the orchestrator's backstop,
   not to any impl track (`plan.md` → Implementation Notes → "Doc upkeep (orchestrator, not
   an impl track)"). Still outstanding as of this review, by design; **does not block
   approval**, and the orchestrator has confirmed it lands before completion:
   - `SPEC.md` §11 has **no** `shortcut-fixes` entry (grep returns nothing). Needs one
     recording the rebind, noting decision `cmd-n-ordering` Option A is *preserved* (only the
     chord moved), and amending the 2026-08-30 line's "follow-up in TODO.md" now that ⌥⌘0
     discharges the recorded dissent.
   - `TODO.md:663` — the `⌘N collides with the browser` item (#5) is still `[ ]`.
   - `TODO.md` — order-sidebar follow-up 1 ("consider a dedicated shortcut") and follow-up 4
     (the inaccurate `focusNth` doc comment, fixed at `main.ts:414-419`) both need ticking.

   `spikes/FINDINGS.md:15` already carries the `S5-key-probe.md` pointer — that one is done.

### Minor

1. **[e2e-specs]** Six internal comments across the suite still name the pre-plan chords,
   after the same pass renamed comments in the five files it did touch. Each describes a
   binding that no longer exists. Verified still present on the current tree:
   - `web/e2e/shell.spec.ts:28` — quotes the placeholder literally as
     `"No sessions yet — ⌘N to launch"`; the string is now `⌥⌘N`. (The assertion is
     `getByText("No sessions yet", { exact: true })` and is correct — only the comment is
     wrong, which is why the suite is green.)
   - `web/e2e/helpers/picker.ts:11` — "the `⌘N` kbd beside the heading text".
   - `web/e2e/views.spec.ts:112` — "⌘1 moves focus the same way a rail-card click does".
   - `web/e2e/rail-order.spec.ts:582,584` — "⌘1-9 (`focusNth`) now indexes into `orderRail`…",
     "Before this fix, ⌘1 could disagree…".
   - `web/e2e/terminal.spec.ts:407` — "the Tiles strip's promote click, ⌘1-9 (`focusNth`)".

   Note for whoever picks this up: `rail-order.spec.ts:582-586` describes a *past* decision,
   so `⌥⌘1–9` is the right replacement rather than a rewording — the history is about the same
   action, which only changed chord.

### Notes

1. **[note]** ⌘↑ with the launch dialog **closed** matches the `launch-parent-dir` binding but
   does not `preventDefault()` — `render/launch.ts:405` guards `if (!elements.dialog.open)
   return;` before the `preventDefault()` on 406. Read literally, REQ-8 ("every matched
   shortcut calls `preventDefault()`") is not satisfied for that one case, so ⌘↑ still reaches
   the browser's scroll-to-top and a focused terminal when the dialog is shut. **No change
   requested**: REQ-10 puts ⌘↑ explicitly out of scope, the guard is byte-for-byte the
   pre-plan behaviour, and swallowing ⌘↑ globally would be new behaviour the plan did not ask
   for. Recorded so the REQ-8/REQ-10 overlap is a known, deliberate seam.

2. **[note]** ⌥⌘N pressed while the End confirm is open stacks `#launch-dialog` **on top of**
   `#end-dialog` — measured in cycle 1: `dialog[open]` returned `["launch-dialog",
   "end-dialog"]`. Edge case 8 covers only "session shortcuts", so `new-session` is correctly
   outside `isBlockingDialogOpen()`'s guard, and pre-plan ⌘N stacked identically. No change
   requested; flagged because the two-modal stack is the kind of thing a future keyboard-model
   plan should decide on deliberately.

3. **[note]** `SHORTCUT_HELP` (`shortcuts.ts:91-97`) is a hand-written parallel array, not
   derived from `BINDINGS`, so the two can silently drift; the shape test only checks the
   entries are `{label: string, chord: string}`. The impl log gives the reason (folding nine
   digit bindings into one `⌥⌘1–9` display row costs more machinery than a nice-to-have with
   no consumer justifies) and I agree with the trade-off. Worth knowing only if REQ-12's
   future help overlay actually gets built — that is when deriving it becomes cheaper than
   maintaining it.

4. **[note]** The plan's own line references drifted before implementation began: REQ-9 cites
   `web/index.html:45,84,92` but the strings live at 67, 106 and 114, and the E2E call-site
   list missed `focus-marker.spec.ts:126` and `permission-mode.spec.ts:75` (e2e-specs found
   both by grep and repointed them anyway — the right call). No defect in the work; noting
   that the full-file grep beat the plan's enumerated list twice here.

5. **[note]** Confirming what the plan asked reviewers to confirm: **⌘1–9 was never measured
   broken.** `spikes/S5-key-probe.md` leaves Safari's ⌘1/⌘2/⌘9 rows unmeasured and records
   Chrome's as SAFE-but-indicative. I treated the rebind as the consistency-and-robustness
   argument the plan states it is, and looked for no failure that was never observed.

6. **[note]** `d-tiled.html:427` now reads `⌥⌘5 resume` on a *stopped* tile, but the shipped
   binding table maps ⌥⌘1–9 to `focusNth` only — nothing resumes a session by chord. That
   mismatch is pre-existing (the line read `⌘5 resume` before this plan) and the mockup is a
   design record of intent rather than a description of shipped behaviour, so correcting only
   the modifier — exactly what cycle 1 prescribed — was right. No change requested; recorded
   so a future keyboard plan knows the reference render already depicts a resume chord that
   does not exist.

7. **[note]** `session-manager-mockup.html:327` at the repo root still says `⌘1`. It sits
   outside `docs/design/`, so REQ-11 does not reach it, and it predates the design system's
   `docs/design/mockups/` set. Out of scope for this plan; mentioned only so the next grep
   over the repo does not read it as something this plan missed.
