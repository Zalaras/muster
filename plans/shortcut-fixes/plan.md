# Plan: shortcut-fixes

**Created**: 2026-09-01
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Description**: Move every Muster keyboard binding off browser-reserved chords, and add the jump-to-neediest shortcut the `cmd-n-ordering` decision left owing.

> **MEASUREMENT COMPLETE.** Both browsers probed, every row closed — `spikes/S5-key-probe.md`.
> Every chord this plan adopts (⌥⌘N, ⌥⌘0, ⌥⌘1–9) reaches the page in both Safari and Chrome
> with no caveat. ⌘N and ⇧⌘N are reserved in both. ⌘\ and ⌘↑ are safe in both and stay as
> they are. The Binding Table below is final and needs no further verification.

## Overview

Muster's ⌘N (new session) is swallowed by Safari, which opens a browser window instead
([#5](https://github.com/Zalaras/muster/issues/5)). The reported bug is one key, but it is
an instance of a class: shortcuts handled by the **browser chrome** — new window, new tab,
tab switch — are dispatched above the page and `preventDefault()` cannot reach them.
Measurement (`spikes/S5-key-probe.md`) confirms ⌘N is one of these in Safari, and confirms
⇧⌘N — the rebind issue #5 and `TODO.md` suggested — is *equally* reserved, as New Private
Window. So the suggested fix would have fixed nothing.

**⌘1–9 is a weaker case than it first appears, and the plan says so.** Chrome delivered
⌘1/⌘2/⌘9 to the page — it does *not* reserve them — and Safari's ⌘-digit rows were skipped
in the probe run. So there is no measurement showing ⌘1–9 was ever broken for Damian; it is
plausible only because Safari's "⌘1 through ⌘9 switch tabs" preference is on by default.
Nothing downstream may cite the probe as proof it was broken.

The rebind is justified anyway, on the destination rather than the origin: ⌥⌘1–9 is measured
clear in both browsers with no caveat, ⌘-digits are at best browser-dependent, and one
coherent modifier for the whole session-shortcut family beats a split table. That is a
consistency and robustness argument, not a bug fix — and it is worth stating plainly so the
review does not look for a failure that was never observed.

So the deliverable is not a rebind of one key; it is a move of the binding set onto chords
both browsers have been *measured* to leave alone.

The constraint that picks the family: Muster has focused xterm panes, so any binding
without ⌘ competes with keystrokes destined for Claude Code. On macOS, ⌘-chords are the
one family the terminal never sees. That rules out the plain-key (`n`, `1`–`9`) and
Control-prefixed schemes and leaves ⌥⌘, which macOS, Safari and Chrome all leave
unclaimed. ⌘⇧-digits are disqualified separately: ⌘⇧3/4/5 are macOS screenshot shortcuts.

While the binding table is being rebuilt, this plan also settles the dissent recorded
against decision `cmd-n-ordering` (`plans/order-sidebar/decisions/cmd-n-ordering/decision.md`,
SPEC §11 2026-08-30, TODO.md follow-up 1): with ⌘1–9 following the rail's displayed order,
there is no keyboard path to SPEC §2.1's needs-input-first rule in any configuration. A
dedicated jump-to-neediest shortcut restores it without reopening Option A.

Two structural notes shape the work. First, the current handlers match on `event.key`
(`event.key.toLowerCase() === "n"`, `Number(event.key)`), which **cannot** express an
⌥-chord: on macOS ⌥N yields `"˜"` and ⌥1 yields `"¡"`. Matching must move to `event.code`.
Second, the binding table today is split across `main.ts` and `render/launch.ts` with no
single place that knows what is bound; this plan centralises matching in one pure module
so the set is reviewable, unit-testable, and cannot drift apart again.

## Requirements

### Must Have

- [ ] **REQ-1**: No Muster keyboard binding uses a chord the browser handles above the
  page. The bindings are those in the Binding Table below, each measured as reaching the
  page in both Safari and Chrome on macOS.
- [ ] **REQ-2**: ⌘N no longer opens the launch modal, and no longer calls
  `preventDefault()`. The browser's own ⌘N is left entirely alone — Muster does not
  attempt to swallow a chord it cannot win.
- [ ] **REQ-3**: Shortcut matching lives in one pure module, `web/src/shortcuts.ts`, which
  maps a `KeyboardEvent` to a `ShortcutAction | null` and holds the whole binding table.
  `main.ts` and `render/launch.ts` dispatch from it; neither matches keys itself.
- [ ] **REQ-4**: Matching keys on `event.code` and an **exact** modifier signature — a
  chord matches only when all four of `metaKey`/`altKey`/`shiftKey`/`ctrlKey` equal the
  binding's, so an extra held modifier never triggers a neighbouring action.
- [ ] **REQ-5**: Focus-session-*n* (⌥⌘1–9) keeps its existing behaviour exactly: it
  selects the *n*th card of `orderRail(store.values(), railSort)` — the rail's displayed
  order under the current sort mode — focusing it in Focus and promoting it in Tiles.
  Decision `cmd-n-ordering` Option A is untouched; only the chord changes.
- [ ] **REQ-6**: A new jump-to-neediest shortcut focuses the single highest-attention
  session per SPEC §2.1 — `sortSessions`'s existing priority order — **ignoring both the
  rail's current sort mode and the pinned block**. In Focus it focuses that session; in
  Tiles it promotes it, exactly as focus-*n* does.
- [ ] **REQ-7**: Jump-to-neediest considers only `alive` sessions. With no live session it
  is a **silent** no-op — no cue, no message, no focus change. It never focuses an ended
  session, and never throws on an empty store. *(Silence is a user decision taken at
  approval, 2026-09-01, not an implementation default: do not "improve" it into a toast or
  a flash.)*
- [ ] **REQ-8**: Every matched shortcut calls `preventDefault()`, so a bound chord never
  reaches a focused terminal, a text input, or the browser's own page-level default.
- [ ] **REQ-9**: The three places the DOM names a shortcut are updated to the new chords:
  `#main-empty`, `#tiles-empty`, and the launch dialog's `.kbd` chip in `web/index.html`.

### Should Have

- [ ] **REQ-10**: ⌘\ (view toggle) and ⌘↑ (launch-dialog parent directory) are left
  unchanged. Both measured SAFE in Safari and Chrome (`spikes/S5-key-probe.md`), so they are
  explicitly **out of scope** — this requirement exists to stop an implementer "tidying"
  them onto ⌥⌘ for symmetry.
- [ ] **REQ-11**: `docs/design/design-system.md` §4.1 and `docs/design/ux-flows.md` §1, §3.8
  are updated to the new chords, including the mockup's `New session ⌘N` line at
  `ux-flows.md:33`.

### Nice to Have

- [ ] **REQ-12**: `shortcuts.ts` exports the binding table as data (label + chord), so a
  future shortcuts-help overlay has a single source. No overlay is built here — the
  keyboard model is explicitly out of scope in ux-flows §4.

## Binding Table

The whole bound set after this plan. "Was" is the pre-plan chord.

| Action | Was | Becomes | Dispatch site |
|---|---|---|---|
| New session (open launch modal) | ⌘N | **⌥⌘N** | `render/launch.ts` |
| Focus / promote session *n* | ⌘1–9 | **⌥⌘1–9** | `main.ts` |
| Jump to neediest session | — (new) | **⌥⌘0** | `main.ts` |
| Toggle Focus / Tiles | ⌘\ | **⌘\** (unchanged) | `main.ts` |
| Launch dialog: parent directory | ⌘↑ | **⌘↑** (unchanged) | `render/launch.ts` |

⌥⌘0 sits deliberately beside ⌥⌘1–9: the list is the rail's order, and 0 is the one that
outranks the list. Digits match `Digit0`–`Digit9` on the main row only; the numpad is
deliberately unbound, to keep the table one row per chord.

## Protocol Contract

**No protocol changes**, so nothing is merged into `docs/protocol.md` on approval. This is
entirely client-side: no WS message, no HTTP endpoint, no
`prefs` field. Bindings are compiled in, not configurable — consistent with SPEC's
single-user scope, and nothing in the daemon needs to know what a key does.

## Schema Changes

No schema changes required.

## UI Specifications

### Views

No new view. Three existing surfaces change their text, and one gains a behaviour:

- **Focus view** — ⌥⌘1–9 and ⌥⌘0 set the focused session (unchanged rendering).
- **Tiles view** — ⌥⌘1–9 and ⌥⌘0 promote into the grid via the existing `promoteSession`,
  which demotes exactly the lowest-priority live tile (order-sidebar REQ-8, unchanged).
- **Empty placeholders and the launch dialog heading** — new chord text (REQ-9).

### User Flows

1. **New session**: user presses ⌥⌘N anywhere in the shell → `#launch-dialog` opens via
   the existing `openModal()`. With the dialog already open, ⌥⌘N is swallowed and does
   nothing (preserving the current guard's behaviour, m1-sessions cycle-3 minor).
2. **Focus the nth session**: user presses ⌥⌘3 → the third card of the rail's current
   displayed order is focused (Focus) or promoted (Tiles). Fewer than 3 sessions → no-op.
3. **Jump to the neediest**: user presses ⌥⌘0 → the highest-attention live session is
   focused or promoted, regardless of where it sits in the rail and regardless of whether
   the rail is in manual or attention mode. No live sessions → no-op.
4. **Browser chords are the browser's**: user presses ⌘N → a browser window opens, exactly
   as it does on any other page. Muster no longer intercepts it.

### States

- **No data yet**: with an empty store, `#main-empty` reads `No sessions yet — ⌥⌘N to
  launch` and `#tiles-empty` reads `No sessions yet — New session or ⌥⌘N to launch`. Every
  session shortcut (⌥⌘1–9, ⌥⌘0) is a silent no-op — nothing to focus is not an error, and
  nothing is rendered to say so.
- **Data**: as the user flows above.
- **Daemon down**: shortcuts are pure client-side view manipulation and keep working
  against the last-known store — ⌥⌘0 still focuses the neediest session Muster last knew
  about. ⌥⌘N still opens the launch dialog; the dialog's own existing daemon-down handling
  (its directory listing fails and surfaces in `#launch-error`) is unchanged by this plan.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---|---|---|---|
| Launch dialog heading | `heading` | `New session` | The `.kbd` chip inside the `<h2>` is `aria-hidden="true"`, so it is **excluded** from the accessible name — the name stays `New session`, not `New session ⌥⌘N`. Assert the chip's text via its element, not the heading's name. |
| Launch dialog chord chip | — | `⌥⌘N` | `span.kbd` inside `#launch-dialog-title`; `aria-hidden`, no role. Locator strategy is e2e-specs' call. |
| Focus empty placeholder | — | `No sessions yet — ⌥⌘N to launch` | `#main-empty`, a bare `<div class="placeholder">` — no implicit role. Em dash `—`, spaces either side, transcribed from `web/index.html:45`. |
| Tiles empty placeholder | — | `No sessions yet — New session or ⌥⌘N to launch` | `#tiles-empty`, transcribed from `web/index.html:84`. |
| New session button (rail) | `button` | `New session` | Unchanged; listed because E2E asserts ⌥⌘N and the button open the same dialog. |

## Invariants

Named rules that must hold at all times. Per the m1-sessions lesson, each is asserted from
**every** reachable source state listed, not the convenient one.

- **INV-1 (no reserved chord)**: no chord in the Binding Table is handled by the browser
  chrome. Source states: Safari and Chrome, macOS. *Not machine-verifiable* — E2E cannot
  observe it (see Implementation Notes → Measurement). Reviewer-Verified, backed by the
  probe run recorded in `spikes/`.
- **INV-2 (exact modifier match)**: `matchShortcut` returns non-null **iff** the event is
  exactly one of the bound chords. Source states: for each bound chord, the same `code`
  with each of the 15 other modifier combinations must return `null` — in particular
  ⌘1 and ⌘⇧1 and ⌃⌥⌘1 must all be `null` while ⌥⌘1 matches. This is the invariant test
  table; write it as a loop over modifier signatures, not a handful of cases.
- **INV-3 (no leak)**: a matched chord never reaches a focused terminal or text input.
  Source states: Focus view with terminal focused, Tiles view with a tile's terminal
  focused, focus inside `#title-input` in the launch dialog, and focus on an ordinary
  button. In every one, the action fires and no character is typed.
- **INV-4 (neediest ignores rail state)**: ⌥⌘0 selects the same session whether
  `railSort` is `manual` or `attention`, and whether or not that session is pinned, and
  whether or not other sessions are pinned above it. Source states: the four combinations
  of {manual, attention} × {target pinned, target unpinned, a *different* session pinned}.
- **INV-5 (both views)**: every session shortcut round-trips from **both** Focus and
  Tiles. Per the m2-terminal lesson, an interactive surface hosted in more than one view
  is asserted from each hosting view.

## Affected Files

### Web

- `web/src/shortcuts.ts` — **new**. Pure module: `ShortcutAction` union, the binding
  table, `matchShortcut(event: KeyboardEvent): ShortcutAction | null`. No DOM, no imports
  from render modules — same shape as `sessions/sort.ts` (docs/conventions.md: pure
  state-derivation modules stay separate from DOM code).
- `web/src/sessions/sort.ts` — add `pickNeediest(sessions: readonly Session[]): Session |
  null`, returning `sortSessions(sessions.filter(s => s.alive))[0] ?? null`. Lives here
  because `sortSessions` is already SPEC §2.1's priority table and must not be duplicated.
- `web/src/main.ts` — replace the inline `keydown` matcher (lines ~787–798) with a
  `matchShortcut` dispatch; add the `focus-neediest` case calling `pickNeediest`, reusing
  the existing `focusNth` focus/promote branch. Update `focusNth`'s doc comment for the
  new chord (and, while there, order-sidebar review follow-up 4 — the comment's claim
  about the strip's order is inaccurate).
- `web/src/render/launch.ts` — the ⌘N handler (lines ~375–385) becomes an ⌥⌘N dispatch via
  `matchShortcut`; the ⌘↑ handler (lines ~390–397) dispatches from it too, keeping its
  dialog-open guard. Drop the "always swallow the browser's own Cmd+N" comment and its
  reasoning — that behaviour is deliberately removed by REQ-2.
- `web/index.html` — the three chord strings (lines 45, 84, 92).
- `docs/design/design-system.md` — §4.1 keyboard line.
- `docs/design/ux-flows.md` — §1 mockup line 33, §3.8, and §4's "beyond ⌘1–9 focus and ⌘N
  new session" scope note.

### E2E (owned by e2e-specs, listed for locating the call sites)

- `web/e2e/launch.spec.ts:389,815` — `Meta+n` → the new chord.
- `web/e2e/views.spec.ts:110` — `Meta+1` → the new chord.
- `web/e2e/rail-order.spec.ts:616,647,676,720` — `Meta+1` → the new chord.
- New spec coverage for ⌥⌘0 and INV-3/INV-5.

`SPEC.md` and `TODO.md` are **not** listed under an impl track — see Implementation Notes
→ Doc upkeep.

## Edge Cases

1. **⌥ produces a dead key.** On macOS ⌥N is `"˜"` and ⌥1 is `"¡"`. Any matcher reading
   `event.key` silently never fires. `event.code` is mandatory, not stylistic.
2. **⌥⌘N with the launch dialog already open** — swallowed, no re-open, no reset of a
   half-filled form. Preserves the existing guard.
3. **⌥⌘0 with zero sessions** — no-op, no throw (REQ-7).
4. **⌥⌘0 with sessions but none alive** — no-op; it must not fall through to the
   most-recently-ended session, which `sortSessions` would otherwise hand back.
5. **⌥⌘0 when the neediest session is already focused** — no-op in effect; a redundant
   re-render is acceptable but the focused session must not change.
6. **⌥⌘0 in Tiles when the neediest is already a live tile** — it must not demote another
   tile to make room for a session that already has one. **Already satisfied by existing
   code, verified while planning**: `promote` (`web/src/sessions/live.ts:46`) returns
   `[...live]` unchanged when `live.includes(id)`. So this needs no new implementation —
   only an E2E assertion that the behaviour is not regressed by the new dispatch path.
7. **⌥⌘3 with only two sessions** — no-op, per the existing `if (!session) return`.
8. **A chord pressed while a `<dialog>` other than launch is open** (End/Remove confirm) —
   the window-level listener still fires. Focus-changing shortcuts under a modal confirm
   are confusing; the dispatch must no-op for session shortcuts while any modal dialog is
   open. State the rule once rather than per-dialog.
9. **Key repeat.** Holding ⌥⌘0 fires repeated keydowns. Each is idempotent here, so no
   guard is required — but the dispatch must not accumulate state that makes it otherwise.
10. **A held ⌃ or ⇧ alongside a bound chord** — does not match (INV-2). ⌃⌥⌘1 is not ⌥⌘1.
11. **Numpad digits** — `Numpad1` is deliberately unbound; pressing it does nothing.
12. **The browser's own ⌘N after this change** — opens a browser window. That is correct
    and intended (REQ-2), and any test asserting Muster reacts to ⌘N is now asserting a
    bug.

## Acceptance Criteria

IDs unique across the section. One clause each.

### Web

- **W1**: `matchShortcut` returns the `new-session` action for ⌥⌘N.
- **W2**: `matchShortcut` returns a `focus-nth` action carrying the right `n` for each of
  ⌥⌘1 through ⌥⌘9.
- **W3**: `matchShortcut` returns the `focus-neediest` action for ⌥⌘0.
- **W4**: `matchShortcut` returns `null` for ⌘N.
- **W5**: `matchShortcut` returns `null` for every ⌘-digit chord without ⌥.
- **W6**: `matchShortcut` returns `null` for each bound chord's `code` under every
  modifier signature other than the bound one (INV-2).
- **W7**: `pickNeediest` returns the longest-blocked `needs_input` session when one exists.
- **W8**: `pickNeediest` returns `null` when no session is `alive`.
- **W9**: `pickNeediest` ignores `pinned` and `railPos` entirely (INV-4).
- **W10**: no `any` types in new web code.
- **W16**: `matchShortcut` returns the right action for an event whose `code` is the bound
  one but whose `key` carries macOS's ⌥ dead-key character (`"¡"` for ⌥1, `"˜"` for ⌥N) —
  i.e. the matcher is provably `code`-based, not merely incidentally working.
- **W11**: neither of the two *global* shortcut matchers reads `event.key` — the launch
  dialog's element-scoped listing navigation (`render/launch.ts` arrow keys) legitimately
  keeps `event.key` and is out of scope.

### E2E

- **E1**: pressing ⌥⌘N in Focus opens `#launch-dialog`.
- **E2**: pressing ⌥⌘N in Tiles opens `#launch-dialog` (INV-5).
- **E3**: pressing ⌥⌘N with `#launch-dialog` already open leaves it open and does not
  reset the Title field.
- **E4**: pressing ⌥⌘1 in Focus focuses the rail's first displayed card, in both `manual`
  and `attention` rail modes.
- **E5**: pressing ⌥⌘1 in Tiles promotes the rail's first displayed session into the grid.
- **E6**: pressing ⌥⌘0 focuses the longest-blocked `needs_input` session while the rail is
  in `manual` mode with a *different* session pinned to the top (INV-4 — the case ⌥⌘1
  cannot reach).
- **E7**: pressing ⌥⌘0 with no live sessions changes nothing and logs no error.
- **E8**: pressing ⌥⌘N with focus inside a session's terminal opens the dialog and types
  no character into the terminal (INV-3).
- **E9**: `#main-empty` reads `No sessions yet — ⌥⌘N to launch` with an empty store.
- **E10**: the launch dialog's `.kbd` chip reads `⌥⌘N`.

### Automated Checks

Every line is `<ID> <single-line shell command>`, run from the project root; a check passes
iff its command exits 0.

IDs W17–W19 and E11 are build/suite gates with no prose twin, deliberately numbered clear
of the prose criteria so that "W1 passed" can never mean two different things. W11–W14 are
the negative greps; W11 twins the prose criterion of the same number.

Two of the four negative greps are **deliberately aimed at test files** — `web/e2e/` is the
whole point of W13/W14, since a spec still pressing `Meta+1` is a spec asserting the old
bug. They need no legal-escape helper: no test has a legitimate reason to press a chord
Muster no longer binds.

W11/W12 are deliberately **narrow**: they name the two exact expressions being deleted
rather than banning `event.key` outright. A blanket ban would have caught
`render/launch.ts`'s listing arrow-key navigation (`event.key === "ArrowDown"` and its
three siblings) — element-scoped handlers for unmodified keys that are correct as they
stand and are no part of this plan's binding table. Banning them would have forced an impl
agent to rewrite unrelated working code to satisfy a gate, which is the plan instructing a
violation of itself.

Dry-run note: each pattern was checked against this document
(`rg "<pattern>" plans/shortcut-fixes/plan.md`) — the patterns are path-scoped to `web/`,
so this plan's own prose cannot trip them.

```checks
W11 ! rg -n 'event\.key\.toLowerCase\(\)' web/src/
W12 ! rg -n 'Number\(event\.key\)' web/src/
W13 ! rg -n 'press\("Meta\+n"\)' web/e2e/
W14 ! rg -n 'press\("Meta\+[0-9]"\)' web/e2e/
W17 make web-build
W18 make web-test
W19 make lint
E11 make e2e
```

### Reviewer-Verified

- **INV-1**: no chord in the Binding Table is browser-reserved — verified against the probe
  results recorded in `spikes/`, not by the suite. **E2E structurally cannot check this**:
  Playwright injects key events below the browser chrome, which is exactly why
  `views.spec.ts:110` has been pressing `Meta+1` green while the binding was broken in
  Safari the whole time.
- **W10**: no `any` types in new web code.
- **REQ-3**: `main.ts` and `render/launch.ts` contain no binding table of their own — the
  whole set is in `shortcuts.ts`.
- **REQ-2**: no `preventDefault()` remains on any path reachable from a bare ⌘N.
- **Edge case 8**: session shortcuts no-op while a modal confirm dialog is open.
- **REQ-11**: the design docs name the new chords, and no stale ⌘N/⌘1–9 reference survives
  in `docs/design/`.

## Implementation Notes

### Measurement

The binding table is settled by a **probe, not by reasoning** — a guided key-probe page run
in real Safari and real Chrome, recording for each candidate chord whether the keydown
reached the page or the browser took it (evidenced by the page losing focus or visibility).
Results: `spikes/S5-key-probe.md`.

Reasoning alone is what produced the ⇧⌘N suggestion in issue #5 and `TODO.md`; the probe
measured it BLOCKED in Safari, same as ⌘N. That is the standing argument for this section.

Both browsers are measured and clean for every adopted chord, and for the two bindings this
plan keeps (⌘\, ⌘↑). No row is open; no agent needs to re-measure anything.

One methodology note for whoever reads this next: ⌘\'s first Safari run recorded BLOCKED
and was wrong — the probe's auto-detect fires on any focus loss, so a fumbled chord is
indistinguishable from a genuine steal. A lone BLOCKED reading is worth re-measuring before
it changes a plan. Had it been taken at face value, this plan would have rebound a working
shortcut.

Two rules follow from this and bind the pipeline:

1. **The probe result is the authority.** If a chord in the Binding Table measures BLOCKED
   in either browser, the table is amended *before* approval — never worked around during
   implementation.
2. **No agent may "verify" INV-1 with a Playwright run.** A green `make e2e` is silent on
   this bug class. Claiming otherwise is the evidence-vs-assertion failure CLAUDE.md names.

Findings land in `spikes/` (a short `S5-key-probe.md` with the two result tables), since
this is measured platform behaviour of exactly the kind `spikes/FINDINGS.md` exists to
hold — even though it is browser behaviour rather than Claude Code wire format.

### The unit test is the only guard for the dead-key problem

Playwright does **not** emulate macOS's ⌥ dead-key transformation: `press("Alt+Meta+Digit1")`
delivers `key: "1"`, not `key: "¡"`. So a matcher wrongly written against `event.key` would
pass the E2E suite and fail on Damian's actual keyboard. This is the second bug class in
this plan that E2E is structurally blind to (INV-1 is the first), and it is why W16 is a
Vitest criterion constructing the event by hand rather than an E2E one. `web-tests` owns it;
`e2e-specs` must not be assigned it.

### Matching

`matchShortcut` compares `event.code` against the table and requires all four modifier
booleans to match exactly. `event.code` is physical-key based and therefore immune to both
the ⌥ dead-key problem (edge case 1) and keyboard layout. Bare modifier keydowns
(`MetaLeft`, `AltLeft`, …) fire their own events and must fall through to `null`.

### Doc upkeep (orchestrator, not an impl track)

- `SPEC.md` §11 — a changelog entry for the rebind, noting that decision `cmd-n-ordering`
  Option A is *preserved* (only the chord moved) and that its recorded dissent is now
  discharged by ⌥⌘0. Amend the §11 2026-08-30 line's "follow-up in TODO.md" accordingly.
- `TODO.md` — tick the `⌘N collides with the browser` item (#5) and strike order-sidebar
  follow-up 1 ("consider a dedicated shortcut"), which this plan closes.
- `TODO.md` — order-sidebar follow-up 4 (the inaccurate `focusNth` doc comment) is fixed in
  passing by this plan's `main.ts` edit; tick it too.
- `spikes/FINDINGS.md` — a pointer to the new `S5-key-probe.md`.
