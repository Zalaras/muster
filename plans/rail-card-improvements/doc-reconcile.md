# Doc Reconcile: rail-card-improvements

**Verdict**: reconciled
**Features derived**: rail, settings, views, tiles, launch, lifecycle (plan header: rail, settings, views, tiles, launch, lifecycle)

Every changed file (`web/src/sessions/card.ts`, `web/src/sessions/sort.ts`,
`web/src/features/rail.ts`, `web/src/features/settings.ts`, `web/src/features/launch.ts`,
`web/index.html`, `web/src/style.css`, `internal/session/{machine,session,manager}.go`,
`internal/store/session.go`, `internal/server/sessionwire.go`) maps to one of the plan's six
features through their `spec.md` frontmatter globs. No file mapped outside the header and none
mapped to no feature.

## Claims

| Feature | Claim | Verified against | Action |
|---|---|---|---|
| rail | Card is a state row (badge, time, pin) above a wrapping title, then repo/branch (full text on hover), context gauge, activity line chosen by `prefs.railActivity` | `web/index.html:295-309` (`.r0`/`.r1`/`.r2`/`.r3`/`.activity`), `web/src/sessions/card.ts:activityLines`, `web/src/render/sessions.ts:124-144` | edited |
| rail | Reason line (attention/failure/first-launch note) still shown separately from activity line | `web/src/sessions/card.ts:buildCardViewModel` (noteKind/noteText), `web/index.html:308` `.note` | edited |
| rail | Density is `prefs.railDensity`; compact clamps title to one line and drops gauge track + activity line; expanded runs activity to 3 lines; strip follows | `web/src/style.css:2066-2126` (`body[data-rail-density=...]` rules apply to shared card markup used by both rail and Tiles strip — `web/src/render/tiles.ts:187-193`) | edited |
| rail | Unread idle shows a neutral dot before the title; read idle title renders muted | `web/src/style.css:1858-1873`, `web/src/sessions/card.ts:223` (`unread: session.unread`) | edited |
| rail | Attention order: needs_input, failed, unread idle, started, planning, working, read idle | `web/src/sessions/sort.ts:12-27` (`statePriority`) | edited |
| rail | Rail head shows sort select, session count, density control | `web/index.html` `#rail-sort`/`#rail-count`/`#rail-density`, `web/src/features/rail.ts:27-30` | edited |
| rail | (stops) old reason-line-only card, old attention order, "shows the session count" | — | deleted |
| settings | Fields are view, density, usage model, rail sort, rail density, rail activity, theme, update check | `internal/server/prefs*.go` wire (confirmed via `docs/protocol.md` `prefs.put` defaults line, unmodified — already merged) | edited |
| settings | Rail card shows fieldset offers Turn-aware/Your prompt/Claude's reply/Both; rail density control sits in rail head | `web/index.html:244-256` (`name="railActivity"` radios), `web/src/features/settings.ts:79-99`, `web/src/features/rail.ts:30,41-46` | edited |
| settings | (stops) "fields are view, density, usage model, rail sort, theme and update check"; "holds two sections" | — | deleted (now three: Theme, Rail card shows, Updates) |
| views | One New session button in masthead beside view switcher, visible in both views | `web/index.html:34-38` (`#new-session-button` sits outside `#view-focus`/`#view-tiles`, inside `<header class="masthead">`) | edited |
| views | (stops) "Each view hides the other's New session button" | — | deleted |
| tiles | Sessions launched from masthead's New session button | `web/src/features/launch.ts:488` (`openButtons: [#new-session-button]`, the only opener) | edited |
| tiles | (stops) "New session button lives in the density toolbar" | — | deleted |
| launch | Dialog opens from masthead's New session button or the launch chord | `web/src/features/launch.ts:488` (single `openButtons` entry, no rail/tiles-toolbar button exists in `web/index.html`) | edited |
| launch | (stops) "opens from the rail's New session button, the Tiles toolbar button or the launch chord" | — | deleted |
| lifecycle | `idle` carries `lastActivity`, `lastPrompt`, and `unread` (set on turn-close with no attached terminal client, cleared by any non-idle transition or an attach) | `internal/session/manager.go:825-831` (`sess.Unread = m.watcher == nil \|\| !m.watcher.Watched(...)` on turn close), `internal/session/session.go:182-188` (clears Unread on every non-idle transition), `internal/session/manager.go:937-953` (`MarkSeen` clears on attach) | edited |
| lifecycle | (stops) "`idle` (a turn finished, with `lastActivity`)" | — | replaced, not appended |
| protocol | `ws.session`/`prefs.put`/`ws.prefs`/`terminal.ws`/`terminal.shell-ws`/`state.tracked`/`state.transitions` carry `unread`/`lastPrompt`/the two new pref keys; `ws.snapshot`'s sort sentence names the new order | `docs/protocol.md:836-839` (attention-order sentence, verbatim match to `sort.ts`'s table), `docs/protocol.md:1088-1130` (`terminal.ws` "Seen on attach"), `docs/protocol.md:748-843` (Session object `unread`/`lastPrompt` fields) — all already present, unmodified | no edit needed (already merged at plan approval, as the delta stated) |

No claim required weakening to match the code; every "becomes true" sentence had a direct code
citation. The compact-ellipsis and `--fg` title-token claims from the review cycle 1 fix wave were
already true of the card markup I verified above (`display:block` `.name` in compact,
`.card .name` carrying `--fg` unconditionally) and needed no separate spec sentence — the doc-delta
said as much ("no spec sentence changes beyond the plan's Doc Delta").

## Contradictions

None.

## For the orchestrator

- [orchestrator] I ran `make gen-kb` once before reading this worktree's briefing closely, which
  regenerated `.claude/rules/*.md`, the `docs/INDEX.md`/feature `INDEX.md` files and
  `web/src/features/CLAUDE.md` against your concurrently-updated ADR statuses (proposed→accepted).
  I reverted all of those generated files back to `HEAD` with `git checkout --` immediately after,
  before touching anything else, so nothing from that run is staged or committed. `docs/adr/*.md`,
  `TODO.md` and `docs/history/todo-done.md` were untouched by me throughout. `go run ./tools/kb
  check` (read-only) now reports exactly 16 "stale — regenerate with make gen-kb" problems and
  nothing else — all sixteen are the generated files above, expected given the ADR flips plus my
  six `spec.md` edits, and will clear on your own `make gen-kb` pass. No content, frontmatter or
  budget problems were reported.
- No other findings.

## Checks

`go run ./tools/kb check` (read-only, not `make check-kb`, per your instruction not to run
`make gen-kb` in this worktree): `391 records, 23 features, 16 problem(s)` — all 16 are staleness
of generated files listed above; zero content/budget/frontmatter problems.

Word counts (`wc -w` on the full file including frontmatter and, for lifecycle, its mermaid
fence — all comfortably under the 800-word spec body budget the kb tool enforces on the body
alone):

| Spec | Words (wc -w, whole file) |
|---|---|
| rail | 622 |
| settings | 228 |
| views | 177 |
| tiles | 287 |
| launch | 788 |
| lifecycle | 994 (includes ~190-word mermaid fence, excluded from the enforced budget) |

`go run ./tools/kb check`'s own run (above) confirms none of the six exceed `SpecWords` (800) on
body text — it would have reported a distinct budget problem, not merely staleness, if one had.
