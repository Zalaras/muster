# Review: Markdown Render Fixes

**Plan**: markdown-render-fixes
**Verdict**: approved
**Pack**: kb: pack 8995 words (WARN: pack exceeds budget of 8000 words)

Cycle 2, full review (cycle 1 carried Majors, so no delta shortcut). Everything below was
re-run and re-verified independently of the orchestrator's own gate run.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 one nav-toggle button, never hidden, every host | Yes | Yes (E1, E18, E22, E27, E9) | pass |
| REQ-2 right edge fixed across nav state and cue presence | Yes | Yes (E1, E4, E27) | pass |
| REQ-3 `File explorer` name, `aria-expanded`, `›`/`‹` glyphs | Yes | Yes (E18) | pass |
| REQ-4 keyboard activation leaves focus on the button | Yes | Yes (E2, Focus + pop-out) | pass |
| REQ-5 docbar group no longer re-aligns on the cue | Yes | Yes (E4) | pass |
| REQ-6 plan header row absent on a dead session | Yes | Yes (E22/E5) | pass |
| REQ-7 bar + `aria-current` move synchronously | Yes | Yes (E6, held route) | pass |
| REQ-8 `loading <basename>…` while a doc is rendered | Yes | Yes (E7, E12) | pass |
| REQ-9 body placeholder reads `loading…` while nothing rendered | Yes | Yes (E9, E11, E14, **new first-open held test**) | pass — cycle-1 Major 1 fixed in `d744f7b` (`web/src/features/reader.ts:236-243`), re-measured in-browser |
| REQ-10 tree shows one `loading…` row while the listing is in flight | Yes | Yes (E9, **E23 extended**) | pass — cycle-1 Major 2 fixed via `listingLoading`, re-measured after a failed listing |
| REQ-11 re-fetch of the open file is silent | Yes | Yes (E10) | pass |
| REQ-12 every load terminates its cue | Yes | Yes (E12, E13) | pass |
| REQ-13 `basename`/`loadingText` pure in `web/src/reader/paths.ts` | Yes | Yes (8 Vitest cases) | pass |
| REQ-14 reading area greys out, `aria-busy`, lifts on every path | Yes | Yes (E16, E12, E13, E15) | pass |
| REQ-15 daemon-down wins the status line | Yes | Yes (E13) | pass |
| REQ-16 cues are per-instance | Yes | Yes (E15) | pass — coverage row in `test-specs.md` corrected (cycle-1 note 3) |
| REQ-17 dead `.arr[hidden]` rule removed | Yes | n/a (grep W3/W5) | pass — the sibling `.rnav .plan-label[hidden]` rule went with it (cycle-1 Minor 1) |

## Build & Tests

E2E tests: pass — 351/351, `make e2e` from a clean tree (1.9m, retries 0); re-run a second
time inside `gates.sh` as check E0 (1.8m), also 351/351. No spec outside this plan regressed.
Daemon tests: pass — `go test -count=1` all packages ok (inside `make check`)
Web tests: pass — 1570/1570 Vitest, 36 files
Daemon build: pass (`make check` → `make build` path; no Go file in the diff — `git diff --name-only` reports 0 `.go` files)
Web build: pass (`make web-build`)
Lint: pass — golangci-lint, Biome (`web-lint`), `e2e-lint: clean`, `check-versions`, `check-kb`, `refs`
Contrast gate: pass — instrument/dark/light, 43 pairs each, 0 failures
dead-refs: `2551 references checked, 0 missing`

No flaky-spec repair is claimed in this cycle's diff (the `## Repairs (Fix Attempt 1)` rows are a
missing-coverage addition and one added assertion, neither a flake), so no `e2e-soak` run was owed.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make check` | PASS |
| W2 | `make web-build` | PASS |
| W3 | `[ "$(rg -o 'class="arr"' web/index.html web/doc.html \| wc -l \| tr -d ' ')" = "2" ]` | PASS |
| W5 | `! rg -n 'data-role="arr-(open\|collapsed)"' web/` | PASS |
| E0 | `make e2e` | PASS (351/351) |
| DOC | doc upkeep | pass, one Completion-ordered item outstanding — `docs/features/reader/spec.md`, both ADRs and the `make gen-kb` output are done and accurate; the two `TODO.md` ticks for #24/#25 and their move to `docs/history/todo-done.md` are the orchestrator's Completion step and cannot precede an approved verdict (listed under Minor `[orchestrator]`) |
| KB | `make check-kb` | PASS — 348 records, 23 features, 0 problems |

Both plan ADRs exist as records, are `status: proposed`, carry `refs: [plan:markdown-render-fixes]`,
and describe what shipped: `kb:adr/reader-nav-toggle-is-one-fixed-button` (one docbar button, the
bar's auto margin moved onto it) and `kb:adr/reader-loading-cue-never-clears-a-rendered-body` (dim +
status line, body placeholder only while nothing has rendered). No `deviation:` line appears in any
`## Decisions` log on this branch (`rg 'deviation:' plans/markdown-render-fixes/`), so no further ADR
is owed. `docs/protocol.md` needed no change — the plan declares no protocol delta and the diff
touches no protocol file.

