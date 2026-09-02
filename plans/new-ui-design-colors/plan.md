# Plan: new-ui-design-colors

**Created**: 2026-09-02
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Closes**: #3 (and absorbs the M5+ "app-wide `.btn:disabled` affordance pass" TODO item)
**Description**: A two-layer theme-token architecture with three built-in themes (Instrument,
Dark, Light), an AA contrast gate under `make check`, a Settings dialog with a persisted `theme`
pref, a daemon poll of Claude Code's theme family that drives the terminal ground, and the
app-wide disabled-button affordance.

## Overview

Spec: `plans/new-ui-design-colors/spec.md` (interview 2026-09-02). This plan turns it into
contracts the pipeline can build against. The **mockups are the design authority**:
`docs/design/mockups/a-instrument.html` and `d-tiled.html` were re-cut during planning onto
the new token vocabulary with all three palettes behind a theme switcher, a Claude-family
toggle, the Settings dialog and disabled buttons. `web/src/style.css` transcribes the
mockups' theme blocks verbatim — the palette values are settled there, not re-derived by an
agent.

Four decisions taken in planning (Damian, 2026-09-02) that the spec left open:

1. **Control borders split.** `.btn` borders stay on `--line-control` (1.5:1) under WCAG
   1.4.11's allowance that a button whose label meets 4.5:1 needs no contrasting boundary,
   and go on the exempt list. Text inputs, selects, textareas and the segmented-control
   track get a new 3:1 token `--edge`, because nothing else identifies a field's extent.
2. **State border tints exempt.** `--amber-line` / `--rose-line` / `--violet-line` /
   `--teal-line` (badge borders, Blocked/Failed tile borders) are redundant carriers —
   design-system §3 already requires the badge word and position to carry state — and are
   listed as exempt with that rationale.
3. **Surface and text tokens renamed to role names.** `--bg`, `--bg-raised`, `--bg-hover`,
   `--well`, `--fg`, `--fg-muted`, `--fg-dim`, `--line-control`, `--edge`. State tokens keep
   their fixed hue names (`--amber` …) because the hue *is* the semantic. Full map below.
4. **`theme` pref is an enum with a `"follow"` default**, not a nullable — same shape as
   `view`/`density`/`railSort`, and it keeps protocol §1's "null means unknown" rule intact.

One thing the spec did not foresee: today `--term` grounds both the live pane *and* chrome
recesses (text inputs, the issue preview, the browse pane, the empty placeholder, dead
snapshots). If `--term` follows Claude's family, a light Claude with a dark Muster theme would
flip the input fields light. The pane ground therefore splits from a new `--well` token for
chrome recesses that follows the Muster theme. Same value in Instrument today; no visual change.

## Requirements

### Must Have

**Tokens and themes**

- [ ] REQ-1: `web/src/style.css` is restructured into two layers. Layer 1 — semantic tokens,
      the only names any rule below the token section may reference. Layer 2 — one
      self-contained palette block per theme: `:root, :root[data-theme="instrument"]` (the
      default), `:root[data-theme="dark"]`, `:root[data-theme="light"]`. The font stacks stay
      on a bare `:root` (theme-independent). A fifth block pair selects the terminal pair:
      `:root { --term: var(--term-dark-bg); --term-fg: var(--term-dark-fg) }` and
      `:root[data-claude-family="light"] { --term: var(--term-light-bg); --term-fg: var(--term-light-fg) }`.
      No colour literal (hex, `rgb()`/`rgba()`, `hsl()`, named colour) appears anywhere in
      the file outside those blocks. Adding a theme = one new `[data-theme]` block plus one
      entry in the web theme registry (REQ-7); no component rule changes.
- [ ] REQ-2: Three palettes, transcribed verbatim from the mockups' blocks (they are the
      authority; the values are also tabulated under Implementation Notes → Palettes).
      Instrument is the current palette with only the shades that failed AA adjusted
      (`--fg-dim`, `--fg-muted` nudged, `--idle`, `--danger`) plus the new tokens.
- [ ] REQ-3: Token rename applied across `web/src/style.css`, `web/src/terminal/pane.ts` and
      anything else in `web/` that names a token (map under Implementation Notes → Rename).
      No old name survives anywhere under `web/`.
- [ ] REQ-4: A contrast gate — `web/scripts/contrast.mjs` (Node, zero dependencies) driven
      by `web/scripts/contrast-pairs.json`. It parses every `[data-theme]` block out of
      `style.css`, evaluates every listed `{fg, bg, min}` pair per theme with the WCAG 2.x
      relative-luminance formula, verifies every hue-family token sits inside its hue band,
      verifies no colour literal exists outside the theme blocks (REQ-1's rule, machine
      checked), prints each failure as `<theme> <fg> on <bg> <ratio> (min <n>)`, and exits
      non-zero on any failure. `npm run contrast` runs it; `make contrast` wraps that;
      `make check` becomes `lint test contrast`.
- [ ] REQ-5: **AA everywhere** on the pair list: ≥ 4.5:1 for every text pair, ≥ 3:1 for every
      non-text pair (gauge fills on their track, `--edge` on the surfaces it bounds, the
      amber focus ring on `--bg-raised`, state dots/stripes on `--bg`). The exempt list — in
      the same JSON, each entry carrying a `reason` — is exactly: `--line` hairlines
      (decorative), `--line-control` button borders (label identifies the control),
      `--amber-line`/`--rose-line`/`--violet-line`/`--teal-line` (redundant state carriers),
      gauge tracks (`--line` under a fill; the fill carries the value), disabled controls
      (WCAG's inactive-component exemption), `--scrim`/`--bg-raised-95` (translucent
      overlays, never a text ground on their own).
- [ ] REQ-6: **Fixed hue families.** In every theme `--amber` sits in hue 25–45°, `--rose` in
      345–15° (wrapping), `--violet` in 235–270°, `--teal` in 165–195°, `--idle` has
      saturation ≤ 20%. Enforced by the script (REQ-4). Design-system §3's meaning rules
      carry over unchanged: `--rose` is never delete, `--amber` never highlight, the
      `--danger` family for destructive actions.
