# Plan: Stale Dirs, Models and Branches

**Created**: 2026-10-01
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: card-location.spec.ts startDaemon (every test passes `repoPoll: "200ms"` so a checkout shows inside the expect timeout, and a per-test scratch git repo as the launch directory); rail-layout.spec.ts fileDaemon (existing file; its E11 `.r2` title assertion is rewritten in place — title-scoped like the rest of the file)
**Features**: lifecycle, ingest, usage, launch, connection, rail, focus, tiles, actions, card-location
**Description**: A card's branch follows checkouts, a ↳ line shows where Claude is when it works in another checkout, the model name is never blank or stale after a bind, and long folder and branch names wrap at the `/` and truncate with a hover.

## Overview

Three backlog entries (the "a card's branch, directory and model going stale" group in
`TODO.md`, none with an issue) share one surface, the card's `repo / branch · model` readout.

**Branch.** The branch and worktree flag are read once at launch
(`internal/server/launcher.go` `repoContext`) and listed as immutable in
`internal/session/writeorder.go`. A checkout made by Claude, the shell pane or anything
outside Muster leaves the card wrong for the session's lifetime. The daemon re-reads the
launch directory's branch on a repo poll (`-repo-poll`, default 5 s, the liveness poll's
cadence) for every alive session whose directory still exists.

**Directory.** The 2026-10-01 probe measured that Claude's working directory moves
mid-session (kb:fact/cwd-follows-claude-mid-session, kb:fact/enter-worktree-moves-project-dir),
and kb:adr/lifecycle-card-directory-follows-claude-cwd decided the card follows it. The
developer has since reversed that: **the card, the shell pane and the docs reader stay on
the launch directory**. Where Claude is becomes a secondary readout that appears **only
when Claude is working in a different checkout** (a worktree, or another repo added with
`/add-dir`), never for a `cd` inside the launch checkout. This is mockup option C
(`docs/design/mockups/claude-location/options.html`, chosen 2026-10-01): a dim
`↳ <folder> / <branch>` line on the rail card and in the Focus header, and a bare `↳` glyph
in the tile header. A superseding ADR replaces the accepted one.

**Model.** The status line already refreshes the model, `/model` included
(kb:fact/model-switch-hooks). The defect is `applyBind` (`internal/session/machine.go:148`):
a `SessionStart` naming a model replaces the id but carries the old display name over. That
leaves it empty on a resumed session with no recorded model (the card shows a blank) and
stale when the id changed. `docs/protocol.md` already says the display name "is the id until
the status line confirms it". The fix makes that true.

**Long names.** At the developer's request, the repo readout wraps at the `/`: the folder
(with its trailing slash) on one line, the branch on the next. Each line truncates at the
end with an ellipsis, and the full text is on hover. This applies on the rail card
(comfortable and expanded density) and in the Focus header, where each line also has a cap
so a long branch can't push the model off the row. Compact density and the tile header stay
on one line. The Focus header's session name gains a hover too. Reference render:
`docs/design/mockups/claude-location/c-long-names.html`.

## Requirements

