# Browser review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6689 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at b5e7688e (embedded dashboard); data dir `$TMPDIR/bv rig.g1ka/data dir` (space-bearing), tmux socket `$TMPDIR/bv rig.g1ka/tmux.sock`, a private copy of the e2e stub `claude` (helpers/daemon.ts STUB_CLAUDE_SCRIPT) at `$TMPDIR/bv rig.g1ka/claude`, first run with `MUSTER_E2E_STUB_VERSION_DELAY_SECONDS=7`; headless Chromium 1280x800 through a throwaway Playwright spec (deleted); daemon SIGTERMed, rig dir removed, `git status` shows nothing of mine.

Gates log: `17-e2e` is red on one test, `embedded.spec.ts:76` (serves /healthz from the
embedded-serving daemon: "never became healthy" within 10 s). That failure belongs to the gate
reviewer (review-work). The binary I drove is this tree's own build. See Note 1 for a
measurement that may explain it.

## Matrix

Hosts: the readout `#claude-version` sits in the masthead (`web/index.html:46`), which is shared by
the Focus and Tiles views. The pop-out `/doc.html` has no masthead and no readout (grep finds no
`claude-version` in `doc.html`), so every pop-out cell is N/A.

States: **no data yet** means the version check is still running (stub sleeping 7 s). **data**
means a check result is held. **daemon-down** means the scratch daemon was SIGTERMed.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | — (daemon) | no data yet | serves without waiting for `--version` | pass | fresh data dir with the stub sleeping 7 s: `/healthz` 200 after 0.252 s and 0.202 s (two runs, curl loop). The first spec run took 3.04 s, but that was macOS's first exec of the newly built `bin/musterd`; a restart of the same binary took 59 ms. Startup log line `musterd starting` appeared 8.2 s before the version log line (3016 ms vs 11211 ms in that run) |
| REQ-1 | focus | no data yet | `hello.claudeCode` = unknown/null until the check ends; readout honest | pass | hello frame `{"installed":null,…,"status":"unknown"}` at +3479 ms. Readout text "Claude installation unknown", box 1042,16–1242,30 inside masthead 0,0–1280,46 and clear of `#connection-status` 1250–1264; opacity 1, display block, visibility visible |
| REQ-1 | tiles | no data yet | same | pass | after a pointer click on Tiles (`aria-pressed=true`): same text and box, opacity 1, display block, visibility visible |
| REQ-1 | pop-out | any | — | N/A — `/doc.html` has no readout | |
| REQ-2 | focus | no data yet → data | readout re-renders from a pushed `claudeCode` with no reload | pass | one `claudeCode` frame at +11212 ms (`installed 2.0.0, status below`). MutationObserver saw "Claude installation unknown" → "claude 2.0.0 ⚠" at 7.9 s after page load. Main-frame navigations stayed at 1, and the `window` marker set at init was unchanged |
| REQ-2 | focus | data | glyph present, visible, inside the readout | pass | glyph aria-label/title "…please update Claude Code", box 1235–1242 inside the readout 1134–1242, opacity 1, display inline |
| REQ-2 | tiles | data | same readout after switching view | pass | text "claude 2.0.0 ⚠", same box, glyph visible |
| REQ-2 | focus | data (a later client) | a dashboard that connects later gets the value in hello | pass | second page: hello carried `installed 2.0.0, status below`, no `claudeCode` frame; readout "claude 2.0.0 ⚠" |
| REQ-2 | focus | data | no broadcast for an unchanged result | pass | stub `touch`ed (new mtime, same output): one new check log line, 0 `claudeCode` frames over 33 s, readout unchanged |
| REQ-3 | focus | data | binary replaced → re-checked and pushed live | pass | stub replaced by atomic rename, now answering 2.1.300: readout became "claude 2.1.300" (no glyph, status verified) 34.1 s after the swap. One `claudeCode` frame; navigations 1; the 30 s look plus the check fit the plan's bound |
| REQ-3 | tiles | data | same | pass | "claude 2.1.300", box 1138–1242 inside masthead, no glyph |
| REQ-3 / Edge 3 | focus | data | binary missing → held value stays, nothing pushed | pass | stub removed for 33 s: 0 frames, readout still "claude 2.1.300", visible |
| REQ-3 / Edge 3 | focus, tiles | data | binary reappears newer → pushed | pass | restored as 2.1.301: "claude 2.1.301 ⚠" 22.4 s later, glyph "…has not been tested with Muster" (no "update"), visible in both views, navigations 1 |
| REQ-4 | focus | data | issue capture carries the latest result | pass | after the 2.1.300 swap, a pointer click on "File an issue" sent POST `/api/issue/captures` whose `snapshot.claudeCode` was `{"installed":"2.1.300",…,"status":"verified"}`, not the startup 2.0.0 |
| Edge 4 | focus | data (normal startup) | version on first paint, no visible unknown | pass | fresh page against a daemon answering at once: readout sequence "" → "claude unknown" (the pre-hello placeholder, which already existed) → "claude 2.1.301 ⚠" at 81 ms. "Claude installation unknown" never rendered |
| Edge 4 | focus | daemon-down → restart | the reconnecting page shows no flash of unknown | pass | after a restart (healthy at 59 ms), the reconnect hello carried `installed 2.1.301`. The only mutation recorded was a re-render to the same "claude 2.1.301 ⚠"; navigations 1 |
| §6 daemon-down | focus | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block, box 0,46–1280,78, text "musterd unreachable — …". `#connection-status` data-health=down, "reconnecting…" |
| §6 daemon-down | tiles | daemon-down | same | pass | same banner box and text in Tiles |
| §6 daemon-down | focus, tiles | daemon-down | readout while down | pass (as before) | keeps the last value "claude 2.1.301 ⚠" under the banner; this behaviour existed before this plan (Note 3) |
| Keeps focus | focus, tiles | data | re-render does not take focus | N/A — the readout holds nothing focusable (the glyph is `role="img"`, not tabbable), and `claudeCodeChanged` only replaces `#claude-version`'s children | |
| §6 cost / Done / permission | — | — | no cost, Done or authoritative permission display added | pass | the plan adds no such surface; the readout shows only the version and the status glyph |
| §7 terminal rules | — | — | — | N/A — the plan touches no terminal surface | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The first exec of a newly built `bin/musterd` took ~3 s to reach `/healthz`
   (`musterd starting` logged at 3016 ms). A restart of the same file took 59 ms, and fresh
   data dirs took 0.2–0.25 s. This is the plan's own fact
   (kb:fact/new-claude-binary-first-run-slow-on-macos) applied to musterd itself. The red
   `embedded.spec.ts:76` gate line runs a freshly placed binary under a 10 s health wait, so it
   may be this cost plus a loaded machine rather than a regression. It is review-work's to judge.
2. **[note]** When the readout changes width, the masthead items to its left move. They are
   right-aligned. With "Claude installation unknown" (200 px) → "claude 2.0.0 ⚠" (108 px),
   Settings moved from x 956–1034 to 1048–1126, and Issue and the usage refresh button moved
   with it. Before this plan that happened only at page load. Now it can happen live, in the
   first seconds after a slow-start daemon or after a Claude Code update, so a click aimed at
   Settings can land on Issue. It is rare. If the developer wants it gone, that is a decision
   between reserving a fixed width for the readout and leaving it as it is.
3. **[note]** At a 900 px wide window the masthead overflows. `.masthead-right` needs 594 px but
   gets 547 px. The readout's right edge is at 909 and `#connection-status` at 917–931, both
   past the 900 px viewport. Layout is unchanged by this plan (the masthead CSS is untouched),
   and the longer "Claude installation unknown" text, which already existed, makes it worse.
   During daemon-down the readout keeps its last value without an age. That existed before this
   plan, and the banner states the outage.
