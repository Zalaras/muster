# Review: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: needs-changes
**Pack**: `<!-- kb:pack plan=markdown-viewing role=review features=reader,surfaces,lifecycle,ingest -->`

Cycle 4, **full re-review** (not a delta): every section below was re-run and re-read, at every
severity, per the developer's explicit ask after granting a fresh review budget.

**Both cycle-3 findings are genuinely fixed, and I verified each by measuring, not by reading the
diff or trusting the logs.** `/doc.html` now bounds itself to the viewport on a normal, a short and
a narrow window, with `article.md` as the only scroller and the `.docbar` pinned at `y = 0`; and
keyboard focus survives activation of the plan slot, a tree file, a folder toggle and an outline
entry — on the Focus host, in a tile, and on the pop-out — with node identity confirmed against a
handle captured before the action. The in-place attribute patching introduced by 754c507 leaves
**no** stale state: I drove a six-step sequence of non-structural updates and every `aria-current`
and changed dot matched the model at every step (measurements below). The `height: 100vh` fix is
correctly scoped — `.reader-host` is a class that exists only on `doc.html`, so it cannot leak into
the dashboard's own hosts, and I confirmed the dashboard hosts size correctly from their own chain.

Every gate is green: **339/339** E2E (full suite, clean rebuild, exit 0), `make test`, `make lint`,
`go build ./...`, `make web-build`, `make web-test`, `make web-lint`, `make contrast`,
`make check-kb` (344 records, 0 problems), `make refs` (2550 references, 0 missing), `make e2e-lint`
("e2e-lint: clean"), and all **14** authored acceptance checks via `gates.sh --checks-only`
(14 lines, 0 failed). No skips, no `test.fixme`, no `.only` anywhere under `web/e2e` or `web/src`.
The Repairs table's four rows all still verify their requirement — nothing deleted, skipped or
weakened, and each addition was proved load-bearing by deliberate breakage.

**The settled decision was not re-opened.** `kb:adr/reader-nav-sections-shrink-without-floor`
(proposed, `tags: [ux, user-decision]`, `refs: [plan:markdown-viewing]`) and
`plans/markdown-viewing/decisions/nav-sections-no-height-floor/decision.md` are both present and
correct. I measured the 2×2 tile nav again only to confirm it matches what Option A describes; it
does, and that is recorded as expected behaviour, not a finding.

**One new blocking finding**, in the one reader control nobody has yet examined — and it is the
same defect *class* as cycle 3's Major 1, reached by a different mechanism:

1. **Major 1 `[web-impl]`** — the nav arrow pair (`Hide files` / `Show files`) destroys keyboard
   focus. Activating either by `Enter` leaves `document.activeElement` at `BODY`, on **both** the
   Focus host and `/doc.html`. Cycle 3's fix stopped focused buttons being *rebuilt*; this control
   is never rebuilt — it is **hidden**, which drops focus just as completely. web-impl's own sweep
   checked the arrow and cleared it as "a permanent ref never rebuilt", which is true and not the
   property that matters here.
2. **Major 2 `[e2e-specs]`** — the new focus-survival sweep covers "all three control kinds" (plan
   slot, tree, outline). The reader has a fourth interactive kind, and it is the only one whose
   activation removes the activated element — so the sweep, by construction, could not see Major 1.