### Must Have
- [ ] REQ-1: The launch directory's `repo.branch` and `repo.isWorktree` are re-read on every repo-poll tick for **alive** sessions only, and a change is broadcast as one `sessionUpsert`. A dead session keeps the last-known `repo` until it is resumed. A tick that finds no change broadcasts nothing.
- [ ] REQ-2: A repo-poll tick on a session whose `directory` no longer exists, or is not a directory, keeps the last-known `repo`.
- [ ] REQ-3: The daemon records the working directory Claude last reported. Sources: the `cwd` of every **main-agent** hook event (never `CwdChanged.new_cwd`, kb:fact/cwd-changed-hook), and a status-line post's `workspace.current_dir`, falling back to its top-level `cwd`. An absent or empty value changes nothing.
- [ ] REQ-4: A hook event that carries the subagent marker, and every `SubagentStart`/`SubagentStop`, never changes the recorded directory.
- [ ] REQ-5: `claudeLocation` is non-null iff the session is alive, Claude has reported a directory since the last launch or resume, and that directory is in a different checkout from `directory` (see Invariants INV-1 for the exact rule).
- [ ] REQ-6: A change to the recorded directory nudges the repo poll, so `claudeLocation` updates without waiting out the poll interval.
- [ ] REQ-7: Launch and resume clear the recorded directory, so a relaunched session starts with `claudeLocation: null`.
- [ ] REQ-8: The shell pane's start directory, the docs reader's root and listing, the file-drop locate root, resume's spawn directory and settings write, and past-session matching keep using `directory`. Nothing reads Claude's location except `claudeLocation`.
- [ ] REQ-9: A bound `SessionStart` whose `model` equals the current model id leaves `model` unchanged. One that names a different id, or arrives when `model` is null, sets `model` to `{id, displayName: id}`. `model.displayName` is never empty.
- [ ] REQ-10: Rail card, comfortable and expanded density: the repo block is two lines, `<repo> /` then `<branch>` (plus ` (worktree)` when `repo.isWorktree`). Each line truncates at the end on its own. A session with `repo: null` shows one line, the directory basename, with no slash.
- [ ] REQ-11: Rail card, compact density: the repo line stays one line, `<repo> / <branch>`, as today.
- [ ] REQ-12: Rail card: while `claudeLocation` is non-null, a `↳` block follows the repo block. It has the same two-line shape (one line in compact): `<location repo name> /` then `<location branch>`, or the location directory's basename alone when `claudeLocation.repo` is null.
- [ ] REQ-13: Focus header: the meta's repo readout is the same two-line block, with the folder line capped at 30ch and the branch line at 44ch, then the `↳` block while moved, then the model and the ended age. The model never truncates.
- [ ] REQ-14: Focus header: the location group (the repo block, plus the `↳` block when present) carries a hover `title` with the full text, in the exact lines given under UI Specifications.
- [ ] REQ-15: Tile header: `.wh` stays one line, `<repo> / <branch>`, and carries the same hover `title` as REQ-14. While moved, a `↳` glyph follows it, with visually hidden text `Claude is in <directory>`.
- [ ] REQ-16: The `↳` blocks and glyph use neutral tokens only (`--fg-muted` for the glyph, `--fg-dim` for the text), never a state colour (design-system §3).

### Should Have
- [ ] REQ-17: The Focus header's session name (the `button.rename`) carries its full text as a hover `title`.

### Nice to Have
- (none)

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval; `docs/features/<f>/contract.md` regenerates).

### WS daemon→UI: the Session object (`kb:anchor/ws.session`) gains `claudeLocation`; `repo` is refreshed

```jsonc
{
  // … every existing field unchanged …
  "directory": "/Users/bob/code/muster",     // unchanged meaning: the LAUNCH directory, fixed for the row's lifetime.
                                               //   The shell, docs reader, file drop, resume and past sessions all use it.
  "repo": { "name": "muster", "branch": "feat-e2e", "isWorktree": false },
                                               // name = basename(directory), unchanged. branch/isWorktree are now
                                               //   RE-READ from directory on every repo poll (-repo-poll, default 5 s) while alive, and
                                               //   whenever claudeLocation is recomputed; null when directory isn't a git
                                               //   checkout or HEAD is detached; a directory that no longer exists, and a dead session, keep the last-known value.
  "claudeLocation": null,                      // REQUIRED key. object | null — where Claude is working when that is a
                                               //   different checkout from `directory`:
  // "claudeLocation": {
  //   "directory": "/Users/bob/code/muster/.claude/worktrees/probewt",  // absolute, cleaned, symlinks resolved —
  //                                            //   the directory Claude last reported (main-agent hook cwd, or the
  //                                            //   status line's workspace.current_dir)
  //   "repo": { "name": "probewt", "branch": "worktree-probewt", "isWorktree": true }
  //                                            // name = basename of that checkout's top level; null when the
  //                                            //   directory isn't a git checkout or HEAD is detached
  // }
  "model": { "id": "claude-sonnet-5-5", "displayName": "claude-sonnet-5-5" }
                                               // semantics unchanged, now actually true: launch value until a bind or
                                               //   the status line reports one; a bind naming a different id sets
                                               //   displayName to the id; the status line confirms the display name.
                                               //   displayName is never "".
}
```

`claudeLocation` is null iff any of: `alive` is false; Claude has reported no directory
since the row's last launch or resume; the reported directory is in the same checkout as
`directory` (INV-1). It is display-only, never read by the state machine. Changes arrive as
ordinary whole-object `sessionUpsert`s, and only on a real change.

Ordering caveat: hooks are unordered (kb:fact/hook-delivery-best-effort), so a straggler
carrying an older `cwd` can briefly revert `claudeLocation`. The next main-agent event or
status post corrects it. This is accepted, not guarded.

### Daemon flag (not wire, stated for both tracks): `-repo-poll <duration>`

