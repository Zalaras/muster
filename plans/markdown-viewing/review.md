# Review: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: approved
**Pack**: `<!-- kb:pack plan=markdown-viewing role=review features=reader,surfaces,lifecycle,ingest -->`

Cycle 6, **full review** (not a delta), at the developer's explicit ask, with focus behaviour and layout
given the extra attention. Every section was re-run and re-read; all findings are reported at every
severity.

**Both cycle-5 findings are fixed, and I verified each by measuring, not by reading the diff.**

*Critical 1 (`[web-impl]`, 4e2c291).* The pop-out's status line is now driven by its own socket. I
did not take the fix on the diff's word: I instrumented `/doc.html` with a per-animation-frame
recorder installed before its first script and read the notice's `hidden`/`textContent` from the
first paint onwards. Healthy → hidden and empty; file deleted + routed Write → `file no longer
exists — <path>`; `daemon.kill()` → the unreachable text, truthfully and for the first time.

*The `connection.ts` extraction is byte-for-byte unchanged in effect on the dashboard, and I
measured that rather than arguing it.* The equivalence claim in the comment holds algebraically —
`set` is reachable only from `connected()` (always `"connected"`) and `disconnected()` (`"reconnecting"`
iff `everConnected`, else `"connecting"`), so `everConnected && status !== "connected"` and
`status === "reconnecting"` agree on all three reachable statuses — but algebra is not a measurement,
so I ran the same five-state dashboard probe (healthy → kill → restart → kill → restart) and a
first-paint status/banner timeline against **both** builds: HEAD, and HEAD with `connection.ts` and
`doc.ts` restored to their pre-4e2c291 content (`git show 4e2c291^:<path>`, rebuilt, then restored
via `git show HEAD:<path>` — `git diff`/`git status` confirm byte-identical, and I rebuilt again).
Every readout is identical across the two builds, including the `everConnected` branch the
simplification touches (`kb:adr/connection-banner-only-after-first-hello`): first load reads
`connecting…` with the banner **hidden**, never `reconnecting…`. Numbers in Manual Verification.

*Major 1 (`[e2e-specs]`, 4473396) is a real test, and its load-bearing argument holds.* E30 reads
the pop-out's own `.reader-notice` in three states. The lead's reasoning about step 3 is sound and I
checked it independently: step 3 would pass vacuously against the broken build, but it is never
reached there — step 1 fails first — and within the passing build step 2 has already put the notice
on `file no longer exists`, so step 3 asserts a genuine *transition* into the unreachable text, not
its permanent presence. `toBeHidden()` followed by `toHaveText("")` also rules out the vacuous
"element absent" pass.

*The `main.ts` contract enumeration is complete and correct, with one framing gap worth recording.*
I checked it against the source rather than against the log: `WsClientHandlers` declares 13
callbacks; `main.ts` wires 12; `doc.ts` wires 6 and dispositions the other 6. Each stated reason
verifies — `initReader`'s `sessionRemoved` subscription really is gated `if (!standalone)`
(`features/reader.ts:471`) and `doc.ts` always passes a standalone target, so that wire would be
dead; `features/reader.ts` really does call `app.on` for only `"docChanged"`, `"snapshot"` and
`"sessionRemoved"` (lines 458/463/472), and `initReader` is the only feature on the page. The 13th
callback, `onConnected`, is wired by **neither** root, so its absence cannot make the two pages
diverge — but the enumeration is framed against `main.ts`'s set rather than against the handler
interface, so it does not mention it (Note 3). The one further divergence I found is `onSnapshot`:
`main.ts` also emits `"prefs"` from `snapshot.prefs`, `doc.ts` does not — with no `"prefs"` listener
on that page it has no effect today (Note 4).

