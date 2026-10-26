# Maintainability review: Remove, unread and right-click (1)

**Plan**: remove-unread-right-click-1
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 26100 words (budget 30000)
**Scope**: Delta re-review. Cycle 2's only open agent-tagged issue was one Minor. The diff is `git diff a43934a7..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, which touches 4 files. All four changes are comments only: fix commit 48c513c3, then comment pass af688df6, which touched only `comment-pass.json`. There is no `web/src` change.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| Minor 1 [daemon-impl]: the `Unread` declaration, `MarkSeen`'s comment and `writeorder.go`'s setter list still named the writers from before this branch | 48c513c3 | All four conditions from cycle 2 now hold. (1) `session.go:168-175` names every writer: Apply (turn_closed), `SetUnread` (the developer's request, set or clear) and `MarkSeen` (attach, through `SetUnread`). `rg -n "\.Unread\s*=" internal --type go -g '!*_test.go'` finds no other writer: `apply.go:94`, `session.go:323` (setState), `manager_rail.go:194` (SetUnread), and `store/session.go:504`, which is the row decode. (2) The declaration names both keepers of `Unread ⇒ idle`: setState for a transition, and SetUnread for a request that causes none. That matches `manager_rail.go:186-188`. (3) `writeorder.go:72` lists `SetUnread` where it listed `MarkSeen`. `MarkSeen`'s comment (`manager_rail.go:167-169`) says "The clear is SetUnread(false); MarkSeen holds no logic of its own". (4) No behaviour changed: the diff touches no code line. Gates `02-test.log` shows `internal/session ok` and `internal/server ok`. Resolved |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/session.go | manager_rail.go, apply.go, writeorder.go (writers the new comment names) | n/a (comment-only; Fix Attempt cycle 2 records it) | none | pass |
| internal/session/manager_rail.go | session.go, writeorder.go, apply.go | yes (daemon Decisions: `MarkSeen` delegates to `SetUnread`) | none | pass (Note 1) |
| internal/session/writeorder.go | manager_rail.go (`SetUnread` calls `persistWholeRowLocked` at `:196`) | n/a (comment-only) | none | pass |
| internal/server/rail.go | same file's `handlePinSession` (`:40`), groups.go | yes (daemon Decisions 2, 3) | dupl ×2 (41-65 / 73-97). This is cycle 2's hit, moved by 2 lines because of the two new comment lines. Its reason holds, as in cycle 2 Note 1 | pass |

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** The two new comments use slightly different words for the same guard. `session.go:174` says `SetUnread` "refuses to set the flag on a non-idle session". `SetUnread`'s own comment (`manager_rail.go:175-176`) says such a request "is treated as a clear". Both are true while setState keeps `Unread ⇒ idle`, because a non-idle session's flag is already false and the request has nothing to clear. I am not asking for a change.
2. **[note]** The new `unreadSessionRequest`/`handleUnreadSession` comments (`rail.go:67`, `:72`) cite `kb:anchor/sessions.unread` in the same form as `handlePinSession` (`rail.go:40`). That covers cycle 2 Note 2's anchor-citation point, which belongs to review-work.
