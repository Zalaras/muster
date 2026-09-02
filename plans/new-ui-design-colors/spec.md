# Spec: Theme tokens, light/dark pair, contrast pass

**Plan**: new-ui-design-colors
**Created**: 2026-09-02
**Status**: Draft
**Closes**: [#3](https://github.com/Zalaras/muster/issues/3) (and absorbs the M5+ "app-wide
`.btn:disabled` affordance pass" TODO entry)

## Goal

Give the dashboard a real theme architecture: a semantic token layer that components
reference, with each theme a self-contained block of palette values, so a new theme is a new
block and never a component edit. Ship three built-in themes in v1 — **Instrument** (the
current palette, contrast-fixed, the default), a **conventional web-style dark**, and a
**standard light** — chosen from a small Settings dialog and persisted through the daemon.

The driver is the theme system itself; the contrast pass rides along. Instrument fails WCAG
AA on its smallest text today (`--dim` at 2.6:1 and the Idle badge at 2.8:1 on `--panel`,
measured 2026-09-02), and fixing that properly means fixing it in the token layer, not with a
one-off shade. Damian will use a dark theme day to day; the light theme ships regardless
because a v1 with a token system and no light palette is an architecture without proof.

This is **theming, not white labelling**. White labelling rebrands a product for a third
party (name, logo, domain). Muster is single-user and personal (SPEC §3); the same Muster
gets swappable palettes, nothing more.

## Background & Context

- **Design system** — `docs/design/design-system.md` §1 declares one flat dark palette as
  CSS custom properties on `:root` and forbids hex literals in components. That rule has
  held: `web/src/style.css` has zero colour literals outside `:root` (three hoisted
  `rgba()` values included). The gap is therefore not "move to tokens" but "one palette, no
  semantic layer, no switch". §3 ("state colour is meaning, never decoration") and §6
  (honesty rules) carry over unchanged.
- **Direction A "instrument"** was chosen 2026-08-16 (SPEC §11, `ux-flows.md` §appendix).
  The rejected direction B "warm light" was a different *layout* direction. A light palette
  on direction A's structure does not re-litigate that decision.
- **SPEC §3 lists accessibility as a v1 non-goal.** This spec makes one bounded, deliberate
  exception: an AA contrast bar on the dashboard's own chrome. It does not widen into
  screen-reader, keyboard-audit or i18n work.
- **Terminal pane** — `web/src/terminal/pane.ts` reads `--term` / `--paper` via `cssVar()`
  once at construction for the xterm theme, so a theme switch must re-theme live panes, not
  only the chrome. Design-system §7.5 forbids restyling pane *contents*; Claude Code draws
  its own TUI colours from its own theme setting, which Muster cannot set.
- **Claude Code's theme setting** lives in the global config `~/.claude.json` under a
  `theme` key — `dark`, `light`, `dark-daltonized`, `light-daltonized`, `dark-ansi`,
  `light-ansi`; absent means the default, dark. It is **not on the wire**: no hook payload,
  status-line field or capture in `spikes/` carries it (checked 2026-09-02), so the daemon
  must read the file. `claude config get` no longer exists in the installed version (a bare
  `claude config …` runs as a prompt). That file also holds account data, so any read is
  bounded to the one key. Changing the theme via `/config` fires no event → poll.
- **Prefs path** — `PUT /api/prefs` → kv → `prefs` broadcast already carries `view`,
  `density`, `usageModel`, `railSort` (`docs/protocol.md` §3.3, §5). A `theme` pref is a
  protocol delta the plan must write down.
- **Disabled buttons** — no `.btn:disabled` anywhere has a visual disabled state
  (issue-capture review cycle 1 Minor 5, measured pixel-identical). Settled Option B in
  `plans/issue-capture/decisions/disabled-button-affordance/decision.md`: one app-wide token
  pass. Folded in here because it is the same layer.
- **Mockups** — `docs/design/mockups/a-instrument.html` and `d-tiled.html` are the
  reference renders the stylesheet was built from and that `review-work` checks against.

## Scope

**In Scope:**

- A two-layer token architecture in `web/src/style.css`: semantic tokens that components
  reference; per-theme blocks that assign palette values to them. Adding a theme = adding a
  block.
- Three built-in themes: **Instrument** (current palette, contrast-fixed; default),
  **Dark** (conventional web-style dark — neutral dark greys in the GitHub/editor sense, not
  a terminal-emulator palette), **Light** (standard light).
- AA contrast pass across all three themes, gated by script.
- App-wide `.btn:disabled` affordance via dedicated disabled-state tokens.
- A **basic Settings dialog** off the masthead holding the theme picker (Follow Claude Code
  / Instrument / Dark / Light) and nothing else for now.
- `theme` pref via the existing prefs path (protocol delta).
- Daemon poll of the `theme` key in `~/.claude.json`, broadcast as a family
  (`light` / `dark` / `unknown`), knowledge confined to `internal/claudecode`.
- Terminal ground/foreground driven by Claude's family.
- Mockups re-rendered under all three themes (planning deliverable); design-system §1
  rewritten for the architecture.

**Out of Scope:**

- User-loadable theme files, a theme file format, or an in-app theme editor. Custom themes
  are *architecture only* in v1: a new theme is a source block and a rebuild.
- Restyling anything Claude Code draws inside the pane (§7.5), or setting Claude Code's
  theme for it.
- Moving existing controls (density, rail sort, usage model) into the Settings dialog.
- Any accessibility work beyond the contrast bar (SPEC §3 non-goal stands otherwise).
- Cut features (notifications, cost tracking, containers, resource gauges) — untouched.

## Requirements

**Tokens and themes**

1. Components reference semantic tokens only; design-system §1's "never hard-code a hex in a
   component" rule stays and extends to `rgba()`/`hsl()` literals. Each theme is one
   self-contained block of palette values; adding a theme touches no component.
2. Three built-in themes as scoped above. Instrument is the default and is the current
   palette with only the shades that fail contrast adjusted.
3. **AA everywhere**: ≥ 4.5:1 for all text (including the 9–11.5px mono metadata layer),
   ≥ 3:1 for non-text UI (control borders, state stripes, gauge fills, focus rings, the
   state dot). Purely decorative hairline dividers (`--line` between sections) are exempt
   per WCAG's decorative-element rule and named on an explicit exempt list. Verified by a
   script over every theme's token pairs, wired into `make check`.
4. **Fixed hue families, per-theme lightness**: Needs-Input is always amber, Failed rose,
   Planning violet, Working teal, Idle grey; each theme tunes only the shade for contrast
   against its own surfaces. §3's meaning rules (rose is never delete, amber never
   highlight, `--danger` family for destructive) carry over to every theme.