**There is no remaining false statement in the UI.** I asked cycle 5's question again — does anything
user-visible still lack a measurement pinning it? — and this time the honest answer is: nothing that
is wrong. Two things are user-visible and now measured that were not before, and I am recording both
as Notes with their numbers rather than as work: an ~11–14 ms one-to-two-frame flash of the
unreachable notice over the *placeholder* body on pop-out load (Note 1), and an open pop-out not
following a live theme change until reload (Note 2). Neither asserts anything false to a user who
can read it, and each carries more risk in the fixing than in the leaving — see the Notes for the
reasoning, which is mine to be overruled on.

**Every gate is green**: 341/341 E2E (full suite, `make e2e`, clean rebuild, exit 0, 1.7 min), `make
test`, `make lint` (0 issues), `go build ./...`, `make web-build`, `make web-test` (1562/1562),
`make contrast`, `make check-kb` (344 records, 0 problems), `make e2e-lint` ("clean"), `dead-refs`
(945 checked, 0 missing), and all **14** authored acceptance checks via `gates.sh --checks-only`
(14 lines, 0 failed). No skips, no `test.fixme`, no `.only`. The daemon is untouched since cycle 1
(`git diff 5353cad..HEAD -- internal/ cmd/` is empty).

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `docs` segment, built once | Yes | E1, W4 | pass |
| REQ-2 selecting `docs` mounts the reader only there | Yes | E1, E2 | pass |
| REQ-3 works on a dead session, plan slot absent | Yes | E22 | pass |
| REQ-4 bar: badge, basename, absolute path, cue, pop out, arrow | Yes | E3, E18, arrow-focus | pass — bar order and arrow keyboard behaviour re-measured on all three hosts |
| REQ-5 GFM body on `--well` with `--disp`/`--sans`/`--mono` | Yes | E15 | pass |
| REQ-6 whole file; >10 MiB is 413 | Yes | D12, E26 | pass — the mask that hid this on `/doc.html` is gone (E30 proves the notice is live there) |
| REQ-7 last open file remembered per session | Yes | E3, E19, W7 | pass |
| REQ-8 `pop out ↗` to `/doc.html` carrying bar, body, nav | Yes | E21, E30, pop-out layout, arrow focus | **pass** — the status line is now functional on that host, measured in all three states |
| REQ-9 plan slot pinned, `no plan yet` | Yes | E3, E4 | pass |
| REQ-10 file tree, folders collapsed with counts | Yes | E6, W5, nav-placement | pass |
| REQ-11 filter narrows + expands ancestors | Yes | E7, W6 | pass |
| REQ-12 `aria-current` on the open file | Yes | E8, focus sweep | pass |
| REQ-13 changed dot until opened | Yes | E9, W7 | pass |
| REQ-14 outline, scroll-spy, independent folds | Yes | E17, E18, pop-out | pass |
| REQ-15 compact in a tile; nav collapsed at 3×2 | Yes | E27, live-compact | pass — re-measured at both densities (numbers below) |
| REQ-16 transcript kept + bounded scan triggers | Yes | D5, D6, D9, E5 | pass |
| REQ-17 `session.plan` additive | Yes | W10, D14 | pass |
| REQ-18 `docChanged` on routed Write/Edit/MultiEdit | Yes | D13, D16, E9, E10 | pass |
| REQ-19 re-fetch on mount / window focus | Yes | E12, E13 | pass |
| REQ-20 two GETs, confinement, no writes | Yes | D10, D11, D17, E20 | pass |
| REQ-21 Claude-format knowledge stays in `internal/claudecode` | Yes | D4 | pass — plus my own widened sweep |
| REQ-22 marked 18.0.13 + DOMPurify 3.4.15, fragment only | Yes | W12, W13, E16 | pass |
| REQ-23 ADR records the renderer choice + alternatives | Yes | — | pass |
| REQ-24 no cue element until a write is seen | Yes | E11 | pass |
| REQ-25 walk cap 20,000 + `truncated` | Yes | D8 | pass |
| REQ-26 straggler never moves transcript/plan | Yes | D20, E29 | pass |
| REQ-27 pop-out shares component, socket, memory | Yes | E21, E30, pop-out layout, arrow focus | **pass** — the shared component now behaves the same on both hosts; verified callback-by-callback, not just on the two the review named |
| REQ-28 deleted file keeps last render | Yes | E25, E30 | **pass** — measured on both hosts |

