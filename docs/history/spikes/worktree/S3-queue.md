# S3 — daemon-driven merge-queue prototype (no LLM)

Claim under test (`docs/design/worktree-conflicts.md`, "Revised stack (v2)" §4/§6, "Muster-core
v1 shape"): rebase → verify → squash-merge can be a deterministic, restart-safe daemon state
machine. **Result: holds.** Every failure path and crash point recovers to the same end state
as an uninterrupted run, with the integration worktree clean. Git 2.50.1, Go 1.26.6.

## What was built — `spikes/worktree/s3-queue/` (nested module `muster-spike-queue`)

| file | code lines (non-blank, non-comment) |
|---|---|
| `queue/queue.go` — states, persistence, recovery, rebase/verify/merge steps | 474 |
| `queue/git.go` — `os/exec` git wrappers, worktree reset, fast-forward, verify runner | 149 |
| `queue/rerere.go` — rerere classify / ids / forget | 63 |
| `cmd/queue/main.go` — `go run ./cmd/queue [-verify CMD] [-confirm] [-resolve P=F] <repo> <branch>` | 59 |
| total (budget was ~700) | **745** — tests another 440 |

Standard library only; invisible to the main module. Scratch repos: `~/.muster-spikes/s3-queue/`.

- **Persistence**: one `entry.json` per branch at
  `<git-common-dir>/muster-queue/entries/<branch>/`, written atomically (tmp + rename)
  by `transition()` *before* the step it names runs. Side effects that must survive a
  crash (`branch_sha`, `base_target`, `rebased_sha`, `verified_tree`, `target_before`)
  ride along in the same write. Conflict blobs, resolutions and `verify.log` sit beside it.
- **Integration worktree**: `<git-common-dir>/muster-queue/wt`, detached HEAD always
  (git allows a worktree inside `.git/`; detached means the candidate branch may stay
  checked out in the user's worktree — tested). `Open()` creates it if missing and
  always resets it: `rebase --abort` if in progress, `reset --hard`, `clean -fd`.
- **Fast-forward of `main`**: if some worktree has `main` checked out, `git -C <that>
  merge --ff-only` there (so its files follow); otherwise a compare-and-swap
  `update-ref refs/heads/main <new> <old>`. Both paths tested.
- **Guards**: before verify and before merge, `main` must still equal `base_target`,
  else the entry goes back to `queued` (max 3 attempts). After the squash commit,
  `merge_tree` must equal `verified_tree` or the entry fails with `tree_mismatch` and
  `main` is not touched (tested by forging an entry).
- Empty verify command ⇒ `awaiting-confirm`; `Confirm()` drives it on. `verified_tree` is
  recorded either way (then it is the tree the human confirmed).

## State diagram

```
queued ──► rebasing ──► verifying ──► merging ──► done
   ▲          │             │  ▲          │
   │          │ conflict    │  │ Confirm  │ tree mismatch / ff refused
   │          ▼             ▼  │          ▼
   │   awaiting-resolution  awaiting-confirm    failed  ◄── verify exit≠0
   │          │ Resolve(path) + Run
   └──────────┘         (also: main moved before verify/merge ⇒ queued, ≤3 attempts)
```

## Crash-restart matrix (`TestCrashRestartMatrix`, CLI killed with `os.Exit(3)`)

| crash point | on disk after crash | recovery on restart | result |
|---|---|---|---|
| `rebasing` (state persisted, rebase not run) | rebasing | `recover: restarting rebase from <branch_sha>` → queued → attempt 2 | done, 1 commit |
| `rebased` (rebase done, verifying not persisted) | rebasing | same restart; rebase is a pure function of (branch_sha, base_target) | done, 1 commit |
| `verifying` (persisted, verify not run) | verifying | `re-running verify on <rebased_sha>` (checkout + reset first) | done, 1 commit |
| `verified` (verify passed, merging not persisted) | verifying | verify re-runs; idempotent | done, 1 commit |
| `merging` (persisted, squash not made) | merging | `target unchanged, redoing squash` | done, 1 commit |
| `committed` (squash commit exists, main not moved) | merging | same; first squash commit left dangling (harmless) | done, 1 commit |
| `ff` (main moved, done not persisted) | merging | `fast-forward already landed as <sha>` (parent = target_before ∧ tree = verified_tree) → done | done, 1 commit |

All seven land `clean`'s tree with `main^ == main-before`, `main^{tree} == verified_tree`, worktree
clean. `TestMainMovedDuringMergeRequeues`: crash at `merging`, foreign commit lands on `main`,
restart ⇒ requeue (attempt 2), re-rebase, done with both changes.

## rerere — measured facts and cost

- Repo config set once: `rerere.enabled=true`, `rerere.autoUpdate=false`.
- When rerere **replays** a resolution during a rebase stop, the path is absent from
  `git rerere status`, `git rerere remaining` **and** `MERGE_RR`. So "pre-resolved" =
  unmerged paths (`diff --name-only --diff-filter=U`) minus `rerere remaining`.
- `MERGE_RR` is `<id>\t<path>\0` (NUL-terminated) and lists only *open* conflicts, so
  rr-cache ids are capturable at stage time only for hand resolutions (recorded as
  `rerere_ids`). The id of a replayed resolution is not observable.
- `git rerere forget <path>` needs the conflict present in the index. It happens to work
  after the rebase completes too (via the index's resolve-undo data), but that state does
  not survive `reset --hard`, so the queue instead **re-creates the conflict**
  (checkout branch tip, rebase onto `base_target`, forget at each stop, abort). Deterministic.
- `git rebase --abort` runs `rerere clear` (drops unresolved preimages): parking leaves no
  rerere trace, only the entry's own blobs.
- **Cost: ~115 lines**, not the design's "~15": `rerere.go` 63 + `forgetReplayed` 37 +
  ~15 in the rebase loop. Half of that is the conflict re-creation for `forget`.
- Caveat on "identical conflict": once X's resolution *lands*, `main` contains it, so a
  twin branch Y now conflicts differently (XM vs X) and nothing replays. Replay pays off
  for re-attempts of the same branch after a verify failure and for twins queued against
  the same `main` — both tested (`TestRerereReplaysIdenticalConflict`, `…ForTwinBranch`).
  Policy left open: only *replayed* paths are forgotten on verify failure; a hand
  resolution that then fails verify stays recorded.

## What could not be made deterministic (and what was accepted)

1. **Conflict set: rebase vs `merge-tree`.** `merge-tree --write-tree main branch` is one
   3-way merge; the rebase replays commit by commit, so for multi-commit branches the
   two path lists can differ. Both are recorded (`conflicts` = where the rebase stopped,
   `merge_tree_conflicts` = merge-tree's). Blobs come from merge-tree as specified.
2. **Verify command nondeterminism** is outside the machine: a flaky verify forgets a
   replayed resolution that was fine (over-forgetting). Cheap to accept.
3. **No cross-process lock.** One process per repo assumed (a daemon serialises anyway).
4. **ff into a dirty user worktree**: if `main` is checked out there with overlapping dirty
   files, `merge --ff-only` refuses ⇒ `failed`, `main` untouched. The user has to act.
5. Squash commit SHA differs on a redo after a crash (timestamps); the tree is identical.

## Test output (`go test -count=1 -v ./...`, 11 tests + 7 matrix subtests, all PASS)

```
--- PASS: TestCleanMergeFastForwardsCheckedOutMain (2.72s)
--- PASS: TestCleanMergeWhenMainNotCheckedOut (2.67s)
--- PASS: TestVerifyFailureLeavesMainUntouched (2.09s)
--- PASS: TestEmptyVerifyStopsAtAwaitingConfirm (3.05s)
--- PASS: TestConflictParksEntryThenResolutionLands (3.79s)
--- PASS: TestRerereReplaysIdenticalConflict (4.53s)
--- PASS: TestRerereReplaysForTwinBranch (4.48s)
--- PASS: TestVerifyFailureAfterReplayForgetsRerere (5.06s)
--- PASS: TestTreeMismatchRefusesFastForward (2.12s)
--- PASS: TestCrashRestartMatrix (24.51s)   # subtests rebasing rebased verifying verified merging committed ff
--- PASS: TestMainMovedDuringMergeRequeues (3.69s)
PASS
ok  	muster-spike-queue/queue	59.369s
```
