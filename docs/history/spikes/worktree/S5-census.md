# S5 — Semantic-conflict census (step 1: textual classification)

**Question.** Among pairs of landed squashes, how many would pass the gates alone but fail
together? Step 1 (done 2026-09-06, zero LLM) classifies adjacent pairs textually and
reserves the clean ones for the gate runs. Step 2 (gate runs on each reconstructed merge) ran 2026-09-07 once the `v1-cleanup`
pipeline completed; step 3 classified the candidates from the trees alone.

**Method.** Scratch clone at `~/.muster-spikes/s5-census/repo` (never the primary checkout).
`census.sh` takes the last 30 first-parent commits on `main` (all squashes — `main` has 0
merge commits in 100 first-parent commits), and for each adjacent pair (older A, newer B)
rebuilds them as parallel branches off A's parent: branch A is the real commit, branch B is
B cherry-picked onto A's parent in a throwaway worktree. A clean cherry-pick means the pair
is textually disjoint; a conflict is a real textual collision. Clean pairs also get a
`merge-tree --write-tree` merge commit stored at `refs/census/<i>/M` — that is the tree
step 2 will run the gates on. `refs/census/<i>/{A,B,base}` are kept for reproduction.

**Result (29 pairs).**

| Outcome | Pairs |
|---|---|
| Cherry-pick clean, merge-tree clean | 25 |
| Cherry-pick conflict (textual collision) | 4 |
| Pairs with any filename overlap | 8 |

All 4 collisions are docs, not code: `SPEC.md` (pair 14), `docs/go-public.md` (pairs 19, 20),
`docs/protocol.md` (pair 22). Filename overlap over-predicts conflict 2:1 here (8 vs 4),
consistent with the 2026-09-01 finding that overlap ≠ conflict.

Full table: `~/.muster-spikes/s5-census/pairs.tsv` (idx, shas, file counts, overlap,
cherry status, conflicted files, merge-tree status, subjects).

## Step 2 — gate runs (2026-09-07, `census-gates.sh`, run alone on an idle machine)

For each of the 25 clean merges `M`: `make check`; if green, `make web-build build` then
Playwright. If a stage fails, both parents run that same stage. Only "both parents pass,
M fails" is a candidate. First attempt was discarded: it ran beside the S4/S6 Haiku
sessions and skipped the build before Playwright — every red was mine.

| Outcome | Pairs |
|---|---|
| Green (check + e2e) | 9 |
| Candidate (parents pass, M fails) | 5 → **all flakes** (step 3) |
| Parent(s) already red at the failing stage | 11 |

**Step 3 — candidates classified without reruns** (`census-recheck.sh`): for pairs 0, 1, 6,
18, 25 the merged tree's code (`cmd internal web/src web/e2e …`) is byte-identical to one
parent that passed the same stage minutes earlier, so the merge cannot behave differently
— flake by construction. Pair 17 (parent-red row) also had one extra failure on M
(`theme.spec.ts:78`) with code identical to its green-on-that-test parent: flake.

**Result: 0 semantic conflicts in 25 textually-clean adjacent pairs.** Every merge failure
was one of three tests failing on trees where the identical code passes elsewhere.

## Repo findings (not about worktrees, but measured along the way)

1. **`TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` is flaky** — 11
   failures tonight, always at ~5.2 s with an empty capture, on trees where it also passes;
   passes alone at HEAD in 1.4 s. Load-sensitive (fails under `nice -n 5` with nothing else
   running). Worth a TODO entry.
2. **`TestPreflight_TooOld`** failed twice at exactly 2.00 s — a timeout-shaped assertion
   that trips under load.
3. **`actions.spec.ts:640` (Tiles: End from a tile footer keeps geometry)** was red on 33
   of the trees in the pair-0…pair-17 stretch of history *and* flaked on later green trees
   (pairs 0, 21, 24, 27, 28 as M). Load-sensitive too.
4. **`e0319f8` landed with a red e2e suite** (pair 26: 244/244 fail at B and M, reproduced
   alone on rerun; A = docs-only passes 281; B's code is byte-identical to `e0319f8`).
   Cause, reproduced by hand: e0319f8 added a startup `claude --version` check under a
   5 s `versionCheckTimeout`; the e2e stub of the time was a sleep loop that never answers.
   The daemon then hangs **indefinitely, not 5 s** — a leaked scratch daemon still answered
   nothing on `/healthz` 23 minutes later — so the harness's 10 s health wait expired for
   every test. The likely mechanism is the Go `exec` gotcha: the context kills the stub
   shell but its `sleep` child keeps the stdout pipe open, and `Output()` waits for EOF
   (`cmd.WaitDelay` is the fix). The next commit, `feec502`, replaced the stub with one that
   answers `--version`, which masks rather than fixes it. **Confirmed latent on `main`:**
   `internal/claudecode/version.go:31` is `exec.CommandContext(ctx, bin, "--version").Output()`
   with no `cmd.WaitDelay`, so a real `claude` whose `--version` leaves a child holding
   stdout would hang `musterd` startup forever. One-line fix; deserves an issue. Not a worktree conflict (B alone is red), but a textbook "unit
   tests green, integration red" commit that went straight to `main` outside the pipeline
   — exactly what the land queue's verify gate exists to catch.
5. **Harness leak at that ref**: when the daemon never became healthy, the fixture's
   teardown threw (`Cannot read properties of undefined (reading 'teardown')`) and the
   scratch daemon plus its stub shell were never killed — ~730 hung `musterd` processes and
   893 `muster e2e-*` tmpdirs accumulated from the pair-26 runs before I noticed. All were
   mine (binary path inside the scratch clone) and were killed; none of Damian's. Worth a
   check that the current `fixtures.ts` tears down on a failed `start()`.

## Reading for the design

- The census argues **against** budgeting for semantic conflicts between adjacent plans:
  0 in 25 here, and the 4 textual conflicts were all docs. The queue's verify gate is
  still load-bearing — finding 4 shows why — but its job is catching individually-red
  lands, not cross-plan interference.
- Gate runs on a shared machine need the flaky-test problem solved first, or the queue
  will cry wolf on ~1 in 3 lands (11 + 5 of 25 merges had a spurious red). A queue that
  retries a failed stage once before declaring `failed` would have absorbed every one of
  tonight's flakes; "parent-red" detection (run the target's HEAD too) tells flake from
  regression.

Artifacts: `~/.muster-spikes/s5-census/{pairs.tsv,gates.tsv,log-*}`; refs
`refs/census/<i>/{base,A,B,M}` in the scratch clone.