The daemon is untouched since cycle 1: `git diff 5353cad..HEAD -- internal/ cmd/` is empty. I
re-read `internal/server/reader.go` in full anyway (this is a full review) and re-ran every daemon
gate green.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `docs` segment, built once | Yes | E1, W4 | pass — measured: the segment button keeps focus across a tick after `Enter` |
| REQ-2 selecting `docs` mounts the reader only there | Yes | E1, E2 | pass |
| REQ-3 works on a dead session, plan slot absent | Yes | E22 | pass — re-measured: plan block removed on `SessionEnd`, tree file still opens |
| REQ-4 bar: badge, basename, absolute path, cue, pop out, arrow | Yes | E3, E18, live-compact | pass on rendering and order; the arrow's **keyboard** behaviour is Major 1 |
| REQ-5 GFM body on `--well` with `--disp`/`--sans`/`--mono` | Yes | E15 | pass |
| REQ-6 whole file; >10 MiB is 413 | Yes | D12, E26 | pass |
| REQ-7 last open file remembered per session | Yes | E3, E19, W7 | pass |
| REQ-8 `pop out ↗` to `/doc.html` carrying bar, body, nav | Yes | E21 + new pop-out layout test | **pass** — cycle-3 Critical 1 fixed; I re-measured at 1280×720, 1280×380 and 420×720 |
| REQ-9 plan slot pinned, `no plan yet` | Yes | E3, E4 | pass |
| REQ-10 file tree, folders collapsed with counts | Yes | E6, W5, nav-placement | pass |
| REQ-11 filter narrows + expands ancestors | Yes | E7, W6 | pass — filter box keeps focus across the narrowing re-render |
| REQ-12 `aria-current` on the open file | Yes | E8 | **pass** — re-measured over six non-structural transitions, never stale |
| REQ-13 changed dot until opened | Yes | E9, W7 | **pass** — same six-step sequence; dots light and clear exactly per the model |
| REQ-14 outline, scroll-spy, independent folds | Yes | E17, E18 + new pop-out test | **pass** — cycle-3 Critical 1 fixed; scroll-spy and click-to-scroll live on `/doc.html` |
| REQ-15 compact in a tile; nav collapsed at 3×2 | Yes | E27 + live-compact | pass — 2×2 measured compact, nav open, `.path` and count absent |
| REQ-16 transcript kept + bounded scan triggers | Yes | D5, D6, D9, E5 | pass |
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
| REQ-27 pop-out shares component, socket, memory | Yes | E21 + new pop-out test | **pass** — the shared component now behaves identically on the pop-out |
| REQ-28 deleted file keeps last render | Yes | E25 | pass |

## Build & Tests

