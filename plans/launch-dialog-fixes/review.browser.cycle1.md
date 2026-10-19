# Browser review: launch-dialog-fixes

**Plan**: launch-dialog-fixes
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6717 words (budget 30000)
**Rig**: `make web-build build` at 76be2860; one fresh scratch daemon per test from the committed `startScratchDaemon` fixture (data dir `$TMPDIR/muster e2e-<owner>-*`, space-bearing; `-S` tmux socket inside it; shared E2E stub `claude`); headless Chromium 1280x720 driven by a throwaway `web/e2e/zz-browser-review.spec.ts` (deleted). Fixture teardown removed every daemon, socket and data dir; `git status --porcelain` shows nothing of mine. Gates log c1: 0 failed lines (`17-e2e` 964 passed, `18-E1` 2 passed).

## Matrix

Hosts: the launch dialog opens only from the masthead `#new-session-button`, which both Focus and Tiles show. `/doc.html` has no such button (`grep -c new-session-button web/doc.html` → 0), so pop-out cells are N/A. The Focus and Tiles cells produced the same values, apart from the frame timestamps.

"First frame" means the first `requestAnimationFrame` sample in which the dialog is `open`. It was taken through a real pointer click on New session, with `PerformanceResourceTiming` counting `/api/repos` and `/api/browse` responses completed since the click.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | focus | no data | opens on defaults | pass | first frame (t=63 ms, repos 0/browse 0): sonnet, auto, effort default; settled +1.5 s the same |
| REQ-2 | tiles | no data | opens on defaults | pass | first frame (t=76 ms, 0/0): sonnet, auto, default; settled the same |
| REQ-2 | focus | data | first frame shows the remembered values before the open's fetch | pass | seed haiku/default/high via API, reload, open with no route held: first frame t=53 ms, repos 0/browse 0: haiku, manual, high. All open frames show one distinct value set, so nothing flashes |
| REQ-2 | tiles | data | same | pass | first frame t=41 ms, 0/0: haiku, manual, high; one distinct value set across 2.5 s |
| REQ-2 | focus | data | a launch from the dialog refreshes the held list (no reload) | pass | pointer picks opus and effort low, Title typed, Launch clicked. Next open with every repos/browse GET held: first frame t=46 ms shows opus, manual, low |
| REQ-2 | tiles | data | same | pass | first frame t=58 ms, all held: opus, manual, low |
| REQ-2 | focus, tiles | data | Visible: the checked segment is visibly marked | pass | checked label: display block, visibility visible, opacity 1, bg rgb(28,32,41), colour rgb(232,230,225). Unchecked sibling: transparent bg, rgb(178,182,195) |
| REQ-2 | focus, tiles | data / no data | Placed: dialog inside the viewport | pass | dialog box 280,57.5–1000,662.5 inside the 1280x720 viewport. REQ-1 state 280,19.5–1000,700.5, also inside |
| REQ-3 | focus | data | a touched field survives the fresh fetch | pass | effort `max` clicked while repos/browse were held, then released, settled +1.5 s: opus, manual, **max** (untouched model and mode kept their restored values) |
| REQ-3 | tiles | data | same | pass | settled: opus, manual, max |
| REQ-3 | focus | data (recent dir deleted) | `failed` → untouched fields return to the defaults | pass | frames went opus/manual/low → sonnet/auto/default. Settled +2 s: sonnet, auto, default. Launch error empty (the browse-root fallback cleared it, as before) |
| REQ-3 | tiles | same | same | pass | same two value sets, settled on sonnet, auto, default |
| REQ-3 | focus, tiles | data | `superseded` → nothing further | N/A | not driven here. Covered by the existing E10 race spec (gate `17-e2e` green) |
| REQ-2/3 | focus | daemon-down | Daemon-down is surfaced; the dialog does not claim fresh data | pass | `#banner` "musterd unreachable — …" display block, opacity 1, not hidden. First frame showed the held haiku/plan/medium, then settled on sonnet/auto/default with "Could not reach musterd." in the dialog. See Note 2 |
| REQ-2/3 | tiles | daemon-down | same | pass | same banner computed style, the same two value sets, the same error text |
| REQ-1 | focus | data | a late refusal of a model no longer selected leaves focus where it is | pass | A refused (focus went to `#custom-model-input`, the existing rule). B's POST was held. The custom field was retyped to A by keyboard (Meta+A, type) and Title clicked. B was released, then +1.5 s (past a render tick): `document.activeElement` is the same node as before the release (`INPUT#title-input`) |
| REQ-1 | tiles | data | same | pass | same identity check true, `INPUT#title-input` |
| REQ-1 | focus, tiles | data | a refused model stays marked, either way | pass | with A selected: `#model-error` shows A's sentence, display block, opacity 1, Launch disabled. Retyped to B: B's sentence shows, Launch disabled |
| REQ-1 | focus, tiles | data | a refusal of the model still selected still moves focus | pass | C's POST held, Title clicked, C released: +1.2 s the active element is `#custom-model-input` |
| REQ-1 | focus, tiles | no data / daemon-down | refusal focus | N/A | a refusal needs a live daemon answering a POST. The no-data row above is the state this was driven in (a fresh daemon with no recents) |
| REQ-1/2/3 | pop-out | any | — | N/A | `/doc.html` hosts no launch dialog |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Edge case 1 (the dialog opens before the init `GET /api/repos` has returned) was not measured. Every data-state open above came after `networkidle`. The plan marks this case untested: it falls back to defaults until the fresh fetch lands.
2. **[note]** In the daemon-down state the dialog paints the held list's values for its first frames, then resets the untouched fields to the defaults when its repos fetch fails, with "Could not reach musterd." showing. The plan does not cover this case (REQ-3 covers `failed`, which means the directory is gone, not an unreachable daemon). The banner surfaces the outage prominently, so this breaks no §6 rule. No change requested.
3. **[note]** "Correct value" was checked against the values seeded through `POST /api/sessions` and the pointer picks made in the dialog, not against a re-read of `GET /api/repos`. Those inputs are what the daemon stores as the recents, so this is the same oracle one step earlier.
