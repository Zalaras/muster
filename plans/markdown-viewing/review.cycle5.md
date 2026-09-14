# Review: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: needs-changes
**Pack**: `<!-- kb:pack plan=markdown-viewing role=review features=reader,surfaces,lifecycle,ingest -->`

Cycle 5, **full review** (not a delta), at Damian's explicit ask, with focus behaviour and layout
given the extra attention he asked for. Every section below was re-run and re-read; all findings
are reported at every severity.

**Both cycle-4 findings are genuinely fixed, and I verified each by measuring rather than by
reading the diff.** `prepareNavArrowFocusRestore` is sound: I drove both arrows with real
`focus()` + `Enter` on the **tile** host (the one host the new spec does not cover) and focus
landed on the counterpart arrow in both directions. Its scoping is airtight by node identity — I
put focus on tile A's tree button, toggled tile B's nav, and let three render ticks pass: focus
never moved. Reading `document.activeElement` before the flip is safe on every path that reaches
`renderReader`, because `navCollapsed` is written in exactly one place (`toggleNav`, called only
from the two arrows' own click handler — `features/reader.ts:231`) and the guard requires the
active element to be *this instance's own* arrow, so an unrelated render pass, a sibling reader
instance, or focus sitting anywhere else all fall through to the no-op thunk. The two malformed
`kb:` citations are gone and `doc.html:7` now matches `index.html`'s own copy.

**The settled decision was not re-opened.** `kb:adr/reader-nav-sections-shrink-without-floor` is
present and `proposed`; I measured the dense-tile nav only to confirm it matches Option A, and it
does. Cycle 4's Notes 1–5 remain accepted notes and are not re-raised.

**Every gate is green**: 340/340 E2E (full suite, `make e2e`, clean rebuild, exit 0, 1.7 min),
`make test`, `make lint` (0 issues), `go build ./...`, `make web-build`, `make web-test`
(1562/1562), `make contrast` (0 failures in all three themes), `make check-kb` (344 records, 0
problems), `make e2e-lint` ("clean"), `dead-refs` (943 checked, 0 missing), and all **14** authored
acceptance checks via `gates.sh --checks-only` (14 lines, 0 failed). No skips, no `test.fixme`, no
`.only`. The Repairs table's eight rows all still verify their requirement — nothing deleted,
skipped or weakened, and each addition was proved load-bearing by deliberate breakage.

**One new blocking finding, and it is the answer to "does anything user-visible still lack a
measurement pinning it?"** — yes, one thing did, and it was wrong. On `/doc.html` the reader's
status line **permanently asserts `musterd unreachable — showing last render` while the daemon is
healthy and actively serving that very page.** `web/src/doc.ts` never wires any handler that sets
`app.state.connection`, so it stays at `createApp()`'s `"connecting"` default and
`RenderFrame.connected` (`app.ts:99`) is false forever. I proved the claim false in the strongest
available way: I let the pop-out's own WebSocket deliver a `docChanged` that re-rendered its body,
and read the status line in the same breath — it still said unreachable. The same false notice
masks every real one, so the pop-out can never show `file no longer exists`, `too_large`,
`directory_missing` or `unknown session`, and can never tell the user the daemon has *actually*
gone down. Four cycles missed it because no spec has ever read the pop-out's `.reader-notice`.

The daemon is untouched since cycle 1 (`git diff 5353cad..HEAD -- internal/ cmd/` is empty). I
re-read `internal/server/reader.go` in full anyway and re-ran every daemon gate green.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `docs` segment, built once | Yes | E1, W4 | pass |
| REQ-2 selecting `docs` mounts the reader only there | Yes | E1, E2 | pass |
| REQ-3 works on a dead session, plan slot absent | Yes | E22 | pass |
| REQ-4 bar: badge, basename, absolute path, cue, pop out, arrow | Yes | E3, E18, cycle-4 arrow-focus | pass — bar order and the arrow's keyboard behaviour both re-measured, on all three hosts |
| REQ-5 GFM body on `--well` with `--disp`/`--sans`/`--mono` | Yes | E15 | pass — read the live DOM: `<h1 id="todo">`, `<input disabled type="checkbox">` |
| REQ-6 whole file; >10 MiB is 413 | Yes | D12, E26 | pass on the dashboard; **the message is masked on `/doc.html`** (Critical 1) |
| REQ-7 last open file remembered per session | Yes | E3, E19, W7 | pass |
| REQ-8 `pop out ↗` to `/doc.html` carrying bar, body, nav | Partly | E21, cycle-3 layout, cycle-4 arrow focus | **fail** — the bar, body and nav are carried; the status line is not functional there (Critical 1) |
| REQ-9 plan slot pinned, `no plan yet` | Yes | E3, E4 | pass |
| REQ-10 file tree, folders collapsed with counts | Yes | E6, W5, nav-placement | pass — live count read as `2 .md` on the fixture |
| REQ-11 filter narrows + expands ancestors | Yes | E7, W6 | pass |
| REQ-12 `aria-current` on the open file | Yes | E8, cycle-3 sweep | pass |
| REQ-13 changed dot until opened | Yes | E9, W7 | pass |
| REQ-14 outline, scroll-spy, independent folds | Yes | E17, E18, cycle-3 pop-out | pass |
| REQ-15 compact in a tile; nav collapsed at 3×2 | Yes | E27, live-compact | pass — re-measured at both densities (numbers below) |
| REQ-16 transcript kept + bounded scan triggers | Yes | D5, D6, D9, E5 | pass |
| REQ-17 `session.plan` additive | Yes | W10, D14 | pass |
| REQ-18 `docChanged` on routed Write/Edit/MultiEdit | Yes | D13, D16, E9, E10 | pass |
| REQ-19 re-fetch on mount / window focus | Yes | E12, E13 | pass |
| REQ-20 two GETs, confinement, no writes | Yes | D10, D11, D17, E20 | pass |
| REQ-21 Claude-format knowledge stays in `internal/claudecode` | Yes | D4 | pass — plus my own widened sweep |
| REQ-22 marked 18.0.13 + DOMPurify 3.4.15, fragment only | Yes | W12, W13, E16 | pass |
| REQ-23 ADR records the renderer choice + alternatives | Yes | — | pass |
| REQ-24 no cue element until a write is seen | Yes | E11 | pass — measured absent before the write, `changed now` after |
| REQ-25 walk cap 20,000 + `truncated` | Yes | D8 | pass |
| REQ-26 straggler never moves transcript/plan | Yes | D20, E29 | pass |
| REQ-27 pop-out shares component, socket, memory | Partly | E21 + two pop-out tests | **fail** — the component and socket are shared, but the shared component behaves differently there: its status line is stuck on a false value (Critical 1) |
| REQ-28 deleted file keeps last render | Yes | E25 | pass on the dashboard (measured: `file no longer exists — <path>`); **never reaches the user on `/doc.html`** (Critical 1) |

## Build & Tests

E2E tests: **pass** — 340/340, `make e2e` from a clean rebuild, exit 0, 1.7 min; run a second time
inside `gates.sh` (check E1), also green. No skipped tests.
Daemon tests: **pass** (`make test`)
Web tests: **pass** (`make web-test` — 35 files, 1562 tests)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build`)
Lint: **pass** (`make lint` — "0 issues"; `make web-lint`; `make e2e-lint` — "e2e-lint: clean")
Knowledge: **pass** (`make check-kb` — 344 records, 23 features, 0 problems; `dead-refs` — 943
references checked, 0 missing)

No soak was required: no Repairs row, `TODO.md` entry or plan line names a flaky spec for this
plan, and cycle 4's addition was a brand-new deterministic test, not a flake repair.

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
| W11 | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| W12 | `marked` pinned to 18.0.13 | pass |
| W13 | `dompurify` pinned to 3.4.15 | pass |
| E1 | `make e2e` | pass (340/340) |
| DOC | doc upkeep | pass — `docs/features/reader/spec.md`'s go/web/e2e globs, `kb:fact/plan-file-path-in-transcript`'s `guard`/`files`/`tests`, `SPEC.md` § 3.1's sentence and the three protocol anchors are all in place. The `TODO.md` tick+move (§ Pre-v1 Cleanup, still `- [ ]` at `TODO.md:80`) and the eight `proposed`→`accepted` ADR flips remain Completion-step work by design. |
| KB | `make check-kb` | pass |

**Decisions / ADRs.** No `deviation:` line exists in any `## Decisions` log. `kb ls --feature
reader --status proposed` returns **eight** records — the plan's seven plus
`kb:adr/reader-nav-sections-shrink-without-floor` (the settled user decision, `tags: [ux,
user-decision]`, `refs: [plan:markdown-viewing, …]`), and each body describes what shipped. Cycle
5 reviewed nothing that needs an ADR of its own.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7–D16, D18–D20 | named Go tests assert what the prose says | pass | daemon untouched since cycle 1 (`git diff 5353cad..HEAD -- internal/ cmd/` empty); I re-read `internal/server/reader.go` end to end this cycle and the confinement, cap, ordering and envelope behaviour match the Protocol Contract clause for clause |
| W4–W10 | Vitest cases assert what the prose says | pass | `make web-test` green; unchanged since cycle 1 |
| W14 | no `any` in new web code | pass | grepped `web/src/reader/`, `render/reader.ts`, `features/reader.ts`, `doc.ts`, `api.ts`, `protocol.ts` for `: any`, `as any`, `<any>` — zero hits |
| W15 | sanitized markdown enters the DOM only as a DOMPurify fragment | pass | `reader/markdown.ts:28` is the only producer (`RETURN_DOM_FRAGMENT`), inserted via `article.replaceChildren`; zero `innerHTML`/`outerHTML`/`insertAdjacentHTML` under `web/src/` outside comments |
| W16 | `ReaderInstance` built/disposed only in `features/reader.ts` | pass | the single `new ReaderInstance` is `features/reader.ts:406`; `main.ts` and `doc.ts` reach it only through `initReader`; `render/reader.ts` performs no fetch and opens no socket |
| W17 | `sessionRemoved` disposes the reader; daemon drops the write log | pass | `features/reader.ts:472` disposes and deletes; `sessions.go` calls `readerFeature.forgetSession` → `writes.forget(id)` after a successful `Remove` |
| W18 | new CSS is tokens only; `--disp`/`--sans`/`--mono` roles | pass | no hex, `rgb()`, `hsl()` or named colour anywhere in the reader's CSS ranges; no survivor of the retired token names; `make contrast` green |
| W19 | `doc.html` carries the same theme-hint script as `index.html` | pass | `diff` of the two inline scripts is empty — byte-identical |
| E2–E29 | Playwright tests assert what the prose says | pass | 340/340; I read the cycle-4 test in full and it asserts node identity against a handle captured before the toggle, not merely `toBeFocused()` |
| REQ-23 | the ADR records the alternatives | pass | `kb:adr/reader-markdown-rendered-in-browser` names markdown-it, micromark/remark, showdown, sanitize-html, goldmark+bluemonday and the Sanitizer API exit |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D4's grep plus my widened sweep (`hook_event_name`, `rate_limits`, `"permission_mode"`, `transcript_path`, `tool_input`, `planFilePath`, `plansDirectory`, `last_assistant_message`) over `cmd/ internal/ web/src` excluding `internal/claudecode/**`, `*_test.go`, `*.test.ts`: clean |
| 2 | No terminal-output state parsing | pass — `capture-pane` appears only in `internal/tmux` and the pre-existing snapshot path; the reader derives no session state |
| 3 | Non-blocking hook handler, 1–2 s timeouts | pass — `Observe` runs on the ingest worker after `Apply`; `docChanged` goes through the non-blocking `wsHub.broadcast` |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — zero `resize-pane` call sites in `internal/`, `cmd/`, `web/` (the only hit is the prohibition in `internal/tmux/CLAUDE.md`) |
| 5 | No payload logging | pass — `reader.go` logs only `session_id` and (on the git fallback) `directory`; the written path is never logged alongside payload text |
| 6 | No empty-gauge dishonesty | pass on the *absence* rules (REQ-24's cue absent, never "unknown"; the file count absent before the listing, never `0 .md`) — but see Critical 1 for the inverse failure: a state the page asserts and does not know |
| 7 | Session identity on the tmux target | pass — `plan`/`transcript` are display-only columns never read by `machine.go` |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json` or `CLAUDE_CONFIG_DIR` reference; the only `settings.local.json` writes are the sanctioned project-scoped path in `internal/server/sessions.go` |
| 9 | No real `claude` outside canary/probes | pass — every Claude input in `reader.spec.ts` is a synthesized hook POST |

## Design System Compliance

- **Tokens** — no colour literal, font stack or spacing literal in the reader's CSS; every colour
  resolves to a semantic token (`--well`, `--bg-raised`, `--fg`, `--fg-dim`, `--fg-muted`,
  `--line`, `--line-control`, `--bg-hover`). No retired name survives. `make contrast` passes with
  no new exempt entries. `--well` grounds the reader; `--term` untouched.
- **No web fonts** — no `@import`, `@font-face` or CDN link in `style.css`, `index.html` or
  `doc.html`.
- **State colour is meaning** — the reader introduces no state colour; the changed dot is
  `--fg-muted` and its DOM presence is the indicator, `aria-hidden` so the accessible name stays
  the basename. No amber primary action.
- **Tabular numerics** — `.docbar .chg`, the only reader value that changes over time, sets
  `font-variant-numeric: tabular-nums`.
- **`[hidden]` companions** — swept all nine `.hidden =` sites in `render/reader.ts` against
  `style.css`: `.docbar .ib`, `.arr` (covering both arrows), `.reader-notice`, `.rnav`, `.rnav
  .plan-label`, `.rnav .plan-slot`, `.rnav .filter`, `.rnav .tree`, `.rnav .outline` each have a
  matching `[hidden] { display: none }` rule. None missing.
- **Honesty rules (§6)** — **one violation, Critical 1**: `/doc.html` renders a daemon-down status
  that is false and never changes, which is the same defect the rule exists to prevent read from
  the other side — the page asserts a connection state it has never been told anything about, and
  the assertion is load-bearing enough to suppress four real messages. Everything else holds: no
  empty track, no bare percentage, no `permission_mode` claim, no "Done" state, no cost display,
  staleness labelled by the cue's age.
- **Terminal rules (§7)** — INV-1 holds: no `TerminalSurface` ever exists for kind `docs`, so
  selecting `docs` cannot open a second live client; no `resize-pane`; the reader applies no
  styling to pane contents.

## Manual Verification

Drove the real dashboard, real tiles and the real pop-out in Chromium against scratch `musterd`
instances (four throwaway probe specs built on the committed E2E helpers, run and then deleted —
`git status` is back to exactly its pre-review state and `web/test-results` was removed). Every
number below is read off the live DOM.

**Focus behaviour — the hosts and paths the suite does not cover.**

```
what I drove                                                         result
tile host (2×2): "Hide files" focus+Enter                            → "Show files" focused        ✓
tile host (2×2): "Show files" focus+Enter                            → "Hide files" focused        ✓
two docs tiles: focus A's tree button, click B's "Hide files"        → focus lands on B's own
                                                                       "Show files" (the correct
                                                                       restore for the arrow the
                                                                       user actually pressed)      ✓
two docs tiles: focus A's tree button, 3 render ticks with
  A's nav open and B's nav collapsed                                 → focus still on A's
                                                                       BUTTON.f.d0 "TODO.md"       ✓ no steal
```

The no-steal result is the code-level guarantee made visible: `prepareNavArrowFocusRestore`
compares `document.activeElement` against `refs.openArrow`/`refs.collapsedArrow` by node identity,
so a sibling instance's arrows, a tree button, the filter box and `BODY` all fall through to the
empty thunk.

**Layout — both tile densities, measured after settling (my first pass measured mid-transition and
briefly looked like a 212px horizontal overflow; it is not — the tile box was stale).**

```
host        tile box            slot/reader        article.md         nav                scrollWidth-clientWidth
FOCUS       #main-terminal-slot 300,90 980×630     300,122 744×598    1044,122 236×598   —
TILE 2×2    1,87 639×316        2,119 637×255      2,132 447×242      449,132 190×242    0
TILE 3×2    1,87 425×316        2,119 423×255      2,132 233×242      235,132 190×242    0
```

Nav right edge == slot right edge in both densities; nav bottom == slot bottom; no horizontal
overflow. The 3×2 tree resolves to a 31px (one-row) section — exactly what Option A
(`kb:adr/reader-nav-sections-shrink-without-floor`) describes, both sections still
`overflow-y: auto`. Expected, not a finding.

**Displayed values read by hand, one realistic case.**

```
bar fname       "TODO.md"
bar path        "/var/folders/…/muster-e2e-repo-EI3DAb/TODO.md"   (absolute, unabbreviated)
plan badge      absent (TODO.md is not the plan)
freshness cue   absent before any write hook;  "changed now" immediately after a routed Write
file count      "2 .md"   (TODO.md + docs/adr/x.md; notes.txt and .hidden/secret.md correctly excluded)
body            <h1 id="todo">TODO</h1><ul><li><input disabled type="checkbox"> one</li></ul>
3×2 compact     nav present, .path count 0, .n count 0
```

**The pop-out — where Critical 1 lives.**

```
dashboard, daemon healthy, file open       .reader-notice hidden=true,  text ""
/doc.html,  daemon healthy, file open      .reader-notice hidden=false, text "musterd unreachable — showing last render"
/doc.html,  after its OWN socket delivered a docChanged that re-rendered the body to
            "LIVE-SOCKET-MARKER"                  .reader-notice still "musterd unreachable — showing last render"
delete the open file + routed Write hook:
            dashboard                             "file no longer exists — /var/folders/…/TODO.md"
            /doc.html                             "musterd unreachable — showing last render"  (real message never shown)
```

Not verified: real Claude Code behaviour (fixtures only, by design — CLAUDE.md hard rule), and the
plans-directory override (plan edge case 18, already recorded as unobservable on this machine).

## Issues

### Critical

1. **[web-impl]** `/doc.html` permanently asserts the daemon is unreachable, and that false
   message suppresses every real one — `web/src/doc.ts:50-64` (the `WsClient` construction),
   consumed at `web/src/features/reader.ts:350`. `main.ts:102/103/132` wire `onConnecting`,
   `onHello` and `onDisconnected` into `features/connection.ts`, which is the only writer of
   `app.state.connection` (`connection.ts:42`). `doc.ts` wires none of them, so the pop-out's
   `app.state.connection` never leaves `createApp()`'s `"connecting"` default and
   `RenderFrame.connected` (`app.ts:99`) is `false` on every frame the page will ever render.
   `ReaderInstance.render` then computes `const notice = !connected ? UNREACHABLE_TEXT :
   this.noticeText` unconditionally.

   Measured: with the daemon healthy and the pop-out's own WebSocket delivering a `docChanged` that
   re-rendered its body, `.reader-notice` read `musterd unreachable — showing last render` with
   `hidden=false`. Deleting the open file and posting a routed Write then showed `file no longer
   exists — <path>` on the dashboard and *still* the unreachable text on the pop-out. The same
   masking hits `too_large` (REQ-6), `directory_missing` and `unknown session`; and because the
   text never changes, a pop-out can never tell the user the daemon has genuinely gone down.

   This is a design-system §6 honesty violation — the page states a connection fact it has never
   been told anything about — and it breaks REQ-8/REQ-27 ("a second page carrying the **full**
   reader", "shares the reader component, the WebSocket client and the memory"), REQ-28 and the
   States table's Daemon-down, Directory-gone, File-gone and Too-large rows on that host.

   **Fix**: give `doc.ts` a writer for `app.state.connection` driven by the same three `WsClient`
   callbacks `main.ts` uses. `initConnection` itself cannot be reused as-is — it `requireElement`s
   `#connection-status`, `#banner`, `#claude-version`, `#app` and `#protocol-mismatch`, none of
   which exist on `doc.html` — so either extract the status-setting core from the masthead/banner
   rendering, or set `app.state.connection` directly in `doc.ts`'s callbacks. Either way keep
   `connection.ts`'s `everConnected` rule (`connection.ts:35-38, 60`): before the first `hello` the
   page must not claim unreachable, or the pop-out will flash the same false message on every load.

### Major

1. **[e2e-specs]** No spec has ever read the pop-out's status line, which is why Critical 1 survived
   four review cycles — `web/e2e/reader.spec.ts`. E24 covers daemon-down on the dashboard only;
   E25 (`file no longer exists`) and E26 (`too_large`) are dashboard-only; the three pop-out tests
   (E21, the cycle-3 layout test, the cycle-4 arrow-focus test) assert body, bar, nav, geometry and
   focus but never `readerStatusLine`. The helper already exists (`helpers/reader.ts`'s
   `readerStatusLine`), so this is missing coverage, not a missing locator.

   **Fix** (after Critical 1 lands): on `/doc.html`, with the daemon up, assert `.reader-notice`
   has `hidden` true / no text; then delete the open file, post a routed Write for it, and assert
   the pop-out shows `file no longer exists — <path>` exactly as E25 asserts it on the dashboard.
   Prove it load-bearing the way the Repairs table requires — reverting Critical 1's fix must turn
   it red on the notice assertion.

### Minor

None.

### Notes

1. **[note]** I agree with the lead's routing of the disabled-segment-button case to a `TODO.md`
   follow-up rather than this plan. The `claude`/`shell` pair's `disabled = !connected` gate
   predates this plan (`ac2b62c`), `docsBtn` only follows it, and every other action button in the
   app (mainhead End/Resume/Remove, dead-surface Resume, tile actions) behaves identically — fixing
   the reader's instance alone would leave the app inconsistent. Worth fixing app-wide one day; not
   here.
2. **[note]** `doc.ts` also leaves `onSessionRemoved` and `onProtocolMismatch` unwired. Neither is
   specified for the pop-out and neither produces a false statement today (a removed session leaves
   a stale-but-truthful last render; the browser owns the tab per REQ-8), so I am **not** asking for
   a change. Flagging them because they share Critical 1's root cause — `doc.ts` wires only the
   callbacks it thought it needed — so whoever fixes that should at least look at them deliberately.
3. **[note]** The nav arrow's focus restore is covered by spec on the Focus host and `/doc.html`
   but not in a tile; the 3×2 tile's layout bounding is likewise unpinned (2×2 is pinned). I
   measured both green this cycle and the code path is identical across hosts, so a third
   repetition would cost a wave for no defect risk. Recorded so the gap is known rather than
   assumed covered.
4. **[note]** Cycle 4's Notes 1–5 (filtered-away focused row, mount-time `navCollapsedDefault`,
   plan slot removed on session death, positional `applyTreeAttrs` indexing, un-`tabular-nums`
   counts) were re-checked and all still read as accepted trade-offs. No change requested.
