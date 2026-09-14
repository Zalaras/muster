# Review: Markdown Render Fixes

**Plan**: markdown-render-fixes
**Verdict**: needs-changes
**Pack**: kb: pack 8995 words (WARN: exceeds budget of 8000 words)

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
| REQ-9 body placeholder reads `loading…` while nothing rendered | **Partial** | Partial (E9, E11, E14) | **FAIL** — Major 1: after the listing settles on `nothing open — pick a file`, a user-initiated open leaves that text on screen (dimmed) instead of `loading…`; measured in-browser |
| REQ-10 tree shows one `loading…` row while the listing is in flight | **Partial** | Partial (E9) | **FAIL** — Major 2: the row never clears when the listing *fails*; it is still there minutes later |
| REQ-11 re-fetch of the open file is silent | Yes | Yes (E10) | pass |
| REQ-12 every load terminates its cue | Yes | Yes (E12, E13) | pass |
| REQ-13 `basename`/`loadingText` pure in `web/src/reader/paths.ts` | Yes | Yes (8 Vitest cases) | pass |
| REQ-14 reading area greys out, `aria-busy`, lifts on every path | Yes | Yes (E16, E12, E13, E15) | pass |
| REQ-15 daemon-down wins the status line | Yes | Yes (E13) | pass |
| REQ-16 cues are per-instance | Yes | Yes (E15) | pass |
| REQ-17 dead `.arr[hidden]` rule removed | Yes | n/a (grep W5/W3) | pass (but see Minor 1 — a sibling rule went dead in the same change) |

## Build & Tests

E2E tests: pass (350/350, `make e2e`, 1.8m, retries 0)
Web tests: pass (1570/1570, Vitest, 36 files)
Web build: pass (`make web-build`)
Daemon build: pass (inside `make check`; no Go file in the diff)
Lint: pass (`make check` — golangci-lint, Biome, `refs`, `check-kb`)
Contrast gate: pass (43 pairs × 3 themes, 0 failures)
`e2e-lint`: clean

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make check` | PASS |
| W2 | `make web-build` | PASS |
| W3 | `[ "$(rg -o 'class="arr"' web/index.html web/doc.html \| wc -l \| tr -d ' ')" = "2" ]` | PASS |
| W5 | `! rg -n 'data-role="arr-(open\|collapsed)"' web/` | PASS |
| E15 | `make e2e` | PASS |
| DOC | doc upkeep | **FAIL** — the two `TODO.md` entries (#24, #25) were rewritten with real titles but are still `- [ ]` under § Reported issues; neither was ticked nor moved to `docs/history/todo-done.md` (plan § Doc upkeep). `docs/features/reader/spec.md`, both ADRs and `make gen-kb` output are done and correct. |
| KB | `make check-kb` | PASS (348 records, 23 features, 0 problems) |

Both plan ADRs exist, are `status: proposed`, carry `refs: [plan:markdown-render-fixes]`, and
describe what actually shipped. `docs/protocol.md` needed no change (no protocol delta).

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W6 | `prepareNavArrowFocusRestore` and `.arr[hidden]` gone; nothing sets `hidden` on the toggle | pass | `rg prepareNavArrowFocusRestore` hits only an ADR and two spec comments; `rg 'arr\[hidden\]' web/` empty; the only `navToggle` writes are `aria-expanded` and `textContent` (`web/src/render/reader.ts:423-424`) |
| W7 | `web/src/reader/paths.ts` imports nothing DOM-bound | pass | the file has no `import` at all; 18 lines, two pure functions |
| W8 | `web/src/reader/CLAUDE.md`'s **Owns** line names `paths.ts` | pass | `web/src/reader/CLAUDE.md:7` |
| W9 | status-line text derived in one place, daemon-down first | pass | `deriveNotice` (`web/src/features/reader.ts:60-69`) is the only reader of `UNREACHABLE_TEXT` outside its declaration, and `render` calls it once (`:403`) |
| W10 | the two `#reader-template` blocks are identical | pass | extracted both blocks; byte-identical, 1476 bytes each |
| E1–E15 | each new test asserts a settled state, not a race | pass | every transient assertion sits behind a held real response (`holdReaderFileResponse` / `holdReaderListingResponse`, the `actions.spec.ts:703` shape) or a post-release settled expectation; the only fixed holds are two `settleFor(page, 500)` calls in E10, which is a stays-unchanged check — the sanctioned use. No `waitForTimeout`, no widened timeout, no retry (`e2e-lint: clean`) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no Go file in the diff; no Claude-Code field names added to `web/src/` |
| 2 | No terminal-output state parsing | pass |
| 3 | No blocking hook handler | pass — no daemon change |
| 4 | tmux always `-L muster` / per-test socket; no `resize-pane` | pass — no tmux call added |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | **see Majors 1–2** — no gauge, but two surfaces assert something untrue (a body reading `nothing open` while that file is being opened; a tree row reading `loading…` when nothing is loading) |
| 7 | Identity on the tmux target, not `session_id` | pass — no identity rule added |
| 8 | No `~/.claude/settings*.json` / `CLAUDE_CONFIG_DIR` | pass |
| 9 | No real `claude` outside canary/probes | pass — fixtures only |