The `E15` → `E0` rename of the full-suite check (cycle-1 Minor 2) landed in `c1c5241`; the checks
block and the acceptance-criteria list no longer disagree about `E15`.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W6 | `prepareNavArrowFocusRestore` and `.arr[hidden]` gone; nothing sets `hidden` on the toggle | pass | `rg 'arr\[hidden\]' web/` empty; `prepareNavArrowFocusRestore` survives only in an ADR and spec comments; the only `navToggle` writes are the click listener, `aria-expanded` and `textContent` (`web/src/render/reader.ts:147`, `:423-424`) |
| W7 | `web/src/reader/paths.ts` imports nothing DOM-bound | pass | the file has no `import` at all — 18 lines, two pure functions |
| W8 | `web/src/reader/CLAUDE.md`'s **Owns** line names `paths.ts` | pass | `web/src/reader/CLAUDE.md:3-7` |
| W9 | status-line text derived in one place, daemon-down first | pass | `deriveNotice` (`web/src/features/reader.ts:60-69`) is the sole reader of `UNREACHABLE_TEXT` outside its declaration and returns it before the loading branch; `render` calls it once (`:417`) |
| W10 | the two `#reader-template` blocks are identical | pass | extracted both blocks programmatically — 1476 bytes each, byte-identical |
| E1–E15 | each new test asserts a settled state, not a race | pass | every transient assertion sits behind a held real response (`holdReaderFileResponse` / `holdReaderListingResponse`, the `actions.spec.ts:703` shape); the only fixed holds are the two `settleFor(page, 500)` calls in E10, a stays-unchanged check — the sanctioned use. `e2e-lint: clean`, no `waitForTimeout`, no widened timeout, retries 0 |

### The two cycle-1 fixes, verified against the requirement rather than the diff

- **Major 1 (REQ-9)** — `openFile` now sets the body to `loadingText(null)` before its await when
  `showLoading && !bodyRendered` (`web/src/features/reader.ts:236-243`). It sits in the one function
  every `showLoading: true` caller funnels through (`decideInitialOpen`, `maybeAutoOpenPlan`,
  `selectRelative`, `selectPlan`), so the mount path and the click path are both covered, not just
  the case I screenshotted. `deriveNotice`'s suppression while `bodyRendered === false` is untouched,
  as the plan's cue table requires.
- **Major 2 (REQ-10)** — `treeLoading` now reads `listingLoading`, cleared after `loadListing`'s
  guard on both the failure and the success path (`:174-181`, `:436`). I checked the guard cannot
  strand the flag in practice: `loadListing` is called once, from the constructor, and the only other
  `++this.fetchSeq` is `openFile`, whose every caller is gated behind `listing !== null` or
  `openPath !== null` — neither reachable before the listing resolves. See Notes 1.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — 0 `.go` files in the diff; no Claude-Code field name (`hook_event_name`, `permission_mode`, `rate_limits`, `session_id`) added anywhere in `web/` |
| 2 | No terminal-output state parsing | pass — no `capture-pane`, no pane-text read added |
| 3 | No blocking hook handler | pass — no daemon change |
| 4 | tmux always `-L muster` / per-test socket; no `resize-pane` | pass — no tmux call added |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | pass — this is exactly what cycle 1's two Majors were, and both surfaces now tell the truth: the body says `loading…` while a first open is in flight (measured), and the tree's row clears when the listing fails (measured) |
| 7 | Identity on the tmux target, not `session_id` | pass — no identity rule added |
| 8 | No `~/.claude/settings*.json` / `CLAUDE_CONFIG_DIR` | pass |
| 9 | No real `claude` outside canary/probes | pass — synthesized fixtures only |

