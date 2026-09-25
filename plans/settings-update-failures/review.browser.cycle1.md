# Browser review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 11348 words (budget 8000) — WARN pack exceeds budget of 8000 words
**Rig**: tree at 73c3a09 (`make web-build build`, then helper-built `musterd` 0.1.0/0.2.0 from the same tree). Each cell got its own daemon from `helpers/fixtures.ts` `startDaemon`, with a space-bearing data dir `$TMPDIR/muster e2e-*`, a private `<data dir>/tmux.sock` and the helpers' stub `claude` (2.0.0-e2e-stub). The release host was the helpers' `FakeReleaseServer`. Headless Chromium ran at 1280×720, driven by a throwaway `web/e2e/zz-rbprobe.spec.ts`, since deleted. `git status` shows none of my files, and no `musterd` or tmux server is left running.

The gates log (0 failed lines: web-build, e2e 451 passed) says the app driven here is the one that will ship.

I timed banner behaviour with a `MutationObserver` recorder. It logs every change to `#banner`'s text, `hidden`, class and computed colours, plus the boxes of the banner, masthead and view, and the `/ws` frames, each with a timestamp, across page reloads. Cells marked "routed" proxied `/ws` through `page.routeWebSocket` to the real daemon. That let me inject an `update` message (`apply.phase: "restarting"`) and hold the socket down. The E2E suite cannot reach the 30 s, protocol-mismatch and version-mismatch paths any other way.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-14 / W11 | focus | daemon-down (real Update and restart) | restarting banner seen, exact text, alarm tokens | pass | R1: visible from 1080 ms (`restarting` frame at 1077) to 4597 ms (hello). Text exact. bg `rgb(59,32,32)` fg `rgb(244,185,185)` border `rgb(92,47,47)` match dark `--banner-bg/-fg/-line` |
| REQ-14 | focus | daemon-down | placed between masthead and view, no overlap | pass | banner 0,46–1280,78; masthead bottom 46; `#view-focus` top 78; scrollWidth 1280 = clientWidth 1280 |
| REQ-14 / W11 | tiles | daemon-down (real, two windows) | restarting banner in each window | pass | R2: p1 visible 1341–2874 ms, p2 1342–2852 ms. Light tokens `rgb(251,232,232)/(122,31,31)/(229,182,182)` match. Banner 0,46–1280,78 over `#view-tiles` top 78 |
| REQ-14 | pop-out | any | — | N/A — `/doc.html` has no banner (`doc.ts:3`) and never wires `helloReceived` (`wsapp.ts`) | |
| REQ-14 | focus | data (record held, still connected) | banner stays hidden | pass | X1 (routed): 300 ms after injection `hidden=true`, computed `display:none` |
| REQ-14 | any | no data yet | — | N/A — no record can exist before an `update` message (plan § States) | |
| REQ-15 | focus | daemon-down (routed) | falls back to unreachable at 30 s; record still held | pass | X1: restarting shown 503 ms → unreachable at 31041 ms, i.e. 30.5 s after display. Text exact, alarm tokens. Return at 40 s still reloaded and confirmed |
| REQ-15 | tiles | daemon-down | fallback | [note] not measured separately — same view-independent `connection.ts` render phase; see Note 3 | |
| REQ-16 | focus | real restart | reloads on first hello | pass | R1: hello at 4594 ms → `load` at 4611 ms. Pre-click `window.__m` marker gone afterwards |
| REQ-16 | tiles | real restart, two windows | each window reloads | pass | R2: p2 hello 2850 → load 2863; p1 hello 2875 → load 2886; both markers gone |
| REQ-16 / edge 17 | focus | routed, hello `protocolVersion: 99` | reload happens before the mismatch screen | pass | X5: 2 loads; `#protocol-mismatch` stayed hidden until unload; marker gone |
| W7 | focus/tiles | reconnect | one reload per restart | pass | exactly one `load` per window after each restart (R1, R2, X1, X5–X7) |
| REQ-17 | focus | data (after real restart) | `Updated to v0.2.0.` shown, then hidden after 3 s | FAIL (duration) | text exact; shown 4643 ms → hidden 8623 ms = **3.98 s** (Minor 1) |
| REQ-17 | tiles | data (after real restart) | confirmation in both windows, 3 s | FAIL (duration) | p2 2902 → 6874 = **3.97 s**; p1 shown at 2937. Text exact in both (Minor 1) |
| REQ-17 | focus | no data yet (routed, first snapshot held 3 s) | handoff waits for the first snapshot | pass | X3: banner `display:none` and status `connecting…` for the 3 s hold. Confirmation 8 ms after the snapshot was released, then hidden after **3.96 s** (Minor 1) |
| REQ-17 / INV-3 | focus | second load of the same tab | nothing shown | pass | X3: `page.reload()`, banner hidden through 4 s |
| REQ-17 / edge 16 | focus | routed, record `9.9.9`, daemon runs 0.1.0 | reload, no confirmation | pass | X6: 2 loads, banner hidden through 4 s |
| REQ-17 / edge 18 | focus | `sessionStorage` get/set/remove throw | reload still happens, no confirmation | pass | X7: 2 loads, banner hidden |
| REQ-17 / edge 18 | focus | `window.sessionStorage` accessor throws (Chrome with site data blocked) | dashboard boots; reload path intact | **FAIL** | X8: no `/ws` opened (0), status line empty, one pageerror (SecurityError). With the daemon then killed, the banner stays hidden with empty text. With only `localStorage` throwing: connected, 1 `/ws` (Major 2) |
| REQ-18 / edge 20 | focus | routed: `restarting`, then `failed` while connected, then drop | record dropped; ordinary banner; no reload | pass | X4: text = unreachable; `window.__m` marker kept after reconnect |
| REQ-19 / W10 | focus | data | confirmation uses the neutral tokens — dark | pass | bg `rgb(31,34,40)` = `--bg-raised`, fg `rgb(193,197,204)` = `--fg-muted`, border `rgb(58,63,73)` = `--line-control` |
| REQ-19 / W10 | tiles | data | neutral tokens — light | pass | `rgb(251,250,247)/(65,69,79)/(203,201,194)` = light tokens |
| REQ-19 / W10 | focus | data | neutral tokens — instrument | pass | `rgb(23,26,36)/(178,182,195)/(52,58,74)` = instrument tokens |
| REQ-19 / W10 | focus | daemon-down | restarting and fallback keep `--banner-*` — instrument | pass | X1 `rgb(58,30,30)/(243,183,183)` = instrument `--banner-bg/-fg` |
| Banner, daemon down (unchanged) / INV-4 / edges 14, 23 | focus | daemon-down (SIGTERM, no record) | ordinary text, visible, placed; no reload on return | pass | X2: text exact, `display:block`, 0,46–1280,78 under masthead 0–46, view top 78. Marker kept after `restart()` |
| Banner, daemon down | focus | daemon-down | text written only on change | FAIL | X1 and X2: **11 mutation records in 5 s** with unchanged text (Minor 3) |
| Banner hidden | focus, tiles | data (connected) | `[hidden]` resolves to `display:none` | pass | R1 and R2 before the click: `hidden=true`, `display:none` |
| Edge 21 | tiles | real restart | several windows each reload and confirm | pass | R2 (see above) |
| Edge 22 | focus | real restart | Settings dialog closes on the drop | pass | R1: `dialog.open` true at 608 ms, false at the 1080 ms drop |
| §7 one live client | focus | after real reload | one tmux client per session | pass | R1: `totalAttachedClients` = 1 after 2 s; tmux `muster-1` survived the restart |
| REQ-2 | Settings over focus | data | git-tree remedy, exact text, matches oracle | pass | S1: text = `/api/state` `update.remedy`; buttons disabled |
| REQ-2 | Settings over focus | data | status line contained in the dialog | **FAIL** | S1: `#update-status` 437–957 vs dialog 420–860. Dialog scrollWidth 536 > clientWidth 438, `overflow-x:auto`. Theme and Rail-card controls clipped (Major 1) |
| REQ-1 | Settings over tiles | data (long space-bearing path) | not-writable remedy, exact text `(permission denied)` | pass | S2: text = `/api/state` remedy |
| REQ-1 | Settings over tiles | data | contained, at 1280×720 and 800×600 | **FAIL** | S2: 437–957 vs 420–860; at 800 wide 197–717 vs 180–620 (Major 1) |
| Edge 1 | Settings over focus | data | `.git` removed + Check now (pointer) enables Update and clears the line | pass | S1 after: Update/Update and restart enabled, text `""`, `/api/state` `install: installer`, `remedy: null` |
| Edge 2 | Settings over tiles | data | chmod 0755 + Check now (keyboard Enter) enables Update | pass | S2 after: enabled, text `""`, oracle `installer` |
| Edge 3 | Settings over focus | data | installer → chmod 0555 → Check now flips to unmanaged | pass (text) / FAIL (containment, Major 1) | S3: REQ-1 remedy exact, buttons disabled, oracle `unmanaged` |
| REQ-3 / edge 7 | Settings over focus | data | Homebrew remedy unchanged, contained, survives Check now | pass | S4: `installed by Homebrew — run brew upgrade musterd`; 437–843 inside 420–860; unchanged after Check now |
| REQ-8 | Settings over focus | data | each check-failure class, exact, equals the 502 body | pass | S5 and S7: `…(connection refused)`, `…(host not found)`, `…(timed out)` (10.4 s), `the release host answered 404, not a redirect`, `the latest release tag "nightly-build" is not a release version`. Each equals the 502 `check_failed` message and is contained (437–843) |
| REQ-9 | Settings over focus | data | apply failures with the `Update failed: ` prefix | pass | S6 and S7: `couldn't download musterd_0.2.0_darwin_amd64.tar.gz (connection refused); nothing was installed`, `…musterd_0.3.0_darwin_amd64.tar.gz (status 404)…`, `couldn't download checksums.txt.minisig (status 404) — this release has no signature, refusing to apply`. Each equals `/api/state` `apply.error` and is contained |
| REQ-10 | Settings | data | no `://` in any check or apply failure | pass | 8 classes above, `hasURL=false` in every one |
| Status line | Settings | daemon-down | — | N/A — the dialog closes on every drop (edge 22) | |
| Status line | Settings | no data yet | — | [note] not measured — see Note 4 | |
| REQ-4–7, 11–13 | — | — | — | N/A — daemon-side (review-work); their visible effects are the edge 1–3 rows | |

