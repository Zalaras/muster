# Correctness review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 64081 words (budget 30000)

Scope: delta re-review (§0) against `git diff a43934a7..HEAD` (`review_commits[2]`). Cycle 2's merged
review had one open agent-tagged issue, maintainability Minor 1 `[daemon-impl]`. The fix commit
`48c513c3` also acts on maintainability Note 2: the unread route's type and handler now cite their
anchor. The diff outside `plans/` is comment-only and touches four files:
`internal/server/rail.go`, `internal/session/manager_rail.go`, `internal/session/session.go` and
`internal/session/writeorder.go`. `git diff a43934a7..HEAD --stat -- docs/ web/ cmd/` is empty. The
diff goes beyond the Minor's stated scope only through the two `rail.go` comments, which the commit
subject names and which change no code. So I did not re-read §3–§6.

Orchestrator note, recorded as asked: in comment-pass cycle 3 the orchestrator overrode three judge
drops to keep. They are the `Session.Unread` field doc, the `unreadSessionRequest` doc and the
`handleUnreadSession` doc. The reasons are in `comment-pass.json` cycle 3. The `comment-ledger` gate
reads "12 added comment blocks, all kept".

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `PUT /api/sessions/{id}/unread` | Yes. No code changed since cycle 2. `SetUnread` (`manager_rail.go:179-200`) has the same body: miss → `ErrUnknownSession`; set on a non-idle session → clear; no change → no write and no broadcast; a change → one `persistWholeRowLocked(..., true)` | Yes. D1 and D2 pass (22-D1.log, 23-D2.log) | pass |
| REQ-2 Mark as read / Mark as unread on every menu | Yes. Unchanged; no `web/` change since cycle 2 | Yes. W1 100, R1 191, E1 162 | pass |
| REQ-3 Remove… on live sessions | Yes. Unchanged | Yes. W1, R1, E1 | pass |
| REQ-4 Focus header holds the switch and one ⋯ | Yes. Unchanged | Yes. R1, E1 | pass |
| REQ-5 ⋯ opens the focused card's menu | Yes. Unchanged | Yes. R1, E1 | pass |
| REQ-6 Note marker inherits no title | Yes. Unchanged | Yes. R1 | pass |
| DIAG | `go tool kb for` on `session.go` and `writeorder.go` names only kb:diagram/daemon-components, a package import diagram. The comment-only diff adds and removes no import | — | pass |

## Build & Tests

E2E tests: pass (383, scoped to 34 files; E1 162 in 10 files) · Daemon tests (race): pass (`make test-race`, 27 `ok` packages, 0 FAIL) · Web tests: pass (3041 in 106 files) · Render tests: pass (422) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean; contrast 0 failures in 3 themes). All of this comes from $GATES_LOG_DIR: 27 lines, 0 failed, 2 warn-only. `WARN size` (`rail.go` dupl ×2, now `41-65`/`73-97` because of the two new comment lines) belongs to review-maintainability. `WARN e2e-level` counts specs that this plan did not author. No flaky-spec repair is in this cycle's diff, so I ran no soak.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestSetUnread\|TestHandleUnreadSession' ./internal/session/ ./internal/server/` | pass (22-D1.log) |
| D2 | `go test -count=1 ./internal/session/ ./internal/server/` | pass (23-D2.log) |
| W1 | `cd web && npx vitest run src/features/railmenuitems.test.ts src/api/http.test.ts src/render/mainhead.test.ts` | pass, 100 tests (24-W1.log) |
| R1 | `cd web && npx playwright test -c playwright.render.config.ts render/focus.spec.ts render/notes.spec.ts render/rail.spec.ts render/actions.spec.ts render/theme.spec.ts render/card-location.spec.ts render/rename.spec.ts` | pass, 191 (25-R1.log) |
| E1 | `make e2e SPECS="rail-menu.spec.ts focus-header.spec.ts effort-header.spec.ts actions.spec.ts rail-cards.spec.ts terminal.spec.ts resilience.spec.ts focus-marker.spec.ts groups.spec.ts notes.spec.ts"` | pass, 162 (26-E1.log) |
| L1 | `make lint` | pass (same command as the baseline `lint` line, not re-run; 03-lint.log, 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The cycle-2 fix attempt's log entry (`daemon-implementation.md`) says "comment-only … no behaviour change" and has no `deviation:` or `doc-delta:` line. No `docs/` file changed. The Doc Delta claims are as verified in cycles 1 and 2, and no code they describe has changed since. The TODO tick is the sweep loop's |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `docs/protocol.md` § kb:anchor/sessions.unread matches the Protocol delta in substance; no other protocol text changed | pass | Verified in cycle 1. `docs/` is unchanged since then (empty `--stat` against `a43934a7`; cycle 2 recorded the same against `63252581`). The anchor the new `rail.go` comments cite exists at `docs/protocol.md:492` |
| RV2 | The header ⋯ uses the existing menu builder through `railMenu.open`; no second menu list | pass | No `web/` change since cycle 2, which verified `focus.ts:160` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. Comment-only diff |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. No ingest change |
| 4 | tmux via `-L muster`; no `resize-pane` sizing | pass. No tmux change |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass. No gauge path touched |
| 7 | Identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 maintainability Minor 1 `[daemon-impl]`: the `Unread` declaration lists its writers as they were before this branch | `48c513c3` | Diff read; I checked all four of the Minor's conditions against the code. (1) `session.go:166-176` names Apply, `SetUnread` (set or clear) and `MarkSeen` (attach, through `SetUnread`). `rg '\.Unread\s*='` over non-test `internal/` finds exactly `apply.go:94`, `manager_rail.go:194`, `session.go:323` (setState) and the store's row scan, so the list is complete. (2) The declaration names both keepers of `Unread ⇒ idle`: setState for transitions, and `SetUnread` for a request with no transition. The second is true at `manager_rail.go:186-188`. (3) `writeorder.go:72` lists `SetUnread` where it used to list `MarkSeen`. `MarkSeen`'s comment now says "The clear is SetUnread(false); MarkSeen holds no logic of its own", which matches its one-line body. (4) There is no behaviour change: the diff touches only `//` lines, and D1/D2 and test-race are green |
| cycle 2 maintainability Note 2 (filed as a rule for review-work): `unreadSessionRequest`/`handleUnreadSession` cite no anchor, against `internal/server/CLAUDE.md:9` | `48c513c3` | Diff read. `rail.go:67` and `:72` both cite `kb:anchor/sessions.unread`, as their pin siblings do |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `setSessionUnread` (`web/src/api/sessions.ts:103`) still has no doc comment. Its sibling `pinSession` cites `kb:anchor/sessions.pin`. No web-side CLAUDE.md states the anchor-citation rule; only `internal/server/CLAUDE.md:9` does. Code comments are not reviewed, so I am not asking for a change.
2. **[note]** review-browser was skipped this cycle, which is correct: the diff has no `web/` change, and the daemon change is comment-only, so nothing observable changed since cycle 2's browser approval.