Design system: no colour literal, font stack or spacing literal added (`opacity` and a `margin-left:
auto` only); `make contrast` green; the one new `hidden` toggle (`planHeader`) ships its
`.rnav .hd[hidden] { display: none; }` companion, per kb:lesson/display-rule-overrides-hidden-attribute;
no new numeric display, so no `tabular-nums` obligation; `--term` untouched; one live client per
session unchanged.

## Manual Verification

Drove the built dashboard in a real Chromium against a scratch `musterd` (three scenarios, one
throwaway spec, deleted afterwards — tree is clean), screenshots read by eye:

- **#24, the arrow.** Focus host, `TODO.md` open: the `›` sits flush against the docbar's right
  edge. Toggling the nav collapses it and the button stays put and flips to `‹` — measured right
  edge `1268px` in both states, and confirmed on the two screenshots. The bar's left group
  (`TODO.md`, the path, `pop out ↗`) does not move. Issue #24's report is fixed.
- **#25, a load over a rendered document.** With `GET …/reader/file` held: status line reads
  `loading x.md…`, `article.md` carries `aria-busy="true"` and visibly dims while still showing the
  old document. Releasing renders the new file and clears both. This is the intended behaviour and
  it works.
- **#25, the first open on a session with no plan** (Major 1). Body text while the fetch was held:
  `"nothing open — pick a file"`, `aria-busy=true`, status line **hidden** (empty). The screenshot
  shows the bar naming `TODO.md`, `aria-current` on `TODO.md` in the tree, and the body
  simultaneously stating nothing is open — the only cue is a 40% dim of that contradicting
  sentence.
- **Listing failure** (Major 2). Ended session, directory removed, docs opened: the status line
  correctly reads `… no longer exists`, the body settles on `nothing open — pick a file`, and the
  file tree sits on an italic `loading…` row **permanently** (re-read 1.5 s after settle, and
  visible in the screenshot).

## Issues

### Critical

None.

### Major