## Issues

### Critical

None.

### Major

1. **[web-impl]** When any `unmanaged` remedy is shown, the Settings dialog overflows horizontally and clips its other controls. The remedy's longest unbreakable tokens are wider than the form column. In the `#settings-form .hint` font (11.25px mono), the install URL is 488 px and a macOS temp-dir path is 582 px, against a 406 px column. `overflow-wrap` is `normal`, so the grid item's min-content width widens the whole form. Measured: `#update-status` 437–957 against the dialog's 420–860; dialog `scrollWidth 536 > clientWidth 438` with `overflow-x: auto`. The screenshot shows the Theme "Light" button, the Rail-card "Both" button and both hint paragraphs cut off at the dialog edge. It also happens at 800×600.
   - The URL token was in the old remedy too, so the defect predates the plan. But the URL alone exceeds 406 px, so every unmanaged remedy hits it, including #53's own `/usr/local/bin` case. This plan's new path tokens make it wider.
   - E1 and E2 assert text only, so they could not fail for this.
   - `web/src/style.css` `#settings-form .hint` (or `#update-status`). A fix must make the status line's right edge ≤ the dialog's content edge and the dialog's `scrollWidth == clientWidth` with the REQ-1/REQ-2 remedy shown, e.g. with `overflow-wrap: anywhere`.