## Build & Tests

E2E tests: **pass** — 341/341, `make e2e` from a clean rebuild, exit 0, 1.7 min; run a second time
inside `gates.sh` (check E1), also green. No skipped tests.
Daemon tests: **pass** (`make test`)
Web tests: **pass** (`make web-test` — 35 files, 1562 tests)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build`)
Lint: **pass** (`make lint` — "0 issues"; `make web-lint`; `make e2e-lint` — "e2e-lint: clean")
Knowledge: **pass** (`make check-kb` — 344 records, 23 features, 0 problems; `dead-refs` — 945
references checked, 0 missing)

No soak was required: no Repairs row, `TODO.md` entry or plan line names a flaky spec for this plan,
and E30 is a brand-new deterministic test, not a flake repair. I ran it alone on the restored build
after the differential rebuild: green.

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
| E1 | `make e2e` | pass (341/341) |
| DOC | doc upkeep | pass — `docs/features/reader/spec.md`'s globs, `kb:fact/plan-file-path-in-transcript`'s `guard`/`files`/`tests`, `SPEC.md` § 3.1 and the three protocol anchors are in place. The `TODO.md` tick+move (§ Pre-v1 Cleanup, still `- [ ]` at `TODO.md:80`) and the eight `proposed`→`accepted` ADR flips remain Completion-step work by design. |
| KB | `make check-kb` | pass |

**Decisions / ADRs.** No `deviation:` line exists in any `## Decisions` log. `kb ls --feature reader
--status proposed` returns **eight** records — the plan's seven plus
`kb:adr/reader-nav-sections-shrink-without-floor` (the settled user decision) — and each body
describes what shipped. Cycle 6 reviewed nothing that needs an ADR of its own: the
`createConnectionState` extraction is a refactor inside an existing accepted decision
(`kb:adr/connection-banner-only-after-first-hello`, whose behaviour I measured unchanged), not a new
one.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7–D16, D18–D20 | named Go tests assert what the prose says | pass | daemon untouched since cycle 1 (`git diff 5353cad..HEAD -- internal/ cmd/` empty); re-read `internal/server/reader.go` end to end in cycle 5 against the Protocol Contract |
| W4–W10 | Vitest cases assert what the prose says | pass | `make web-test` green; unchanged since cycle 1 |
| W14 | no `any` in new web code | pass | grepped `web/src/doc.ts`, `features/connection.ts`, `features/reader.ts`, `render/reader.ts`, `reader/`, `api.ts`, `protocol.ts` for `: any`, `as any`, `<any>` — zero hits (the one grep hit is the English word "any" in a comment) |
| W15 | sanitized markdown enters the DOM only as a DOMPurify fragment | pass | `reader/markdown.ts` is the only producer (`RETURN_DOM_FRAGMENT`), inserted via `replaceChildren`; zero `innerHTML`/`outerHTML`/`insertAdjacentHTML` under `web/src/` outside comments |
| W16 | `ReaderInstance` built/disposed only in `features/reader.ts` | pass | the single `new ReaderInstance` is in `features/reader.ts`; `main.ts` and `doc.ts` reach it only through `initReader` |
| W17 | `sessionRemoved` disposes the reader; daemon drops the write log | pass | `features/reader.ts:471-475` (dashboard only, by design); `sessions.go` → `readerFeature.forgetSession` → `writes.forget(id)` |
| W18 | new CSS is tokens only | pass | no CSS changed this cycle; `make contrast` green |
| W19 | `doc.html` carries the same theme-hint script as `index.html` | pass | the two inline scripts are byte-identical |
| E2–E30 | Playwright tests assert what the prose says | pass | 341/341; I read E30 in full and re-derived its non-vacuity argument independently |
| REQ-23 | the ADR records the alternatives | pass | `kb:adr/reader-markdown-rendered-in-browser` names markdown-it, micromark/remark, showdown, sanitize-html, goldmark+bluemonday and the Sanitizer API exit |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D4's grep plus a widened sweep (`hook_event_name`, `rate_limits`, `"permission_mode"`, `transcript_path`, `tool_input`, `planFilePath`, `plansDirectory`) over `cmd/ internal/ web/src` excluding `internal/claudecode/**`, `*_test.go`, `*.test.ts`: clean |
| 2 | No terminal-output state parsing | pass — `capture-pane` only in `internal/tmux` and the pre-existing snapshot path; the reader derives no session state |
| 3 | Non-blocking hook handler, 1–2 s timeouts | pass — `Observe` runs on the ingest worker after `Apply`; `docChanged` goes through the non-blocking `wsHub.broadcast` |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — zero `resize-pane` call sites in `internal/`, `cmd/`, `web/` (only the prohibition text in `internal/tmux/CLAUDE.md`) |
| 5 | No payload logging | pass — nothing added this cycle logs; `reader.go` logs only `session_id` and (git fallback) `directory` |
| 6 | No empty-gauge dishonesty | **pass** — this is what cycle 5's Critical was, and it is gone: `/doc.html` no longer asserts a connection state it was never told. Absence rules still hold (no cue before a write, no `0 .md` before the listing). Note 1 records the one measured transient. |
| 7 | Session identity on the tmux target | pass — `plan`/`transcript` are display-only columns never read by `machine.go` |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json` or `CLAUDE_CONFIG_DIR` reference |
| 9 | No real `claude` outside canary/probes | pass — every Claude input in `reader.spec.ts` is a synthesized hook POST |

## Design System Compliance

- **Tokens** — no CSS changed this cycle. The reader's CSS remains literal-free; every colour
  resolves to a semantic token (`--well`, `--bg-raised`, `--fg`, `--fg-dim`, `--fg-muted`, `--line`,
  `--line-control`, `--bg-hover`); no retired name survives; `make contrast` passes with no new
  exempt entries. `--well` grounds the reader; `--term` untouched.
- **No web fonts** — no `@import`, `@font-face` or CDN link in `style.css`, `index.html` or `doc.html`.
- **State colour is meaning** — the reader introduces no state colour; the changed dot is
  `--fg-muted` and its DOM presence is the indicator. No amber primary action.
- **Tabular numerics** — `.docbar .chg`, the only reader value that changes over time, sets
  `font-variant-numeric: tabular-nums`.
- **`[hidden]` companions** — unchanged from cycle 5's sweep of all nine `.hidden =` sites in
  `render/reader.ts`; each has a matching `[hidden] { display: none }` rule. E30 depends on exactly
  this for `.reader-notice` and passes.
- **Honesty rules (§6)** — **clean.** No empty track, no bare percentage, no `permission_mode`
  claim, no `StopFailure.error` enum switch, no "Done" state, no cost display; staleness is labelled
  by the cue's age; daemon-down is surfaced prominently on both hosts (the banner on the dashboard,
  the status line on both). The violation cycle 5 found is fixed and measured fixed.
- **Terminal rules (§7)** — INV-1 holds: no `TerminalSurface` ever exists for kind `docs`, so
  selecting `docs` cannot open a second live client; no `resize-pane`; the reader applies no styling
  to pane contents.

## Manual Verification

Drove the real dashboard, real tiles and the real pop-out in Chromium against scratch `musterd`
instances (four throwaway probe tests built on the committed E2E helpers, run and then deleted;
`git status` is back to exactly its pre-review state and `web/test-results` was removed). Every
number below is read off the live DOM or the live build.

**The `connection.ts` extraction — differential, HEAD vs the pre-4e2c291 build.** Same probe, two
builds; the pre-fix build was produced by `git show 4e2c291^:<path>` for both files, rebuilt, then
restored with `git show HEAD:<path>` (`git diff`/`git status` clean) and rebuilt again.

```
dashboard state        HEAD                                              pre-4e2c291
healthy                connected  / banner hidden / notice hidden ""     identical
daemon killed          reconnecting… / banner VISIBLE / notice
                       "musterd unreachable — showing last render"       identical
restarted              connected  / banner hidden / notice hidden ""     identical
killed again           reconnecting… / banner VISIBLE / same notice      identical
restarted again        connected  / banner hidden / notice hidden ""     identical

first-paint timeline   t=19ms ""            banner hidden               t=19ms ""            hidden
(fresh load, the       t=74ms "connecting…" banner hidden  ← everConnected rule
 everConnected branch  t=87ms "connected"   banner hidden               t=79ms "connected"   hidden
 the simplification
 touches)
```

The banner never appears before the first `hello`, on either build
(`kb:adr/connection-banner-only-after-first-hello` intact), and `reconnecting…` never appears on a
fresh load. The dashboard's connection behaviour is unchanged in effect, not merely in E24.

**The pop-out's status line — per-animation-frame from first paint.** Recorder installed on the
browser context so it runs before `/doc.html`'s own first script; two independent runs.

```
t=94ms   notice present, hidden=false, "musterd unreachable — showing last render", body = placeholder
t=105ms  notice present, hidden=true,  ""                                            body = placeholder
t=139ms  notice present, hidden=true,  ""                                            body = "TODO…"
(second run: 116ms → 130ms → 172ms)
```

So the notice settles hidden and empty before the document body ever appears — and the ~11–14 ms
window before that is Note 1.

**Focus behaviour — every host, both directions.**

```
what I drove                                            result
tile host (2×2): "Hide files" focus+Enter               → "Show files" focused     ✓
tile host (2×2): "Show files" focus+Enter               → "Hide files" focused     ✓
pop-out: "Hide files" focus+Enter                       → "Show files" focused     ✓
pop-out: "Show files" focus+Enter                       → "Hide files" focused     ✓
```

(Focus host and pop-out are also pinned by the cycle-4 spec; the tile host is the one the suite
still does not cover — cycle 5 Note 3, re-measured green here.)

**Layout — every host, measured after settling.**

```
host             reader box          docbar        nav                 article            overflow-x  .path
FOCUS            300,90 980×630      980×32        1044,122 236×598    300,122 744×598    0           1
TILE 2×2         2,119 637×255       637×32        449,151 190×223     2,151  447×223     0           0
TILE 3×2         2,119 423×255       423×32        235,151 190×223     2,151  233×223     0           0
POP-OUT 1280     0,0 1280×720        1280×26       1044,26 236×694     0,26  1044×694     0           1
POP-OUT 420 wide 0,0 420×700         420×26        184,26  236×674     0,26   184×674     0           1
```

Article + nav exactly fills the reader at every host and density; nav's right edge meets the
reader's; no horizontal overflow on the reader or the document at any size. The 3×2 nav is open here
because the reader was mounted at 2×2 — `navCollapsedDefault` is a mount-time decision (cycle 4
Note 2, accepted); E27 pins the mounted-at-3×2 case. The 420 px pop-out is Note 5.

**Displayed values read by hand, one realistic case.**

```
bar fname       "TODO.md"          bar path  "/var/folders/…/muster-e2e-repo-*/TODO.md" (absolute)
plan badge      absent             cue       absent before any write hook
body            "# TODO" → <h1 id="todo">, "- [ ] one" → <input disabled type="checkbox">
pop-out notice  healthy: hidden ""  /  file deleted + routed Write: "file no longer exists — <path>"
                /  daemon killed: "musterd unreachable — showing last render"
