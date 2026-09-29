# Maintainability review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 31121 words (budget 20000) (WARN pack exceeds budget of 20000 words)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. The spawn prompt did not say the previous cycle's open issues were only Minors, so this is a full-scope review, not a delta. `git diff --stat 8f050bf..HEAD` (cycle 2's review commit to HEAD) shows that 6 of the 32 files changed since cycle 2. I asked the per-file questions again of those 6, with their siblings open. The other 26 are byte-identical to what cycle 2 reviewed, so their cycle 2 result stands; they are listed in cycle 2's Files table.

## Prior cycle (cycle 2) issues

| Prior issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Minor 1: `claudeLocks` invariant kept in a plan log | 4500836 | The declaration at `internal/session/manager.go:130-145` now states the rule ("no caller ever calls Forget on an entry here, and none should") and the reason: a Forget lets a later Lock get a fresh `*sync.Mutex` that does not exclude anyone still queued on the old one, which reopens the double-claim. It also states the growth trade-off. The reason is tied to `keyedlock.Locks.Forget`'s own doc (`internal/keyedlock/keyedlock.go:37-47`), and that doc does say this. The pointer into `plans/` is gone. | fixed |
| Minor 2: past-sessions error switch had no `default` arm | 4500836 | `internal/server/launcherpastlist.go:74-76` adds `default:` → `f.log.Error()…` + `writeJSONError(w, 500, "internal_error", msgInternalError)`. This matches `handleBrowse`'s arm (`internal/server/browse.go:68-70`): same status, same code, same `msgInternalError` constant (`respond.go:34`). `f.log` is the feature's existing `zerolog.Logger` field (`launcherpastlist.go:50`). | fixed |
| Minor 3: two size warnings had no reason | 4500836 (log) | `daemon-implementation.md` Fix Attempt § Decisions (lines 387-403) adds two `size:` lines. **manager.go filelen 551**: the reason is "comment weight, not new logic". `git diff main...HEAD -- internal/session/manager.go` with comment and blank lines removed leaves about 20 code lines (`claudeLocks`, `LockClaudeSession`, the `pendingResumeClaudeSessionID` set, `AliveByClaudeSessionID`, the `*string` model). The rest of the +82 is comments, so the reason holds. **`launchResume` funlen 61**: the reason is "one coherent check-then-spawn body; the tipping line is a comment inside the lock block". I re-read `launcherpast.go:50-127`. It runs one straight sequence (validate → find → lock+check → repoContext → TouchRepo → settings → argv → spawn) and does not interleave concerns, so the reason holds. | fixed |
| Minor 4: `PastRow` / `PastRowView` declared twice | 3f45762 | `rg -n 'PastRow\b\|interface PastRow' web/src` finds one declaration, `export interface PastRowView` at `render/launchpast.ts:23`. `features/launchpastlist.ts:6` imports it (`import type { PastRowView } from "../render/launchpast"`). `rg -n 'from "\.\./features' web/src/render` finds only two `*.test.ts` files, so no production file imports features/ from render/. Dependencies now run features/ → render/, as `launchmodels.ts:7` does. | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/launch.go | launchtranscripts.go | n/a (comment-only edit) | none | pass |
| internal/server/launcherpastlist.go | browse.go, respond.go | yes | none | pass |
| internal/server/launcherpast.go (unchanged since cycle 2; size reason newly given) | launcher.go | yes | funlen `launchResume` 61, reason holds | note |
| internal/session/manager.go | keyedlock/keyedlock.go, apply.go, writeorder.go | yes | filelen 551, reason holds | note |
| internal/session/session.go | manager.go | n/a (comment-only edit) | none | pass |
| web/src/features/launchpastlist.ts | launchmodels.ts | yes (Fix Attempt Decisions) | none | pass |
| web/src/render/launchpast.ts | render/launch.ts, reader.ts | yes (Fix Attempt Decisions) | none | pass |
| 26 other files in the branch diff | as in cycle 2 | as in cycle 2 | unchanged since cycle 2 (`15-size.log`: main.go filelen 513 / funlen ×2, launcher.go filelen 553, `New` 43, `applyInput` 52 pre-existing, launch.ts filelen 731; each has its cycle 2 reason) | pass (cycle 2) |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** `plans/resume-and-dangerously-allow/web-implementation.md:235` still holds the old `design:` line, which says `render/launchpast.ts`'s local `PastRow` "deliberately duplicates `PastRowView`'s shape". The Fix Attempt entry at line 320 supersedes it, and the code matches the new entry. The log contradicts itself, but only the log. No change requested.
2. **[note]** Cycle 2 Note 3 still applies. The two resume paths take `claudeLocks` and `locks` in opposite orders, and no deadlock is reachable because a Resume aimed at the fresh row returns on `sess.Alive` before it asks for `claudeLocks`. Nothing in this cycle's diff changes either path.
3. **[note]** For `review-work` (comment truth): the reworded `LaunchParams.PermissionMode` comment (`internal/claudecode/launch.go:33-39`) and the `ValidPermissionMode` doc (`internal/session/session.go:47`) are statements. I did not judge them here.
