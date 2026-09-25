# Browser review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 11348 words (budget 8000) — WARN pack exceeds budget of 8000 words
**Rig**: tree at b137429. I ran `make web-build build`, and the helpers built `musterd` 0.1.0 and 0.2.0 from the same tree. Every cell got its own daemon from `helpers/fixtures.ts` `startDaemon`/`daemon`, each with:
- a space-bearing data dir `$TMPDIR/muster e2e-*`
- a private `<data dir>/tmux.sock`
- the helpers' stub `claude` (`$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`)

The release host was the helpers' `FakeReleaseServer`. Headless Chromium ran at 1280×720, plus 800×600 and 390×844 where noted, driven by a throwaway `web/e2e/zz-rbprobe.spec.ts` that I have since deleted. `git status --porcelain` shows none of my files. No `musterd` or `tmux` process is left.

The gates log (`-c2`, 0 failed lines; web-build green, e2e 453 passed) says the app I drove is the one that will ship.

I used the same instruments as cycle 1. A context-level `MutationObserver` recorder logs each `#banner` mutation with a `Date.now()` timestamp. Each entry holds the text, `hidden`, class, the computed display/background/foreground/border colours, the resolved `--banner-*` and neutral tokens, and the boxes of the banner, masthead and view. The recorder also logs `/ws` frames (`hello`, the `restarting` update) and `load` events across reloads.

"Routed" cells proxy `/ws` through `page.routeWebSocket` to the real daemon. That let me inject an `update` message (`apply.phase: "restarting"`), hold the socket down, rewrite the hello's `protocolVersion`, or hold the first snapshot. Oracles: `/api/state` `update` (install, remedy, `apply.error`), the 502 body of `POST /api/update/check`, and tmux `totalAttachedClients`.

The daemon a plain `daemon` fixture runs reports `running: "v0.18.3-30-gb137429"`, which carries its own `v`. So routed confirmation text reads `Updated to vv0.18.3-….` That is an artifact of the dev ldflags. GoReleaser's `{{.Version}}` has no `v`, and the real-restart cells (R1, R2) read exactly `Updated to v0.2.0.`.

## Cycle-1 issues re-measured

