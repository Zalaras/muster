# Review: new-ui-design-colors

**Plan**: new-ui-design-colors
**Cycle**: 1
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 two-layer token architecture | Yes | Yes (`make contrast` literal scan, negative-controlled) | pass |
| REQ-2 three palettes verbatim from mockups | Yes | Yes (W11 diffed, see Reviewer-Verified) | pass |
| REQ-3 token rename across `web/` | Yes | Yes (W4 grep) | pass |
| REQ-4 contrast gate script + pairs JSON | Yes | Yes (W3, negative-controlled both halves) | pass |
| REQ-5 AA on the pair list + exempt list | Yes | Yes (43 pairs × 3 themes, 0 failures) | pass |
| REQ-6 fixed hue families | Yes | Yes (hue bands + idle saturation ceiling in the gate) | pass |
| REQ-7 web theme registry + resolver | Yes | Yes (`theme.test.ts`, 12 cells + unknown names) | pass |
| REQ-8 `.btn:disabled` affordance | Yes | Yes (E13; verified by hand in the browser) | pass |
| REQ-9 Settings dialog + theme picker | Yes | Yes (E2, E4; verified by hand) | pass |
| REQ-10 `prefs.theme` persistence | Yes | Yes (D12, D14, D16, E6) | pass |
| REQ-11 no wrong-theme first frame | Yes | Yes (E5, W10, W15) | pass |
| REQ-12 instant apply incl. live panes | Yes | Yes (E7, E8) | pass |
| REQ-13 `claudecode.ReadThemeFamily` | Yes | Yes (D5–D8, INV-6) | pass |
| REQ-14 theme poller | Yes | Yes (D9–D11, D17) | pass |
| REQ-15 `claudeTheme` on snapshot + `/api/state` | Yes | Yes (D15; verified live via `GET /api/state`) | pass |
| REQ-16 mockups (done at planning) | Yes | n/a | pass |
| REQ-17 design-system §1 + agent bullet | Yes | n/a | pass |
| REQ-18 E2E harness options (should) | Yes | Yes (used by E9/E10/E11/E15) | pass |
| REQ-19 pre-plan daemon tolerance (should) | Yes | Yes (W7, W8) | pass |
| REQ-20 per-theme summary line (nice) | Yes | Yes (observed in every `make contrast` run) | pass |

## Build & Tests

E2E tests: **pass (191/191)** — full suite, not just this plan's spec
Daemon tests: **pass** (all packages green)
Web tests: **pass (653)**
Daemon build: **pass**
Web build: **pass** (`tsc --noEmit` clean + Vite)
Lint: **pass** (0 issues)

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n --fixed-strings ".claude.json" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| W4 | `! rg -n -e "--(ink\|panel2?\|paper\|muted\|dim\|line2\|border-(blocked\|failed\|plan\|work)\|note-fg-(amber\|rose)\|panel-95)\b" web/ --glob '!web/node_modules/**'` | pass |
| W5 | `! rg -n "#[0-9a-fA-F]{6}\b" web/src --glob '*.ts'` | pass |
| E1 | `make e2e` | pass |

**The contrast gate is not vacuous.** I negative-controlled both halves against a
temporary edit to `style.css` (reverted; `git diff` clean afterwards):

- appending `.zz-review-probe { color: #ff0000; }` outside a theme block →
  `literal outside theme blocks: hex literal "#ff0000"`, exit 1.
- setting Light's `--fg-dim` to `#c9c9c9` → four failures printed with real ratios
  (1.40–1.66 against min 4.5), exit 1.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5–D8 | `ReadThemeFamily` table tests, one-field decode struct | pass | Read `theme.go`: `claudeConfig` has exactly one field, `Theme *string`. `theme_test.go` fixture carries `installMethod`/`autoUpdates`/`machineID`/nested object/null and still decodes `dark-ansi` → dark |
