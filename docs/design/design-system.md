# Muster — design system

Chosen 2026-08-16: **direction A, "instrument"** (`docs/design/mockups/a-instrument.html`,
tiled view in `d-tiled.html`). B and C are kept as rejected alternatives, not live options.

This file is the concrete rule set `review-work` checks UI work against. Behaviour lives in
`docs/design/ux-flows.md`; `SPEC.md` stays authoritative for what the product does.

## 1. Tokens and themes

Rewritten 2026-09-02 (plan `new-ui-design-colors`, closes #3). Two layers:

1. **Semantic tokens** — the vocabulary below. A component rule may reference **only these
   names**. Never a hex, `rgb()`, `hsl()` or named colour in a component; if a needed colour
   isn't a token, add the token to *every* theme block first.
2. **Theme blocks** — one self-contained palette per theme, selected by
   `<html data-theme="…">`: `:root, :root[data-theme="instrument"]` (default), `[data-theme="dark"]`,
   `[data-theme="light"]`. **Adding a theme is adding one block** (plus its name in
   `web/src/theme.ts`'s registry) — never a component edit. Font stacks sit on a bare
   `:root`; they don't vary by theme.

The values live in the reference renders (`mockups/a-instrument.html`, `d-tiled.html` —
each has a theme switcher) and are transcribed verbatim into `web/src/style.css`. This file
defines the **roles**; it does not repeat the numbers.

| Token | Role |
|---|---|
| `--bg` | app background |
| `--bg-raised` | masthead, rail, tile chrome, dialogs |
| `--bg-hover` | hover + selected |
| `--well` | chrome recesses that follow the Muster theme: text inputs, previews, browse pane, empty placeholder, dead-session snapshot |
| `--line` | hairline rules between sections (decorative — exempt from the contrast bar) |
| `--line-control` | button borders, badge borders, drag/drop outline (exempt — the label identifies the control) |
| `--edge` | boundaries that must be seen on their own, ≥ 3:1: inputs, selects, textarea, the segmented-control track |
| `--fg` / `--fg-muted` / `--fg-dim` | primary / secondary / metadata-and-label text |
| `--amber` `--rose` `--violet` `--teal` `--idle` | state (§3): Needs-Input / Failed / Planning / Working / Idle — **fixed hue families in every theme** (amber 25–45°, rose 345–15°, violet 235–270°, teal 165–195°, idle ≤ 20% saturation); a theme tunes only lightness |
| `--amber-line` `--rose-line` `--violet-line` `--teal-line` | state border tints: badge borders, Blocked/Failed tile borders (exempt — redundant carriers; the word and position carry state) |
| `--amber-note` / `--rose-note` | the card note's copy (Needs-Input reason / Failed reason) |
| `--amber-fg` | text on an amber fill (the one filled primary per surface) |
| `--banner-bg` / `--banner-line` / `--banner-fg` | daemon-down banner (§6.7) — never `--rose` |
| `--danger` / `--danger-line` / `--danger-fg` | destructive actions (§3: rose is never delete) |
| `--disabled-fg` / `--disabled-line` / `--disabled-bg` | every `.btn:disabled` (§5) — exempt from the contrast bar (inactive components) |
| `--term-dark-bg`/`-fg`, `--term-light-bg`/`-fg` | the two terminal pairs every theme supplies |
| `--term` / `--term-fg` | **the live pane's ground/foreground — chosen by `<html data-claude-family>`, not by the theme** (see below) |
| `--scrim` / `--bg-raised-95` | modal backdrop and overlays / the dead-surface pill (translucent; exempt) |
| `--mono` / `--sans` / `--disp` | type — system stacks only |

`--green` (health dot) exists in the mockups only; it has no consumer in the app yet and is
added to `style.css` with its first real one.

**The terminal pair follows Claude Code, not Muster.** Claude Code draws its own TUI colours
for *its* theme (read from Claude Code's own global config by `internal/claudecode`, which alone knows the file and key), which Muster reads but never sets (§7.5 forbids
restyling pane contents). So `--term`/`--term-fg` resolve from `data-claude-family`:
`light` → the theme's light pair; `dark` or `unknown` → its dark pair — whichever Muster theme
is active. Chrome recesses use `--well` instead, so a light Claude never bleaches a dark
Muster's inputs.

**Themes shipped (v1):** **Instrument** — the 2026-08-16 direction-A palette, contrast-fixed
(the default); **Dark** — conventional web-style dark, neutral greys; **Light** — standard
light. Chosen in the Settings dialog (§5): *Follow Claude Code · Instrument · Dark · Light*.
*Follow* paints Light when Claude's family is light and Instrument otherwise, and keeps
following. The choice is `prefs.theme` (`docs/protocol.md` §3.3). Custom themes are
architecture only: a new block and a rebuild, not a loadable file.

**Contrast bar — WCAG AA on every theme, machine-gated** (`make contrast`, part of
`make check`; `web/scripts/contrast.mjs` + `contrast-pairs.json`). Tiered floors, raised
2026-09-03 (plan `ui-text-and-focus`, REQ-4, option A — the AA gate passed while the
metadata layer sat *at* the floor): `--fg-muted` ≥ 8:1, `--fg-dim` ≥ 7:1 on `--bg`,
`--bg-raised`, `--bg-hover` and `--well`; `--idle` and the four state hues (`--amber`
`--rose` `--violet` `--teal`) ≥ 6:1, and `--amber-note`/`--rose-note` ≥ 7:1, on
`--bg-raised` and `--bg-hover`; every other text pair keeps the prior ≥ 4.5:1 floor. ≥
3:1 for non-text UI that carries information alone: gauge fills on their track, `--edge`
on the surfaces it bounds, the amber focus ring, state dots and stripes on `--bg`. The
script also enforces the hue bands and "no literal outside a theme block". **Exempt
list** (each with its reason in the JSON): `--line` hairlines, `--line-control` button
borders, the four `--*-line` state tints, gauge tracks under a fill, disabled controls,
`--scrim`/`--bg-raised-95`. This is SPEC §3's one bounded accessibility exception;
nothing else in that non-goal moves.

**No web fonts, no CDN links, no vendored font binaries.** The dashboard is localhost-only
and the dep tree is deliberately small; a font request is a network dependency and a
supply-chain surface for nothing. Display differs from body by weight (700–800) and tight
tracking (`-.01em` to `-.03em`), not by family.

## 2. Type roles

Tokenised 2026-09-03 (plan `ui-text-and-focus`, REQ-6/REQ-7): a seven-step `--fs-*` ramp
in rem, anchored to `--fs-root` (15px, up from the previous unlinked 14px body / 16px
browser default). Sizes below are each role's token(s) with the resulting px at the 15px
root; a per-viewer text-size control (a `prefs.textSize` enum moving `--fs-root`) is a
post-release TODO — v1 ships the tokens, not the control.

| Role | Family | Size | Notes |
|---|---|---|---|
| Session title, brand, pane heading | `--disp` | `--fs-md`–`--fs-xl` (13.35–17.1px), 700–800 | tight tracking; tile header `--fs-md`, rail card `--fs-base` (15px), mainhead `--fs-lg`, brand `--fs-xl` |
| Body | `--sans` | `--fs-base` (15px) | |
| Buttons, segmented controls | `--mono` | `--fs-xs` (11.25px) | |
| **All metadata, gauges, timers, paths, state badges** | `--mono` | `--fs-2xs`–`--fs-sm` (10.2–12.3px) | this is what makes it read as an instrument |
| Terminal | `--mono` | 12.5px / 1.65 | xterm.js owns this; don't restyle pane contents — untouched by the `--fs-*` ramp (REQ-8) |
| Section headers | `--mono` | `--fs-2xs`–`--fs-xs` (10.2–11.25px), `letter-spacing:.12em`, uppercase | |

Every number that changes over time — timers, percentages, token counts, resets —
gets `font-variant-numeric: tabular-nums`. Non-negotiable: digits that shift width make a
dashboard twitch.

## 3. State colour is meaning, never decoration

| State | Token | Where it appears |
|---|---|---|
| Needs-Input | `--amber` | 3px card stripe, badge, timer, tile border |
| Failed | `--rose` | same |
| Planning | `--violet` | same |
| Working | `--teal` | same |
| Started | `--fg-muted` | same |
| Idle | `--idle` | same |

Rules:

- A state colour may **only** mean that state. Amber is never "highlight", teal is never
  "link", rose is never "delete" — destructive actions use the `--danger` family (§1),
  never `--rose`.
- Colour is never the only carrier: every state also has a **word** (the badge) and a
  **position** (sort order). A colour-blind read of the rail must still work.
- Exactly **one** primary action per surface may use a filled amber button. Everything else
  is a bordered ghost button.

## 4. The two views

Direction A has **two peer views**, not one view plus an extra. Both are first-class, both
are always reachable, and the switcher sits in the masthead beside the brand.

| | View | Answers | Reference |
|---|---|---|---|
| **Focus** | rail of attention-sorted cards + one live pane | *who needs me, and let me deal with them* | `mockups/a-instrument.html` |
| **Tiles** | grid of live tiles + snapshot strip | *show me several at once* | `mockups/d-tiled.html` |

What is identical across both, and must stay identical: the **masthead** (brand, switcher,
5-hour bar, 7-day bar, model-week (selectable), refresh, model, daemon health), the **state colours and badges**, the
**attention ordering**, and the **degraded states**. A user should never have to re-learn
anything when switching.

What differs is only how sessions are laid out:

- **Focus** — the rail is vertical, one session is live, the rest are snapshots.
- **Tiles** — the top N by attention are live tiles (filled by attention at entry and
  growth, then slot-stable and user-ordered by dragging — ux-flows §3.7); the rest become
  the horizontal **snapshot strip** along the bottom. The strip *is* the rail, laid on its side; it is not
  a lesser surface, and clicking a card there promotes that session.

### 4.1 Switching

- The switcher is a segmented control (`Focus` | `Tiles`), mono, `--fs-xs` (11.25px),
  sharing the button border treatment. The active segment takes `--bg-hover` and `--fg`.
- Keyboard: **⌘\\** toggles. `⌘1–9` keeps its meaning in both views — focus session *n*,
  which in Tiles means promote it to a live tile. *n* is the rail's displayed order
  (ux-flows §3.4/§3.8; decision `cmd-n-ordering`, 2026-08-30).
- The chosen view **persists across reloads and daemon restarts**. Coming back to a
  dashboard that silently changed layout is worse than either layout.

### 4.2 Switching moves geometry — it never duplicates it

This is the one rule that makes two views safe, and it is the same law as §7.1:

- A session is live on **exactly one surface at a time**. Switching Focus → Tiles moves
  ownership of each affected session's geometry from the pane to its tile, and back again
  on the way out.
- A view change therefore **resizes** real tmux windows. Debounce it (~100 ms), drive both
  `pty.Setsize` and `tmux resize-window`, and only touch sessions whose live surface
  actually changed.
- Sessions that are snapshots in both views are never resized at all.

## 5. Components

**Masthead** — brand, view switcher (`Focus` / `Tiles`), then right-aligned: 5-hour bar,
7-day bar, model-week (selectable), refresh, model, daemon health. Always visible in both views; account-level truth is never
behind a tab.

**Rail card** — 3px state stripe, then title + badge + timer, `repo / branch`, then the
context row (gauge, %, absolute tokens, compaction count), then either a **note** (amber
left-border, for the reason it needs you) or a **snapshot** (mono, `--well` ground, clipped).
The card whose session the Focus pane is currently showing carries **`current`**
(plan `ui-text-and-focus`, REQ-1/REQ-2) — `--bg-hover` ground, a 1px inset `--edge` ring, its
action row shown unconditionally (same reveal as hover/focus-within) — a neutral treatment,
no state colour, since state colours are already spoken for (§3). The strip (Tiles' snapshot
copy of the rail card) never carries it — nothing in Tiles is "the session the Focus pane
shows". The rail card's title is plain text, not a rename trigger — renaming happens from
the Focus mainhead's heading or a tile's header in Tiles (REQ-13), one shared editor for
both.

**Tile** (tiled view) — header (state dot, title, where, context, timer), terminal body on
`--term`, footer stating `live` or `stopped` plus the tile's geometry. Blocked and failed
tiles take a coloured border (`--amber-line` / `--rose-line`); nothing else does. The header
is the tile's **drag handle** (`cursor: grab`; the terminal body never starts a drag); while
dragging, the source tile dims (`.dragging`) and the tile under the pointer takes a 1px inset
`--line-control` outline (`.drop-target`) — neutral tokens only, never a state colour (§3).
The state dot carries a `title` with the state word so a hover explains the colour. The
header's title is also a **rename trigger** (plan `ui-text-and-focus`, REQ-13, the same
editor the Focus mainhead uses): a click-and-release opens it, a click-and-drag still
reorders the grid; while an edit is open that header is `draggable="false"` so typing never
starts a drag.

**Buttons** — mono, `--fs-xs` (11.25px), 1px `--line-control` border, transparent ground. Filled amber
(`--amber` ground, `--amber-fg` text) for the single primary action. No border-radius above
2px anywhere in the app. **Disabled** (`.btn:disabled`, any variant): `--disabled-fg` /
`--disabled-line` / `--disabled-bg`, weight 400, `cursor: not-allowed`, and no hover change
(every `.btn` hover rule is `:hover:not(:disabled)`). **Ghost danger** (`.btn.danger`, e.g.
Remove) fills on hover — `--danger` ground, `--danger-fg` text — rather than colouring its
text, because no dark palette can hold both "white on `--danger`" and "`--danger` on
`--bg-raised`" at 4.5:1 with one token (decided 2026-09-02).

**Modal** — `--bg-raised` on the `--scrim` backdrop, 1px `--line-control` border, header
rule, footer rule. The launch dialog is 720px wide (its picker panes scroll internally);
confirm dialogs are 440px; the issue dialog is 560px, capped at 80vh (its preview scrolls
internally); the **Settings** dialog is 440px and holds, in v1, only the theme picker (a
segmented control of four radios — Follow Claude Code · Instrument · Dark · Light — applied
on change, no Save) plus a one-line hint and a Close button. Reference: the Settings modal
in `mockups/a-instrument.html`.

**Form fields** — text inputs, selects and textareas sit on `--well` with a 1px `--edge`
border (≥ 3:1 on the surface they sit on — nothing else marks a field's extent).

**Segmented control** — mono, `--fs-xs` (11.25px), 1px `--edge` track border; native radio inputs
visually hidden inside their labels, the checked segment taking `--bg-hover` ground and
`--fg` text, focus-visible an amber 1px inset outline. Used by the Focus/Tiles view switcher,
the launch form's Model and Start-in rows, and the Settings dialog's theme picker.

**Gauge thresholds** — a masthead usage bar takes `warn` and a context track takes `hot`
at **≥ 60% used** (settled by m3-gauges planning, 2026-08-23 — the mockups' 61%-warn /
23%-plain examples made concrete).

## 6. Honesty rules — these are correctness, not taste

`review-work` treats a violation of any of these as a **Critical** finding, because each one
makes the UI assert something Muster does not know.

1. **Never render an empty gauge for unknown data.** Before a session's first API response
   `rate_limits` is an absent key and the context fields are `null`. Draw **no track at
   all** and write the word *unknown*. A 0%-filled track reads as "0% used".
2. **Never show a bare context percentage.** Always pair it with absolute tokens
   (`context_window_size` varies by model) and the compaction count (the gauge reads 0%
   after `/compact`).
3. **Never present `permission_mode` as authoritative.** Label it *last known*. Shift+Tab
   changes fire no hook and no status-line update.
4. **Never switch on `StopFailure.error` as an enum.** It is not pass-through from the API —
   an injected 400 surfaced as `"unknown"`. Show the raw value plus a human sentence.
5. **Never show "Done".** A turn ended; the task may not have. `Idle` plus last activity.
6. **Never show cost or spend.** Cut by design (SPEC §3).
7. **Surface daemon-down loudly.** While it is down every managed pane fills with hook-error
   lines; the UI must explain that noise or it reads as sessions failing. The banner grounds
   on the dedicated `--banner-*` tokens (§1), never on `--rose` — per §3 a state colour may
   only ever mean its state, and the banner is about the daemon, not a session.
8. **Stale is labelled, not hidden.** Hook delivery is lossy and unordered; when state may be
   stale, show its age rather than implying freshness.

## 7. Terminal rules — these are correctness too

1. **One live client per session.** A session may be live in the focused pane *or* in a
   tile, never both. Rail cards and snapshot strips render static snapshots.
2. **The live surface owns the geometry.** Focusing moves ownership; it never duplicates it.
   Debounce resizes ~100 ms.
3. **Drive both `pty.Setsize` and `tmux resize-window`, in that order.** `resize-pane` exits
   0 and silently no-ops on a single-pane window.
4. **`scrollback: 0` in xterm.js.** tmux owns scrollback.
5. **Never restyle pane contents.** Claude Code draws its own TUI; the dashboard supplies the
   frame and nothing inside it. The one thing the frame *does* match is the **ground**:
   `--term`/`--term-fg` follow Claude Code's own theme family (§1), in every Muster theme,
   because a dark TUI drawn on a light ground (or the reverse) is unreadable and Muster
   cannot change what Claude draws. A theme switch re-themes live xterm instances in place
   (`term.options.theme`); it never recreates them.

## 8. Deferred, with the slot kept dark

- **Attention ribbon** (60-minute state timeline) — designed, deferred post-v1
  (2026-08-16). It needs a rolling state-history query and a timeline renderer for a signal
  the rail's time-in-state largely already carries. The `event` table stores what it would
  need, so it costs no schema change later. Visible in `a-instrument.html` behind the
  "Ribbon (deferred)" demo toggle.
**Not deferred, only sequenced:** the tiled view is part of the design (§4), not an
extra. It simply cannot be *built* before the PTY bridge, so M1 ships the Focus view and
the switcher arrives with M2. The masthead must be laid out from M1 as though the switcher
is there, so adding it moves nothing.
