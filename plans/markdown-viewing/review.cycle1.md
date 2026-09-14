# Review: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: needs-changes
**Pack**: `<!-- kb:pack plan=markdown-viewing role=review features=reader,surfaces,lifecycle,ingest -->`

Cycle 1. Every gate is green — 334/334 E2E, `make test`, `make lint`, `make web-build`,
`make web-test`, `make web-lint`, `make contrast`, `make check-kb`, and all 14 authored
acceptance checks. The blocking findings are both **layout**, both invisible to the suite
because no spec measures geometry or asserts compactness across a view switch, and both
caught by driving the app in a browser (§ Manual Verification): the right-hand file nav
that defines the chosen design renders *below* the body instead of beside it (and escapes
its tile), and a reader keeps its mount-time compactness after a Focus↔Tiles switch.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `docs` segment, built once | Yes | E1, W4 | pass |
| REQ-2 selecting `docs` mounts the reader only there | Yes | E1, E2 | pass |
| REQ-3 works on a dead session, plan slot absent | Yes | E22 | pass |
| REQ-4 bar: badge, basename, absolute path, cue, pop out, arrow | Yes | E3, E18 | pass (see Critical 1 for the arrow's nav) |
| REQ-5 GFM body on `--well` with `--disp`/`--sans`/`--mono` | Yes | E15 | pass |
| REQ-6 whole file; >10 MiB is 413 | Yes | D12, E26 | pass |
| REQ-7 last open file remembered per session | Yes | E3, E19, W7 | pass |
| REQ-8 `pop out ↗` to `/doc.html` | Yes | E21 | pass |
| REQ-9 plan slot pinned, `no plan yet` | Yes | E3, E4 | pass |
| REQ-10 file tree, folders collapsed with counts | Yes | E6, W5 | pass (placement: Critical 1) |
| REQ-11 filter narrows + expands ancestors | Yes | E7, W6 | pass |
| REQ-12 `aria-current` on the open file | Yes | E8 | pass |
| REQ-13 changed dot until opened | Yes | E9, W7 | pass |
| REQ-14 outline, scroll-spy, independent folds | Yes | E17, E18 | pass (placement: Critical 1) |
| REQ-15 compact in a tile; nav collapsed at 3×2 | Partial | E27 (mount only) | **fail** — Major 1 |
| REQ-16 transcript kept + bounded scan triggers | Yes | D5, D6, D9, E5, REQ-16 test | pass |
| REQ-17 `session.plan` additive | Yes | W10, D14 | pass |
| REQ-18 `docChanged` on routed Write/Edit/MultiEdit | Yes | D13, D16, E9, E10 | pass |
| REQ-19 re-fetch on mount / window focus | Yes | E12, E13 | pass |
| REQ-20 two GETs, confinement, no writes | Yes | D10, D11, D17, E20 | pass |
| REQ-21 Claude-format knowledge stays in `internal/claudecode` | Yes | D4 | pass |
| REQ-22 marked 18.0.13 + DOMPurify 3.4.15, fragment only | Yes | W12, W13, E16 | pass |
| REQ-23 ADR records the renderer choice + alternatives | Yes | — | pass |
| REQ-24 no cue element until a write is seen | Yes | E11 | pass |
| REQ-25 walk cap 20,000 + `truncated` | Yes | D8 | pass |
| REQ-26 straggler never moves transcript/plan | Yes | D20, E29 | pass |
| REQ-27 pop-out shares component, socket, memory | Yes | E21 | pass |
| REQ-28 deleted file keeps last render | Yes | E25 | pass |

## Build & Tests

E2E tests: **pass** (334/334, `make e2e` from a clean rebuild, exit 0; no skips anywhere in `web/e2e`)
Daemon tests: **pass** (`make test`, every package ok)
Web tests: **pass** (Vitest, 1554/1554)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build` — `tsc --noEmit && vite build`)
Lint: **pass** (`make lint` 0 issues; `make web-lint` clean)
Knowledge: **pass** (`make check-kb` — 343 records, 0 problems; `dead-refs --all` 2547 checked, 0 missing)

## Acceptance Checks

Run verbatim via `.claude/skills/orchestrate/scripts/gates.sh markdown-viewing --checks-only`.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | boundary grep (no Claude-format keys outside `internal/claudecode/`) | pass |
| D5 | `go test ./internal/claudecode -run TestLocatePlanFile` | pass |
| D6 | `go test ./internal/claudecode -run TestInterpretFiles` | pass |
| D17 | no mutating route under `/api/sessions/{id}/reader` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make web-lint` | pass |
| W11 | `make contrast` | pass |
| W12 | `marked` pinned to 18.0.13 | pass |
| W13 | `dompurify` pinned to 3.4.15 | pass |
| E1 | `make e2e` | pass |
| DOC | doc upkeep | pass — feature globs filled, `plan-file-path-in-transcript` carries `guard: TestLocatePlanFile` / `files: [internal/claudecode/plan.go]`, SPEC.md § 3.1 sentence added, protocol anchors `sessions.reader` / `sessions.reader-file` / `ws.doc-changed` merged, generated files fresh. The `TODO.md` tick+move and the seven ADR `proposed`→`accepted` flips are Completion steps by design, not gaps now. |
| KB | `make check-kb` | pass |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7 | git listing filters/sorts; falls back to `"walk"` on git failure | pass | `TestListMarkdown_GitSuccessFiltersToMarkdownAndSorts` asserts `["docs/alpha.MD","zeta.md"]` + `listing:"git"`; `..GitFailureFallsBackToWalk` injects an error and asserts `"walk"`. Fake `readerExecFunc` — no real git |
| D8 | walk skips dot-dirs; cap returns exactly 20,000 + `truncated` | pass | `TestWalkMarkdown` (`.git/ignored.md` absent, `.MD` included, sorted); `..CapsAt20000AndReportsTruncated` writes 20,005 files, asserts `Len == maxWalkFiles` and `truncated` |
| D9 | listing resolves the plan and broadcasts `sessionUpsert` before responding | pass | `TestHandleReaderList_KnownTranscriptResolvesPlanAndBroadcastsBeforeResponding` reads the upsert off a live WS after the GET returned; `..NoTranscriptRespondsPlanNullAndBroadcastsNothing` is the negative |
| D10 | exact bytes as `text/markdown; charset=utf-8` | pass | `TestHandleReaderFile_ServesExactBytesAsMarkdown` |
| D11 | 404 for `..`, symlinks, `-agent-`/`.workshop.md`, non-`.md`, a dir; 400 relative; 200 plan-outside-dir | pass | `TestConfine` (9 cases + empty-planPath guard) and `TestHandleReaderFile_OutsideConfinementIs404NotFound` with its plan-outside-dir subtest |
| D12 | 10 MiB + 1 → 413; exactly 10 MiB → 200 | pass | `TestHandleReaderFile_SizeCap` writes both sizes |
| D13 | plan write flips `exists` with the upsert **before** `docChanged`; non-`.md` and unrouted broadcast nothing | pass | `TestReaderObserve_RoutedWriteToPlanPathFlipsExistsBeforeDocChanged` reads the two frames in order; two negative tests |
| D14 | three columns round-trip through `UpdateSession`/`LoadAll` | pass | `TestUpdateSession_ReaderFieldsRoundTrip` + `TestReaderFields_RoundTripThroughLoadAll` |
| D15 | `SetTranscript` persists only on change, never broadcasts | pass | `TestSetTranscript_PersistsOnlyOnChangeAndNeverBroadcasts` asserts the recorder length is unchanged across three calls |
| D16 | subagent-marked write still fires `docChanged` | pass | `TestIngestRouting_SubagentMarkedWriteBroadcastsDocChanged`, through the real ingest pipeline |
| D18 | missing directory → 409 `directory_missing` | pass | `TestHandleReaderList_DirectoryMissingIs409` |
| D19 | `writtenAt` non-null only for a recorded write | pass | `TestHandleReaderList_WrittenAtNonNullOnlyForARecordedWrite` asserts `a.md` non-nil and `b.md` nil |
| D20 | straggler Claude id moves neither transcript nor plan, for three event types | pass | `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` drives `SessionEnd`, `PostToolUse` Write and `PreToolUse` `ExitPlanMode` through real ingest |
| W4 | `docs` selection, never attachable, `shellEnded` keeps it, key round-trip | pass | 10 added cases in `surfaceswitch.test.ts`; all four `alive`×`shellRunning` combos asserted |
| W5/W6 | `buildTree` / `filterTree` / `countFiles` | pass | `tree.test.ts` 26 cases — folder-before-file ordering, collapsed start, recursive count, case-insensitive substring, ancestor expansion, empty-query identity |
| W7 | memory round-trip, throwing storage, per-session keys | pass | `memory.test.ts` 20 cases, incl. a foreign JSON shape and `writtenAt`-keyed re-dirty |
| W8 | `headingSlug` / `dedupeIds` | pass | `slug.test.ts` 11 cases incl. `-2`/`-3` in document order |
| W9 | `changedText` renders `changed <age> ago` | pass as specified | `freshness.test.ts` 5 cases — **but see Major 2**: the specified copy is ungrammatical in the freshest bucket |
| W10 | `parseSession` plan handling; `parseDocChanged` | pass | 16 added cases in `protocol.test.ts` incl. missing-key and malformed-object rejection |
| W14 | no `any` in new web code | pass | grepped every new/modified file in `web-implementation.md` — no `: any`, `as any`, `any[]`, `<any>` |
| W15 | sanitized markdown only via a DOMPurify fragment | pass | `rg innerHTML web/src` — only comments; `markdown.ts` is the sole `sanitize` call and `setReaderBody` uses `replaceChildren` |
| W16 | `ReaderInstance` built/disposed only in `features/reader.ts` | pass | `new ReaderInstance` occurs once (reader.ts:394); `render/reader.ts` takes refs + view-model, no fetch, no socket |
| W17 | `sessionRemoved` disposes the reader; daemon drops the write log | pass | `features/reader.ts:457-460`; `sessions.go` `handleRemoveSession` → `forgetSession` → `writeLog.forget` (`TestWriteLog` "forget drops the whole session") |
| W18 | new CSS is tokens only; `--disp`/`--sans`/`--mono` roles | pass | every colour in the new block is `var(--…)`; `.md` = `--sans`, `.md h1–h6` = `--disp`, `.md code`/`pre`/`.docbar`/`.rnav` = `--mono`; `make contrast` green |
| W19 | `doc.html` carries the same theme-hint script | pass | `web/doc.html:7-21` mirrors `web/index.html:7-21` verbatim |
| E2–E29 | exist as Playwright tests asserting the prose | pass | read `web/e2e/reader.spec.ts` end to end: 32 tests, one per criterion plus the `ExitPlanMode` and INV-1 additions; assertions are specific (`toHaveText`, `toHaveCount(0)`, `toHaveAttribute`), none skipped or weakened |
| REQ-23 | the ADR records the alternatives | pass | `kb:adr/reader-markdown-rendered-in-browser` names markdown-it, micromark/remark, showdown, sanitize-html, goldmark+bluemonday and the Sanitizer API exit, and states bumps are manual |

### Repairs table (test-specs.md)

Both repairs are locator-only and neither weakens its assertion: repair 1 moved
`TerminalSocketTracker` before `page.goto` (the E2/INV-6 socket-count and geometry
assertions are unchanged), repair 2 added `exact: true` so `Files` stops matching the
`Hide files` arrow (the independent-fold assertion is unchanged, and the author proved it
by reverting the fix and reproducing the failure). Neither is a flake repair, so no
`e2e-soak` was required. No `test.skip`/`test.fixme` exists anywhere under `web/e2e` or
`web/src`.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D4's grep is green; `internal/server/reader.go` touches only `claudecode.FileSignal`/`LocatePlanFile`, never a payload key |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in the diff; state comes from hooks only |
| 3 | No blocking hook handler | pass — `Observe` runs on the ingest worker after `Apply`, off the 200 path; no timeout touched |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — no tmux invocation and no `resize-pane` in the diff |
| 5 | No payload logging | pass — the six log sites in `reader.go` carry only an error, the Muster session id and (once) a directory; the written path is never logged with payload text |
| 6 | No empty-gauge dishonesty | pass — the freshness cue element is **absent** until a write is seen (REQ-24, verified by hand: count 0), the `.n` count is absent before the listing, the plan slot says `no plan yet` rather than showing an empty entry |
| 7 | Identity on the tmux target | pass — `SetTranscript`/`SetPlan` key on the Muster id and *compare* `claudeSessionID` as a guard; nothing identifies a session by it |
| 8 | No settings trespass | pass — nothing reads `~/.claude/settings*.json`; `IsUnderDefaultPlansDir` reads `$HOME` only |
| 9 | No real `claude` outside canary | pass — reader specs synthesize hooks; no `claude` invocation added |

### Design-system spot checks

- Tokens only in the new CSS; no colour literal outside a theme block (`make contrast` green).
- No web font, no CDN link, no `@import` added.
- No state colour repurposed — the reader introduces no `--amber`/`--rose`/`--violet`/`--teal` use.
- Tabular numerics on every value that changes over time: `.docbar .chg`, `.rnav .hd .n`, `.rnav .f .cnt`.
- `[hidden]` companions: every `hidden` toggle in `render/reader.ts` (`.ib`, `.arr`, `.reader-notice`, `.rnav`, `.plan-label`, `.plan-slot`, `.filter`, `.tree`, `.outline`) has a matching `[hidden] { display: none; }` rule in `style.css`. Swept all nine.
- §7 terminals: `docs` never has a `TerminalSurface` (`isSurfaceAttachable` returns false; `desiredSurfaceEntries` never pushes kind `docs`), so no second live client is opened; the one background `shell` attach kept while `docs` is selected is the *same* single client that was already open, kept alive so `onShellEnded` still clears the pip.

## Manual Verification

Drove the real dashboard in Chromium against a scratch `musterd` (a throwaway spec using
the committed E2E helpers, run and then deleted — `git status` is clean of it), with a
fixture plan containing a GFM table, a task list, a fenced block and three headings.

Confirmed by hand, reading the live DOM rather than trusting a test:

- Mainhead segment renders exactly `claude | shell | docs`; the tile footer segment does too.
- Bar shows `PLAN` badge, `review-manual-slug.md`, and the **absolute** plan path, unabbreviated.
- Body renders the table (3 rows), 2 checkboxes both `disabled`, one `<pre><code>`, bold and inline code.
- Outline lists `The Plan`, `Requirements`, `Notes`; tree lists `docs/` (count 1) and `TODO.md`; the non-`.md` and the dot-directory file are absent.
- Freshness cue: **0 elements** before any write hook (REQ-24 honoured, not a hidden element).
- Posting a routed `PostToolUse` Write for the open file re-rendered the new content live and produced the cue — whose text reads `changed now ago` (Major 2).
- Screenshots: `reader-focus.png`, `reader-after-write.png`, `tiles-3x2.png` in the review scratchpad.

Measured geometry (Chromium, `getBoundingClientRect`), which is what produced Critical 1:

```
Focus:  .reader flex-direction: column
        article.md  x=300 y=122 w=980 h=365
        nav.rnav    x=300 y=487 w=236 h=233     ← below the body, not beside it
Tile:   tile bottom = 402.5   nav bottom = 428  ← 25.5px outside the tile
        compact class = false, .docbar .path present, .rnav .hd .n present
```

Not verified: real Claude Code behaviour (fixtures only, by design), and the
plans-directory override (edge case 18 — the plan already records it as unobservable on
this machine).

## Issues

### Critical

1. **[web-impl]** The reader's file nav renders **below** the body instead of as the
   right-hand nav, and overflows its host in a tile —
   `web/src/style.css` (`.reader { display: flex; flex-direction: column }`) with
   `<nav class="rnav">` nested inside `<section class="reader">` in `web/index.html:336`
   and `web/doc.html`.
   The mockups that the plan names as design authority put `.rnav` *outside* `.reader`, as
   its sibling inside a `display:flex` row wrapper
   (`docs/design/mockups/markdown-viewing/gen.mjs:218-222`) — which is what `.rnav`'s own
   `border-left` and `width: 236px` assume. Nested in a column flex container it becomes a
   236px-wide block stacked under `article.md`.
   Measured above: in Focus the nav sits at y=487 directly below a 980px-wide body; in a
   tile it ends 25.5px past the tile's own bottom edge, painting over the chrome below
   (`.rnav` is `flex: none`, so it cannot shrink to fit). This is the placement
   `kb:adr/reader-docs-is-third-surface-segment` decided ("option A … with a right-hand
   file nav") and REQ-4/REQ-9/REQ-10/REQ-14/REQ-15 all describe.
   Fix: keep `.docbar` and `.reader-notice` stacked at the top and put `article.md` and
   `nav.rnav` side by side in a row — either a wrapper element added to both templates, or
   `.reader { display: grid; grid-template-columns: 1fr auto; }` with the bar and notice
   spanning both columns — so the nav is a right-hand column bounded by the host's height
   and scrolls internally (`.rnav` already has `overflow: hidden auto`). Verify by
   measuring, not by a locator: the nav's `x` must exceed the body's right edge and its
   `bottom` must not exceed the host's.

### Major

1. **[web-impl]** REQ-15 is only honoured at mount: `ReaderInstance.compact` is
   `readonly`, set once in the constructor from `app.state.view === "tiles"`
   (`web/src/features/reader.ts:62, 392`), and `reconcileInstances` keeps the instance
   alive across a view switch because the session id stays in the desired set. Measured:
   open `docs` in Focus, press `Cmd+\` → the tile's reader has
   `classList.contains("compact") === false`, `.docbar .path` present, `.rnav .hd .n`
   present, nav 236px. The reverse direction leaves a 190px nav and no path in the full
   Focus pane. REQ-15 states a property of the host ("In a tile the reader renders
   compact"), not of the mount moment; E27 misses it because it opens a fresh session at
   each density while already in Tiles.
   Fix: make compactness a per-render input (the host passes it, like `session`/`now`/
   `connected`) rather than a constructor field, and toggle the `compact` class plus
   `pathVisible`/`filesHeader.count` from it each pass. The nav-collapsed *default* stays
   mount-time — that one is genuinely a "starts collapsed" rule.

2. **[web-impl]** `changedText` composes `changed ${formatAge(...)} ago` directly
   (`web/src/reader/freshness.ts:11`), so the freshest bucket renders **`changed now
   ago`** — confirmed on screen. This is the exact defect the project already ruled on:
   `web/src/sessions/format.ts:50-59` carries `formatEndedAgo` with the comment "review
   m4-reconcile Major 6: every caller that composes `<age> ago` copy … must go through
   this instead of appending ` ago` directly — … `ended now ago` is ungrammatical on the
   plan's most common path". The reader's most common path is identical: looking at a file
   right after Claude wrote it. Fix it the same way — return `changed now` for the
   sub-minute bucket and `changed <age> ago` otherwise, ideally via a shared helper beside
   `formatEndedAgo` so a third caller cannot repeat it.

3. **[web-tests]** Companion to Major 2: `web/src/reader/freshness.test.ts:10-14` pins the
   ungrammatical string (`toBe("changed now ago")`) and the `/^changed .+ ago$/` matrix
   case asserts it at the sub-minute bucket. Update both to the corrected copy once
   Major 2 lands — keeping a case that proves the sub-minute bucket is *not* `now ago`.

4. **[e2e-specs]** Companion to Major 2: `web/e2e/reader.spec.ts:369` (E10) asserts
   `toHaveText(/^changed .+ ago$/)`, which the corrected copy will not match when the
   write is seconds old — the common case in that test. Widen it to accept both shapes
   (e.g. `/^changed (now|.+ ago)$/`) without weakening what it proves: a cue element with
   real freshness text appears after the routed write.

### Minor

None.

### Notes

1. **[note]** `LocatePlanFile(transcriptPath, home)`'s extra `home` parameter departs from
   the plan's Affected Files signature, and I agree with the orchestrator that it needs no
   ADR: it is a private signature inside `internal/claudecode` with no REQ, wire or
   protocol consequence, its rationale (never mutate process-global `$HOME` in a test) is
   `docs/conventions.md` § Go applied as written, and the doc comment records it. No
   `deviation:` line exists in either implementation log, and `kb ls --status proposed`
   shows exactly the seven ADRs the plan named, all `refs: [plan:markdown-viewing]`.
2. **[note]** The correction to `web/src/reader/CLAUDE.md`'s Invariants block is right:
   the exception is measured (`default.sanitize is not a function` without a `window`),
   names the module, and points at its real coverage (W15, E15, E16). The file's `# …
   pure reader logic, no DOM` heading now slightly overstates, but the invariant directly
   beneath it carries the truth, so I would not change it.
3. **[note]** `web-tests` declining Vitest coverage of `markdown.ts`, `features/reader.ts`
   and `render/reader.ts` is the right line: the first has a hard `window` dependency
   under a jsdom-less Vitest, and the other two are the DOM/socket layer that no
   `features/*.ts` controller in this repo unit-tests. The plan's own W4–W10 enumerate
   every other reader module by name and never these.
4. **[note]** `ac4137e`'s `maybeAutoOpenPlan` is genuinely covered (the `leaving plan mode
   fires a scan…` spec, red before the fix and green after) and cannot re-fetch: `openFile`
   assigns `this.openPath` synchronously before awaiting, so the `openPath !== null` guard
   closes after the first call even when the fetch later 404s — which is why E14's
   zero-request settle window stays at 0. The `isStandalone` skip is right too; the pop-out
   owns its file through `?path=`.
5. **[note]** `walkMarkdown`'s `if walkErr != nil && !errors.Is(walkErr, errWalkCap) { _ =
   walkErr }` (`internal/server/reader.go:436-442`) is a no-op branch kept only to hold its
   comment. It is lint-clean and honest about why nothing is logged; flagging it only so a
   later reader doesn't mistake it for a dropped error.
6. **[note]** `ReaderMemory.clearedAt` grows one entry per acknowledged path per session
   and is never pruned. Bounded in practice by the daemon's 512-path write log per session
   and by localStorage's own quota (`saveMemory` already swallows a quota throw), so
   nothing to do now.
7. **[note]** `handleReaderFile`'s `too_large` message names the symlink-*resolved* path
   rather than the requested one. The contract's example shows a plain path and E26 only
   matches the message's substance, so this is cosmetic; worth knowing if the message ever
   becomes an assertion target.
8. **[note]** Completion still owes the `TODO.md` § Pre-v1 Cleanup tick + move to
   `docs/history/todo-done.md` and the seven `proposed`→`accepted` ADR flips. Both are
   Completion-step work by design (plan § Doc upkeep), not gaps in this cycle — recorded
   so they are not lost.