```

Not verified: real Claude Code behaviour (fixtures only, by design — CLAUDE.md hard rule), and the
plans-directory override (plan edge case 18, already recorded as unobservable on this machine).

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `/doc.html` still paints `musterd unreachable — showing last render` for one to two
   frames on every load, before its socket's first `hello`. Measured twice, on two fresh builds:
   **94 ms → 105 ms** and **116 ms → 130 ms** after navigation start, i.e. an 11–14 ms window, and in
   both runs the body underneath was still the `nothing open — pick a file` placeholder — the
   document itself first painted at 139 ms / 172 ms, well after the notice had gone. Cause:
   `RenderFrame.connected` is `state.connection === "connected"` (`app.ts:99`), so the
   `"connecting"` default and the known-down `"reconnecting"` collapse to the same input, and
   `ReaderInstance.render` maps both to the unreachable text (`features/reader.ts:350`). The
   `everConnected` rule the fix preserved governs the masthead string and the banner, not this.
   **I am not asking for a change**, and I want to be explicit that this means my own cycle-5 fix
   instruction ("before the first `hello` the page must not claim unreachable") is met in letter
   — `everConnected` survives, and that is what makes the *dashboard* honest — but not in the
   outcome I named for the pop-out. I am not requesting the fix because it would mean teaching
   `ReaderInstance.render` a third connection input, which is live dashboard code shared by four
   hosts, and each of the last five cycles has found a new defect in exactly that kind of change;
   the harm being bought off is a sub-perceptual flash over a placeholder. That trade is mine to
   have got wrong — if the developer would rather have it fixed, the change is small and belongs in a
   follow-up, not in a seventh cycle of this plan.
2. **[note]** An open pop-out does not follow a live theme change; it keeps the theme it was loaded
   with until reloaded. Measured: dashboard and pop-out both `data-theme="instrument"`, body
   `rgb(18,20,28)`; `PUT /api/prefs {theme:"light"}` → 204 → dashboard becomes `light`,
   `rgb(243,242,238)`, pop-out stays `instrument`, `rgb(18,20,28)`; after `popup.reload()` the
   pop-out reads `light`. Cause: `initTheme` runs only in `main.ts`, so `/doc.html`'s theme comes
   entirely from its first-paint hint script, which reads `localStorage` once. Nothing in the plan
   requires otherwise (W19 asks only for the hint script), nothing false is stated, and a reload
   fixes it — so **no change requested**. Recorded because it is genuinely user-visible (two windows
   side by side in opposite themes) and because `doc.ts`'s otherwise excellent disposition table
   gives `onClaudeTheme` the reason "needs no runtime event", which is true of the init script but
   reads as if theme were fully handled. The conclusion in that row is still right: wiring
   `onClaudeTheme` alone would fix nothing without `initTheme`, and the change I drove came through
   `prefs`, not `claudeTheme`.
3. **[note]** The disposition table enumerates against the 12 callbacks `main.ts` wires, not against
   `WsClientHandlers`' 13. The 13th, `onConnected` (socket open, before `hello`), is wired by
   neither root, so it cannot make the pages diverge — but "every callback" reads stronger than what
   was checked. No change requested; recorded so the next reader of that table knows its exact scope.
4. **[note]** `main.ts`'s `onSnapshot` also emits `"prefs"` from `snapshot.prefs`; `doc.ts`'s does
   not. No `"prefs"` listener exists on `/doc.html` (`initReader` is the only feature there, and it
   subscribes to `"docChanged"`, `"snapshot"`, `"sessionRemoved"` only), so this has no effect today.
   It is the same class of divergence as cycle 5's Critical — a handler body that differs between
   the two roots — and it is the one the disposition table does not cover, because it lives inside a
   callback both roots wire rather than in a callback one omits. Harmless now; worth knowing if a
   prefs-driven feature ever reaches that page.
5. **[note]** At a 420 px-wide pop-out the nav keeps its fixed 236 px and the article gets 184 px.
   No overflow, and the nav arrow collapses it, but the split is unhelpful at that width. There is
   no responsive requirement in the plan and this is a macOS desktop tool, so no change requested.
6. **[note]** Cycle 5's Note 3 gap is now narrower but not closed: the tile host's arrow-focus
   restore and the 3×2 tile's layout bounding are still unpinned by spec. I measured both green
   again this cycle (numbers above) and the code path is identical across hosts.
7. **[note]** Cycle 4's Notes 1–5 and cycle 5's Notes 1–3 were re-checked and all still read as
   accepted trade-offs. No change requested. `kb:adr/reader-nav-sections-shrink-without-floor`
   (Option A) was not re-opened.
