# S5 — Browser-reserved keyboard chords (plan `shortcut-fixes`)

Measured 2026-09-01 on macOS Darwin 25.6, via the guided key-probe page kept alongside this
file at `spikes/key-probe.html`, opened as a `file://` URL — no build step, no server, no
dependency on musterd. Re-run it whenever a keyboard binding is added or changed:

```
open -a Safari spikes/key-probe.html && open -a "Google Chrome" spikes/key-probe.html
```

Open two or three extra tabs in the window first, so a ⌘-digit tab switch is observable.
Edit the `CANDIDATES` array to probe different chords; click any table row to re-test a
single combo after a mis-press.

For each candidate chord the page records whether the `keydown` reached the page, or the
browser handled it above the page — the latter evidenced by the probe losing focus or
visibility.

**Why this needed measuring at all**: chords dispatched by the *browser chrome* (new
window, new tab, tab switch) never reach the document, so `preventDefault()` cannot
suppress them. Muster's ⌘N was one ([#5](https://github.com/Zalaras/muster/issues/5)).

**Why the E2E suite could not measure it**: Playwright injects key events *below* the
browser chrome. `web/e2e/views.spec.ts:110` pressed `Meta+1` green for the whole period
⌘1 was broken in Safari. Any claim that `make e2e` verifies a chord is safe is false.

## Safari

| Chord | Verdict | Evidence |
|---|---|---|
| ⌘N | **BLOCKED** | page lost focus — new window |
| ⇧⌘N | **BLOCKED** | page lost focus — new private window |
| ⌘1 | *not measured* | skipped during the run |
| ⌘2 | *not measured* | skipped during the run |
| ⌘9 | *not measured* | skipped during the run |
| ⌥⌘1 – ⌥⌘9 | **SAFE** (all nine) | keydown reached the page, `code=Digit1`…`Digit9` |
| ⌥⌘N | **SAFE** | `code=KeyN` |
| ⌘K | **SAFE** | `code=KeyK` |
| ⌘/ | **SAFE** | `code=Slash` |
| ⌘; | **SAFE** | `code=Semicolon` |
| ⌘↩ | **SAFE** | `code=Enter` |
| ⇧⌘K | **SAFE** | `code=KeyK` |
| ⌥⌘0 | **SAFE** | `code=Digit0` |
| ⌥⌘J | **SAFE** | `code=KeyJ` |
| ⇧⌘↩ | **SAFE** | `code=Enter` |
| ⌘\ | **SAFE** | `code=Backslash` — on re-measurement; the first run's BLOCKED was a mis-press |
| ⌘↑ | **SAFE** | `code=ArrowUp` |

## Chrome

| Chord | Verdict | Evidence |
|---|---|---|
| ⌘N | **BLOCKED** | page lost focus — new window |
| ⇧⌘N | **BLOCKED** | page lost focus — new incognito window |
| ⌘1 | **SAFE** | `code=Digit1` — see caveat below |
| ⌘2 | **SAFE** | `code=Digit2` — see caveat below |
| ⌘9 | **SAFE** | `code=Digit9` — see caveat below |
| ⌥⌘1 – ⌥⌘9 | **SAFE** (all nine) | `code=Digit1`…`Digit9` |
| ⌥⌘N | **SAFE** | `code=KeyN` |
| ⌘K | **SAFE** | `code=KeyK` |
| ⌘/ | **SAFE** | `code=Slash` |
| ⌘; | **SAFE** | `code=Semicolon` |
| ⌘↩ | **SAFE** | `code=Enter` |
| ⇧⌘K | **SAFE** | `code=KeyK` |
| ⌥⌘0 | **SAFE** | `code=Digit0` |
| ⌥⌘J | **SAFE** | `code=KeyJ` |
| ⇧⌘↩ | **SAFE** | `code=Enter` |
| ⌘\ | **SAFE** | `code=Backslash` |
| ⌘↑ | **SAFE** | `code=ArrowUp` |

**Caveat on Chrome's ⌘-digit rows.** The probe `preventDefault()`s on match, and no tab
switch followed, which is evidence the page can win the chord. That inference is only
sound if the probe window actually held ≥2 tabs during the run — with a single tab, ⌘2 has
no target and Chrome may decline to act for an unrelated reason. Tab count during the
Chrome run was not confirmed. Treat these three rows as *indicative, not conclusive*.

## Findings

1. **⌘N is browser-reserved in Safari** — confirms the reported bug, and confirms it is
   not fixable by `preventDefault()`.
2. **⇧⌘N is equally reserved** (New Private Window). The rebind suggested in `TODO.md` and
   in issue #5 would not have fixed anything. Reasoning-from-memory produced that
   suggestion; the probe is what caught it.
3. **The ⌥⌘ family is entirely clear in Safari** — all nine digits, plus `Digit0`, `KeyN`
   and `KeyJ`. This is the family `shortcut-fixes` adopts.
4. **⌘N and ⇧⌘N are reserved in *both* browsers.** The one chord family that is
   unambiguously unusable.
5. **Chrome does not reserve ⌘-digits** (indicative — see the caveat). This contradicts the
   common belief, repeated in the first draft of `plans/shortcut-fixes/plan.md`, that ⌘1–9
   is broken everywhere. It is not broken in Chrome.
6. **Safari's ⌘1/⌘2/⌘9 remain unmeasured**, so whether ⌘1–9 was ever broken for Damian is
   still unknown. It is plausible — Safari's "⌘1 through ⌘9 switch tabs" preference is on
   by default — but this file must not be cited as evidence that it was.
7. **The ⌥⌘ family is clear in both browsers**, every candidate, with no caveat. That is
   what makes it the right choice regardless of how the ⌘-digit question resolves: the
   rebind is justified by the destination being provably safe, not by the origin being
   provably broken.
8. **⌘\ is SAFE in both browsers.** Its first Safari run recorded BLOCKED; re-measurement
   after the reported mis-press returned SAFE (`code=Backslash`). Muster's existing view
   toggle needs no change. Worth noting as a probe-methodology point: a single BLOCKED
   reading from a guided run is not self-validating — the auto-detect fires on any focus
   loss, so a fumbled chord and a genuine steal look identical. Re-measure before acting on
   a lone BLOCKED.