| D9 | fixture bytes + mtime unchanged after three ticks | pass | `TestThemePoller_NeverWritesTheConfigFile` + measured live (below) |
| D10 | broadcast once on flip, zero across three no-change ticks | pass | `TestThemePoller_Tick_BroadcastsExactlyOnceOnChangeZeroTimesOtherwise` |
| D11 | single failed read silent, two consecutive broadcast | pass | Both branches tested with call-count and elapsed-time assertions; implementation matches (see Notes 3) |
| D12–D16 | prefs validation, persistence, defaults, fallback | pass | 14 new `prefs_test.go` tests; `D13`'s exact `"Dark Mode!"` case present |
| D17 | `-claude-theme-poll 0` constructs no poller | pass | `server.go` guards on `cfg.ClaudeThemePoll > 0`; both the nil and non-nil cases tested |
| W6 | resolver table, 12 cells + unknown pref per family | pass | `theme.test.ts:11-38` — all 12 cells enumerated explicitly, plus `solarized`/`""`/`"Dark"` in each of the three families |
| W7–W10 | parser defaults, `claudeTheme` decode, hint read/write | pass | `protocol.test.ts` + `theme.test.ts`; `readThemeHint` rejects `"follow"` as a resolved theme, swallows throwing storage |
| W11 / R4 | theme blocks identical to the mockups' | pass | Scripted comparison of all three blocks against **both** `a-instrument.html` and `d-tiled.html`: all 37 shipped tokens identical in value in every theme. The only deltas are `.72`→`0.72` decimal formatting (numerically identical, matches the file's own pre-existing convention) and `--green`, intentionally undeclared per the plan's Implementation Notes |
| W12 | every `.btn` hover rule guarded | pass | Only two `.btn…:hover` rules exist (`style.css:1307`, `:1392`); both carry `:not(:disabled)` |
| W13 | `pane.ts` reads `--term-fg`, exposes `applyTheme()`, names no colour | pass | Read the file; only the sanctioned `Canvas`/`CanvasText` keyword fallbacks remain |
| W14 | `main.ts` never sets theme state from a click | pass | `requestTheme` only issues the PUT; `themeChoice` is assigned in exactly one place, `applyPrefsFromSnapshot` |
| W15 | hint script placement and form | pass | Plain non-module inline `<script>` in `<head>`, before the stylesheet `<link>`, whole body in try/catch |
| E2–E15 | as prose | pass | 17/17 in `theme.spec.ts` within the green 191-test suite; spec bodies read |
| R1 | `theme.go` never opens the file for writing | pass | Only `os.ReadFile`; no `os.Create`/`WriteFile`/`OpenFile`/rename anywhere in the package's new code |
| R2 | poller logs nothing per tick, nothing containing content | pass | One `Debug` line per *change* only, carrying just the family string. Measured live: ~480 ticks produced 0 log lines (below) |
| R3 | `docs/protocol.md` matches shipped wire shapes | pass | §3.3/§5.2/§5.5/§5.6 + changelog read and cross-checked against a live `GET /api/state` response |
| R5 | exempt list is exactly REQ-5's, each with a reason | pass | Six entries in `contrast-pairs.json`, one per REQ-5 clause, each carrying `reason` |
| R6 | `--well` grounds recesses, `--term` only the pane | pass | `var(--term)` appears at exactly two sites: `.terminal-surface` and `.tbody-slot` (plus the xterm theme in `pane.ts`). `var(--well)` at exactly the seven sites the plan lists |

