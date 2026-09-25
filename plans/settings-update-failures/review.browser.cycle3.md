# Browser review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 17586 words (budget 8000) — WARN pack exceeds budget of 8000 words
**Rig**: tree at 8520a5c. I ran `make web-build build`, giving `bin/musterd` v0.18.3-42-g8520a5c, and the helpers built `musterd` 0.1.0 and 0.2.0 from the same tree. Every cell got its own daemon from `helpers/fixtures.ts` `daemon`/`startDaemon`, each with:
- a space-bearing data dir `$TMPDIR/muster e2e-*`
- a private `<data dir>/tmux.sock`
- the helpers' stub `claude` (`$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`)

Release hosts were the helpers' `FakeReleaseServer` plus a probe-local Node server for the classes it can't produce (300 with a malformed or missing `Location`, a hung request). Headless Chromium ran at 1280×720, plus 800×600, 1024, 1100 and 390×844 where noted, driven by a throwaway `web/e2e/zz-rbprobe3.spec.ts` that I have since deleted. `git status --porcelain` shows none of my files; the two `??` entries are the other reviewers' parts. No `musterd` or `tmux` process is left.

The gates log (`-c3`, 0 failed lines; web-build green, e2e 454 passed) says the app I drove is the one that will ship.

**Instruments.** A context-level `MutationObserver` recorder logged, with a Node-side `Date.now()` timestamp, each of:
- every `#banner` mutation: text, `hidden`, class, computed display/background/foreground/border colours, and the boxes of the banner, masthead and view
- every `#protocol-mismatch` and `#app` attribute mutation: `hidden`, computed `display`, `document.activeElement`

A continuous `requestAnimationFrame` sampler reported any frame where `#protocol-mismatch` was displayed or `#app` was not. The recorder also logged `load` events, which survive reloads through an exposed binding, and the `/ws` frames seen by a `page.routeWebSocket` proxy. The proxy let me inject `update` messages, hold the socket down, rewrite a hello's `protocolVersion`, or hold the first snapshot.

**Oracles:** `/api/state` `update`, the 502 body of `POST /api/update/check` read in the same step, and tmux `totalAttachedClients`.

## Cycle-2 issues re-measured