2. **[web-impl]** The dashboard no longer boots when the `window.sessionStorage` accessor throws, which is what Chrome does when site data is blocked. `initUpdateRestart(app, storage = sessionStorage)` (`web/src/features/updaterestart.ts:87`) evaluates the global in its default parameter, and `main.ts` calls it before `new WsClient`.
   - Measured, X8: accessor throwing gives 0 `/ws` opens and an empty connection status. After the daemon was killed, the banner stayed hidden with empty text, so daemon-down is never surfaced in this configuration.
   - With only `localStorage` throwing, the same page connected (1 `/ws`, status `connected`) and showed the unreachable banner on kill. So `sessionStorage` is the new failure point: it is the only `sessionStorage` reference in `web/src`.
   - Edge 18 says a throwing `sessionStorage` still reloads. W5 covers a throwing `StorageLike` object but not a throwing accessor.
   - A fix must read the global inside a try, so a throwing accessor degrades to "no handoff" and the dashboard still connects.

### Minor

1. **[web-impl]** The `Updated to v….` confirmation stays up about 4 s, not REQ-17's 3 s. Measured 3.98 s (R1), 3.97 s (R2 p2), 3.96 s (X3) and 3.99 s (X1). The hide depends on `main.ts`'s 1 s `setInterval(app.render)`. The confirmation starts about 20–30 ms after the interval's phase, so the tick at ~3 s always sees less than 3000 ms elapsed, and the tick at ~4 s hides it. This is `web/src/features/connection.ts`'s render phase combined with `updaterestart.ts`. A fix must hide it within about 100 ms of 3 s, e.g. a render scheduled at `startedAt + 3000`.
2. **[e2e-specs]** E5 could not fail for Minor 1 or Major 1. Its `await expect(banner).toBeHidden()` inherits the 15 s expect timeout, so a confirmation lasting anywhere up to about 15 s passes. E1 and E2 assert only `toHaveText` on `#update-status`, never its box against the dialog. `web/e2e/update.spec.ts` E5, E1, E2.
3. **[web-impl]** The `role="alert"` banner is rewritten every second while its text does not change. There were 11 mutation records in 5 s during a plain daemon-down (X2) and during the restarting display (X1). Each tick sets `textContent` (a node replacement) and sets `hidden`. Before this plan the text was static markup and `renderBanner` ran only on a status change. An alert region whose text node is replaced every tick can be re-announced by assistive technology. I did not measure that here (headless, no screen reader). `web/src/features/connection.ts` onRender, `web/src/render/banner.ts`. A fix must write text, class and `hidden` only when they change, so a steady daemon-down produces 0 mutations.