1. **[web-impl]** A user-initiated open with nothing yet rendered shows no loading cue at all — the
   body keeps `nothing open — pick a file` (dimmed) while the bar already names the file being
   opened. `web/src/features/reader.ts:177-190` (`openFile`'s `showLoading` branch) sets
   `loadingPath` and re-renders but never touches the body, and `deriveNotice`
   (`web/src/features/reader.ts:66-68`) deliberately suppresses the status-line cue while
   `bodyRendered === false` — so on any session without a plan and without remembered state, the
   *first* click (the common case, and exactly issue #25's complaint) gets a dimmed contradiction
   instead of a cue. The plan's own § The loading cues table, row 2, specifies body content
   `loading…` for "user-initiated open, nothing rendered yet"; the parenthetical "(already
   showing)" only holds for the mount path, which is why the transitions list below it omits the
   case. Fix: in `openFile`, when `opts.showLoading && !this.bodyRendered`, set the body to
   `{ kind: "placeholder", text: loadingText(null) }` before the await. No plan change needed.
2. **[web-impl]** The tree's `loading…` row never clears when the listing fetch fails — it is
   permanent. `render()` passes `treeLoading: this.listing === null`
   (`web/src/features/reader.ts:422`), and `loadListing`'s failure branch
   (`web/src/features/reader.ts:172-181`) returns without ever assigning `this.listing`, so the row
   the plan scopes to "while the listing is in flight" outlives the request that justified it. Plan
   edge case 2 says the row "is replaced by an empty tree"; measured instead: the row is still
   `loading…` after the `directory_missing` message has settled (screenshot above). Fix: drive
   `treeLoading` off a "the listing request has not resolved yet" flag cleared on every exit from
   `loadListing`, not off `listing === null`.
3. **[e2e-specs]** Neither behaviour above is pinned by a test, and the suite is green because of
   it. Edge case 2 is mapped to E14 in the plan, but the authored E14 exercises a *deleted
   remembered path*, not a listing failure — the one test that does fail a listing (E23, "on an
   ended session whose directory was removed") asserts only the status line, so the stranded tree
   row passed unnoticed; and no test opens a file while `bodyRendered` is still false. After the
   two fixes land, add (a) an assertion to the listing-failure path that the tree holds no
   `loading…` row once the error message has settled, and (b) a held-response test that a first
   open on a plan-less session shows `loading…` in the body and never `nothing open — pick a file`.

### Minor

1. **[web-impl]** `web/src/style.css:1051` — `.rnav .plan-label[hidden] { display: none; }` is now
   dead: `planLabel` was dropped from `ReaderRefs` and nothing sets `hidden` on `.plan-label` any
   more (`rg plan-label web/src` returns only this rule and the two templates' static spans).
   REQ-17 removed the sibling rule that this change made dead; this one was made dead by the same
   change and should go with it.
2. **[orchestrator]** Plan defect: the ```checks block reuses the ID `E15` for `make e2e`, while
   acceptance criterion **E15** is the two-tiles-per-instance test — the plan's own Acceptance
   Criteria preamble says "IDs are unique across the whole section". Harmless here (both pass), but
   the checks table and the criteria list disagree about what `E15` means.

### Notes

1. **[note]** The impl's `## Decisions` resolution of the tree loading row — `.f.loading-row` with
   `.rnav .f.none, .rnav .f.loading-row { font-style: italic; }` rather than a literal `.f.none` —
   is the right call. The plan's prose said "styled like `.f.none`", not "reuse the class"; the
   plan slot's own `.f.none` can legitimately coexist (it reads `session.plan` off the socket,
   independent of the listing fetch), so a literal reuse made `noPlanText`'s nav-scoped `.f.none`
   locator strict-mode-ambiguous. The visual result is identical and no test locator was bent to
   fit. No ADR is warranted for a class name, and the log is not a `deviation:` line.
2. **[note]** The deletion of the cycle-4 arrow-focus test and `prepareNavArrowFocusRestore` reads
   as intended, not as a lost fix. The replacement (`assertNavToggleKeepsFocus`) drives real
   `focus()` + `Enter` in both directions on the Focus host and the pop-out and checks
   `document.activeElement` against a captured node handle — the same shape as the test it
   replaces, minus the counterpart-arrow dance that no longer has a subject.
3. **[note]** `test-specs.md`'s Coverage table says REQ-16 is "not directly E2E-tested". That looks
   like a conflation with REQ-15's precedence: REQ-16 ("two readers mounted, a cue only in the
   instance whose fetch is in flight") is exactly what the E15 test asserts, including the
   bystander's hidden status line and absent `aria-busy`. The coverage is real; only the row is
   wrong.
4. **[note]** An unrelated backlog entry (`triage`'s `CheckVersion` regex rejecting dev-build
   version strings) was added to `TODO.md` on this branch. It is accurate and harmless, but it will
   ride this plan's squash merge.
5. **[note]** `kb pack --plan markdown-render-fixes --role review` reports 8995 words against an
   8000-word budget (`kb: WARN pack exceeds budget`). Worth a `/retro` look, not a change here.
