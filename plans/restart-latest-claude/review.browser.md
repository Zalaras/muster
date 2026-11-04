# Browser review: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 16162 words (budget 30000)
**Rig**: `make web-build build` at a31fba26 (`v0.27.3-40-ga31fba26-dirty`, dirty = orchestrator's plan-dir files only); per-test scratch `bin/musterd` from `helpers/fixtures.ts` `startDaemon` on `$TMPDIR/muster e2e-55a1b6f1-*` (space-bearing data dir) with a private `-tmux-socket` inside it (fixture teardown runs `kill-server` and removes the dir), harness stub `claude` answering `--version` with `2.1.318` (with a 6 s delay for the held-mark cells, and failing for the installed-unknown cell); headless Chromium 1280×900. Throwaway spec deleted; no daemon left running; `git status` shows nothing of mine.

Gates log read (not re-run): all 21 lines green, `21-e2e.log` 449 passed, `04-web-build.log` built. The dashboard driven here is the one that ships.

Scope of this cycle: re-measure cycle 1's two Minors, measure the new held-mark daemon-restart state (REQ-6 as amended), and re-sweep the readout cells those changes could move. The cycle-1 matrix (`review.browser.cycle1.md`) covered the panel, dialog, queue, Ignore and §7.1 cells. The cycle-2 web change (62d72cb9) touches only the glyph CSS, the Ignore focus target and the wording helpers, so I did not re-drive the dialog cells. Installed `2.1.318` is above the verified range, so the `⚠` glyph was present in every cell.

## Matrix

Hosts: **focus** and **tiles** share one masthead element. The **pop-out** (`/doc.html`) has no masthead and no Claude readout, so every pop-out cell is N/A.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-11 (cycle-1 Minor 1) | focus | data | glyph clear of Settings | pass | `⚠` box 1098.05–1104.72, `#settings-button` 1018.53–1096.72: 1.33 px clear (it overlapped by 3.41 px in cycle 1); `elementFromPoint` at the glyph returns the glyph |
| REQ-11 | focus | data + panel open | glyph clear, box unchanged | pass | same glyph box; readout 1104.72–1242 (w 137.28); panel `display:block` |
| REQ-11 | tiles | data | glyph clear of Settings | pass | glyph 1098.05–1104.72 vs Settings right 1096.72 |
| REQ-11 | tiles, focus | queued (`↻1 queued`, behind + pending) | glyph clear, width fixed | pass | `claude ↻1 queued`, w 137.28, right 1242, glyph 1098.05–1104.72 |
| REQ-11 | focus | no data / plain after queue drains | glyph inside the box, width fixed | pass | `claude 2.1.318 ⚠`, glyph 1234.59–1242 inside the host 1104.72–1242, w 137.28 |
| Keeps focus (cycle-1 Minor 2) | focus | data, Ignore by pointer | focus not dropped to body | pass | after Ignore plus 1.5 s: readout plain, activeElement `#settings-button` (the readout is a span now, so this is the fallback target) |
| Keeps focus | focus | data, Ignore by keyboard | focus not dropped to body | pass | Enter on the notice, Shift+Tab to `#restart-ignore-button`, Enter; after 1.5 s activeElement is `#settings-button`, panel `display:none` |
| REQ-12 | focus | daemon-down (panel open) | button disabled, panel closed, banner | pass | after SIGTERM: `disabled:true`, color rgb(90,96,112), w 137.28, panel `display:none`, `#banner` `display:block` |
| REQ-12 | tiles | daemon-down | — | N/A: same masthead element as focus | |
| REQ-6 held | focus | daemon restarted, live page (no reload) | the readout goes from queued to down, then held, then released | pass | 100 ms samples: 2 ms `claude ↻2 queued` → 105 ms disabled + banner → 630 ms `claude unknown`, no button, banner hidden → 6181 ms `claude ↻2 queued` enabled; w 137.28 in every sample |
| REQ-6 held | focus | held (installed unknown) | mark off the wire, no restart | pass | `/api/state` 1.5 s after the respawn: both sessions `claudeVersion {running:2.1.317/2.1.316, behind:false}`, `restartPending:false`, alive, working; tmux pane identity unchanged |
| REQ-6 held / §6 honesty | focus | held | the readout claims no version it does not know | pass | `claude unknown`, no glyph, no notice button, panel `display:none` |
| REQ-6 released | focus | first installed result | mark re-derived, queued notice back | pass | wire `{running:2.1.317, behind:true}`, `restartPending:true`; readout `claude ↻2 queued` |
| REQ-9 released | focus | released, panel opened | panel lists pending, no buttons | pass | panel 862–1242 × 33.5–132.5; `#restart-panel-behind` `display:none`, `#restart-panel-queued` `display:block`; visible buttons `[]`; innerText `Claude Code 2.1.318 · Restart when free · 2 · c2-held working · c2-behind working`; focus on `#restart-panel` |
| REQ-6 unknown | focus | daemon restarted, first installed result fails | mark cleared, nothing restarted | pass | 6 s after the respawn: readout `claude unknown`, no button; wire `behind:false`, `restartPending:false`; then Stop with 0 tasks → idle, pane identity unchanged after 3 s, still no notice |
| REQ-6 held | tiles | held | — | N/A: the readout is the same element; the held state is daemon-side and was measured in focus | |
| All | pop-out | all | — | N/A: `/doc.html` has no masthead or Claude readout | |
| REQ-7, REQ-8, REQ-10, REQ-13, Edge 25/28/29, §7.1 | focus, tiles | data / queued | panel, dialog, queue, one live client | not re-measured this cycle | cycle-1 matrix passes. No web change since then touches those paths (see Note 1) |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** I did not re-drive the cycle-1 dialog, panel-content and §7.1 cells. Since 18a79b48 the web diff (62d72cb9) changes only `.claude-notice ~ .version-warn` (margin 0, font-size 0.9em), the Ignore focus target, a shared `setText` and the background-task wording helper. The daemon diff changes the batch runner, and the gate's `claude-restart.spec.ts` journeys, all green, cover that runner end to end.
2. **[note]** The glyph clearance is now 1.33 px at 1280 px. It is clear, but only just: any widening of the glyph or narrowing of the masthead gap closes it again. The `1d5964b5` test pins it, so a regression would go red.
3. **[note]** Ignore leaves focus on `#settings-button`. When pending sessions remain, the code focuses the notice button instead. I measured only the no-pending branch, because the notice button that this branch would otherwise focus is removed by the render. Settings is a deliberate masthead target, not `<body>`.
4. **[note]** In the held window (630 ms to 6181 ms here, up to 30 s per the decision) a queued restart is invisible: the readout reads `claude unknown` and nothing tells the user a restart is still queued. The developer chose this in the decision record (`decisions/pending-marks-held-until-installed-known`), and it is honest (no version or queue is claimed while unknown). No change requested.
5. **[note]** The narrow-width overflow (cycle-1 Note 2) was not re-measured. Nothing in this cycle changes the masthead's width.
