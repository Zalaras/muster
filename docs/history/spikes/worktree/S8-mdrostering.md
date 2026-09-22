# S8 — Second-repo census: MDRostering (measured 2026-09-07)

**Why.** Every number so far came from muster's own history, which is small, doc-heavy and
pipeline-shaped. Damian's MDRostering repo (`Documents/code/company/mdrostering`: Go/Echo
API + React/TS front end, 528 tracked files, 75 MB `.git`, 440 commits over two years,
283 on first-parent `main`, 39 real merges there, 40 branches incl. one Claude Code
`worktree-*` branch) is a different shape. Read-only: a local clone at
`~/.muster-spikes/s8-mdr/repo`; the source checkout (dirty, 3 files) was never touched and
no env/credential file was opened.

## A. Real merges (`census-real-merges.sh`) — genuinely parallel work

| | |
|---|---|
| Merges on first-parent `main` | 39 |
| `merge-tree` clean | **38** |
| `merge-tree` conflict | 1 (`package.json` + `package-lock.json`, a dependabot merge) |
| Parents with filename overlap | 22 |
| Clean merges whose recorded tree ≠ merge-tree result (hand-edited at merge time) | 0 |
| `merge-tree --write-tree` per pair | avg 77 ms, max 107 ms |

Reading: real parallel branches on this repo almost never conflicted, and git's automatic
merge reproduced every recorded merge byte-for-byte. Filename overlap over-predicts 22:1
here — a tier-1 radar on overlap alone would be wrong 95% of the time on this history.
Tier-2 (`merge-tree`) costs ~80 ms per pair on a 75 MB repo: cheap enough for a 30 s tick
across dozens of branch pairs.

## B. Adjacent first-parent pairs rebuilt as parallel (`census-adjacent.sh`, all 281)

Same reconstruction as S5 (newer commit cherry-picked onto the older one's parent; merge
commits take their first-parent diff via `-m 1` — the first run without that flag logged 39
false conflicts).

| | MDRostering | muster (S5) |
|---|---|---|
| Adjacent pairs | 281 | 29 |
| Textually clean | 204 (73%) | 25 (86%) |
| Conflict | 77 (27%) | 4 (14%) |
| Pairs with filename overlap | 110 | 8 |
| Overlap → conflict precision | 70% | 50% |
| Conflicts touching only generated/lockfiles | 12 | 0 |
| Conflicts involving source | 65 | 0 (all docs) |

Hot files: `src/dist/index.html` (11 pairs) and hashed `src/dist/assets/*` — **committed
build output**; `pkg/api/server.go` (5, the route registration chokepoint);
`PersonnelTable.tsx`, `RosterList.tsx` (3 each). By extension: `.go` 40, `.tsx` 34,
generated `.map`/`.js`/`.html` 38.

Reading: consecutive commits by one developer on one branch collide far more often than
the real parallel branches did (27% vs 3%) — adjacency is a pessimistic model of
parallelism, so S5's "0 conflicts" and this 27% bracket the truth rather than contradict
it. The single biggest defusable class is committed build artefacts: a `.gitattributes`
`merge=ours`/regenerate rule (or not committing `dist/`) removes 12 of 77 conflicts and all
of the noisiest files; the per-repo suppression list in the design must be able to name a
*directory*, not just files. `server.go` is the code analogue of muster's `main.ts`: a
registration list that every feature appends to — the "restructure hot files append-only"
advice applies to code too.

## C. Gate census (`census-gates-any.sh`) — *in progress*

Verify = `go test` (excluding the two DB-backed integration packages) + `vitest run` +
`tsc --noEmit`, ≈ 30–60 s per tree; 803 vitest tests, tsc clean, 9 Go packages green on
`main`. Sample: all 33 clean-but-overlapping pairs (where a semantic collision is most
likely) + 27 random clean non-overlapping pairs = 60 merges, parents run on failure.
Results below.

**Result (60 merges, 1425 s total, ~24 s per gated tree).**

| | Gated | Green | Red (M and both parents) | Candidates |
|---|---|---|---|---|
| Clean pairs **with** filename overlap | 33 | 26 | 7 | **0** |
| Clean pairs without overlap (random) | 27 | 14 | 13 | **0** |

Every red row is all three trees red on the same thing: `src/App.test.tsx`
`ReferenceError: document is not defined` (37 of 40 parent logs; the rest Go tests of the
same era), for every pair with idx <= 120 (history 2025-02 to 2025-11), while every pair with
idx >= 160 is green. That is the old front-end test setup not running under today's
vitest/jsdom wiring, i.e. my environment, not those commits: the verify command is only
trustworthy for the last ~120 commits of this repo. Within that window, **0 semantic
conflicts in 40 textually-clean merges, 26 of them on pairs whose parents touched the same
files**, the exact place a "merges clean, breaks together" collision would live.

## Reading across both repos

- **Semantic (clean-merge-but-broken) conflicts did not occur** in 25 + 40 gated clean
  merges across two repos of different shape, including 26 same-file pairs. Budget the
  verify gate for catching individually-red lands (S5 finding 4), not cross-branch
  interference.
- **Textual conflict rates differ 2x** between repos (14% vs 27% of adjacent pairs) and are
  driven by hot files: docs here, committed build output plus a route-registration file
  there. The defuse policy is per-repo and must accept directories (`src/dist/`).
- **Real parallel branches conflicted far less than adjacent commits** (1 of 39 vs 27%): the
  reconstruction is a pessimistic bound. Overlap-as-signal precision swung from 5% (real
  merges) to 70% (adjacent pairs); tier-1 filename overlap is not a reliable warning on its
  own, and tier-2 `merge-tree` at ~80 ms/pair is what should drive the matrix.
- **A gate census, like a merge queue, is bounded by environment drift**: 20 of 60 merges
  here and 11 of 25 in S5 were "parent already red" for reasons unrelated to the merge. The
  queue's "run the target HEAD too" comparison is what keeps that from reading as a
  regression.

Artifacts: `~/.muster-spikes/s8-mdr/` (`real-merges.tsv`, `pairs.tsv`, `gates.tsv`,
`sample.txt`, `log-*`); refs `refs/census/<i>/*` in the clone.