### Notes

1. **[note]** W11: the restarting banner is not sub-second in a real Update and restart. It stayed up 1.5–3.5 s (R2 and R1), until the first backoff reconnect reached the new daemon, and I observed it directly in two themes and both views.
2. **[note]** After a keyboard Enter on Check now, `document.activeElement` was `BODY` 1.2 s later. The button disables itself for the duration of the check (an earlier plan's behaviour), and `render/update.ts` is untouched by this diff. This predates the plan; no change requested here.
3. **[note]** REQ-15 was measured in focus only. The 30 s decision is `connection.ts`'s single view-independent render phase, and REQ-14's tiles cell showed the same element and box.
4. **[note]** I did not measure the Settings dialog before the first snapshot. The plan changes nothing about the dialog's no-data rendering.
5. **[note]** Pop-out (`/doc.html`): it has no banner and gets no `update` messages, so a pop-out open across an update restart keeps its old bundle. That is out of this plan's scope (and `docs/protocol.md` § hello already names it); I did not measure it.
6. **[note]** R2 had two windows open in Tiles and `totalAttachedClients` read 2, one per window. That is outside this plan, and R1 (one window) read 1.
7. **[note]** I did not re-measure E4's on-disk byte identity. That is a filesystem fact, and E4 is green in the gates log. The refused-download text itself was measured (S7).