- [ ] REQ-7: A web theme registry, `web/src/theme.ts`, exporting `THEMES = ["instrument",
      "dark", "light"] as const`, `type ThemeName`, `type ThemeChoice = "follow" | ThemeName`,
      `type ClaudeFamily = "light" | "dark" | "unknown"`, and the pure resolver
      `resolveTheme(choice: string, family: ClaudeFamily): ThemeName` — a known name wins;
      `"follow"` or any unknown string resolves by family: `"light"` → `"light"`, `"dark"` or
      `"unknown"` → `"instrument"`. Plus `readThemeHint()`/`writeThemeHint()` for REQ-11.

**Disabled affordance**

- [ ] REQ-8: Three tokens per theme — `--disabled-fg`, `--disabled-line`, `--disabled-bg` —
      and one rule set: `.btn:disabled` (covering `.btn.key:disabled`,
      `.btn.key-danger:disabled`, `.btn.danger:disabled`, `.btn.sm:disabled`) takes those
      three, `font-weight: 400`, and `cursor: not-allowed`. Every `.btn` hover rule becomes
      `:hover:not(:disabled)` so a disabled button never changes on hover. Covers every
      disabled site in the app today: masthead End/Resume/Remove (`render/mainhead.ts`),
      card action rows (`render/sessions.ts`), tile footers (`render/tiles.ts`), the dead
      surface's Resume (`render/dead.ts`), the issue dialog's submit and the Issue button
      itself (`render/issue.ts`).

**Switching and persistence**

- [ ] REQ-9: A **Settings** button in the masthead (`#settings-button`, class `btn`, text
      `Settings`, placed immediately after `#issue-button`) opens `#settings-dialog`, a
      `<dialog class="modal confirm">` (440px) titled `Settings` whose only content in v1 is
      the theme picker: a `fieldset.seg` with legend `Theme` and a `.seg-track` of four
      radios named `theme`, values and labels in this order — `follow` "Follow Claude Code",
      `instrument` "Instrument", `dark` "Dark", `light` "Light" — a hint paragraph (text
      under UI Specifications), and a footer with one `Close` button. Changing the radio
      fires `PUT /api/prefs {"theme": <value>}` immediately; there is no Save. The checked
      radio always reflects the daemon's last `prefs` broadcast, never local optimistic
      state (INV-7).
- [ ] REQ-10: `prefs.theme` rides the existing prefs path: validated and defaulted by the
      daemon, persisted in the kv `prefs` blob, echoed in the `prefs` broadcast and in every
      `snapshot`. Survives reload and daemon restart by construction.
- [ ] REQ-11: **No wrong-theme first frame.** `web/index.html` carries a plain inline
      `<script>` in `<head>`, *before* the stylesheet link, that reads
      `localStorage["muster.theme-hint"]` (JSON `{"theme": ThemeName, "family": ClaudeFamily}`)
      inside try/catch and sets `document.documentElement.dataset.theme` and
      `.dataset.claudeFamily` from it. `main.ts` rewrites the hint every time it applies a
      theme or family. The daemon's prefs remain authoritative: the first `snapshot` may
      repaint. With no hint (fresh profile) the page paints Instrument — the one permitted
      flash.
- [ ] REQ-12: **Instant apply, including live panes.** `main.ts` sets `data-theme` (from
      `resolveTheme`) and `data-claude-family` on `<html>` on every `snapshot`, `prefs` and
      `claudeTheme` message, then calls `applyTheme()` on every live `TerminalSurface`.
      `TerminalSurface.applyTheme()` re-reads `--term`/`--term-fg` via `cssVar` and assigns
      `term.options.theme = { background, foreground }`. Never called from the 1 s render
      tick — only on those three messages.

**Claude theme poll**