| Cycle 2 | Result now | Evidence |
|---|---|---|
| Minor 1: mismatch screen painted before the restart reload | fixed | P1 ran 8 times (4 in Focus, 4 in Tiles). Every run: **0** `#protocol-mismatch`/`#app` mutations between the record and the unload, **0** rAF frames with the mismatch screen displayed or `#app` hidden, exactly one `load` 20–42 ms after the rewritten hello, and the pre-click marker gone afterwards. The fresh page ends with `#protocol-mismatch` `display:none` and `#app` `display:flex`, and Tiles stays pressed in the Tiles runs |
| Minor 1 regression check: the gate must not swallow a real mismatch | pass | P2, no record: `#protocol-mismatch` `display:flex`, `visibility:visible`, `opacity:1`, `#app` `display:none`, focus on `#protocol-mismatch`, 0 loads over 3 s, marker kept. P2, record then `failed` while connected (record dropped): identical |

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-16 / edge 17 | focus | routed: record held, reconnect hello `protocolVersion: 99` | reloads *rather than showing* the mismatch screen | pass | P1 focus ×4: hello at 814–818 ms, `load` at 842–856 ms. 0 mismatch mutations, 0 bad frames |
| REQ-16 / edge 17 | tiles | same | same | pass | P1 tiles ×4: hello at 810–814 ms, `load` at 831–842 ms. 0 mismatch mutations, 0 bad frames, `aria-pressed=true` after reload |
| REQ-16 / edge 17 | focus | record held, `sessionStorage` accessor throws, proto 99 | reloads, no mismatch frame, no page error | pass | X5-accessor: 1 load, 0 mismatch mutations, 0 bad frames, `pageerror` list empty, marker gone |
| Protocol mismatch (unchanged) | focus | no record / record dropped, proto 99 | mismatch screen still shown, no reload | pass | P2 (table above) |
| REQ-14 / W11 | focus | daemon-down (real Update and restart, dark) | restarting banner seen, exact text, alarm tokens | pass | R1: shown at 442 ms, text `Updating musterd to v0.2.0 — restarting; hook output in open panes is Muster's absence, not session failure.`. `display:block`, bg `rgb(59,32,32)` / fg `rgb(244,185,185)` / border `rgb(92,47,47)`, equal to the resolved `--banner-bg/-fg/-line` |
| REQ-14 | focus | daemon-down | placed under masthead, above view, no page overflow | pass | R1: banner 0,46–1280,78; masthead 0,0–1280,46; view top 78; page `scrollWidth 1280 == clientWidth` |
| REQ-14 / W11 | tiles | daemon-down (real restart, two windows, light) | restarting banner in each window | pass | R2: p0 shown at 477 ms, p1 at 475 ms. Light `rgb(251,232,232)/(122,31,31)/(229,182,182)` equal the tokens. Box 0,46–1280,78 over `#view-tiles` top 78 |
| REQ-14 | focus, tiles | daemon-down at 390×844 (routed) | placed, wraps, no horizontal scroll | pass (see Note 3) | X6: banner height 46–108 (wraps), `scrollWidth 390 == clientWidth 390` for page and banner. Its x-range was shifted by a pre-existing masthead scroll (Note 3) |
| REQ-14 | focus | daemon-down at 800/1024/1100, Settings reached by keyboard | text fully on screen | pass | X8: `#app scrollLeft 0` at each width. Text range 16–747 / 16–884 / 16–884 inside banner 0–800 / 0–1024 / 0–1100 |
| REQ-14 | focus, tiles | data (record held, still connected) | banner stays hidden | pass | X6: 1.3 s after injection, `hidden=true`, computed `display:none`, both views |
| REQ-14 | pop-out | any | — | N/A — `doc.html` has no `#banner`, and only `wsapp.ts` relays `helloArrived` | |
| REQ-14 | any | no data yet | — | N/A — no record can exist before an `update` message (plan § States) | |
| REQ-15 | focus | daemon-down (routed, instrument) | unreachable text at 30 s, record still held | pass | X1: restarting text at 1008 ms, unreachable at 30783 ms. Alarm tokens `rgb(58,30,30)/(243,183,183)/(90,44,44)` equal instrument `--banner-*`. Released at 33 s, the return still reloaded (`load` 40576 ms) |
| REQ-15 | tiles | daemon-down | same | N/A this cycle — the fallback code is untouched since cycle 2's tiles pass (`updaterestart.ts` diff is `reloading()` only). Tiles placement of the same element is measured in R2/X2t | |
| REQ-16 | focus | real restart | reloads on first hello | pass | R1: restarting hidden at the hello 1952 ms, `load` 1971 ms. Marker gone |
| REQ-16 | tiles | real restart, two windows | each reloads, view kept | pass | R2: p0 `load` 2009 ms, p1 2023 ms. Both markers gone, both `aria-pressed=true` on Tiles |
| W7 | focus, tiles | reconnect | one reload per restart | pass | exactly one `load` per window in P1 ×8, R1, R2 ×2, X1, X5 ×2 |
| REQ-17 | focus | data (after real restart) | `Updated to v0.2.0.` for 3 s, then hidden | pass | R1: shown 1990 ms, hidden (`display:none`) 3.042 s later |
| REQ-17 | tiles | data (after real restart, two windows) | confirmation in both, 3 s | pass | R2: p0 3.040 s, p1 3.039 s |
| REQ-17 | focus | no data yet (routed, first snapshot held 3 s) | handoff waits for the first snapshot | pass | X3: `display:none` from 24 ms through the hold. Snapshot released at 3034 ms, confirmation at 3037 ms, hidden at 6089 ms (3.052 s) |
| REQ-17 / INV-3 / edge 19 | focus | second load of the same tab | nothing shown | pass | X3: second `reload()`, 0 unhidden banner mutations over 4.5 s |
| REQ-17 / edge 16 | focus | routed, record `9.9.9`, daemon runs another version | reload, no confirmation | pass | X5-ver: 1 load, marker gone, 0 `Updated…` displays over 4.5 s |
| REQ-18 / edge 20 | focus | routed: `restarting`, then `failed` while connected, then drop | record dropped, ordinary banner, no reload | pass | X4: text `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`, 0 loads, marker kept |
| REQ-19 / W10 | focus | data | neutral tokens, dark | pass | R1: class `banner neutral`, bg `rgb(31,34,40)` = `--bg-raised`, fg `rgb(193,197,204)` = `--fg-muted`, border `rgb(58,63,73)` = `--line-control` |
| REQ-19 / W10 | tiles | data | neutral tokens, light | pass | R2: `rgb(251,250,247)/(65,69,79)/(203,201,194)` equal the light tokens, both windows |
| REQ-19 / W10 | focus | data | neutral tokens, instrument | [note] not re-measured — Note 5 | |
| Banner daemon-down / INV-4 / edges 14, 23 | focus | daemon-down (SIGTERM, no record) | ordinary text, visible, placed, written once, no reload on return | pass | X2: `display:block`, 0,46–1280,78 under masthead 46, view top 78. **0** mutations over 12 s down, 0 loads, marker kept; `display:none` after return |
| Banner daemon-down | tiles | same | same | pass | X2t: same text and tokens, box 0,46–1280,78 over `#view-tiles`, 0 mutations over 5 s, 0 loads |
| Banner hidden | focus, tiles | data (connected) | `[hidden]` resolves to `display:none` | pass | every connected-state record (R1, R2, X2, X3, X6) |
| Edge 21 | tiles | real restart | each window reloads and confirms | pass | R2 |
| Edge 22 | focus, tiles | routed drop | Settings dialog closes on the drop | pass | X6: `dialog.open` true before, false 1.5 s after, both views |
| §7 one live client | focus / tiles | after the real reload | one tmux client for the session | pass | R1 and R2: `totalAttachedClients` = 1, five seconds after the confirmation |
| REQ-2 / edge 1 | Settings over focus | data at 1280/800/390 | git-tree remedy exact and equal to the oracle, buttons disabled, contained; `.git` removed + Check now (pointer) enables | pass | S1: text = `/api/state` `remedy` = expected (space-bearing root). Status 437–843 / 197–603 / 33–357 inside dialog 420–860 / 180–620 / 16–374. Dialog `scrollWidth == clientWidth` at all three; no control past the dialog's edge. At 800×600, `scrollHeight 681 > clientHeight 562` with `overflow-y:auto`. After: text `""`, both enabled, oracle `installer`/`null` |
| REQ-1 / edge 2 | Settings over tiles | data at 1280/800/390 (287-character space-bearing path) | not-writable remedy exact, contained, reachable; `chmod 0755` + Check now (keyboard Enter) enables | pass | S2: text = oracle = expected `…is not writable (permission denied) — install with: …`. Contained at all three widths. At 1280×720, `sh 816 > ch 682` with `overflow-y:auto`. After: `""`, oracle `installer`/`null` |
| Edge 3 | Settings over focus | data | installer → `chmod 0555` → Check now flips to unmanaged | pass | S3: oracle `installer` → `unmanaged`, REQ-1 remedy exact, buttons disabled, contained at 1280/800/390 |
| REQ-3 / edge 7 | Settings over focus | data | Homebrew remedy unchanged, contained, survives Check now | pass | S4: `installed by Homebrew — run brew upgrade musterd`, oracle `homebrew`, contained, unchanged after Check now |
| REQ-8 | Settings over focus | data at 1280/800/390 | every check-failure class exact, equal to the 502 body, contained | pass | S5, each `#update-status` equals the 502 `check_failed` message and is contained at all three widths: `…couldn't reach the release host (connection refused)`, `(host not found)`, `(timed out)` (10.0 s), `…answered 404, not a redirect`, `…tag "nightly-build" is not a release version` |
| REQ-8 / REQ-10 fourth class (new this cycle) | Settings over focus | data | fourth-class fallback has no URL | pass | S5: a 300 with malformed `Location` and a malformed base URL (`http://[::1`) both read `update check failed: the release host's response couldn't be read`. A 300 with no `Location` reads `update check failed: latest release redirect carried no Location header`. All equal the 502 body, all contained, `hasURL=false` |
| REQ-9 | Settings over focus | data at 1280/800/390 | apply failures with `Update failed: `, equal to the oracle | pass | S6: `…couldn't download musterd_0.2.0_darwin_amd64.tar.gz (connection refused); nothing was installed`, `…musterd_0.3.0_darwin_amd64.tar.gz (status 404); nothing was installed`, `…checksums.txt.minisig (status 404) — this release has no signature, refusing to apply`. Each equals `Update failed: ` + `/api/state` `apply.error`, and each is contained |
| REQ-10 | Settings | data | no `://` in any check or apply failure | pass | all 12 classes above: `hasURL=false` |
| Status line | Settings | daemon-down | — | N/A — the dialog closes on every drop (edge 22, measured) | |
| Status line | Settings | no data yet | — | [note] not measured — Note 6 | |
| REQ-4–7, 11–13 | — | — | — | N/A — daemon-side (review-work's). Their visible effects are the edge 1–3 and REQ-8/9 rows | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** A 302 whose `Location` is malformed reads `update check failed: couldn't reach the release host (an unreadable response)`, although the host did answer. No URL leaks, and cycle 2's review-work called this wording correct, so I request no change. The statement itself is review-work's to judge.
2. **[note]** The committed spec for the mismatch race records `#protocol-mismatch`/`#app` mutations and compares them with the reload's `load`. Cycle 2 measured the mismatch screen unhidden 3–4 ms after the hello and 33–40 ms before `load`, so this spec would have failed on the old code. I did not run it against pre-fix source, because editing source is outside my remit.
3. **[note]** Pre-existing, not this plan. At 390×844 the masthead is 968 px wide inside `#app` (`overflow-x:hidden`), which puts the Settings button at x 700–778, off screen. Focusing it (Playwright's click, or Tab) sets `#app.scrollLeft` to 544. After that the banner box is −544…−154, so it is entirely off screen, and the restarting and ordinary daemon-down banners can't be seen until the page is reloaded.
   - At 800, 1024 and 1100 the scroll stays 0 and the banner text is fully visible (X8). SPEC §3.6 lists phone access as "Not built".
   - I'm recording this so the masthead's narrow-width behaviour can be picked up separately if wanted.
4. **[note]** Pre-existing, not this plan. Clicking Tiles while the daemon is down does nothing (`aria-pressed` stays `false`, `#view-tiles` stays hidden), because the view is a daemon-owned pref. Cycle 2's X2 described a Focus→Tiles switch while down; the switch never actually happened there either. I measured Tiles daemon-down by switching before the kill (X2t).
5. **[note]** I did not re-measure REQ-19's instrument-theme neutral tokens or REQ-15's Tiles fallback this cycle. Cycle 2 passed both, and nothing since touches `style.css`, `connection.ts`, `render/banner.ts` or the fallback branch of `computeBannerOverride`. The web diff since cycle 2 is `updaterestart.ts` `reloading()`, `wsapp.ts` `onProtocolMismatch`, and `main.ts` passing the handle.
6. **[note]** I did not measure the Settings dialog before the first snapshot, and I did not re-measure keyboard focus retention on Check now (cycle 1 Note 2, pre-existing; `render/update.ts` is untouched).
7. **[note]** In P1, a window whose reconnect hello is mismatched goes on to process that socket's snapshot on the old bundle for the 20–40 ms before unload. The banner flips to hidden about 1 ms before `load`, and nothing paints differently. This is not a defect.
8. **[note]** With the dev ldflags, the plain `daemon` fixture reports `running: "v0.18.3-42-g8520a5c"`, so X3's confirmation reads `Updated to vv0.18.3-….`. That is an artifact of the dev build. GoReleaser builds carry no `v`, and the real-restart cells (R1, R2) read exactly `Updated to v0.2.0.`.