5. Dedicated disabled-state tokens applied to every `.btn:disabled` in the app (masthead
   End/Resume/Remove, tile footers, dead surface, issue submit, confirm dialogs), with
   `cursor: not-allowed`. Disabled controls are exempt from the contrast bar (WCAG's own
   inactive-component exemption).

**Switching and persistence**

6. A Settings dialog opened from the masthead. Contents in v1: the theme picker with exactly
   four options — **Follow Claude Code**, **Instrument**, **Dark**, **Light**.
7. The `theme` pref is **unset until the user picks**. While unset the dashboard follows
   Claude's family: light-family → Light; dark-family or unknown → Instrument. Because
   nothing is recorded, it keeps following if Claude's theme changes later. Picking a named
   theme records it and stops following. Picking Follow Claude Code clears the pref.
8. Persistence rides the existing prefs path (`PUT /api/prefs` → kv → `prefs` broadcast), so
   the choice survives page reload and daemon restart.
9. Switching applies instantly with no reload, including re-theming live xterm panes.
10. No flash of the wrong theme on load: prefs arrive over the WebSocket after connect, so
    the dashboard keeps a browser-side cached hint of the last painted theme and paints it
    before first frame. The daemon's prefs remain the authority; the hint is only a
    first-paint guess.

**Claude theme poll**

11. The daemon reads **only the `theme` key** of `~/.claude.json`, read-only, on a modest
    poll (planner picks the interval; ~10 s is the suggested default), and broadcasts the
    family. Everything about that file's location, shape and value set lives in
    `internal/claudecode` and nowhere else (CLAUDE.md hard rule). It is never written.
12. The terminal pane's ground and foreground **always** follow Claude's family —
    light-family → light ground, dark-family or unknown → dark ground — regardless of which
    Muster theme is active. Each theme therefore supplies both a light and a dark terminal
    pair.

**Design documentation**

13. During planning, `docs/design/mockups/a-instrument.html` and `d-tiled.html` gain a theme
    switcher and render all three palettes, so approving the plan means seeing every theme on
    both views before implementation starts. The palettes are authored in the mockups first;
    the stylesheet follows the mockup (the same order the original direction was built in).
