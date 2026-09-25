# Browser review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 17586 words (budget 8000) — WARN pack exceeds budget of 8000 words
**Rig**: tree at 218b109. I ran `make web-build build`, giving `bin/musterd` v0.18.3-51-g218b109, and the helpers built `musterd` 0.1.0 and 0.2.0 from the same tree. Every cell got its own daemon from `helpers/fixtures.ts` `daemon`/`startDaemon`, each with:
- a space-bearing data dir `$TMPDIR/muster e2e-*`
- a private `<data dir>/tmux.sock`
- the helpers' stub `claude`

The release host was the helpers' `FakeReleaseServer`, plus a refused port (`127.0.0.1:1`) for the check-failure smoke test. Headless Chromium ran at 1280×720, driven by a throwaway `web/e2e/zz-rbprobe4.spec.ts`: 16 cells, all run, all passed, and the spec is now deleted. `git status --porcelain` shows none of my files; the three `??` entries are the other reviewers' parts and `doc-delta.md`. No `musterd` or `tmux` process is left.

The gates log (`-c4`, 0 failed lines; web-build green, e2e 454 passed) says the app I drove is the one that will ship.

**Scope.** The only change since cycle 3 that has a runtime effect is c829d15. It moves the check that suppresses the protocol-mismatch screen during the restart reload out of `wsapp.ts` `onProtocolMismatch` and into `connection.ts` `showProtocolMismatch`, reached through `ConnectionDeps.reloading`. `main.ts` now builds `ConnectionDeps` with two members and no longer passes `updateRestart` to `dashboardWsHandlers`. The `failure.go` change is a comment only.

I re-measured every cell that the moved check or the rebuilt deps object can reach:
- the reload-instead-of-mismatch race
- a real mismatch, which must still show the screen
- the restart banner and confirmation, which read `restartBanner` from the same deps object
- the ordinary daemon-down banner