**On the 43-vs-46 pair count the team lead flagged**: the shipped list is correct. I
enumerated the plan's own *Contrast pairs* section and it yields exactly 43 — 31 text
pairs (12 surface/text + 10 state + 4 note + 2 fill + 1 banner + 2 terminal) and 12
non-text (5 state-on-`--bg` + 3 gauge-on-`--line` + 3 `--edge` + 1 focus ring). Nothing
was dropped, and the exempt list matches REQ-5 clause for clause. The "46" appears only
in two prose spots in the plan and is stale (Minor 2 below).

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the config file's name and key exist only in `internal/claudecode/theme.go`; D4's negative grep is clean. `docs/protocol.md` explicitly defers ("where the setting lives … is `internal/claudecode`'s business") |
| 2 | Terminal-output state parsing | pass — nothing in this diff reads pane text; the theme family comes from a file read, never from a pane |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux / `resize-pane` | pass — no tmux invocation added; no `resize-pane` anywhere in the tree outside historical docs |
| 5 | Payload logging | pass — the only new log line carries the family string (`light`/`dark`/`unknown`); no file content, no payloads |
| 6 | Empty-gauge dishonesty | pass — `claudeTheme.family` is `"unknown"` (never a fabricated `dark`) while polling is disabled or unread; the masthead's existing "5h unknown / 7d unknown" rendering is intact (observed in the browser) |
| 7 | Session identity on `session_id` | pass — not touched |
| 8 | Settings trespass | pass — the daemon opens only `-claude-config-file`, read-only, and never `settings.json`/`settings.local.json`; no `CLAUDE_CONFIG_DIR` |
| 9 | Real `claude` outside canary/probes | pass — no test or fixture invokes the binary. daemon-impl's measurement was a read-only `strings -a` of the installed binary plus a read of the config file, not an invocation |

### Design-system compliance

- **Tokens** — every colour literal lives inside a `[data-theme]` block or the two
  terminal-pair blocks; machine-checked and negative-controlled. No old token name
  survives under `web/`. `make contrast` passes; the exempt list is unchanged from the
  plan's.
- **No web fonts** — system stacks only on a bare `:root`; no `@import`, no CDN link, no
  vendored binary.
- **State colour is meaning** — the rename is 1:1 (`--border-blocked` → `--amber-line`
  etc.); no new state-colour usage was introduced. One filled amber primary per visible
  surface confirmed in the browser: the issue dialog's second `.btn.key` sits inside a
  `[hidden]` success pane.
- **Tabular numerics** — no new time-varying numeric display; the 15 existing
  declarations are untouched.
- **`[hidden]` companions** — this diff adds no `.hidden =` toggle site, so the sweep
  finds nothing new to cover.
- **Honesty rules (§6)** — no 0%-for-unknown, no cost display, no "Done" state, no
  `StopFailure.error` enum switch. `claudeTheme.family` reports `unknown` honestly.
- **Terminal rules (§7)** — `scrollback: 0` intact; `applyTheme()` reassigns
  `term.options.theme` in place rather than recreating the `Terminal`, so no second live
  client is opened; no geometry code touched; no styling applied to pane contents.

## Manual Verification

I built `musterd` and drove the real app in Chromium against a scratch data dir, a
scratch Claude config file and `-claude-theme-poll 500ms`. All values below were read by
hand from computed styles and compared against the plan's palette table.

- **First paint / defaults** — config `{"theme":"dark"}`, no pref: `data-theme=instrument`,
  `data-claude-family=dark`, body background `rgb(18, 20, 28)` = `#12141c` = Instrument's
  `--bg`. The hint was written to `localStorage` as `{"theme":"instrument","family":"dark"}`.
- **Settings dialog** — opened from the masthead. Accessibility tree shows the dialog
  named *Settings* with exactly four radios in the order Follow Claude Code, Instrument,
  Dark, Light, with Follow checked from the broadcast. The screenshot confirms the
  intended layout: the THEME legend in column 1, the segmented track in column 2, the
  hint spanning both columns, Close in the footer, and Close correctly *not* amber-filled.
- **Choosing Dark** — applied with no reload. Body background became `rgb(24, 26, 31)` =
  `#181a1f`, text `rgb(232, 233, 235)` = `#e8e9eb`, and `--amber`/`--rose`/`--violet`/`--teal`
  resolved to `#e6a642`/`#ef7079`/`#a99cf5`/`#4fcbc6` — every value matching the Dark
  column of the plan's table exactly. The checked radio and the hint both followed.
- **INV-2 end to end through the real poller** — rewriting the scratch config to
  `{"theme":"light-daltonized"}` flipped `data-claude-family` to `light` within the poll
  interval while `data-theme` stayed `dark` and the body background did not move.
  `--term`/`--term-fg` flipped to `#fafafa`/`#1f2228`, the Dark theme's *light* pair. The
  `light` prefix mapping is confirmed against the real Go code, not just a unit test.