Default `5s`. `0` disables the timer, and then the repo poll runs only on a nudge (REQ-6).
*Amended 2026-10-01 (review cycle 1, code Major 2 `[orchestrator]`): with `0` the poll also runs
once at start, so a restarted daemon rederives `claudeLocation` from a persisted `claude_dir`
(shipped and tested — `TestRepoPoll` D8; kb:adr/lifecycle-branch-refreshed-by-repo-poll). Not a wire change.*
A negative value is a flag error, the `-update-check-interval` validation pattern.

## Schema Changes

Migration `internal/store/migrations/0012_claude_dir.sql`, forward-only:

```sql
-- Plan stale-dirs-models-branches (2026-10-01): the working directory Claude last reported,
-- display-only (kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere).
-- NULL = nothing reported since the last launch or resume.
ALTER TABLE session ADD COLUMN claude_dir TEXT;
```

The existing `branch` and `is_worktree` columns become written after creation, with no
schema change. `claudeLocation`'s derived repo fields are in memory only: after a daemon
restart they are null until the first repo-poll tick, which runs at start (≤ 5 s).

## Diagrams

`delta of kb:diagram/store-schema`: the `session` entity gains
`TEXT claude_dir "last reported cwd, null = none"`, and the summary's "0001-0011" becomes "0001-0012".

`delta of kb:diagram/domain-model`: the prose "branch and worktree flag are recorded on the
session at launch" becomes "branch and worktree flag are read from the launch directory and
refreshed while the session exists; where Claude is working is a separate, display-only
reading". The diagram fence gains no box.

## UI Specifications

Binding: `docs/design/design-system.md` §3 (state colours are reserved), §5 Rail card / Tile
/ Focus mainhead, §6 (unknown renders the word). Reference renders:
`docs/design/mockups/claude-location/c-long-names.html` (the chosen layout) and
`options.html` § C.

### Views
- **Rail card** (`web/src/render/sessions.ts`, template in `web/index.html`): `.r2` becomes
  a block of two children, `.rf` (folder line, text `<repo> /`) and `.rb` (branch line, text
  `<branch>` + ` (worktree)` when `isWorktree`). With `repo: null` it holds only `.rf`, whose
  text is the directory basename with no slash. In compact density both children render
  inline on one line, separated by a space (CSS only, same DOM). A new `.r2c` block follows
  `.r2`, hidden unless `claudeLocation` is non-null. It holds an `aria-hidden="true"`
  `.lead` with `↳`, then `.rf`/`.rb` filled from `claudeLocation` (`claudeLocation.repo.name`
  and `.branch`, or `.rf` alone with basename(`claudeLocation.directory`)).
- **Focus header** (`web/src/render/mainhead.ts`): `.meta` becomes structured. It holds a
  `.loc` group (`.repo` block of `.rf`/`.rb`, then while moved a `.sep` `·`, then a `.claude-at`
  block of `.lead` + `.rf`/`.rb`), then `.sep` `·`, `.model` (`displayName`, or `unknown`),
  then ` · ended <age>` when dead, as today. `.rf` is capped at `max-width: 30ch` and `.rb` at
  `44ch`, each `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. `.model` is
  `flex: none`. `button.rename` gains `title` = the session's display title.
- **Tile header** (`web/src/render/tiles.ts`): `.wh` keeps its one-line text
  `<repo> / <branch>[ (worktree)]` (today's `repoLine`) and gains the REQ-14 `title`. A new
  `.wh-claude` span after it, hidden unless moved, holds an `aria-hidden` `↳` and a
  visually hidden span `Claude is in <claudeLocation.directory>`.

### Hover text (REQ-14, REQ-15), lines joined with `\n`
1. `<repo> / <branch>[ (worktree)]`, or the basename when `repo` is null
2. `<directory>`
3. only while moved: `Claude is in <claudeLocation.directory>`
4. only while moved and `claudeLocation.repo` non-null: `on <claudeLocation.repo.branch>`

Rail card hovers: `.r2` `title` = line 1. `.r2c` `title` = lines 3 and 4.

### User Flows
1. Session launched in `muster` on `main`. Claude runs `git checkout -b fix`. Within one
   repo-poll tick, every surface's branch reads `fix`.
2. Claude calls `EnterWorktree`. The next main-agent hook carries the worktree as `cwd`, the
   poll is nudged, and the rail card gains `↳ probewt /` over `worktree-probewt`. The Focus
   header gains the same block. The tile header gains `↳`. The shell and the docs reader stay
   on `muster`.
3. `ExitWorktree`: the next event reports the launch directory, and the `↳` disappears.
4. Hovering the Focus header's repo readout shows the hover text above.

### States
- No data yet: no directory reported, so `claudeLocation` is null and nothing extra renders.
  A null `model` reads `unknown`, unchanged.
- Daemon down: the last snapshot stays on screen as today (kb:spec/connection). No new state.
- Dead session: `claudeLocation` is null on the wire, so no `↳`. The repo block still renders.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---|---|---|---|
| Rail card folder line | — | `<repo> /` (e.g. `muster /`); basename alone when `repo` is null | `.r2 .rf` |
| Rail card branch line | — | `<branch>` or `<branch> (worktree)` | `.r2 .rb`; absent when `repo` is null |
| Rail card repo hover | — | `title` = `<repo> / <branch>[ (worktree)]` | on `.r2` |
| Rail card Claude-location block | — | `.rf` `<name> /`, `.rb` `<branch>`; `.lead` text `↳` | `.r2c`; hidden when `claudeLocation` is null |
| Focus header repo block | — | `.rf` / `.rb` as the rail card | inside `#mainhead .meta .loc .repo` |
| Focus header Claude block | — | as the rail card's `.r2c` | `#mainhead .meta .loc .claude-at`; hidden when not moved |
| Focus header location hover | — | `title` = the 2–4 hover lines | on `#mainhead .meta .loc` |
| Focus header model | — | `displayName`, or `unknown` | `#mainhead .meta .model` |
| Focus header session name hover | `button` | `title` = display title | the existing `button.rename` |
| Tile header where | — | `<repo> / <branch>[ (worktree)]`; `title` = the hover lines | `.thead .wh` |
| Tile header moved marker | — | visually hidden text `Claude is in <directory>` | `.thead .wh-claude`; hidden when not moved |

