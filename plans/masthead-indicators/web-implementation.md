# Web Implementation: masthead-indicators

**Plan**: masthead-indicators
**Mode**: initial
**Pack**: kb: pack 21117 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/index.html` | edited | REQ-1: `#usage-model` removed. REQ-6/7: `#connection-status` now holds a `.sr-only` word child and starts at `data-health="pending"`. |
| `web/src/protocol/usage.ts` | edited | REQ-2: `Usage.model` and its parse block removed; a stray `model` key on the wire is ignored. |
| `web/src/protocol/messages.ts` | edited | Comment no longer names `usage.model`. |
| `web/src/features/usage.ts` | edited | REQ-1: no model readout lookup or render call. |
| `web/src/render/masthead.ts` | edited | `renderUsageModel` removed; `renderConnectionStatus` takes a `ConnectionHealthDescription` and writes the hidden word, `data-health` and `title` only when they changed; `renderUsageBucket` sets the reset `title` (REQ-12). |
| `web/src/features/connectionhealth.ts` | created | `describeConnectionHealth(status, override)`: the pure ok/pending/down derivation with word and title (REQ-6/7/8/9, INV-1). |
| `web/src/features/connection.ts` | edited | The dot renders in the per-tick render phase beside the banner, from the same `restartBanner` call, so INV-1 holds by construction. |
| `web/src/sessions/format.ts` | edited | REQ-4: `formatResets` returns `(HH:MM)` / `(HH:MM Ddd)`; new `formatResetsTitle` (REQ-12). |
| `web/src/sessions/usage.ts` | edited | REQ-4/5: view model drops the `· ` prefix, adds `resetsTitle` (null while unknown). |
| `web/src/style.css` | edited | REQ-10: `--health-ok/-pending/-down` in all three theme blocks; the dot rule on `#connection-status::before` (6px round); `.masthead-right > .model` elasticity and `.model[hidden]` removed; stale comments reworded. |
| `web/scripts/contrast-pairs.json` | edited | Three pairs: each health token against `--bg-raised` at 3:1 (W11). |

## Decisions