- **Follow re-resolution** — choosing Follow Claude Code with family `light` repainted to
  the Light theme (`#f3f2ee`), and `GET /api/state` returned
  `prefs.theme: "follow"` with `claudeTheme: {"family":"light"}` — the shipped wire shape
  matching `docs/protocol.md` (R3).
- **REQ-8 / edge case 13** — the issue dialog's disabled `.btn.key` submit measured
  `color rgb(166,170,179)` = `--disabled-fg`, `background rgb(236,235,230)` =
  `--disabled-bg`, `border rgb(221,219,213)` = `--disabled-line`, `cursor: not-allowed`,
  `font-weight: 400`. The enabled `.btn.key` beside it kept the amber fill and weight
  600, so the source-order cascade fix genuinely wins over `.btn.key`.
- **INV-6 measured, not asserted** — after roughly four minutes at a 500 ms interval
  (~480 ticks), the config file's mtime was still my own write and its bytes unchanged.
- **R2 measured** — the daemon emitted 4 log lines total, all from startup, zero
  containing "theme". No per-tick logging and no file content reached the log.
- The only console error on the page is a pre-existing `favicon.ico` 404, unrelated to
  this plan.

The rig was torn down afterwards (daemon stopped, scratch tmux server killed, the
Playwright artefacts and screenshot removed from the repo; `git status` clean).

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `isThemeChoice` hard-codes the four theme values instead of deriving
   them from the registry — `web/src/render/settings.ts:29`. REQ-1's stated property is
   that adding a theme costs one `[data-theme]` block plus one `THEMES` entry, but a new
   theme would silently fail this guard until someone also edited this line, and the
   symptom would be a radio that does nothing. Suggest
   `value === "follow" || (THEMES as readonly string[]).includes(value)`, importing
   `THEMES` alongside the existing `ThemeChoice` type import.

2. **[orchestrator]** The plan's prose says the pair list is 46 pairs; its own enumerated
   list is 43 — `plans/new-ui-design-colors/plan.md` REQ-20 and *Carried-over
   measurements*. The shipped 43 is correct and complete (verified clause by clause
   above); only the two prose figures are stale. Worth correcting so the next reader does
   not go hunting for three missing pairs. Plan defect, no code change.

3. **[orchestrator]** `docs/design/design-system.md` §1 names Claude Code's config file
   and key inline, while `docs/protocol.md` deliberately withholds exactly that fact
   ("Where the setting lives and how it is read is `internal/claudecode`'s business — not
   specified here"). Not a hard-rule violation — the rule and D4 both scope to code, and
   D4 passes — but the two docs disagree on discipline, and the design doc will go stale
   silently if the file ever moves. Suggest reducing it to "Claude Code's own global
   config" with a pointer to `internal/claudecode`.

### Notes

1. **[note]** The contrast script excludes all six `:root`-prefixed blocks from the
   literal scan, including the bare font-stack `:root`, whereas INV-8's letter is
   "inside a `[data-theme]` block or the two terminal-pair blocks". A colour literal
   added to the font-stack block would therefore pass the gate. No such literal exists
   today and the block holds only font stacks, so nothing is wrong now — just a place
   the gate is one notch looser than the invariant it enforces.

2. **[note]** `--edge` on `--bg-hover` is not on the pair list, though `.seg-track label`
   dividers sit on `--bg-hover` once a segment is checked. The shipped list matches the
   plan's enumerated *Contrast pairs* section exactly, so this is an inherited scope
   choice rather than implementation drift, and the divider is arguably decorative.

3. **[note]** D11's interpretation is sound and I am not asking for a change. The
   implementation retries only when a previously *known* family reads unknown, compares
   against the last broadcast family, and treats initial-plus-retry as the "two
   consecutive failures". That matches D11's own parenthetical, "(the 250 ms retry
   path)", and the tests assert the branches directly with call counts and elapsed time.

4. **[note]** The `<head>` hint script does not validate the stored theme name, while
   `readThemeHint` in `theme.ts` does. An unrecognised stored name would set
   `data-theme="<garbage>"`, which still matches the bare `:root` block and paints
   Instrument — the same outcome the validating path produces, and the first snapshot
   corrects it either way.