`textContent` concatenates siblings with no whitespace: `.r2`'s `textContent` is
`muster /main`. Locators target `.rf`/`.rb`, never `.r2`'s whole text.

### Invariants
- **INV-1** (`claudeLocation`): non-null iff `alive` && `claude_dir` is set && *elsewhere*.
  *Elsewhere*: if `claude_dir` is inside a git checkout, its top level differs from
  `directory`'s top level (null counts as different). Otherwise, `claude_dir` is neither
  `directory` nor inside it. Both sides are compared after `filepath.EvalSymlinks` and
  `Clean`. A worktree under `<repo>/.claude/worktrees/` lies inside the launch path but has
  its own top level, so it is elsewhere.
- **INV-2**: no daemon path other than the repo poll's `claudeLocation` derivation reads
  `ClaudeDir` (REQ-8).
- **INV-3**: `model` non-null ⇒ `model.displayName != ""`.
- **INV-4**: a subagent-marked event never changes `ClaudeDir`, from any state.

INV-1 is asserted from every reachable source state, as a table: {alive, dead} × {no report,
same dir, subdir, worktree under `.claude/worktrees`, sibling worktree, other repo, non-git
inside, non-git outside} → expected null or non-null (D4, D5). It is also asserted with a
second session present: one session's move never sets the other's `claudeLocation` (D6).

#### Carried-over measurements
- kb:fact/cwd-follows-claude-mid-session and kb:fact/enter-worktree-moves-project-dir were
  measured on 2.1.286 with a `/tmp` project. Re-checked: the facts are about which keys carry
  the directory, not about the path. The `/tmp` vs `/private/tmp` spelling difference the
  fact notes is why INV-1 resolves symlinks.
- kb:fact/cwd-changed-hook: still valid. Production registers no `CwdChanged` and this plan
  adds none, so `new_cwd` is never seen.