- REQ coverage: REQ-1..REQ-12 are all in Changes. REQ-3 is daemon-side only (nothing here reads or writes history).
- design: `features/connectionhealth.ts` beside `connection.ts` follows `connectionversion.ts` exactly: a pure derivation with one controller caller, returning a description type declared in `render/masthead.ts` (`ConnectionHealthDescription`, like `ClaudeVersionDescription`); `render/` never imports `features/` or `app`. Precedent grep: `rg -n "describeClaudeVersion|ClaudeVersionDescription" web/src` finds that pair; nothing else derives a health state.
- design: the dot is evaluated in `connection.ts`'s existing per-tick `onRender`, using the same `deps.restartBanner(frame.now, frame.connection)` result as the banner; the old `onChange` call is gone, as `app.render()` already runs on every status change. The state owner is `app.state.connection` plus `updaterestart.ts`'s record; the dot holds no state of its own.
- design: `renderConnectionStatus` skips unchanged writes (word, `data-health`, `title`) because the host is `role="status"` and a per-tick text rewrite would be re-announced; no cross-call state needed, the DOM is the comparison.
- design: the dot is the host's `::before` (6px, `border-radius: 50%`) inside a 14px hit box that carries `title`; the word is a `.sr-only` child. `dotColour` in `helpers/masthead.ts` finds the colour on the host's `::before`. Measured in Chromium against the built stylesheet: `::before` 6px x 6px, radius 50%, host 14px, hidden word box 1px, in all three themes.
- design: tokens are `--health-ok`, `--health-pending`, `--health-down`. Hues: ok 123/130/138 deg, pending 49/49/47 deg, down 18/18/17 deg, so none lies in the amber (25-45), rose (345-15), violet or teal bands. Contrast against `--bg`/`--bg-raised`/`--bg-hover` is 4.2:1 to 10.9:1 (computed with the same luminance formula as `contrast.mjs`); `make contrast` reports 46 pairs, 0 failures in each theme. The down hue is a red-orange rather than the banner's pink-red because a banner-red hue would sit inside the rose band; whether it reads as "the same alarm" is for the reviewer's eye.
- design: `formatResetsTitle` sits next to `formatResets` and reuses its `clockText`, so the title's `HH:MM` cannot drift from the suffix's. `sessions/format.ts` is touched only for the reset formatters.
- design: the bare `.model` rule stays in `style.css` because the Focus mainhead's meta row (`index.html`, `.mainhead .meta .model`) is the same class and inherits its font and tabular-nums.
- INV-1 edge: a `reconnecting` status with the neutral post-update confirmation override showing is rendered `down`, not `ok`. The plan's INV-1 does not cover that pair, and green with a lost socket would be dishonest. It lasts at most 3 s after the confirmation starts.
- No Testable UI Elements row is unimplementable. Names, roles, `data-health` values and titles are the table's exact strings.
- A `biome-ignore` on `parseUsage` stays: complexity is 20 with the model block gone (measured by removing the suppression: "reduce its complexity score from 20 to the max allowed complexity 15"); its doc comment now says 20.
- No size warning on a touched file (`make size-warn | rg` over the touched web files: none).
- doc-delta: design-system §5 Masthead names "daemon health" and a model-less right group; the health readout is now a dot with its word hidden and the detail on hover, and `--green` (§1 note) is superseded by the three `--health-*` tokens.
- doc-delta: the stale `.model` elasticity text in `docs/design/design-system.md` §5 ("the model name is the one readout that truncates") is no longer true; nothing in the masthead truncates.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on sanctioned test files only: `web/src/render/masthead.test.ts` (imports `renderUsageModel`, which the plan removes; its `renderConnectionStatus` tests pass a string, now a `ConnectionHealthDescription`) and `web/src/ws.test.ts:70` (a `Usage` literal with `model`). `npx vite build` and `npm run -s lint` exit 0 (`make web-build` therefore stops at tsc; the bundle was built with `npx vite build`, then `make build`).
**E2E smoke**: `18 passed (22.0s)` for `masthead-indicators.spec.ts`, `masthead-update-dot.spec.ts` and `masthead-layout.spec.ts`.

Test files needing changes (web-tests), all red now for the plan's approved delta (28 Vitest failures, measured with `npx vitest run`):
- `web/src/render/masthead.test.ts`: delete the `renderUsageModel` block (`:491+`) and its import (X1 also flags it); rewrite the `renderConnectionStatus` cases (`:134`) for a `ConnectionHealthDescription` (hidden `.sr-only` word, `data-health`, `title`); the known-bucket resets expectations (`resets ...` to bracketed form, plus `title`).
- `web/src/sessions/format.test.ts:179-206`: `resets HH:MM` / `resets <weekday>` to `(HH:MM)` / `(HH:MM Ddd)`; add `formatResetsTitle`.
- `web/src/sessions/usage.test.ts:36`: the `· ` prefix; add `resetsTitle`.
- `web/src/protocol/usage.test.ts:33-58`: `usage.model` parsing and rejection cases become "a stray `model` key is ignored and not exposed".
- `web/src/ws.test.ts:70` and the "dispatches a usage frame" / snapshot cases that carry `model`.
- New unit tests: `features/connectionhealth.ts` (W4/W5; note the reconnecting + neutral-override pair returns `down`), the three tokens in each theme block (W6).

Spec locator mismatches for validate: none (all 18 pass as authored).

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: review Minor 1 — `web/src/features/CLAUDE.md` pure-helper list omitted `connectionhealth.ts`.
**Changes made**: added `connectionhealth.ts` to the hand-written "pure ones" list in `web/src/features/CLAUDE.md` (alphabetical, between `batchplan.ts` and `connectionrestore.ts`). The GENERATED trailer was not touched. Other consumers of the list: none; the only other pure helpers in `features/` were already listed.
**Decisions**: none new; no code change. The developer's two cycle-1 decisions (kb:adr/connection-dot-red-during-update-confirmation, kb:adr/connection-health-dot-hues-kept) need no web change.