E2E tests: **pass** — 339/339, `make e2e` from a clean rebuild, exit 0, 1.7 min; run a second time
inside `gates.sh` (check E1), also green. No skipped tests.
Daemon tests: **pass** (`make test`)
Web tests: **pass** (`make web-test`, Vitest)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build`)
Lint: **pass** (`make lint` — "0 issues"; `make web-lint`; `make e2e-lint` — "e2e-lint: clean")
Knowledge: **pass** (`make check-kb` — 344 records, 23 features, 0 problems; `make refs` — 2550
references, 0 missing)

No soak was required: no Repairs row, `TODO.md` entry or plan line names a flaky spec for this plan
— the two repairs were a listener-ordering defect and a missing `exact: true`, both deterministic.

## Acceptance Checks

Run verbatim via `.claude/skills/orchestrate/scripts/gates.sh markdown-viewing --checks-only` —
**14 lines, 0 failed**.

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
| E1 | `make e2e` | pass (339/339) |
| DOC | doc upkeep | pass — feature globs, the fact's `guard`/`files`, `SPEC.md` § 3.1 and the protocol anchors are all in place and unchanged. The `TODO.md` tick+move (§ Pre-v1 Cleanup → "Markdown viewing", still `- [ ]` at `TODO.md:80`) and the eight `proposed`→`accepted` ADR flips remain Completion-step work by design. |
| KB | `make check-kb` | pass |

**Decisions / ADRs.** No `deviation:` line exists in any `## Decisions` log. `kb ls --feature reader
--status proposed` returns **eight** records — the plan's seven plus
`kb:adr/reader-nav-sections-shrink-without-floor`, added by c33c435 for the settled user decision,
with `status: proposed`, `refs: [plan:markdown-viewing, …]` and `tags: [ux, user-decision]`. Its
body accurately describes what shipped (no code change; `.rnav .tree`/`.rnav .outline` keep
`overflow-y: auto` with no `min-height`) — I confirmed that against `style.css`. Cycle 4's reviewed
changes (a host sizing rule; a signature split plus focus restore) are implementation details with
no REQ, wire or DOM-contract consequence, so neither needs an ADR.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7–D16, D18–D20 | named Go tests assert what the prose says | pass | daemon untouched since cycle 1 (`git diff 5353cad..HEAD -- internal/ cmd/` empty); cycle-1 verification stands, all daemon gates re-run green |
| W4–W10 | Vitest cases assert what the prose says | pass | `make web-test` green; unchanged since cycle 1 |
| W14 | no `any` in new web code | pass | grepped `web/src/reader/`, `render/reader.ts`, `features/reader.ts`, `doc.ts`, `api.ts`, `protocol.ts` for `: any`, `as any`, `<any>` — zero hits |
| W15 | sanitized markdown enters the DOM only as a DOMPurify fragment | pass | `reader/markdown.ts` is the only producer (`DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true })`), inserted via `article.replaceChildren`; zero `innerHTML`/`outerHTML`/`insertAdjacentHTML` anywhere under `web/src/` |
| W16 | `ReaderInstance` built/disposed only in `features/reader.ts` | pass | the single `new ReaderInstance` is in `features/reader.ts:406`; `main.ts` and `doc.ts` reach it only through `initReader`; `render/reader.ts` performs no fetch and opens no socket |
| W17 | `sessionRemoved` disposes the reader; daemon drops the write log | pass | `features/reader.ts`'s `app.on("sessionRemoved", …)` disposes and deletes; daemon side is the narrowed `writeLogForgetter` interface in `sessions.go` calling `readerFeature.forgetSession` → `writes.forget(id)` |
| W18 | new CSS is tokens only; `--disp`/`--sans`/`--mono` roles | pass | no hex, `rgb()`, `hsl()` or named colour in the whole reader CSS range; `.md h1–h6` → `--disp`, `.md` → `--sans`, `.md code`/`.docbar`/`.rnav` → `--mono`; `make contrast` green |
| W19 | `doc.html` carries the same theme-hint script as `index.html` | pass | both read `muster.theme-hint` and stamp `documentElement.dataset.theme` in an inline non-module script before the stylesheet |
| E2–E29 | Playwright tests assert what the prose says | pass | 339/339; I read the three new cycle-3 tests in full and they assert identity by element handle, not merely `toBeFocused()` |
| REQ-23 | the ADR records the alternatives | pass | `kb:adr/reader-markdown-rendered-in-browser` names markdown-it, micromark/remark, showdown, sanitize-html, goldmark+bluemonday and the Sanitizer API exit |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-format keys outside `internal/claudecode/` | pass — D4's grep plus my own widened sweep (`hook_event_name`, `rate_limits`, `"permission_mode"`, `transcript_path`, `tool_input`, `planFilePath`, `plansDirectory`) over `cmd/ internal/ web/src` excluding `internal/claudecode/**`, `*_test.go` and the built bundle: clean |
| 2 | No terminal-output state parsing | pass — `capture-pane` appears only in `internal/tmux` (display/oracle) and the pre-existing snapshot path; the reader derives no session state |
| 3 | Non-blocking hook handler, 1–2 s timeouts | pass — `Observe` runs on the ingest worker after `Apply`; `docChanged` goes through the non-blocking `wsHub.broadcast`; no ingest change since cycle 1 |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — zero `resize-pane` occurrences in `internal/`, `cmd/`, `web/` |
| 5 | No payload logging | pass — `reader.go` logs only `session_id` and (on the git fallback) `directory`; the written path is never logged with payload text |
| 6 | No empty-gauge dishonesty | pass — REQ-24's cue is **absent** when no write was seen (never "unknown", never `0`), the file count is absent before the listing (never `0 .md`), daemon-down shows "musterd unreachable — showing last render" |
| 7 | Session identity on the tmux target | pass — unchanged; `plan`/`transcript` are display-only columns never read by `machine.go` |
| 8 | No settings trespass | pass — no reference to `settings.json`, `settings.local.json` or `CLAUDE_CONFIG_DIR` in `internal/`, `cmd/` or `web/src` |
| 9 | No real `claude` outside canary/probes | pass — `reader.spec.ts`'s header states it, and every Claude input in the suite is a synthesized hook POST |

## Design System Compliance

- **Tokens** — no colour literal, font stack or spacing literal in the reader's CSS; every colour
  resolves to a semantic token (`--well`, `--bg-raised`, `--fg`, `--fg-dim`, `--fg-muted`, `--line`,
  `--line-control`, `--bg-hover`). No survivor of the retired names (`--ink`, `--panel`, `--paper`,
  `--muted`, `--dim`, `--line2`) anywhere in `style.css`. `make contrast` passes with no new exempt
  entries. `--well` grounds the reader as the plan specifies; `--term` is untouched.
- **No web fonts** — no `@import`, `@font-face` or CDN link in `style.css`, `index.html` or
  `doc.html`.
- **State colour is meaning** — the reader introduces no state colour at all; the changed dot is
  `--fg-muted` and its *presence in the DOM* is the indicator, with `aria-hidden` so the accessible
  name stays the basename. No amber primary action.
- **Tabular numerics** — `.docbar .chg` (the only value in the reader that changes over time) sets
  `font-variant-numeric: tabular-nums`.
- **`[hidden]` companions** — swept every `.hidden =` site in the reader against `style.css`: `.ib`,
  `.arr` (both arrows), `.reader-notice`, `.rnav`, `.rnav .plan-label`, `.rnav .plan-slot`,
  `.rnav .filter`, `.rnav .tree`, `.rnav .outline` each have a matching `[hidden] { display: none }`
  rule. None missing.
- **Honesty rules (§6)** — no empty track, no bare percentage, no `permission_mode` claim, no "Done"
  state, no cost display; daemon-down is the existing banner plus the reader's own status line;
  staleness is labelled by the cue's age rather than hidden.
- **Terminal rules (§7)** — INV-1 holds: no `TerminalSurface` ever exists for kind `docs`, so
  selecting `docs` cannot open a second live client for a session; no `resize-pane`; the reader
  applies no styling to pane contents.

## Manual Verification

Drove the real dashboard, the real pop-out page and real tiles in Chromium against scratch
`musterd` instances (four throwaway probe specs using the committed E2E helpers, run and then
deleted — `git status` is back to exactly its pre-review state, and `web/test-results` was
removed). Every number below is read off the live DOM.

**Layout — measured on every host, including short and narrow viewports.** `article.md` is the
scroller everywhere; the document never scrolls; the `.docbar` never moves.

```
host / viewport            document sh/ch    reader h×w    article.md sh/ch   .docbar top
FOCUS      1280×720          720 / 720        630×980        2511 / 598          90
FOCUS      1280×380          380 / 380        290×980        2511 / 258          90
POPOUT     1280×720          720 / 720        720×1280       2511 / 672           0
POPOUT     1280×380 short    380 / 380        380×1280       2511 / 332           0
POPOUT      420×720 narrow   720 / 720        720×420        3208 / 672           0   (sw 420 = cw 420, no h-scroll)
POPOUT     nav collapsed     720 / 720        720×1280       2511 / 669           0
TILE 2×2   1280×720          720 / 720        255×637        1734 / 223         119   compact, nav open, .path absent, count absent
TILE 3×2   1280×720          720 / 720        255×423           —                —    (nav stays as the user left it — see Note 2)
```

`height: 100vh` is correctly confined: `.reader-host` is a class that appears **only** on
`web/doc.html:25`; no dashboard host carries it, so the rule cannot affect Focus or a tile. It
behaves on a 380px-tall window (the page is still exactly one viewport) and at 420px wide.

**Focus — every interactive control in the reader, on every host, with real key presses.**

```
control                       host      action            document.activeElement afterwards
docs segment button           Focus     Enter + 1s tick   BUTTON "docs"                       ✓
plan slot entry               Focus     Enter + tick      same node (handle identity)         ✓ (covered by the new spec)
tree file entry               Focus     Enter + tick      same node                           ✓
tree file entry               Tile 2×2  Enter + tick      same node (sameNode: true)          ✓
folder toggle                 Focus     Enter (rebuild)   NEW equivalent node, aria-expanded=true  ✓
outline entry                 Focus     Enter + tick      same node                           ✓
outline entry                 /doc.html Enter + tick      BUTTON.ol.h2                        ✓
Files fold toggle             Focus     Enter (both ways) BUTTON.hd.toggle "Files"            ✓
Outline fold toggle           Focus     Enter             BUTTON.hd.toggle "Outline"          ✓
filter box                    Focus     typing "x.md"     INPUT.filter                        ✓
pop out ↗ link                Focus     tick + docChanged same node (sameNode: true)          ✓
nav arrow "Hide files"        Focus     Enter             BODY                                ✗  Major 1
nav arrow "Show files"        Focus     Enter             BODY                                ✗  Major 1
nav arrow "Hide files"        /doc.html Enter             BODY                                ✗  Major 1
nav arrow "Show files"        /doc.html Enter             BODY                                ✗  Major 1
```

**No stale state from 754c507's in-place attribute patching.** Six-step sequence on one instance
(plan + `TODO.md` + `docs/adr/x.md`, folders pre-expanded), reading every `.f`/`.ol` row's
`aria-current` and `.dot` count after each step. `current=2` throughout is correct — one tree/plan
row plus one outline row:

```
step                              plan            x.md            TODO.md         outline
plan open at mount                current, 0 dots  —, 0            —, 0            "Plan B" current
after docChanged x.md             current, 0       —, 1 dot        —, 0            "Plan B" current
after opening x.md                —, 0             current, 0      —, 0            "ADR X"  current
after docChanged TODO.md + plan   —, 1 dot         current, 0      —, 1 dot        "ADR X"  current
after opening TODO.md             —, 1 dot         —, 0            current, 0      "TODO"   current
after reopening the plan          current, 0       —, 0            —, 0            "Plan B" current
```

Every cell matches the model; no `aria-current` was ever left behind on a row that had stopped
being open, and no dot survived opening its file or appeared on a file with no unseen write. The
bar tracked it exactly (`plan` badge present only while the plan is open; path and `changed now`
cue correct at each step).

**Also measured:** a dead session drops the plan block and still opens a tree file (REQ-3); the
2×2 tile nav matches the Option-A density that was just settled.

Not verified: real Claude Code behaviour (fixtures only, by design — CLAUDE.md hard rule), and the
plans-directory override (plan edge case 18, already recorded as unobservable on this machine).

## Issues

### Critical

None.

### Major

1. **[web-impl]** The nav arrow pair destroys keyboard focus — `web/src/render/reader.ts`
   (`renderReader`, the `refs.nav.hidden` / `refs.collapsedArrow.hidden` pair) and
   `web/src/features/reader.ts` (`toggleNav`). Activating `Hide files` with `Enter` hides the `.rnav`
   that contains the focused button, so `document.activeElement` becomes `BODY`; activating
   `Show files` hides the `.docbar` arrow the user just pressed, with the same result. Measured on
   both hosts (table above). REQ-4 describes this as **one** arrow that changes position (`›` on the
   nav's edge while open, `‹` at the bar's right end while collapsed), so a keyboard user reasonably
   expects to press it again to undo — instead they are dumped to the top of the document and must
   Tab all the way back. This is cycle-3 Major 1's consequence reached by hiding rather than by
   rebuilding, which is exactly why web-impl's sweep cleared the arrow ("a permanent ref never
   rebuilt" — true, and not the property that matters). **Fix**: after `toggleNav`, move focus to the
   counterpart arrow when the arrow itself was the element that initiated the toggle — i.e. in
   `renderReader`, if the element about to be hidden currently holds focus, focus its replacement
   once it is visible. Keep it scoped to the arrow pair; do not focus-steal when the toggle came
   from anywhere else.
2. **[e2e-specs]** No spec measures keyboard focus across the nav arrow — `web/e2e/reader.spec.ts`.
   The cycle-3 sweep covers the plan slot, a tree file and an outline entry, all of which survive
   because they are *reused*; the arrow is the reader's fourth interactive control kind and the only
   one whose activation removes the activated element, so the sweep could not see Major 1 by
   construction. E18 drives both arrows but with `.click()`, which never reveals where focus lands.
   **Fix**: extend the focus-survival test (or add a sibling) to focus `Hide files`, press `Enter`,
   and assert `Show files` holds focus — and the reverse — asserting against an element handle as
   the existing sweep does, on the Focus host and on `/doc.html`.

### Minor

1. **[web-impl]** Two malformed `kb:` citations in this plan's new code — `web/src/style.css:687`
   reads "`kb:for` `#app`'s own rule above" and `web/doc.html:7` reads "(`kb:anchor's` REQ-11)".
   Neither is a well-formed `kb:<type>/<slug>` token, so neither resolves to anything; `make refs`
   passes only because its scanner never matches them. `docs/conventions.md` § Knowledge records
   makes the token form the citation contract, and a citation-shaped string that points nowhere
   costs the next reader a search. **Suggestion**: in `style.css` say "see `#app`'s own rule above";
   in `doc.html` cite the real record or drop the parenthetical.

### Notes

1. **[note]** A tree row that is filtered away while it holds focus leaves focus at `BODY`
   (measured by dispatching an `input` on the filter while a row was focused). I am **not** asking
   for a change: the only user path to that state puts focus in the filter box, not on a row, so it
   is not reachable in normal use — and the listing is never re-fetched after mount, so a row cannot
   disappear underneath a focused user any other way. Worth remembering if the reader ever gains
   live re-listing.
2. **[note]** `navCollapsedDefault` is a mount-time decision, so switching density from 2×2 to 3×2
   while a reader is already mounted leaves the nav open rather than collapsing it. That matches
   REQ-15's wording ("at 3×2 density the nav **starts** collapsed") and the cycle-1 decision that
   `compact` is per-render while the collapse default is not, and yanking a nav the user opened
   would be worse. Recorded so it is not re-derived as a bug next time.
3. **[note]** Focusing the plan-slot entry and then letting the session die leaves focus at `BODY`
   (the whole plan block is removed by REQ-3, and there is no equivalent replacement to move focus
   to). Externally driven, not user-initiated; no change requested.
4. **[note]** `applyTreeAttrs`/`applyOutlineAttrs` index `container.children` positionally against
   the entries array. That is sound today — the positional assumption holds exactly because a
   mismatch would have changed the structural signature and forced a rebuild — and the comment says
   so. No change requested; flagging it as the invariant a future edit to `treeStructOf` could break
   silently.
5. **[note]** The reader's `.rnav .hd .n` file count and folder `.cnt` counts do not set
   `tabular-nums`. They are not values that change over time (the listing is fetched once per mount
   and never re-fetched), so the design-system rule does not bind them. No change requested.