- Subagent `cwd`: unmeasured. A subagent with worktree isolation could report its own
  directory. REQ-4 ignores subagent-marked events rather than relying on a measurement.

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/ingest.go` — the raw hook struct reads the common `cwd`.
- `internal/claudecode/interpret.go` — `StateInput.Cwd *string`, set from a non-empty `cwd` on every event except subagent-marked ones and `SubagentStart`/`SubagentStop`.
- `internal/claudecode/status.go` — `StatusUpdate.Cwd *string` from `workspace.current_dir`, else top-level `cwd`.
- `internal/gitutil/gitutil.go` — `TopLevel(ctx, dir) *string` (`git rev-parse --show-toplevel`, nil when not a checkout).
- `internal/session/session.go` — `ClaudeDir string` ("" = none), and the in-memory derived `ClaudeLocation *Location` (`Directory`, `Repo *LocationRepo{Name, Branch, IsWorktree}`).
- `internal/session/location.go` (new) — the pure INV-1 *elsewhere* rule, `Elsewhere(launchTop, claudeTop *string, launchDir, claudeDir string) bool`, with path resolution passed in so it is unit-testable without git.
- `internal/session/machine.go` — `applyBind`'s model rule (REQ-9).
- `internal/session/apply.go` — `Apply`/`ApplyStatus` adopt a changed `Cwd` into `ClaudeDir`, persist it, and fire the nudge callback. A `ClaudeDir`-only change persists without broadcasting, because the wire is unchanged until the derivation runs.
- `internal/session/actions.go` — `RecordLaunch`/`RecordResume` clear `ClaudeDir` and `ClaudeLocation`.
- `internal/session/repo.go` (new) — `Manager.SetRepoState(ctx, id, RepoState{Branch, IsWorktree, Location})`, which persists and broadcasts only on a real change. Also `Manager.RepoTargets()`, returning each session's id, `Directory`, `ClaudeDir` and `Alive` for the poller.
- `internal/session/writeorder.go` — `Branch`, `IsWorktree`, `ClaudeDir`, `ClaudeLocation` move into `restoreChangedFields`/`restoredSessionFields`, and `Branch`/`IsWorktree` leave `immutableSessionFields`.
- `internal/session/row.go`, `internal/store/session.go` — the `claude_dir` column round-trip, and `branch`/`is_worktree` in the update statement.
- `internal/store/migrations/0012_claude_dir.sql` — new.
- `internal/server/reporefresh.go` (new) — the repo poller: on start, on each `-repo-poll` tick and on nudge (coalesced). Per alive session whose `Directory` exists: `Branch`/`IsWorktree` of `Directory`, and when `ClaudeDir` is set: the INV-1 rule plus the location's repo. All git runs happen outside the manager lock. Then `SetRepoState`.
- `internal/server/sessionwire.go` — `claudeLocation` (always present, `null` when nil).
- `internal/server/server.go` — one-line registration of the poller (composition root).
- `cmd/musterd/main.go` — `-repo-poll` flag, validation, wiring, and stop-on-shutdown beside the liveness poll (`cmd/musterd/onexit.go`).

Superseded tests (all test agents): a test of behaviour this plan replaces is rewritten to the new behaviour, or deleted when the new criteria already cover it. No test of the old behaviour is kept.

### Daemon tests (daemon-tests)
- `internal/claudecode/*_test.go`, `internal/session/*_test.go`, `internal/server/*_test.go`, `internal/gitutil/gitutil_test.go`, `cmd/musterd/main_test.go` — D1–D10, D17. Tests asserting `Branch`/`IsWorktree` are immutable (e.g. the field-coverage partition's expectations, applyBind's display-name carry-over) are rewritten to the new rule or deleted. Existing fixtures carrying `cwd: "/tmp"` stay valid: they change only `ClaudeDir`, and wire-shape tests gain `claudeLocation: null`.

### Web (web-impl)
- `web/src/protocol/session.ts` — parse `claudeLocation` (a required key; an absent key on an older daemon reads as null).
- `web/src/sessions/card.ts` — pure `repoParts(session)` → `{folder, branch | null}`, `claudeLocationParts(session)` → the same shape or null, `locationHover(session)` → the 2–4 hover lines. `repoLine` stays (actions dialog copy, tile `.wh`). `mainheadMeta` is replaced by a structured view-model, and its string form goes.
- `web/src/render/sessions.ts`, `web/src/render/mainhead.ts`, `web/src/render/tiles.ts` — the DOM above.
- `web/index.html` — the rail card, mainhead and tile templates gain the new children.
- `web/src/style.css` — `.rf`/`.rb` truncation and caps, compact-density inline rule, `.r2c`/`.claude-at`/`.wh-claude`, `.lead`, `.model { flex: none }`. Tokens only.

### Web tests (web-tests)
- `web/src/sessions/card.test.ts`, `web/src/render/*.test.ts`, `web/src/protocol/*.test.ts` — W1–W5. The existing `mainheadMeta` string tests are deleted, since W3/W4 cover the structured view-model. `repoLine` tests stay only for its remaining callers (actions dialog copy, tile `.wh`).

### E2E (e2e-specs)
- `web/e2e/card-location.spec.ts` — new, E1–E12.
- `web/e2e/rail-layout.spec.ts` — E11's REQ-2 assertion (`.r2` `title` equals its own `innerText`) is rewritten to E13. The wrap makes `innerText` two lines while the `title` is one. Any other existing spec asserting the old one-line repo text or the `mainheadMeta` string (e.g. `actions.spec.ts`'s `.meta` read) is rewritten to target `.rf`/`.rb`/`.model`, or deleted when a new criterion covers it.
- `web/e2e/helpers/payloads.ts` — the hard-coded `cwd: "/tmp"` and `workspace: {current_dir: "/tmp", …}` defaults become optional overrides, omitted by default. Left in, they would mark every existing E2E session moved, because `/tmp` is outside each scratch launch directory. Real Claude always sends a `cwd`. The omission is a test-only default that REQ-3's "absent changes nothing" makes safe.
- `web/e2e/helpers/daemon.ts` — `ScratchDaemonOptions.repoPoll?: string` → `-repo-poll`.

## Edge Cases

1. Checkout from Claude's Bash tool, the shell pane, or outside Muster: none fires a hook, and the repo poll catches all three within one tick. → E1
2. Detached HEAD after a checkout: `repo` becomes null, so the card shows the basename, which is today's launch-time behaviour. → D6
3. The launch directory is deleted while the session lives: the last-known `repo` stays. → D6 (shared with edge case 2)
4. `cd sub` inside the launch checkout: same top level, so no `↳`. → E3
5. `EnterWorktree` into `<repo>/.claude/worktrees/x`: inside the launch path but a different top level, so `↳` shows. → E2
6. A sibling worktree (`../muster-foo`) or an `/add-dir` repo: a different top level, so `↳` shows. → D4
7. A non-git launch directory, with `cd` into a subfolder (no `↳`) or outside it (`↳`, `claudeLocation.repo` null). → D4 (shared with edge case 6)
8. A `cd` outside the allowed directories: Claude resets to the project root, and `cwd` (never `new_cwd`) is read, so no `↳` (kb:fact/cwd-changed-hook). → D1
9. `/tmp` vs `/private/tmp` spellings of the same directory: symlinks resolved, equal. → D4 (shared with edge case 6)
10. A subagent-marked event whose `cwd` is a worktree: ignored. → E6
11. A straggler hook with the previous `cwd`, arriving after a newer one: last-applied wins, and the next event corrects it. → untested: unordered delivery is accepted and self-healing, not guarded
12. `/clear` mints a new `session_id` in the same pane: `ClaudeDir` is untouched, and the next event carries Claude's real directory. → D5
13. The `/clear` pair's late-arriving `SessionEnd(clear)` after the rebind: its `cwd` is applied like any main-agent event, which is harmless because it is the same pane's directory. → D5 (shared with edge case 12)
14. A straggler from the previous turn after a rebind: same rule as 11. → untested: same as 11
15. Daemon restart mid-session: `claude_dir` persists, and the first repo-poll tick at start rederives `claudeLocation`. → D7
16. Pane dies without `SessionEnd`: `alive` flips via liveness, and `claudeLocation` becomes null on the wire. → E7
27. A checkout in a dead session's directory: not polled, so the card keeps its last-known branch until resume, whose first tick re-reads it. → D17
17. Resume of a moved session: Claude starts in `directory`, `ClaudeDir` is cleared, so no `↳`. → E7 (shared with edge case 16)
18. Hook loss: a lost move event is corrected by the next main-agent event or status post. → untested: loss tolerance is the existing design, nothing new to drive
19. Duplicate hook with the same `cwd`: no change, no persist, no broadcast. → D5 (shared with edge case 12)
20. Two sessions in the same launch directory, one moves: only that one's `claudeLocation` changes. → D6 (shared with edge case 2)
21. A late `SessionStart` with the same model id after the status line confirmed the display name: unchanged, and the display name survives. → D3
22. A resumed-from-list session with a null model, then `SessionStart` with a model: `{id, displayName: id}`, never blank. → E9
23. A launch alias (`sonnet`), then `SessionStart` `claude-sonnet-5-5`: the id shows until the status line confirms `Sonnet 5.5`. → E8
24. A 60-character folder plus an 80-character branch at a 1280px window: the model stays fully visible. → E11
25. `-repo-poll 0`: no timer, but nudges still derive `claudeLocation`. → D8
26. Compact density with a long branch: one line with an ellipsis, as today. → E10

## Acceptance Criteria

### Daemon
- **D1**: `Interpret` sets `StateInput.Cwd` from a main-agent hook's non-empty `cwd`, leaves it nil for an absent or empty `cwd`, and never reads `new_cwd`.
- **D2**: `Interpret` leaves `Cwd` nil for a subagent-marked event and for `SubagentStart`/`SubagentStop`.
- **D3**: `applyBind`'s model rule holds for the table (nil, X) → {X, X}; ({X, N}, X) → same pointer; ({Y, N}, X) → {X, X}; no model → unchanged.
- **D4**: The *elsewhere* rule returns the expected result for every INV-1 row (same dir, subdir, `.claude/worktrees` worktree, sibling worktree, other repo, non-git inside, non-git outside, symlinked spelling).
- **D5**: `Apply`/`ApplyStatus` persist a changed `Cwd` as `ClaudeDir` and fire the nudge exactly once, while an unchanged `Cwd` persists nothing.
- **D6**: The repo poller broadcasts one `sessionUpsert` per changed alive session, none on an unchanged tick, keeps the last-known `repo` for a missing directory, and never touches a bystander session.
- **D17**: The repo poller runs no git command for a dead session, which keeps its last-known `repo`.
- **D7**: After a restart with `claude_dir` set on an alive row, the first poll tick yields a non-null `claudeLocation`.
- **D8**: With `-repo-poll 0`, a nudge still runs the derivation.
- **D9**: `RecordLaunch` and `RecordResume` clear `ClaudeDir` and `ClaudeLocation`.
- **D10**: `toWireSession` always emits the `claudeLocation` key, `null` when nil.

### Web
- **W1**: `repoParts` returns `{folder: "muster /", branch: "main"}`, `branch: "x (worktree)"` for a worktree, and `{folder: "<basename>", branch: null}` for `repo: null`.
- **W2**: `claudeLocationParts` returns null for a null `claudeLocation`, and the same shape as `repoParts` otherwise, falling back to the basename when its `repo` is null.
- **W3**: `locationHover` returns exactly lines 1–2 when not moved, 1–4 when moved, and 1–3 when moved with a null location repo.
- **W4**: The Focus header's model readout is `unknown` for a null model and `displayName` otherwise.
- **W5**: `parseSession` reads an absent `claudeLocation` as null and rejects a malformed one.

### E2E
- **E1**: `git checkout -b` in the launch directory changes the rail card's `.rb` to the new branch, without any hook post.
- **E2**: A main-agent hook whose `cwd` is a `git worktree add` worktree under the launch directory's `.claude/worktrees/` shows `.r2c` on the rail card, `.claude-at` in the Focus header and `.wh-claude` in the tile header.
- **E3**: A main-agent hook whose `cwd` is a subdirectory of the launch directory shows no `.r2c`.
- **E4**: The Focus header's `.loc` `title` equals the four hover lines while moved.
- **E5**: While moved, `GET /api/sessions/{id}/reader`'s `directory` is the launch directory.
- **E6**: A subagent-marked hook whose `cwd` is a worktree shows no `.r2c`.
- **E7**: Ending a moved session removes its `.r2c`, and resuming it shows none until a new move is reported.
- **E8**: A `SessionStart` with model `claude-sonnet-5-5` on a session launched as `sonnet` shows `claude-sonnet-5-5` in `.model`, and a later status post shows its display name.
- **E9**: A resumed-from-list session with no model shows the id in `.model` after a `SessionStart` names one, never an empty string.
- **E10**: In comfortable density a rail card's `.rf` and `.rb` sit on two lines, while in compact density they sit on one line.
- **E11**: With a 60-character folder and an 80-character branch at 1280×800, the Focus header's `.model` is not clipped (`scrollWidth <= clientWidth`).
- **E12**: The Focus header's `button.rename` `title` equals the session's display title.
- **E13**: A rail card's `.r2` `title` equals `<repo> / <branch>` (rail-layout.spec.ts E11, rewritten).

### Automated Checks

```checks
D11 make test
D12 make lint
W6 make web-build
W7 make web-test
W8 make web-lint
E14 make e2e
```

### Reviewer-Verified
- **W9**: No `any` types in new web code.
- **W10**: The `↳` blocks and glyph use only neutral tokens (`--fg-muted`, `--fg-dim`), never a state colour.
- **W11**: The rendered rail card, Focus header and tile header match `c-long-names.html` in Instrument and Light.
- **D15**: No git subprocess runs while the session manager's lock is held.
- **D16**: The hook and status-line key names for the working directory appear only under `internal/claudecode/` (hard rule). No production code reads `CwdChanged`'s target field. (Not a grep: the plan text itself names the keys, which plan-lint refuses in a checks line.)

## Doc Delta

**lifecycle** — becomes true:
- The card shows the launch directory. While the session is alive, its branch and worktree flag are re-read from it on a repo poll (default 5 s), so a checkout from anywhere shows within one tick. A dead card keeps its last-known branch.
- Where Claude is working is recorded from main-agent hooks and the status line, and is surfaced as `claudeLocation` only while Claude is in a different checkout. It is display-only, and launch and resume clear it.
- A bind naming a different model sets its display name to the id until the status line confirms one.

**lifecycle** — stops being true:
- Any sentence saying branch and worktree flag are recorded at launch and fixed.

**ingest** — becomes true: every main-agent hook's `cwd` and the status line's `workspace.current_dir` are read. `CwdChanged` stays unregistered.
**ingest** — stops being true: nothing.

**rail** — becomes true: the repo line wraps at the `/`, folder over branch, each line truncated (one line in compact). A `↳` block shows where Claude is when it works in another checkout.
**rail** — stops being true: "then the repo and branch line" as one line.

**focus** — becomes true: the meta's repo readout is folder over branch, each capped, the model never truncates, `↳` shows a move, and the repo readout and session name carry hover text.
**focus** — stops being true: "a meta line of repo and branch, model" as one line.

**tiles** — becomes true: the tile header's repo readout carries hover text, and a `↳` glyph marks a move.
**tiles** — stops being true: nothing.

**usage**, **launch**, **connection**, **actions** — No doc change (they are in **Features** for file ownership: `status.go`, `gitutil.go`, `server.go`/`main.go`/`protocol/session.ts`; **actions** added mid-run by the developer, 2026-10-01, because two of its test fixtures gained `claudeLocation: null`).

**protocol.md**: the Session object's `claudeLocation`, the refreshed `repo` comment and the `model` comment, as the Protocol Contract above.

## Out of scope

- Effort level on the card: the developer is handling it as its own feature.
- Registering `CwdChanged`, `PreModelSwitch` or `PostModelSwitch`: every hook's `cwd` and the status line already carry what this plan needs.
- Moving the shell, docs reader or file drop to Claude's location: decided against (REQ-8).

## Implementation Notes

- **ADRs** (written `proposed` at approval):
  - `kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere`: supersedes `kb:adr/lifecycle-card-directory-follows-claude-cwd`. The card, shell, reader and drop stay on the launch directory, and Claude's location is a secondary readout shown only in another checkout.
  - `kb:adr/lifecycle-claude-location-from-main-agent-cwd`: the signal is every main-agent hook's `cwd` plus the status line's `workspace.current_dir`. Never `CwdChanged`/`new_cwd`, never subagent-marked events.
  - `kb:adr/lifecycle-branch-refreshed-by-repo-poll`: a timer poll plus a nudge, not a file watcher. Hooks miss shell-pane and outside checkouts, and a 5 s `git` read per session is cheap.
  - `kb:adr/lifecycle-bind-model-display-name-is-id`: REQ-9.
  - `kb:adr/rail-repo-line-wraps-at-slash`: folder over branch with per-line truncation and hover; compact and the tile header stay one line.
- Facts handled: kb:fact/cwd-follows-claude-mid-session, kb:fact/enter-worktree-moves-project-dir, kb:fact/cwd-changed-hook, kb:fact/model-switch-hooks, kb:fact/sessionstart-model-optional-string, kb:fact/status-model-is-object, kb:fact/status-line-keys, kb:fact/hook-delivery-best-effort.
- Hard rule: only `internal/claudecode` knows the working-directory key names (D16).
- E2E git setup runs `git init`/`checkout`/`worktree add` in the test's scratch directory with `-c user.name=bob -c user.email=bob@example.com` per command. Never `git config user.*`.
- `repoContext` in `internal/server/launcher.go` stays the launch-time read, and the poller reuses the same `gitutil` calls.
- **Doc upkeep (orchestrator)**: tick the three `TODO.md` entries in "Together — a card's branch, directory and model going stale", and move the group to `docs/history/todo-done.md`. Update `docs/design/design-system.md` §5 Rail card, Tile and Focus mainhead (citing `mockups/claude-location/c-long-names.html`). Apply the two diagram deltas. Flip the five ADRs and mark `lifecycle-card-directory-follows-claude-cwd` superseded at Completion.