- [ ] REQ-13: `internal/claudecode/theme.go` owns everything about Claude Code's global
      config file: `DefaultConfigPath() (string, error)` (the user's home directory joined
      with the file's name), `type ThemeFamily string` with `ThemeLight`, `ThemeDark`,
      `ThemeUnknown`, and `ReadThemeFamily(path string) ThemeFamily`. It reads the file,
      decodes into a struct with the single field `Theme *string` tagged with the file's key
      name (every other key is structurally ignored), and maps: file missing, unreadable, not
      JSON, or the value not a string → `ThemeUnknown`; key absent → `ThemeDark` (Claude's
      default); value with prefix `light` → `ThemeLight`; prefix `dark` → `ThemeDark`;
      anything else → `ThemeUnknown`. Read-only: the package never opens that path for
      writing. The file's name and key appear nowhere outside `internal/claudecode/`.
- [ ] REQ-14: `internal/server/themepoll.go` — a poller modelled on `usagepoll.go`:
      immediate first tick on `Start()`, then a ticker at `Config.ClaudeThemePoll`; holds the
      current family under a mutex (`Current()` for snapshots); broadcasts `claudeTheme` only
      when the family changed since the previous tick; one `Debug` log line per *change*,
      none per tick. A tick whose read yields `ThemeUnknown` after a previous tick was
      known retries once after 250 ms before adopting `unknown` (torn-write guard — Claude
      Code rewrites this file itself). `Stop(ctx)` mirrors the usage poller. Flags in
      `cmd/musterd/main.go`: `-claude-theme-poll` (duration, default `10s`; `0` disables —
      no goroutine, family is `unknown` forever) and `-claude-config-file` (path, default
      `claudecode.DefaultConfigPath()`; a test seam like `-usage-token-file`).
- [ ] REQ-15: `snapshot` and `GET /api/state` carry `claudeTheme: {"family": …}` (always
      present; `"unknown"` while polling is disabled or nothing has been read). The
      terminal pair follows this family in every theme (REQ-1's selector block + REQ-12).

**Design documentation**

- [x] REQ-16: Both mockups render all three palettes behind a theme switcher with a
      Claude-family toggle, the Settings dialog and disabled buttons — **done during
      planning, 2026-09-02** (`a-instrument.html`, `d-tiled.html`; the switcher persists
      across the two pages via `localStorage`).
- [x] REQ-17: `docs/design/design-system.md` §1 rewritten for the architecture (token
      vocabulary and roles, theme list, the contrast bar and exempt list, the
      Claude-family rule for the terminal pair, the `.btn:disabled` rule);
      `.claude/agents/review-work.md` §6a's token bullet updated to match. **Done at plan
      approval by the planning session**, alongside the protocol merge — the same order the
      original direction was documented in (design doc before code).

### Should Have

- [ ] REQ-18: `web/e2e/helpers/daemon.ts` gains a `claudeConfigContent?: string` option
      (written to a scratch path inside `dataDir` before spawn), a `claudeThemePoll?: string`
      option, a `writeClaudeConfig(content)` method for mid-test flips, and passes
      `-claude-config-file <scratch path>` **unconditionally** on every scratch daemon — the
      same discipline as `-usage-token-file`, so no E2E run can ever read the real file
      (INV-5).
- [ ] REQ-19: `parsePrefs` defaults a missing `theme` key to `"follow"` and `parseSnapshot`
      defaults a missing `claudeTheme` to `{family: "unknown"}` (pre-plan daemon tolerance,
      same pattern as `usageModel`/`railSort`).

### Nice to Have

- [ ] REQ-20: The contrast script prints a per-theme summary line (`instrument: 43 pairs, 0
      failures`) on success so `make check` output shows the gate ran.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval).

### HTTP: PUT /api/prefs (§3.3 — gains `theme`)

**Auth**: UI cookie (unchanged).
**Request** (unchanged rule: at least one known field; unknown fields ignored):
```json
{ "theme": "string — optional; matches ^[a-z][a-z0-9-]{0,31}$; the daemon treats the value as opaque. \"follow\" means no override." }
```
**Response 204**, no body (unchanged). Persisted in the kv `prefs` blob and echoed as a
full-object `prefs` broadcast (unchanged).
**Errors:**
- 400 `invalid_request`: `theme` present but not matching the pattern (message: `theme must
  be 1-32 chars of a-z, 0-9 or -, starting with a letter`). The existing "no known field
  present" 400 now counts `theme` as a known field.

Defaults before any PUT become
`{"view":"focus","density":"2x2","usageModel":"Fable","railSort":"manual","theme":"follow"}`.
A persisted `theme` that fails the pattern loads as `"follow"` (same silent fallback the
other four fields use in `loadPrefs`).

**Why opaque**: the daemon does not know the theme list, so adding a theme never needs a
daemon release. The client owns the registry (REQ-7); a stored name the client no longer
knows resolves as `follow` (spec Edge Case 5).

### WS daemon→UI `snapshot` (§5.2 — gains `claudeTheme`; `prefs` gains `theme`)

```json
{ "type": "snapshot",
  "sessions": [ "…" ],
  "usage": { "…": "…" },
  "prefs": { "view": "focus", "density": "2x2", "usageModel": "Fable", "railSort": "manual",
             "theme": "string — always present; \"follow\" | any accepted opaque name" },
  "claudeTheme": { "family": "\"light\" | \"dark\" | \"unknown\" — always present; \"unknown\" while polling is disabled or no read has succeeded" } }
```
`GET /api/state` mirrors the same object minus the `type` envelope (unchanged rule).

### WS daemon→UI `prefs` (§5.5 — full-object echo now includes `theme`)

```json
{ "type": "prefs", "prefs": { "view": "focus", "density": "2x2", "usageModel": "Fable", "railSort": "manual", "theme": "follow" } }
```

### WS daemon→UI `claudeTheme` (new §5.6)

```json
{ "type": "claudeTheme", "family": "\"light\" | \"dark\" | \"unknown\"" }
```
Sent only when the polled family differs from the previously broadcast one — never on
every tick, never with a timestamp (the value is a current-state fact, not an event).
The first value a client sees arrives inside `snapshot`, so a reconnect needs no replay. A
client applies it by re-deriving `data-theme` (only relevant when `prefs.theme` is
`"follow"`) and always re-deriving `data-claude-family`.

## Schema Changes

No schema changes required. `theme` lives inside the existing kv `prefs` JSON blob.

## UI Specifications

### Views

- **`<html>`** — carries `data-theme="instrument|dark|light"` (always one of the registry
  names, never `follow`) and `data-claude-family="light|dark|unknown"`. Set by the hint
  script before first paint (REQ-11) and by `main.ts` on every relevant message (REQ-12).
- **Masthead** — gains the `Settings` button after `Issue`. Otherwise unchanged in
  structure; every surface recolours via tokens.
- **Settings dialog** (new, `#settings-dialog`) — reference render: the Settings modal in
  `mockups/a-instrument.html` (open it with the demo bar's *Settings* button). DOM:
  ```
  <dialog id="settings-dialog" class="modal confirm" aria-labelledby="settings-dialog-title">
    <h2 id="settings-dialog-title">Settings</h2>
    <form id="settings-form" class="fields">
      <fieldset class="seg">
        <legend>Theme</legend>
        <div class="seg-track">
          <label><input type="radio" name="theme" value="follow">Follow Claude Code</label>
          <label><input type="radio" name="theme" value="instrument">Instrument</label>
          <label><input type="radio" name="theme" value="dark">Dark</label>
          <label><input type="radio" name="theme" value="light">Light</label>
        </div>
      </fieldset>
      <p class="hint">Follow Claude Code paints Light when Claude Code's theme is light, Instrument otherwise. The terminal ground always follows Claude Code's theme, whichever Muster theme is chosen.</p>
    </form>
    <div class="modal-foot">
      <button type="button" id="settings-close-button" class="btn">Close</button>
    </div>
  </dialog>
  ```
  Uses the existing `.fields`/`fieldset.seg`/`.seg-track` patterns from the launch form
  (design-system §5 "Segmented control"). Escape closes it (native `<dialog>` behaviour).
- **Every `.btn:disabled`** — the disabled treatment (REQ-8). Reference: the disabled
  *Resume* in `a-instrument.html`'s mainhead and the disabled *End* in `d-tiled.html`'s
  stopped tile footer.
- **Ghost danger hover** — `.btn.danger:hover:not(:disabled)` takes the filled treatment
  (`--danger` ground, `--danger-fg` text, `--danger-line` border) instead of danger-coloured
  text on the panel, because no dark theme can hold both "white on `--danger` ≥ 4.5" and
  "`--danger` text on `--bg-raised` ≥ 4.5" with one token. Decided in planning; recorded in
  design-system §5 at approval.

### User Flows

1. **Pick a theme**: click `Settings` → dialog opens with the radio matching
   `prefs.theme` checked → click `Dark` → `PUT /api/prefs {"theme":"dark"}` → `prefs`
   broadcast arrives → `<html data-theme="dark">`, every live pane re-themed, hint written →
   `Close`.
2. **Return to following**: open Settings → click `Follow Claude Code` → PUT `"follow"` →
   broadcast → `data-theme` becomes `light` if `data-claude-family="light"`, else
   `instrument`.
3. **Claude changes theme while following**: the poller sees the file change → `claudeTheme`
   broadcast → `data-claude-family` updates → `data-theme` re-resolves → panes re-themed.
4. **Claude changes theme while overridden**: same broadcast → only `data-claude-family`
   changes; the pane ground flips; the chrome stays.
5. **Reload**: hint script paints the last theme/family before the stylesheet applies;
   `snapshot` confirms (or corrects) it.

### States

- **No data yet** (before the first `snapshot`): `<html>` carries the hint's attributes, or
  none (→ Instrument, dark terminal pair via the bare `:root` fallback). The Settings
  button is present; opening the dialog before a snapshot shows no radio checked (there is
  no pref to reflect yet) — the first `prefs`/`snapshot` checks one.
- **Data**: as above.
- **Daemon down**: `data-theme`/`data-claude-family` are **not touched** on disconnect
  (INV-4); the page keeps the last painted theme. The Settings dialog closes with the other
  dialogs (existing "Dialogs, if open, close" rule), since a PUT cannot land.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Settings button (masthead) | `button` | `Settings` | `#settings-button`; the only masthead control with that name |
| Settings dialog | `dialog` | `Settings` | `#settings-dialog`, `aria-labelledby` its `<h2>` |
| Theme legend | — | `Theme` | `<legend>` inside `fieldset.seg`; no reliable role — e2e-specs picks the locator |
| Follow radio | `radio` | `Follow Claude Code` | `input[name=theme][value=follow]` |
| Instrument radio | `radio` | `Instrument` | value `instrument` |
| Dark radio | `radio` | `Dark` | value `dark` |
| Light radio | `radio` | `Light` | value `light` |
| Settings close | `button` | `Close` | scope the locator to `#settings-dialog` — the issue dialog also has a `Close` |
| Theme attribute | — | `html[data-theme="…"]` | one of `instrument`, `dark`, `light` |
| Family attribute | — | `html[data-claude-family="…"]` | one of `light`, `dark`, `unknown` |
| Live pane ground | — | `.terminal-surface` | computed `background-color` equals the resolved `--term`; xterm's own viewport ground is the same colour — e2e-specs chooses which to read |
| Disabled masthead Resume | `button` | `Resume` | inside `#mainhead`; disabled for an alive session — computed `color`/`border-color`/`cursor` differ from an enabled `.btn` |

### Invariants

- **INV-1 — theme resolution.** After every `snapshot`, `prefs` and `claudeTheme` message,
  `html[data-theme]` equals `resolveTheme(prefs.theme, family)`. Test from **every** source
  state: each of the four pref values × each of the three families (12 cells), including
  the transitions *into* each cell from each other cell — a table test in Vitest for the
  resolver, and E2E from at least `follow×dark → dark×dark → follow×light → light×dark`.
- **INV-2 — family independence.** A `prefs` message never changes `data-claude-family`; a
  `claudeTheme` message never changes `data-theme` while `prefs.theme ≠ "follow"`.
- **INV-3 — every live pane follows.** After any theme/family change, every live
  `TerminalSurface`'s xterm ground equals the resolved `--term` — in **both** hosting views
  (the Focus pane; Tiles with ≥ 2 live tiles) and for a surface created *after* the change.
- **INV-4 — daemon-down freezes theme.** Disconnect never changes either attribute; the
  first `snapshot` after reconnect re-applies (possibly identically).
- **INV-5 — no test reads the real config file.** The E2E harness passes a scratch
  `-claude-config-file` on every daemon unconditionally; Go tests use `t.TempDir()` paths.
- **INV-6 — the daemon never writes the config file.** Unit test: content and mtime
  unchanged after ≥ 3 ticks; reviewer: no write/create/rename call targets that path.
- **INV-7 — the broadcast is the only source of the checked radio.** Clicking a radio does
  not change which radio is checked until the `prefs` broadcast arrives (mirrors view/
  density's INV — `main.ts` never sets theme state locally from a click).
- **INV-8 — no literal outside theme blocks.** Every colour literal in `style.css` is inside
  a `[data-theme]` block or the two terminal-pair selector blocks (machine-checked by the
  script, REQ-4).

### Carried-over measurements

The only measurements this plan inherits are the 2026-09-02 contrast readings of the
*current* palette (`--dim` 2.60, `--idle` 2.76, white-on-`--danger` 4.45, `--line2` 1.53,
state borders 1.56–1.95). Re-checked against decision 3 (rename) and the new palettes:
the readings motivated which shades change; the **new** values were measured directly with
the same formula (`0 failures` across all three themes and 43 pairs — corrected from 46 per review cycle 1 Minor 2; the enumerated list below is 43 — script in the planning
session — the shipped `contrast.mjs` re-measures them on every `make check`). Nothing else
is carried: the `cssVar()` read in `pane.ts` measured nothing, and no spike value applies.

## Affected Files

### Daemon
- `internal/claudecode/theme.go` — new: `DefaultConfigPath`, `ThemeFamily` + constants,
  `ReadThemeFamily` (REQ-13). Only place the file's name/key may appear.
- `internal/claudecode/doc.go` — one line adding the theme file to the package's inventory
  of Claude-format knowledge.
- `internal/server/themepoll.go` — new poller (REQ-14).
- `internal/server/state.go` — `PrefsInfo.Theme string \`json:"theme"\``;
  `Snapshot.ClaudeTheme ClaudeThemeInfo \`json:"claudeTheme"\`` with
  `ClaudeThemeInfo{Family string \`json:"family"\`}`; `buildSnapshot` defaults family
  `"unknown"`; `currentSnapshot` fills it from the poller (or `"unknown"` when disabled).
- `internal/server/prefs.go` — `prefsRequest.Theme *string`, `validTheme` (the pattern),
  default `"follow"`, merge + 400 path, the "at least one field" check.
- `internal/server/server.go` — `Config.ClaudeThemePoll time.Duration`,
  `Config.ClaudeConfigFile string`; construct/Start/Stop the poller next to the usage
  poller (nil when `ClaudeThemePoll <= 0`).
- `cmd/musterd/main.go` — flags `-claude-theme-poll` (default `10s`) and
  `-claude-config-file` (default from `claudecode.DefaultConfigPath()`; if that errors, the
  flag default is empty and polling reports `unknown`).

### Web
- `web/src/style.css` — token section rewritten (REQ-1/2/3), `--well` applied to chrome
  recesses, `--edge` to inputs/selects/textarea/`.seg-track`, `.btn:disabled` rules
  (REQ-8), `:hover:not(:disabled)` on every `.btn` hover rule, ghost-danger hover → filled.
- `web/src/theme.ts` — new registry + resolver + hint read/write (REQ-7, REQ-11).
- `web/src/render/settings.ts` — new: `initSettingsDialog(elements, {onChooseTheme})`
  returning `{open, close, setChecked(theme)}`; DOM + wiring only, no store access.
- `web/src/protocol.ts` — `Prefs.theme: string`, `Snapshot.claudeTheme`,
  `ClaudeThemeMessage`, `ClaudeFamily`, parsers with the REQ-19 defaults, `Message` union.
- `web/src/api.ts` — `PrefsRequest.theme?: string`.
- `web/src/ws.ts` — `onClaudeTheme?: (family) => void` handler + dispatch.
- `web/src/main.ts` — `themeChoice`/`claudeFamily` state, `applyThemeAttributes()`,
  `requestTheme()`, Settings wiring, surface re-theme fan-out, hint write, dialog close on
  daemon-down.
- `web/src/terminal/pane.ts` — `applyTheme()`; constructor reads `--term-fg` (was
  `--paper`) for the foreground; the `Canvas`/`CanvasText` fallbacks stay.
- `web/index.html` — head hint script, `#settings-button`, `#settings-dialog`.
- `web/scripts/contrast.mjs`, `web/scripts/contrast-pairs.json` — new (REQ-4/5/6).
- `web/package.json` — `"contrast": "node scripts/contrast.mjs"`.
- `Makefile` — `contrast` target (`cd web && npm run contrast`), `check: lint test
  contrast`. Owned by **web-impl** (tooling belongs to an impl track).

### E2E harness (owned by e2e-specs)
- `web/e2e/helpers/daemon.ts` — REQ-18 options, unconditional `-claude-config-file`.
- `web/e2e/theme.spec.ts` — new spec.

### Tests (owned by the test agents)
- `internal/claudecode/theme_test.go`, `internal/server/themepoll_test.go`,
  `internal/server/prefs_test.go` (theme cases), `internal/server/state_test.go`
  (`claudeTheme` shape).
- `web/src/theme.test.ts`, `web/src/protocol.test.ts` (new fields/defaults),
  `web/src/render/settings.test.ts` (if the controller has pure logic worth a unit test).

### Docs (not an impl track)
- At approval (planning session): `docs/protocol.md` delta merge; `docs/design/design-system.md`
  §1 rewrite + §5 disabled/ghost-danger notes; `.claude/agents/review-work.md` §6a token
  bullet.
- Orchestrator (Doc-Upkeep Backstop / Completion): `SPEC.md` changelog entry ("shipped"),
  `TODO.md` ticks for "Contrast pass + design tokens (#3)" and the M5+ `.btn:disabled` item.

## Edge Cases

1. **Config file missing, unreadable or not JSON** → `unknown`; unknown behaves as dark
   everywhere (dark terminal pair; `follow` shows Instrument). No error surface, no per-tick
   log.
2. **`theme` key absent** → `dark` (Claude's default), distinguishable from `unknown` on the
   wire. (Damian's own file has no key today — measured 2026-09-02.)
3. **Unrecognised value** (`dark-daltonized`, `light-ansi`, a future `solarized`) → prefix
   match on `light`/`dark`; no match → `unknown`. Value not a string → `unknown`.
4. **Torn write** — Claude Code rewrites the file itself; a tick may read a partial file →
   parse error. The poller retries once after 250 ms before adopting `unknown` (REQ-14), so
   a single torn read never flashes the pane ground. A file that stays broken reports
   `unknown` on the next tick.
5. **Daemon down** → both attributes frozen (INV-4); Settings dialog closes; on `hello` +
   `snapshot` they are re-applied.
6. **Stored pref names a theme the client doesn't know** (renamed in a later build, or an
   older client against a newer daemon) → `resolveTheme` treats it as `follow`. The radio
   group shows nothing checked (no radio has that value) — honest, and the next pick fixes
   it. The daemon accepts and stores it unchanged (opaque).
7. **Claude's theme changes while overridden** → pane ground only (INV-2).
8. **Fresh browser profile** → no hint → Instrument + dark pair until the snapshot; one
   permitted flash. `localStorage` throwing (private mode, disabled storage) → same path,
   swallowed by try/catch.
9. **Hint disagrees with prefs** (theme changed from another window, or a daemon restart
   with a different data dir) → prefs win; a single repaint on snapshot.
10. **Two windows** → both receive the `prefs`/`claudeTheme` broadcast; the second window's
    open Settings dialog re-checks its radio from the broadcast (INV-7).
11. **Polling disabled (`-claude-theme-poll 0`)** → no goroutine; `snapshot.claudeTheme.family`
    is `unknown`; `follow` resolves to Instrument; pane ground dark.
12. **A surface created after a theme change** (focusing a new session, promoting a tile)
    → its constructor reads the current tokens, so it is correct without a call to
    `applyTheme()`; INV-3 asserts this case explicitly.
13. **Disabled button on a filled primary** (`.btn.key:disabled`, e.g. issue submit with an
    empty title) → loses the amber fill and bold weight, takes the disabled trio; the
    enabled/disabled computed styles must differ in every theme.
14. **Hooks** — nothing here derives from hook delivery; no loss/reorder story. `/clear`
    minting a new `session_id` is irrelevant to theme.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` succeeds.
- **D3**: `make lint` passes.
- **D4**: The config file's name and its key appear in no Go file outside
  `internal/claudecode/` (negative grep on the file's basename; test files included — they
  must obtain paths via `t.TempDir()` and the exported `ReadThemeFamily`).
- **D5**: `ReadThemeFamily` returns `unknown` for a missing file, an unreadable file, a
  non-JSON file and a non-string value — table test.
- **D6**: `ReadThemeFamily` returns `dark` for valid JSON without the key.
- **D7**: `ReadThemeFamily` maps `light`, `light-daltonized`, `light-ansi` → `light`;
  `dark`, `dark-daltonized`, `dark-ansi` → `dark`; `solarized` → `unknown`.
- **D8**: The fixture file in the `ReadThemeFamily` test contains other top-level keys with
  nested objects, and the decode struct has exactly one field (reviewer reads the struct).
- **D9**: After three poller ticks against a fixture, the fixture's bytes and mtime are
  unchanged (INV-6).
- **D10**: The poller broadcasts `claudeTheme` exactly once when the family flips and zero
  times across three ticks with no change (hub spy or recording broadcaster).
- **D11**: A single failed read after a successful one does not broadcast `unknown` (the
  250 ms retry path), while two consecutive failures do.
- **D12**: `PUT /api/prefs {"theme":"dark"}` → 204, kv blob contains `"theme":"dark"`, and
  the `prefs` broadcast carries the full object including `theme`.
- **D13**: `PUT /api/prefs {"theme":"Dark Mode!"}` → 400 `invalid_request`.
- **D14**: `PUT /api/prefs {"theme":"follow"}` → 204 and the stored value is `"follow"`.
- **D15**: A fresh daemon's snapshot has `prefs.theme == "follow"` and
  `claudeTheme.family == "unknown"` when polling is disabled.
- **D16**: A kv `prefs` blob with `"theme":"BAD VALUE"` loads as `"follow"`.
- **D17**: `-claude-theme-poll 0` constructs no poller (nil field; `Start` skips it).

### Web
- **W1**: `make web-build` passes (strict TS, no `any`).
- **W2**: `make web-test` passes.
- **W3**: `make contrast` passes — zero contrast failures, zero hue-band failures, zero
  literals outside theme blocks, across all three themes.
- **W4**: No old token name (`--ink`, `--panel`, `--panel2`, `--paper`, `--muted`, `--dim`,
  `--line2`, `--border-blocked`, `--border-failed`, `--border-plan`, `--border-work`,
  `--note-fg-amber`, `--note-fg-rose`, `--panel-95`) survives anywhere under `web/`.
- **W5**: No six-digit hex literal appears in any `.ts` file under `web/src` (tests
  included — `theme.ts` and its test deal in names, never colours).
- **W6**: `resolveTheme` table test covers all 12 pref×family cells plus an unknown pref
  name in each family (INV-1).
- **W7**: `parsePrefs` accepts a payload without `theme` and yields `"follow"`; rejects a
  non-string `theme`.
- **W8**: `parseSnapshot` accepts a payload without `claudeTheme` and yields
  `{family:"unknown"}`; rejects a family outside the three values.
- **W9**: `parseMessage` decodes `{"type":"claudeTheme","family":"light"}` and rejects an
  unknown family.
- **W10**: `readThemeHint` returns `null` for absent, malformed, or unknown-name hints and
  the parsed value otherwise; `writeThemeHint` swallows a throwing storage.
- **W11**: The three theme blocks in `style.css` are byte-for-byte the same token→value
  assignments as the mockups' blocks (reviewer diffs them; the mockups are the authority).
- **W12**: Every `.btn` hover rule in `style.css` is guarded with `:not(:disabled)`.
- **W13**: `pane.ts` reads `--term-fg` for the xterm foreground and exposes `applyTheme()`;
  nothing in the file names a colour.
- **W14**: `main.ts` never assigns theme state from a click — only from `snapshot`, `prefs`
  and `claudeTheme` handlers (INV-7, reviewer).
- **W15**: The `<head>` hint script precedes the stylesheet `<link>` and is a plain (non-
  module) script wrapped in try/catch.

### E2E
- **E1**: `make e2e` passes.
- **E2**: Clicking `Settings` opens a dialog named `Settings` containing exactly four
  radios named Follow Claude Code, Instrument, Dark, Light, in that order.
- **E3**: With a fresh daemon and no config file, `html[data-theme]` is `instrument` and
  `html[data-claude-family]` is `unknown`, and the `Follow Claude Code` radio is checked.
- **E4**: Choosing `Dark` sets `html[data-theme="dark"]` without a reload, and `body`'s
  computed `background-color` changes from its Instrument value.
- **E5**: After E4, `page.reload()` shows `html[data-theme="dark"]` on the very first
  `domcontentloaded` (before the WebSocket connects — assert via an init script or by
  reading the attribute at `DOMContentLoaded`).
- **E6**: After E4, `daemon.restart()` + reload still shows `dark` and the `Dark` radio
  checked.
- **E7**: With a live Focus pane, choosing `Light` re-themes the chrome and the pane's
  computed ground within one render, with no reload (INV-3, Focus).
- **E8**: In Tiles with two live tiles, choosing a theme re-themes both tiles' grounds
  (INV-3, Tiles, multi-instance).
- **E9**: With `-claude-theme-poll 200ms` and a scratch config `{"theme":"dark"}`, writing
  `{"theme":"light"}` flips `html[data-claude-family]` to `light` within 2 s, and the live
  pane's ground becomes the light pair while `data-theme` stays `instrument`... unless the
  pref is `follow`, in which case `data-theme` becomes `light` — assert both branches
  (INV-1, INV-2).
- **E10**: With pref `dark` and the config flipped to light, `data-theme` stays `dark` and
  only the pane ground changes (INV-2).
- **E11**: Choosing `Follow Claude Code` after `Dark`, with family `light`, yields
  `data-theme="light"`; the stored pref (via the next snapshot on reload) is `follow`.
- **E12**: Killing the daemon leaves both attributes unchanged while the banner shows;
  restarting re-applies them (INV-4).
- **E13**: The masthead `Resume` button for an alive session is disabled and its computed
  `color`, `border-color` and `cursor` differ from the enabled `End` button beside it, in
  each of the three themes.
- **E14**: Badge text for a Needs-Input, Failed, Planning and Working card reads as amber,
  rose, violet, teal respectively in every theme (computed `color` matches the theme
  block's token value).
- **E15**: A scratch config with malformed JSON yields `data-claude-family="unknown"` and
  no error banner or console error.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. Write "must not exist" checks so success is exit 0 — prefix the grep with
`!`. IDs match the prose criterion above where one exists; a check with no prose twin (e.g. a build
gate) is fine and shares the same ID namespace. The orchestrator and the review agent run these
verbatim; nothing else in this section is executed automatically.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n --fixed-strings ".claude.json" cmd/ internal/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
W3 make contrast
W4 ! rg -n -e "--(ink|panel2?|paper|muted|dim|line2|border-(blocked|failed|plan|work)|note-fg-(amber|rose)|panel-95)\b" web/ --glob '!web/node_modules/**'
W5 ! rg -n "#[0-9a-fA-F]{6}\b" web/src --glob '*.ts'
E1 make e2e
```

Scope notes for the negative greps:
- **D4** includes `_test.go` files: tests get a path from `t.TempDir()` and never need the
  real basename. The `internal/claudecode/**` exclusion is the boundary itself. Dry run
  against this plan: the plan mentions the file by name in prose only, never inside a Go
  snippet, and the check does not scan `plans/`.
- **W4** includes `web/e2e/**`: specs assert the *new* names. `--muted`/`--dim` are matched
  as whole tokens with `\b`, so `--fg-muted`/`--fg-dim` do not trip it. Dry run against
  this plan: the rename table under Implementation Notes writes old names in backticks;
  the check does not scan `plans/`, and an agent copying the table copies the *new* column.
- **W5** includes `*.test.ts`: `pane.ts` keeps its `Canvas`/`CanvasText` keyword fallbacks,
  `theme.ts` deals in names, and no unit test needs a colour value (contrast math is not
  unit-tested — `make contrast` is its own gate). Dry run: this plan's hex values live in a
  CSS-context table; the check scans only `.ts` files.

### Reviewer-Verified

- **D5**–**D17** as prose above (unit-test presence and shape; nil poller; retry path).
- **W6**–**W15** as prose above (test coverage shape, mockup parity W11, hover guards W12,
  `pane.ts` W13, no local theme state W14, hint script placement W15).
- **E2**–**E15** as prose above, via the Playwright run and reading the specs.
- **R1**: `internal/claudecode/theme.go` never opens the file for writing (INV-6).
- **R2**: The poller logs nothing per tick and nothing containing file content.
- **R3**: `docs/protocol.md` matches the shipped wire shapes (`theme`, `claudeTheme`).
- **R4**: The three mockups' theme blocks and `style.css`'s are identical assignments (W11).
- **R5**: The exempt list in `contrast-pairs.json` is exactly REQ-5's list, each with a
  reason.
- **R6**: `--well`, not `--term`, grounds every chrome recess (inputs, `#issue-preview`,
  `.browse`, `.placeholder`, `.snapshot.ended`, `#issue-error-detail`); `--term` grounds
  only `.terminal-surface`/`.tbody-slot` and the xterm theme.

## Implementation Notes

### Palettes (authority: the mockups' `[data-theme]` blocks; reproduced for reference)

| Token | Role | Instrument | Dark | Light |
|---|---|---|---|---|
| `--bg` | app background | `#12141c` | `#181a1f` | `#f3f2ee` |
| `--bg-raised` | masthead, rail, tile chrome, dialogs | `#171a24` | `#1f2228` | `#fbfaf7` |
| `--bg-hover` | hover + selected | `#1c2029` | `#282c34` | `#edece7` |
| `--well` | chrome recesses: inputs, previews, browse pane, placeholder, dead snapshot | `#0d0f16` | `#121418` | `#ffffff` |
| `--line` | hairline rules (exempt) | `#282d3b` | `#2c3038` | `#e0ded8` |
| `--line-control` | button borders, badge borders, drag outline (exempt) | `#343a4a` | `#3a3f49` | `#cbc9c2` |
| `--edge` | 3:1 boundaries: inputs, selects, textarea, seg-track | `#6a7286` | `#737a87` | `#8a8983` |
| `--fg` | primary text | `#e8e6e1` | `#e8e9eb` | `#1c1e26` |
| `--fg-muted` | secondary text | `#9096a8` | `#a3a9b4` | `#585d6b` |
| `--fg-dim` | metadata, labels | `#8087a0` | `#8e95a1` | `#61667a` |
| `--amber` | Needs-Input | `#f2a33c` | `#e6a642` | `#9d5600` |
| `--rose` | Failed | `#e36a6a` | `#ef7079` | `#c0323c` |
| `--violet` | Planning | `#9a8cf0` | `#a99cf5` | `#6a4fd6` |
| `--teal` | Working | `#56c5d0` | `#4fcbc6` | `#0c737a` |
| `--idle` | Idle | `#7f869e` | `#8c95a4` | `#656a7a` |
| `--amber-line` / `--rose-line` / `--violet-line` / `--teal-line` | state border tints (exempt) | `#5c4526` `#5c2e2e` `#3e3663` `#215058` | `#5a4422` `#5d2d31` `#3f3a66` `#1f5352` | `#efd6ac` `#f2c3c5` `#d8d1f4` `#b8e1e3` |
| `--amber-note` / `--rose-note` | note copy | `#f5cc93` `#f1b0b0` | `#f2cf95` `#f5b7bb` | `#7a4400` `#962c34` |
| `--amber-fg` | text on an amber fill | `#12141c` | `#181a1f` | `#ffffff` |
| `--banner-bg` / `--banner-line` / `--banner-fg` | daemon-down banner | `#3a1e1e` `#5a2c2c` `#f3b7b7` | `#3b2020` `#5c2f2f` `#f4b9b9` | `#fbe8e8` `#e5b6b6` `#7a1f1f` |
| `--danger` / `--danger-line` / `--danger-fg` | destructive | `#c24646` `#7a3535` `#ffffff` | `#c24646` `#7a3535` `#ffffff` | `#b23838` `#8c2b2b` `#ffffff` |
| `--disabled-fg` / `--disabled-line` / `--disabled-bg` | disabled controls (exempt) | `#5a6070` `#2c3140` `#22262f` | `#5e646e` `#2f343c` `#252930` | `#a6aab3` `#dddbd5` `#ecebe6` |
| `--term-dark-bg` / `--term-dark-fg` | pane pair when Claude is dark/unknown | `#0d0f16` `#e8e6e1` | `#121418` `#e8e9eb` | `#14161c` `#e8e6e1` |
| `--term-light-bg` / `--term-light-fg` | pane pair when Claude is light | `#fbfaf7` `#1c1e26` | `#fafafa` `#1f2228` | `#ffffff` `#1c1e26` |
| `--scrim` | modal backdrop, overlay | `rgba(8,9,13,.72)` | `rgba(10,11,14,.72)` | `rgba(28,30,38,.45)` |
| `--bg-raised-95` | dead-surface pill ground | `rgba(23,26,36,.95)` | `rgba(31,34,40,.95)` | `rgba(251,250,247,.95)` |

`--green` stays declared in the mockups (health dot) and **undeclared in `style.css`** — it
still has no consumer (m1-sessions review Minor 5); it arrives with its first real one.

### Rename (old → new), applied by web-impl everywhere under `web/`

`--ink` → `--bg` · `--panel` → `--bg-raised` · `--panel2` → `--bg-hover` · `--paper` → `--fg` ·
`--muted` → `--fg-muted` · `--dim` → `--fg-dim` · `--line2` → `--line-control` ·
`--border-blocked` → `--amber-line` · `--border-failed` → `--rose-line` ·
`--border-plan` → `--violet-line` · `--border-work` → `--teal-line` ·
`--note-fg-amber` → `--amber-note` · `--note-fg-rose` → `--rose-note` ·
`--panel-95` → `--bg-raised-95`. New with no predecessor: `--well`, `--edge`, `--amber-fg`
(replaces `.btn.key`'s `color: var(--ink)`), `--term-fg`, the four `--term-*-bg/fg`, the
three `--disabled-*`. Order the sed so `--panel2` runs before `--panel`.

Where `--term` becomes `--well`: `.placeholder`, `.snapshot.ended`, `.browse`,
`.fields input[type="text"]`, `#issue-form .sel/input/textarea`, `#issue-preview`,
`#issue-error-detail`. Where `--term` stays: `.terminal-surface`, `.tbody-slot`, and the
xterm theme in `pane.ts`. Where `--line2` becomes `--edge`: `.fields input[type="text"]`,
`#issue-form .sel/input/textarea`, `.railhead .sel`, `.seg-track` and its label dividers,
`#issue-preview`/`#issue-error-detail` borders (they are read-only wells; `--edge` keeps
their extent visible on `--bg-raised` in Light).

### Contrast pairs (the JSON's content; `min` 4.5 unless stated)

Text: `fg`, `fg-muted`, `fg-dim` each on `bg`, `bg-raised`, `bg-hover`, `well`. State text
`amber`, `rose`, `violet`, `teal`, `idle` each on `bg-raised` and `bg-hover`. Notes
`amber-note`, `rose-note` on `bg-raised` and `bg-hover`. Fills `amber-fg` on `amber`,
`danger-fg` on `danger`. Banner `banner-fg` on `banner-bg`. Terminal `term-dark-fg` on
`term-dark-bg`, `term-light-fg` on `term-light-bg`.
Non-text (min 3): `amber`, `rose`, `violet`, `teal`, `idle` on `bg` (tile dots, strip
stripes); `teal`, `amber`, `fg-muted` on `line` (gauge fills on track); `edge` on
`bg-raised`, `well`, `bg`; `amber` on `bg-raised` (focus ring).
Hue bands (REQ-6) and the exempt list (REQ-5) live in the same file. The planning-session
run of this exact list: **0 failures in all three themes**.

### Script shape

Parse `style.css` with a small regex state machine: capture each `:root…[data-theme="X"]{…}`
block, collect `--name: value;` pairs, resolve `var(--x)` references within a block, convert
hex/`rgb()` to sRGB, compute WCAG relative luminance and ratio. Hue via RGB→HSL. Then scan
the remainder of the file (everything outside those blocks and the two terminal-selector
blocks) for `#[0-9a-f]{3,8}\b`, `rgba?(`, `hsla?(` and the CSS named-colour list, reporting
any hit as a failure. No npm dependency — Node's stdlib only, so `make check` stays
dependency-free beyond the existing toolchain.

### Daemon patterns

- `themepoll.go` copies `usagepoll.go`'s Start/Stop/loop/tick shape and the "one loop
  goroutine, sequential ticks" property. The 250 ms retry is a `time.After` inside `tick`
  (respecting ctx). Tests inject the reader (`func(string) claudecode.ThemeFamily`) and a
  recording broadcaster — never a real 10 s wait.
- `ReadThemeFamily` uses `os.ReadFile` + `json.Unmarshal` into the one-field struct; a
  `json.Number` or object under the key decodes as a type error → `unknown`.
- `DefaultConfigPath` uses `os.UserHomeDir()`; `main.go` passes the result as the flag
  default so the flag's help text can say "Claude Code's global config file" without the
  literal name.
- gofmt reminder (conventions): no paired backticks or `''` in doc comments.

### Web patterns

- xterm.js 6: `term.options.theme = { background, foreground }` re-themes a live terminal
  in place; do not recreate the `Terminal`.
- The hint script is plain inline JS in `index.html`'s `<head>` — Vite leaves non-module
  inline scripts in place. Key `muster.theme-hint`; value JSON; try/catch around every
  storage access.
- `main.ts` fan-out: keep a `Set<TerminalSurface>` (the surface manager already tracks
  live surfaces) and call `applyTheme()` on each after setting the attributes — never from
  the 1 s `render` interval.
- `render/settings.ts` follows `render/confirm.ts`'s controller shape: elements in,
  handlers in, `{open, close, setChecked}` out; `main.ts` owns the PUT and the store.
- Focus ring: `.seg-track label:has(input:focus-visible)` stays amber (3:1 on
  `--bg-raised` in every theme — on the pair list).

### Doc upkeep (orchestrator)

- `SPEC.md` §11: a "shipped" entry for this plan (the 2026-09-02 spec entry already
  records the decisions; add the four planning decisions from the Overview and the `--well`
  split).
- `TODO.md`: tick "Contrast pass + design tokens (#3)" and the M5+ "App-wide `.btn:disabled`
  affordance pass".
- `orchestration-state.json`: `closes_issues: [3]`.