I also ran one Settings status-line smoke test against the fresh binary. The instruments are cycle 3's:
- a context-level `MutationObserver` recorder (Node-side `Date.now()`, bound through `exposeFunction` so it survives reloads) on `#banner`, `#protocol-mismatch` and `#app`, logging computed display, colours, resolved `--banner-*` and neutral tokens, the boxes of banner, masthead and views, and `document.activeElement`
- a continuous `requestAnimationFrame` sampler that flags any frame where `#protocol-mismatch` is displayed or `#app` is not
- `load` events
- a `routeWebSocket` proxy that injects `update` messages, drops the server socket and rewrites the next hello's `protocolVersion` to 99

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-16 / edge 17 | focus | routed: record held, reconnect hello `protocolVersion: 99` | reloads *rather than showing* the mismatch screen | pass | P1 focus ×3: one `load` at 758–763 ms after the record. **0** unhidden `#protocol-mismatch`/`#app` mutations before unload (the only pre-`load` record is the fresh document's own attach report: `mmDisplay:none`, `appDisplay:flex`). **0** bad rAF frames, marker gone, no page errors. Final state: mismatch `display:none`, `#app` `display:flex` |
| REQ-16 / edge 17 | tiles | same | same | pass | P1 tiles ×3: `load` at 740–742 ms, 0 unhidden mismatch mutations, 0 bad frames, marker gone, `aria-pressed=true` on Tiles after the reload |
| REQ-16 / edge 17 | focus | record held, `sessionStorage` accessor throws, proto 99 | reloads, no mismatch frame, no page error | pass | X5: one `load` at 743 ms, 0 unhidden mismatch mutations, 0 bad frames, `pageerror` list empty |
| Protocol mismatch (moved check must not swallow it) | focus | no record, proto 99 | mismatch screen shown, keeps focus, no reload | pass | P2: `#protocol-mismatch` `display:flex`, `visibility:visible`, `opacity:1`, box 0,0–1280,720, text `protocol changed — reload the dashboard`. `#app` `display:none`, `activeElement` = `protocol-mismatch` at 3 s, 0 loads, marker kept |
| Protocol mismatch | tiles | no record, proto 99 | same | pass | P2 tiles: identical values |
| Protocol mismatch / edge 20 | focus, tiles | record, then `failed` while connected (record dropped), proto 99 | mismatch screen shown, no reload | pass | P2b ×2: `display:flex`, `#app` `display:none`, focus on `protocol-mismatch`, 0 loads, marker kept |
| REQ-14 / W11 | focus | daemon-down (real Update and restart, dark) | restarting banner seen, exact text, alarm tokens, placed | pass | R1: shown at 447 ms, text `Updating musterd to v0.2.0 — restarting; hook output in open panes is Muster's absence, not session failure.`. `display:block`, bg/fg/border `rgb(59,32,32)/(244,185,185)/(92,47,47)`, equal to the resolved `--banner-bg/-fg/-line`. Box 0,46–1280,78 under masthead 0,0–1280,46 over `#view-focus` top 78, page `scrollWidth 1280 == clientWidth` |
| REQ-14 / W11 | tiles | daemon-down (real restart, two windows, light) | restarting banner in each window | pass | R2: p0 shown at 479 ms, p1 at 478 ms. `rgb(251,232,232)/(122,31,31)/(229,182,182)` equal the light tokens. Box 0,46–1280,78 over `#view-tiles` top 78 in both |
| REQ-14 | pop-out | any | — | N/A — `doc.html` has no `#banner` and registers only `coreWsHandlers`. `onProtocolMismatch`, `onHelloArrived` and `ConnectionDeps` are dashboard-only | |
| REQ-14 / REQ-17 | any | no data yet | — | N/A — no record can exist before an `update` message (plan § States). The first-snapshot hold (cycle 3 X3) runs through `updaterestart.ts` code that c829d15 did not change, so I did not re-measure it (Note 1) | |
| REQ-15 | focus, tiles | daemon-down 30 s | unreachable fallback | not re-measured — Note 1 | |
| REQ-16 | focus | real restart | reloads on first hello, no mismatch paint | pass | R1: restarting hidden at 3960 ms, `load` at 3982 ms, marker gone, 0 unhidden mismatch mutations, 0 bad frames |
| REQ-16 / edge 21 | tiles | real restart, two windows | each reloads, view kept | pass | R2: p0 `load` 2022 ms, p1 2013 ms. Both markers gone, both `aria-pressed=true` on Tiles, 0 bad frames in either |
| W7 | focus, tiles | reconnect | one reload per restart | pass | exactly one `load` per window in P1 ×6, X5, R1 and R2 ×2 |
| REQ-17 | focus | data (after real restart) | `Updated to v0.2.0.` for 3 s, then hidden | pass | R1: shown 3989 ms, hidden (`display:none`) at 7040 ms (3.051 s). Settings Running reads `v0.2.0` afterwards |
| REQ-17 | tiles | data (after real restart, two windows) | confirmation in both, 3 s | pass | R2: p0 2031→5082 ms (3.051 s), p1 2016→5068 ms (3.052 s) |
| REQ-19 / W10 | focus | data | neutral tokens, dark | pass | R1: class `banner neutral`, `rgb(31,34,40)/(193,197,204)/(58,63,73)` equal `--bg-raised`/`--fg-muted`/`--line-control`. Box 0,46–1280,78 |
| REQ-19 / W10 | tiles | data | neutral tokens, light | pass | R2: `rgb(251,250,247)/(65,69,79)/(203,201,194)` equal the light tokens, both windows |
| Banner daemon-down / INV-4 / edges 14, 23 | focus | daemon-down (SIGTERM, no record, default theme) | ordinary text, visible, placed, written once, no reload on return | pass | X2: shown at 15 ms, text `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`. `display:block`, `rgb(58,30,30)/(243,183,183)/(90,44,44)` equal the resolved `--banner-*`. Box 0,46–1280,78 under masthead over `#view-focus` top 78. **0** mutations over 8 s down, 0 loads, marker kept. After the return: `hidden`, `display:none` |
| Banner daemon-down | tiles | same | same | pass | X2 tiles: shown at 39 ms with the same text and tokens, box 0,46–1280,78 over `#view-tiles` top 78, 0 mutations, 0 loads, `display:none` after the return |
| Banner hidden | focus, tiles | data (connected) | `[hidden]` resolves to `display:none` | pass | every hidden record in R1, R2 and X2 has computed `display:none` and box 0,0–0,0 |
| REQ-8 / REQ-10 (smoke) | Settings over focus | data | check failure equals the 502 body, no URL, contained | pass | S5: status `update check failed: couldn't reach the release host (connection refused)` = the 502 `check_failed` message. Status 437–843 inside dialog 420–860, dialog `scrollWidth 438 == clientWidth 438`, no `://` |
| REQ-1–3, other REQ-8 classes, REQ-9, edges 1–3/7 | Settings | data | — | not re-measured — Note 2 | |
| Edge 22 | focus, tiles | routed drop | Settings closes on the drop | not re-measured — Note 2 | |
| §7 one live client | focus / tiles | after the real reload | — | not re-measured — Note 2 | |
| REQ-4–7, 11–13 | — | — | — | N/A — daemon-side (review-work's). Their visible effects are the Settings rows | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** I did not re-measure three things this cycle:
   - REQ-15's unreachable fallback at 30 s
   - REQ-17's first-snapshot hold and second-load no-show (cycle 3 X3)
   - edge 16's version-mismatched record

   They go through `computeBannerOverride` and the `updaterestart.ts` snapshot/handoff paths, and c829d15 changed only comments in `updaterestart.ts`. The `restartBanner` wiring they share is measured live in R1 and R2 above.
2. **[note]** I did not re-measure the Settings status-line rows beyond one smoke test, nor edge 22 or the §7 one-live-client check. Since cycle 3 (which passed all of them at 1280/800/390 with oracles), neither `render/update.ts`, `style.css`, `index.html` nor any daemon code has changed behaviour: the `failure.go` diff is a comment. The S5 smoke test confirms the fresh binary serves the same text.
3. **[note]** Cycle 3 Notes 3 (the 390-px masthead scroll hides the banner) and 4 (Tiles can't be switched while the daemon is down) are pre-existing and unchanged. I am carrying them so they aren't lost.
4. **[note]** The committed mismatch-race spec (`update.spec.ts`, "a window holding a restart record reloads on a mismatched-protocol reconnect…") still records `#protocol-mismatch`/`#app` mutations against the reload's `load`, so it would fail if the moved check were missing or ran after the paint. Only its header comment changed in 6d2d505.