**Design system.** No colour literal, font stack or spacing literal added — the whole CSS delta is
`margin-left: auto` moved from `.docbar .chg` to `.docbar .arr`, an `opacity: 0.4` dim with a 120 ms
transition, one italic selector extended, one dead rule removed and one `[hidden]` companion added.
`make contrast` green in all three themes. `[hidden]` sweep: every `hidden` write in
`web/src/render/reader.ts` (`popOut`, `planHeader`, `planSlot`, `notice`, `nav`, `filter`, `tree`,
`outline`) has its companion rule in `web/src/style.css` (`:791`, `:1023`, `:1051`, `:828`, `:1000`,
`:1077`, `:1194-1195`), per kb:lesson/display-rule-overrides-hidden-attribute — including the new
`.rnav .hd[hidden]` for REQ-6. No new numeric display, so no `tabular-nums` obligation. `--term`
untouched; one live client per session unchanged; no `resize-pane`; xterm scrollback untouched.

## Manual Verification

Drove the freshly built dashboard (the binary and bundle `gates.sh` had just produced) in a real
headless Chromium against a scratch `musterd`, via one throwaway spec deleted afterwards — the tree
is clean (`git status --porcelain` shows only `orchestration-state.json`, the review file being
replaced, and the orchestrator's untracked `review.cycle1.md`). Screenshots read by eye, values
read out of the live DOM:

- **#24, the arrow.** Focus host, plan-less session. Measured bounding-box right edge **1268px with
  the nav open and 1268px with it collapsed** — identical, flush against the docbar's right edge in
  both screenshots. Glyph flips `›` → `‹`, `aria-expanded` `true` → `false`, the button is never
  hidden, and the bar's left group does not move. The dead-session screenshot shows the same button
  present and right-aligned with no plan header row above the nav (REQ-6). Issue #24's report is fixed.
- **#25, first open with nothing rendered** (cycle-1 Major 1). With `GET …/reader/file` held:
  body text `"loading…"`, `aria-busy="true"`, status line hidden, bar already naming `TODO.md` and
  `aria-current` on it in the tree. The screenshot shows the dimmed `loading…` where cycle 1 showed
  a dimmed "nothing open — pick a file". After release: the document renders and `aria-busy` is
  **removed** (read back as `null`, not `"false"`).
- **Listing failure** (cycle-1 Major 2). Ended session, directory removed, docs opened, then a
  deliberate 2 s wait past the settled status line — `treeLoadingRows=0`, body
  `"nothing open — pick a file"`, status line `"… no longer exists"`. The permanent italic
  `loading…` row from cycle 1 is gone; the screenshot shows an empty tree, which is plan edge case
  2's stated behaviour.
- **Load over a rendered document** (unchanged from cycle 1, re-confirmed by E7/E16/E15 in the
  green suite rather than re-driven by hand).

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** Doc upkeep still owed at Completion: tick **Jumping file explorer arrow**
   ([#24]) and **No loading state for markdown files** ([#25]) in `TODO.md` § Reported issues and
   move both blocks, with their issue links intact, to `docs/history/todo-done.md` under the same
   heading (plan § Doc upkeep). Correctly deferred — the pipeline forbids a ✅ before an approved
   verdict exists — so this does not block approval; it is listed so the Doc-Upkeep Backstop does
   not lose it.

### Notes

1. **[note]** `listingLoading`'s doc comment says it is "cleared on every exit from `loadListing`";
   strictly it is cleared on every exit *past* the `disposed || seq !== this.fetchSeq` guard. I
   verified that guard is unreachable today for the superseded case — `loadListing` runs once from
   the constructor and the only other `fetchSeq` bumper (`openFile`) cannot be entered before the
   listing resolves, since `selectRelative`/`selectPlan`/`maybeAutoOpenPlan` are gated on
   `listing !== null` and `refetchOpenFile`/`handleWindowFocus`/`handleDocChanged` on `openPath` —
   and the `disposed` case removes the instance's DOM anyway. No change requested; worth knowing if
   a future change ever starts a file fetch during mount, which would strand the row again.
2. **[note]** The new first-open test and the extended E23 were each proven red against the pre-fix
   tree (`element(s) not found` and `Received: "1"` respectively, with the implementation hunk
   reverse-applied and rebuilt), so neither assertion is vacuous. `test-specs.md`'s two Repairs
   tables record no deleted, skipped or weakened assertion, and reading both edits confirms that:
   E23 gained an assertion and kept its status-line one, and nothing was replaced by a
   container-level `toBeVisible()`.
3. **[note]** Carried from cycle 1 and still true: the unrelated `triage` `CheckVersion` backlog
   entry added to `TODO.md` on this branch is accurate and harmless, but it will ride this plan's
   squash merge.
4. **[note]** `kb pack --plan markdown-render-fixes --role review` still reports 8995 words against
   the 8000-word budget. A `/retro` matter, not a change here.