14. Design-system §1 is rewritten to describe the token architecture, the theme list, the
    contrast bar and exempt list, and the Claude-family rule for the terminal ground.
    `review-work`'s checklist follows.

## Edge Cases & Considerations

1. **`~/.claude.json` missing, unreadable or malformed** → family `unknown`. Unknown behaves
   as dark everywhere (dark terminal ground; unset theme shows Instrument). No error
   surface, no per-poll log line.
2. **`theme` key absent** → Claude's default → family `dark`, not `unknown`, so the two stay
   distinguishable in the broadcast.
3. **Unrecognised value** (a future theme name) → match on the `light` / `dark` prefix; no
   match → `unknown`.
4. **Daemon down** → the dashboard keeps the last theme it painted; never reverts to a
   default mid-session because the WebSocket dropped.
5. **Stored pref names a theme that no longer exists** (renamed in a later version) → treat
   as unset, log once.
6. **Claude's theme changes while a Muster override is set** → only the terminal ground
   changes; the chrome stays as the user chose.
7. **Fresh browser profile: no cached hint, no WebSocket yet** → paint Instrument, re-theme
   on the first prefs message. This is the one permitted flash.
8. **Hooks are irrelevant here** — nothing in this feature derives from hook delivery, so
   there is no loss story to design; the poll is the only external input and it is
   idempotent.

## Acceptance Criteria

**Themes and contrast**
- [ ] A contrast script over every theme's token pairs reports zero failures at 4.5:1 (text)
      and 3:1 (non-text UI), with an explicit exempt list for decorative hairlines, and runs
      under `make check`.
- [ ] `web/src/style.css` contains no colour literal outside the theme blocks. Adding a
      fourth theme block in a test makes it selectable with no other file changed.
- [ ] In every theme, Needs-Input reads amber, Failed rose, Planning violet, Working teal on
      the rail, tiles, badges and stripes.
- [ ] Every `.btn:disabled` in the app is visually distinct from its enabled state (measured
      by computed style) and shows `cursor: not-allowed`.

**Switching and persistence**
- [ ] The Settings dialog opens from the masthead and offers exactly Follow Claude Code,
      Instrument, Dark, Light.
- [ ] Picking a theme re-themes the chrome and any live xterm pane without a reload, and the
      choice survives a page reload and a daemon restart.
- [ ] With no theme pref recorded, the dashboard shows Instrument when the Claude family is
      dark or unknown and Light when it is light. Picking Follow Claude Code after an
      override returns to that behaviour and clears the stored pref.
- [ ] On reload with a cached hint, the first painted frame is already the correct theme.

**Claude theme poll**
- [ ] Changing the `theme` key in a scratch config file flips the broadcast family within
      one poll interval, and the terminal ground follows on every live pane.
- [ ] A missing file, malformed JSON, absent key and unknown value each produce the
      documented family with no error surface and no per-poll log line.
- [ ] The daemon reads no other key from that file, asserted by the unit test's fixture.
      No test touches the real `~/.claude.json`.

**Design docs**
- [ ] Both mockups render all three themes behind a switcher, delivered with the plan for
      approval, and design-system §1 describes the token architecture rather than a single
      palette.

## References

- GitHub issue [#3](https://github.com/Zalaras/muster/issues/3) "Improve UX/UI"
- `TODO.md` — "Contrast pass + design tokens (#3)" and M5+ "App-wide `.btn:disabled`
  affordance pass" (folded in)
- `docs/design/design-system.md` §1, §3, §5, §6.7, §7.5
- `docs/design/mockups/a-instrument.html`, `d-tiled.html`
- `docs/protocol.md` §3.3 (prefs), §5 (`prefs` broadcast)
- `plans/issue-capture/decisions/disabled-button-affordance/decision.md` (Option B)
- `web/src/terminal/pane.ts` (`cssVar` xterm theme read)
- SPEC §3 (non-goals: accessibility, cost), §11 changelog 2026-08-16 (direction A)
- Contrast measurements 2026-09-02 (this interview): `--dim` 2.60:1, `--idle` 2.76:1,
  `--muted` 5.46:1, `--paper` 13.92:1 on `--panel`; white on `--danger` 4.45:1;
  `--line2` on `--panel` 1.53:1.
