# Muster — design system

Chosen 2026-08-16: **direction A, "instrument"** (`docs/design/mockups/a-instrument.html`,
tiled view in `d-tiled.html`). B and C are kept as rejected alternatives, not live options.

This file is the concrete rule set `review-work` checks UI work against. Behaviour lives in
`docs/design/ux-flows.md`; `SPEC.md` stays authoritative for what the product does.

## 1. Tokens

Declare these once as CSS custom properties on `:root`. **Never hard-code a hex value in a
component** — if a needed colour isn't here, add it here first.

```css
:root{
  /* surfaces, back to front */
  --ink:#12141C;      /* app background */
  --panel:#171A24;    /* masthead, rail, tile chrome */
  --panel2:#1C2029;   /* hover + selected */
  --term:#0D0F16;     /* terminal ground — darker than the app, always */
  --line:#282D3B;     /* hairline rules */
  --line2:#343A4A;    /* control borders */

  /* text */
  --paper:#E8E6E1;    /* primary */
  --muted:#8A90A3;    /* secondary */
  --dim:#565C6D;      /* metadata, labels */

  /* state — see §3; these are the ONLY meanings these colours carry */
  --amber:#F2A33C;    /* Needs-Input */
  --rose:#E36A6A;     /* Failed */
  --violet:#9A8CF0;   /* Planning */
  --teal:#56C5D0;     /* Working */
  --idle:#5A6070;     /* Idle */
  --green:#7BC47F;    /* health ok, tool success */

  /* daemon-down banner (§6.7) — a muted rose-family treatment of its own, because the
     banner describes the daemon, not any session's Failed state; --rose stays reserved
     for Failed (§3). Values from the reference render (a-instrument.html, .down). */
  --banner-bg:#3A1E1E;
  --banner-line:#5A2C2C;
  --banner-fg:#F3B7B7;

  /* destructive actions (Remove hover, the filled Remove confirm button) — their own
     family, because --rose means Failed and nothing else (§3: "rose is never delete").
     Deliberately a deeper, duller red than --rose so the two read as different things
     when a Failed card sits beside a Remove button. Decided 2026-08-26 (m4-reconcile
     review, cycle 1 Major 10 → option A). */
  --danger:#C94F4F;
  --danger-line:#7A3535;
  --danger-fg:#FFFFFF;

  /* type — system stacks only; nothing vendored, nothing fetched (decided 2026-08-16) */
  --mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,'Segoe UI',sans-serif;
  --disp:system-ui,-apple-system,'Segoe UI',sans-serif;
}
```

**No web fonts, no CDN links, no vendored font binaries.** The dashboard is localhost-only
and the dep tree is deliberately small; a font request is a network dependency and a
supply-chain surface for nothing. Display differs from body by weight (700–800) and tight
tracking (`-.01em` to `-.03em`), not by family.

## 2. Type roles

| Role | Family | Size | Notes |
|---|---|---|---|
| Session title, brand, pane heading | `--disp` | 13.5–19px, 700–800 | tight tracking |
| Body / buttons | `--sans` | 14px | |
| **All metadata, gauges, timers, paths, state badges** | `--mono` | 9–11.5px | this is what makes it read as an instrument |
| Terminal | `--mono` | 12.5px / 1.65 | xterm.js owns this; don't restyle pane contents |
| Section headers | `--mono` | 9.5–10.5px, `letter-spacing:.12em`, uppercase | |

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
| Started | `--muted` | same |
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
5-hour bar, 7-day bar, model, daemon health), the **state colours and badges**, the
**attention ordering**, and the **degraded states**. A user should never have to re-learn
anything when switching.

What differs is only how sessions are laid out:

- **Focus** — the rail is vertical, one session is live, the rest are snapshots.
- **Tiles** — the top N by attention are live tiles (filled by attention at entry and
  growth, then slot-stable and user-ordered by dragging — ux-flows §3.7); the rest become
  the horizontal **snapshot strip** along the bottom. The strip *is* the rail, laid on its side; it is not
  a lesser surface, and clicking a card there promotes that session.

### 4.1 Switching

- The switcher is a segmented control (`Focus` | `Tiles`), mono, 10.5px, sharing the
  button border treatment. The active segment takes `--panel2` and `--paper`.
- Keyboard: **⌘\\** toggles. `⌘1–9` keeps its meaning in both views — focus session *n*,
  which in Tiles means promote it to a live tile.
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
7-day bar, model, daemon health. Always visible in both views; account-level truth is never
behind a tab.

**Rail card** — 3px state stripe, then title + badge + timer, `repo / branch`, then the
context row (gauge, %, absolute tokens, compaction count), then either a **note** (amber
left-border, for the reason it needs you) or a **snapshot** (mono, `--term` ground, clipped).

**Tile** (tiled view) — header (state dot, title, where, context, timer), terminal body on
`--term`, footer stating `live` or `stopped` plus the tile's geometry. Blocked and failed
tiles take a coloured border; nothing else does. The header is the tile's **drag handle**
(`cursor: grab`; the terminal body never starts a drag); while dragging, the source tile
dims (`.dragging`) and the tile under the pointer takes a 1px inset `--line2` outline
(`.drop-target`) — neutral tokens only, never a state colour (§3). The state dot carries
a `title` with the state word so a hover explains the colour.

**Buttons** — mono, 10.5px, 1px `--line2` border, transparent ground. Filled amber for the
single primary action. No border-radius above 2px anywhere in the app.

**Modal** — `--panel` on a 72%-opaque scrim, 1px `--line2` border, header rule, footer rule.

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
   frame and nothing inside it.

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
