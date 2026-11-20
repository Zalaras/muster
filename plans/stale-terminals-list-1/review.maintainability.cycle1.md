# Maintainability review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 15998 words (budget 30000)
**Scope**: 13 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/server.go | shells.go, shellactivity.go (the two features whose wiring line changed) | n/a (one registration line) | funlen ×1 (`New`, 56 > 40), pre-existing; no reason in Decisions, and the Decisions size line misplaces it | Minor 1 |
| internal/server/shellactivity.go | themepoll.go (`Current`), usagepoll.go, shells.go | yes (rev beside `terms`, `snapshot()`, pending-broadcast order) | none | pass |
| internal/server/shells.go | rename.go, note.go, actions.go (reply shapes), shellactivity.go | yes (`revFor` as a function field beside `changed`) | none | pass |
| internal/server/state.go | shellactivity.go (`contribute`) | covered by the snapshot() line | none | pass |
| internal/server/terminalswire.go | usagewire.go | wire field only | none | pass |
| web/src/api/sessions.ts | api/http.ts, api/groups.ts, api/update.ts, protocol/decode.ts | covered by the four-replies line | none | pass |
| web/src/app.ts | wsapp.ts, ws.ts | event signature only | none | pass |
| web/src/features/surfaces.ts | terminal/terminals.ts, terminal/shellactivity.ts, terminal/surfaceswitch.ts | yes (owner of `revState`, its four writers; reply raised before the newer-selection guard) | none (436 lines) | pass |
| web/src/protocol/messages.ts | protocol/terminals.ts, protocol/decode.ts | yes (`terminalsRev` optional like `terminals`) | none | pass |
| web/src/protocol/terminals.ts | protocol/decode.ts, protocol/session.ts | covered | none | pass |
| web/src/terminal/terminalsrev.ts | terminal/terminals.ts, terminal/shellactivity.ts | yes (pure immutable module, Map-in-state like its neighbours; rg for an existing rev found none) | none | pass |
| web/src/ws.ts | wsapp.ts | handler signature only | none | pass |
| web/src/wsapp.ts | ws.ts, app.ts | handler signature only | none | pass |

Duplicate searches (question 1):

```
$ rg -n "revFor|Rev\b|rev\+\+|epoch|Seq\s+int64" internal/server --glob '!*_test.go'
  -> only this diff's own lines (shells.go, shellactivity.go, state.go, terminalswire.go, server.go);
     the "epoch" hits are renderfix fixture prose. No existing revision counter in internal/server.
$ rg -n ">= 0|< 0" web/src/protocol web/src/api
web/src/protocol/terminals.ts:20:  return rev !== null && rev >= 0 ? rev : null;
web/src/protocol/session.ts:427:    backgroundTasks < 0
  -> no existing non-negative-integer helper in protocol/decode.ts; parseRev is the first.
$ rg -n "func \(p \*\w+Poller\) Current|func.*\bsnapshot\(\)" internal/server --glob '!*_test.go'
internal/server/themepoll.go:138:func (p *themePoller) Current() claudecode.ThemeFamily {
internal/server/shellactivity.go:105:func (p *shellActivityPoller) Current() map[string][]terminalWire {
internal/server/shellactivity.go:110:func (p *shellActivityPoller) snapshot() (map[string][]terminalWire, int64) {
```

Shared state (question 3): `shellActivityPoller.rev`/`revs` are written only in `reconcile`, under
`mu` (write lock) and inside `tickMu` (held by `tick`, which `sync` also takes); readers
(`snapshot`, `revFor`) take `mu.RLock`. The guard is named at the declaration
(shellactivity.go:66-69). The hub closure's `revFor` read (shellactivity.go:41) runs after `mu` is
released but still inside `tickMu`, so no other writer can move `revs[id]` between assignment and
broadcast. I found no interleaving that reaches unguarded state. Web side: `revState` is closure
state in `initSurfaces`, single-threaded, its writers named in the web `design:` line.

## Issues

### Critical

### Major

### Minor
1. **[daemon-impl]** `plans/stale-terminals-list-1/daemon-implementation.md` § Decisions gives no reason for the `funlen` warning on a touched file, and its size line is wrong about where the warning is. The gates' size log (`02-size.log`) says `WARN  internal/server/server.go:137:6: Function 'New' has too many statements (56 > 40) (funlen)`. That is the production composition root this branch touches at server.go:225. The Decisions line says "no new size warnings on touched production files (the one warning is in an existing test file)". Rule: conventions § Design "Size is read, not obeyed": going over a limit is fine "with a reason in Decisions". The fix: the size line names `server.go:New` and gives a reason that holds. For example, this diff changes one argument on an existing registration line and adds no statements to `New`, which on main is already a list of one-line registrations. Do not split `New` to silence the warning (kb:adr/process-size-linters-warn-never-fail).
   id: plans/stale-terminals-list-1/daemon-implementation.md:Decisions:funlen New unexplained | confidence: 90

### Notes
1. **[note]** shellactivity.go:41 — the hub closure passed into `newShellActivityPoller` calls `f.poller.revFor(sessionID)`, so the poller drops the rev it just assigned in `reconcile` (line 194) and fetches it again through its own callback. This is correct only because every `p.broadcast` call sits inside `reconcile` under `tickMu`. The "Seam kept" Decision gives the reason: impl agents may not edit the test helpers that construct the poller with the two-argument `broadcast`. That reason holds within the pipeline's boundaries. A later cleanup that passes the rev as a `broadcast` argument would remove the coupling.
2. **[note]** shellactivity.go:105 — `Current()` now has no production caller, only `shellactivity_test.go` and `terminalsrevpoller_test.go`; `contribute` uses `snapshot()`. Decisions gives the reason (tests call it). Compare `themePoller.Current` (themepoll.go:138), which production uses.
3. **[note]** web/src/protocol/terminals.ts:18 `parseRev` checks for a non-negative integer, and protocol/session.ts:423-427 already does the same check inline for `backgroundTasks`. protocol/decode.ts says it "owns how a JSON primitive … [is] recognised", so a shared `asNonNegativeInteger` there would serve both. There was no existing helper to reuse, so this is not a duplicate. Because of where `parseRev` lives, api/sessions.ts:11 imports from `protocol/terminals`. Importing a concept parser is already done in api/groups.ts and api/sessions.ts (`parseGroup`, `parseSession`).
4. **[note]** web/src/api/sessions.ts:207-210 — `restartSessions` was reformatted (its `{ ids }` argument expanded onto three lines) with no change in behaviour, outside this plan's concern. Biome keeps the expanded form once it exists, so `make web-lint` will not undo it.
5. **[note]** For review-work: shells.go:240 changes `DELETE /api/sessions/{id}/shells/{n}` from 204 with no body to 200 with a JSON body. Its sibling deletes and puts still answer 204 (rename.go:89, note.go:68, actions.go:109, groups.go:141). That is a protocol-contract question for review-work, not a shape question.
6. **[note]** Component diagram: the web diagram already counts `terminal/` as 10 modules and describes "the terminals-list revision a window has seen" (commit eefb0dcc). The diff adds no new daemon package or import edge.