| Cycle 1 | Result now | Evidence |
|---|---|---|
| Major 1: Settings dialog overflows with an unmanaged remedy | fixed | S1–S3: `#update-status` 437–843 inside dialog 420–860. Dialog `scrollWidth 438 == clientWidth 438` at 1280 and 800, `356 == 356` at 390. Status line `overflow-wrap: anywhere`, `scrollWidth == clientWidth`. No button, input, label, legend, `.hint`, `dt` or `dd` past the dialog's edge, even with a 285-character space-bearing path |
| Major 2: dashboard fails to boot when the `sessionStorage` accessor throws | fixed | X5 accessor-throw: status `connected`, 0 page errors. A routed restart still reloads (2 loads, marker gone). After SIGTERM the banner is `display:block` with the unreachable text |
| Minor 1: confirmation up ~4 s | fixed | Six cells measured 3.043–3.053 s (R1 3043, R2 3052/3051, X1 3053/3052, X3 3053, X5 3051 ms) |
| Minor 2: E5/E1/E2 could not fail for those | fixed | E5 now bounds the duration at 2.7–3.4 s from its own observer. E1 and E2 call `expectRemedyContained`, which checks the box and `scrollWidth` |
| Minor 3: banner rewritten every second | fixed | X2: 1 mutation at the drop, **0** over 15.5 s down (including a Focus→Tiles switch), 1 at the return. X1: 0 mutations between the restarting display and the 30 s fallback (1349 → 30799 ms) |

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-14 / W11 | focus | daemon-down (real Update and restart) | restarting banner seen, exact text, alarm tokens | pass | R1: `restarting` frame at 444 ms, banner shown at 447 ms, hidden at the hello at 1957 ms (1.5 s). Text `Updating musterd to v0.2.0 — restarting; hook output…` is exact. Dark theme bg `rgb(59,32,32)`, fg `rgb(244,185,185)`, border `rgb(92,47,47)` equal the resolved `--banner-bg/-fg/-line` |
| REQ-14 | focus | daemon-down | placed under masthead, above view, no page overflow | pass | banner 0,46–1280,78; masthead bottom 46; view top 78; scrollWidth 1280 = clientWidth |
| REQ-14 | focus, tiles | daemon-down at 390×844 | placed, wraps, no horizontal scroll | pass | X1 in both views: banner 0,46–390,108 under masthead 46; banner and page `scrollWidth 390 == clientWidth 390` |
| REQ-14 / W11 | tiles | daemon-down (real restart, two windows) | restarting banner in each window | pass | R2: p0 and p1 both shown at 458/459 ms. Light theme `rgb(251,232,232)/(122,31,31)/(229,182,182)` equal the tokens. Box 0,46–1280,78 over tiles view top 78 |
| REQ-14 | pop-out | any | — | N/A — `doc.html` has no `#banner`, and `doc.ts` never relays `helloArrived` (only `wsapp.ts:88` does) | |
| REQ-14 | focus, tiles | data (record held, still connected) | banner stays hidden | pass | X1: 1.3 s after injection, `hidden=true`, computed `display:none`, in both views |
| REQ-14 | any | no data yet | — | N/A — no record can exist before an `update` message (plan § States) | |
| REQ-15 | focus | daemon-down (routed, instrument theme) | unreachable text at 30 s, record still held | pass | X1: record at 0, restarting text at 1349 ms, unreachable at 30799 ms. Alarm tokens `rgb(58,30,30)/(243,183,183)` equal instrument `--banner-*`. The return at 40.9 s still reloaded and confirmed |
| REQ-15 | tiles | daemon-down (routed, light) | same | pass | X1 tiles: unreachable at 30759 ms, light alarm tokens, reload and confirmation on return at 40.9 s (this closes cycle 1's Note 3 gap) |
| REQ-16 | focus | real restart | reloads on first hello | pass | R1: hello at 1956 ms, `load` at 1978 ms. Pre-click `window.__m` is gone afterwards |
| REQ-16 | tiles | real restart, two windows | each window reloads, view kept | pass | R2: p0 hello 1968 → load 1993; p1 hello 1979 → load 2005. Both markers gone, both still in Tiles |
| REQ-16 / edge 17 | focus | routed, hello `protocolVersion: 99` | reloads *rather than showing* the mismatch screen | **FAIL** | X5 proto99 (4 runs): `#protocol-mismatch` is unhidden 3–4 ms after the hello, and `load` follows 33–40 ms later. In 2 of 4 runs a double-`requestAnimationFrame` fired with the mismatch screen shown, so at least one frame was produced (Minor 1) |
| W7 | focus, tiles | reconnect | one reload per restart | pass | exactly one `load` per window per restart (R1, R2, X1 ×2, X5 ×4) |
| REQ-17 | focus | data (after real restart) | `Updated to v0.2.0.` for 3 s, then hidden | pass | R1: text exact, shown 2001 ms, hidden 5044 ms = 3.043 s |
| REQ-17 | tiles | data (after real restart, two windows) | confirmation in both windows, 3 s | pass | R2: p0 2003 → 5055 (3.052 s); p1 2014 → 5065 (3.051 s) |
| REQ-17 | focus | no data yet (routed, first snapshot held 3 s) | handoff waits for the first snapshot | pass | X3: banner `display:none` through the 3 s hold. Confirmation 3 ms after the snapshot was released, hidden 3.053 s later |
| REQ-17 / INV-3 / edge 19 | focus, tiles | second load of the same tab | nothing shown | pass | X1 in both views: `page.reload()`, banner hidden for 4.5 s |
| REQ-17 / edge 16 | focus | routed, record `9.9.9`, daemon runs another version | reload, no confirmation | pass | X5 ver-mismatch: 2 loads, banner hidden for 4.5 s |
| REQ-17 / edge 18 | focus | `sessionStorage` methods throw | reload still happens, no confirmation | pass | X5 methods-throw: 2 loads, marker gone, banner hidden, 0 page errors |
| REQ-17 / edge 18 | focus | `window.sessionStorage` accessor throws | dashboard boots, reload intact, daemon-down surfaced | pass | X5 accessor-throw: see cycle-1 table, Major 2 |
| REQ-18 / edge 20 | focus | routed: `restarting`, then `failed` while connected, then drop | record dropped, ordinary banner, no reload | pass | X4: unreachable text exact; `window.__m` survives the reconnect |
| REQ-19 / W10 | focus | data | neutral tokens, dark | pass | R1: bg `rgb(31,34,40)` = `--bg-raised`, fg `rgb(193,197,204)` = `--fg-muted`, border `rgb(58,63,73)` = `--line-control`; class `banner neutral` |
| REQ-19 / W10 | tiles | data | neutral tokens, light | pass | R2 and X1 tiles: `rgb(251,250,247)/(65,69,79)/(203,201,194)` equal the light tokens |
| REQ-19 / W10 | focus | data | neutral tokens, instrument | pass | X1 and X3: `rgb(23,26,36)/(178,182,195)/(52,58,74)` equal the instrument tokens |
| REQ-19 / W10 | focus, tiles | daemon-down | restarting and fallback keep `--banner-*` in all three themes | pass | R1 dark, R2 and X1 tiles light, X1 focus instrument (values above) |
| Banner daemon-down (unchanged) / INV-4 / edges 14, 23 | focus → tiles | daemon-down (SIGTERM, no record) | ordinary text, visible, placed; no reload on return | pass | X2: text exact, `display:block`, 0,46–1280,78 under masthead 46, view top 78. Marker kept after `restart()` |
| Banner daemon-down | focus, tiles | daemon-down | written only on change | pass | X2: 0 mutations over 15.5 s of steady down |
| Banner hidden | focus, tiles | data (connected) | `[hidden]` resolves to `display:none` | pass | every connected-state record: `hidden=true`, `display:none` |
| Edge 21 | tiles | real restart | each window reloads and confirms | pass | R2 (above) |
| Edge 22 | focus, tiles | routed drop | Settings dialog closes on the drop | pass | X1 in both views: `dialog.open` true before the drop, false 1 s after |
| §7 one live client | focus | after the real reload | one tmux client per session | pass | R1: `totalAttachedClients` = 1 five seconds after the confirmation |
| REQ-2 | Settings over focus | data | git-tree remedy exact, equals oracle, buttons disabled | pass | S1: text equals `/api/state` `update.remedy` (`can't update <space-bearing path>/musterd: it is inside the git checkout <root> — install with: curl …`); both buttons disabled |
| REQ-2 | Settings over focus | data at 1280, 800 and 390 | status line contained, no clipped control, dialog reachable | pass | S1: status 437–843 / 197–603 / 33–357 inside dialog 420–860 / 180–620 / 16–374. `scrollWidth == clientWidth` at each size. At 800×600, `scrollHeight 681 > clientHeight 562` with `overflow-y:auto` |
| REQ-1 | Settings over tiles | data (285-character space-bearing path) | not-writable remedy exact, `(permission denied)` | pass | S2: text = `/api/state` remedy = expected string |
| REQ-1 | Settings over tiles | data at 1280, 800 and 390 | contained, reachable | pass | S2: 437–843 / 197–603 / 33–357 inside the dialog. Dialog `sw == cw`. At 1280×720, `sh 749 > ch 682` with `overflow-y:auto` |
| Edge 1 | Settings over focus | data | `.git` removed + Check now (pointer) enables Update, clears the line | pass | S1: both buttons enabled, text `""`, oracle `install: installer`, `remedy: null` |
| Edge 2 | Settings over tiles | data | `chmod 0755` + Check now (keyboard Enter) enables Update | pass | S2: enabled, text `""`, oracle `installer` / `null` |
| Edge 3 | Settings over focus | data | installer → `chmod 0555` → Check now flips to unmanaged, contained | pass | S3: oracle `installer` → `unmanaged`, REQ-1 remedy exact, buttons disabled, contained (437–843) |
| REQ-3 / edge 7 | Settings over focus | data | Homebrew remedy unchanged, contained, survives Check now | pass | S4: `installed by Homebrew — run brew upgrade musterd`, 437–843 inside 420–860, oracle `homebrew`, unchanged after Check now |
| REQ-8 | Settings over focus | data | each check-failure class exact, equal to the 502 body, contained | pass | S5, each 502 `check_failed` equal to `#update-status`, all contained: `…couldn't reach the release host (connection refused)`, `(host not found)`, `(timed out)` (10.3 s), `…the release host answered 404, not a redirect`, `…the latest release tag "nightly-build" is not a release version` |
| REQ-9 | Settings over focus | data | apply failures with the `Update failed: ` prefix, equal to the oracle | pass | S6: `couldn't download musterd_0.2.0_darwin_amd64.tar.gz (connection refused); nothing was installed`, `…musterd_0.3.0_darwin_amd64.tar.gz (status 404); nothing was installed`, `couldn't download checksums.txt.minisig (status 404) — this release has no signature, refusing to apply`. Each equals `/api/state` `apply.error` and is contained |
| REQ-10 | Settings | data | no `://` in any check or apply failure | pass | all 8 classes above: `hasURL=false` |
| Status line | Settings | daemon-down | — | N/A — the dialog closes on every drop (edge 22, measured) | |
| Status line | Settings | no data yet | — | [note] not measured — Note 3 | |
| REQ-4–7, 11–13 | — | — | — | N/A — daemon-side (review-work). Their visible effects are the edge 1–3 and REQ-8/9 rows | |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** When the daemon comes back speaking another protocol version, a window holding a restart record briefly shows the protocol-mismatch screen before it reloads. `ws.ts` `dispatch` calls `onHelloArrived()`, and `updaterestart.ts` then calls `location.reload()`. `reload()` only schedules the navigation, so `dispatch` keeps going into `onProtocolMismatch`, and `connection.showProtocolMismatch()` hides `#app`, unhides `#protocol-mismatch` and focuses it.
   - Measured over 4 runs of X5 proto99: the mismatch screen was unhidden 3–4 ms after the hello, and the reload's `load` came 33–40 ms later. In 2 of the 4 runs a double-`requestAnimationFrame` fired with the screen shown, so a frame was produced.
   - REQ-16 and edge 17 say the protocol bump "reloads rather than showing the mismatch screen". Cycle 1 recorded this cell as a pass, with an instrument that did not look for a painted frame.
   - A fix must keep `#protocol-mismatch` hidden and `#app` shown from the hello through the unload whenever the reload fires. For example, the reloading path could suppress the mismatch gate for that hello. W6 covers only that `reload` is called, so it could not fail for this.

### Notes

1. **[note]** REQ-15 fallback timing: the unreachable text appeared 30.76–30.80 s after the record arrived (X1, both views), which is the 1 s render tick's granularity. The confirmation now has its own timer; the fallback does not. No change requested, since the plan states no precision here.
2. **[note]** In X5 proto99 the route kept rewriting the hello after the reload, so the fresh page showed the mismatch screen. That is the correct steady state for a real protocol bump against a stale bundle; the real flow serves a matching bundle. It is not a defect.
3. **[note]** I did not measure the Settings dialog before the first snapshot. The plan changes nothing about the dialog's no-data rendering.
4. **[note]** I did not re-measure keyboard focus retention on Check now. Cycle 1's Note 2 (focus goes to `BODY` while the button disables itself) predates this plan, and `render/update.ts` is untouched.
5. **[note]** Pop-out (`/doc.html`) has no banner and no hello relay, so a pop-out open across an update restart keeps its old bundle. That is outside this plan and unchanged since cycle 1.
6. **[note]** I did not re-measure E4's on-disk byte identity. It is a filesystem fact, and E4 is green in the gates log. The download-failure text itself was measured (S6).
