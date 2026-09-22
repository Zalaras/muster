# S9 — Team-repo census: SPANDigital/presidium-services (measured 2026-09-07)

**Why.** S5 and S8 were one-person repos. presidium-services is a real team codebase: Go
services, 3,933 commits from 71 authors over 2017–2026, 1,351 first-parent commits on
`develop` (the integration branch; `main` is production), 372 real merges there, 128
remote branches (113 not yet merged). Cloned read-only with `gh` to
`~/.muster-spikes/s9-presidium/repo`; two tracked files that look like secrets (`.env`,
`build/bin/secret.sh`) were never opened — nothing here needs them.

## A. Real merges on `develop` (`census-real-merges.sh`, 372)

| | |
|---|---|
| `merge-tree` clean | 328 (88%) |
| conflict | 44 (12%) |
| … of which only `VERSION` / generated / version files | 18 |
| parents with filename overlap | 77 (57% of those actually conflicted) |
| recorded tree ≠ merge-tree result on clean merges | 0 |
| `merge-tree` per pair | avg 106 ms, max 860 ms (210 MB `.git`) |

Hot files: `VERSION` (21 of 44 conflicts — a release-number file bumped on every branch),
`web/static/version` (7), `.travis.yml` (4), then real code: `authz/authorization.go`,
`api/middleware.go` (4 each). Conflict rate by year: 2024 8/89 (9%), 2025 9/51 (18%),
2026 10/37 (27%) — rising as merges per year fell, consistent with fewer, larger,
longer-lived branches.

## B. Live matrix: 113 unmerged branches vs `develop` (`branch-matrix.sh`)

> **Correction (Damian, 2026-09-07):** most of these open branches are ancient and abandoned,
> not work anyone is doing. They are evidence for the cleanup sweep and nothing else. Design
> conclusions about concurrency should rest on **merged branches (section A), the real-merge
> replay (S10), and the recent-and-current subset in section C** — not on this table.

| Tip age | Branches | Conflict with `develop` |
|---|---|---|
| < 30 days | 18 | 6 (33%) |
| 30–90 days | 8 | 4 |
| 90 days – 1 year | 57 | 52 (91%) |
| > 1 year | 30 | 27 (90%) |

Median commits behind `develop`: clean branches 45, conflicting branches 717. Only 5 of the
89 conflicts are generated-files-only; 84 involve hand-written code. Hottest files across
the matrix: `pkg/api/handler.go` (35 branches), `pkg/config/model.go` (22),
`pkg/config/config.go` (20), `pkg/api/spec.gen.go` (17, generated OpenAPI),
`repo_mock.go` (16, generated mocks), `pkg/api/server.go` (15). 154 ms per cell.

Reading (with the correction above): **staleness, not concurrency, is what the matrix mostly shows** — and staleness here means abandonment. 87 of 113
unmerged branches are older than 90 days and 79 of them conflict — that is the "abandoned
trees for cleanup" case from SPEC §4.2 measured on a real team, and it says the matrix must
label cells `stale` (behind by hundreds, conflict is a rebase debt) separately from
`colliding` (fresh branch, genuine overlap), or the 24 live branches drown in 89 red cells.

## C. Pairwise among the 26 branches active since 2026-06 (`branch-pairwise.sh`)

325 pairs, 44 s total. Headline **171 conflict** — but 165 of those involve a branch that
is itself already stale vs `develop`; six stale branches each conflict with 20–24 of the
other 25 purely by carrying an old `develop`. Restrict to the **16 branches that are both
recent and clean vs `develop`** — the realistic "concurrent worktrees" population:

| | |
|---|---|
| pairs | 120 |
| conflict | **6 (5%)** |
| … dependabot `go.mod`/`go.sum` pairs | 5 |
| … generated-only | 1 |
| genuine hand-written collision between two live branches | **0** |

Hottest files among all pairwise conflicts: `spec.gen.go` (67 pairs), `postgres/articles.go`
(35), `repo_mock.go` (33), `handler.go` (24). Two of the top three are generated — a
regenerate-on-merge rule (or not committing them) removes the noisiest cells outright.

Reading: on a real team's live branches, **two in-flight pieces of work almost never collide
with each other once both are current with the integration branch.** What collides is
(1) branches that fell behind, (2) generated files, (3) dependency bumps. All three are
mechanical: rebase nudges, regenerate/`merge=ours`, and a lockfile policy. The
"cross-worktree conflict radar" earns its keep mainly as a **staleness and hot-file
monitor**, and the resolver rungs (S4/S6) are for the rare remainder.

## D. Adjacent first-parent pairs rebuilt as parallel (`census-adjacent.sh`, 1,349)

| | presidium | MDRostering | muster |
|---|---|---|---|
| Adjacent pairs | 1,349 | 281 | 29 |
| Textually clean | 1,077 (79%) | 204 (73%) | 25 (86%) |
| Conflict | 272 (21%) | 77 (27%) | 4 (14%) |
| Overlap → conflict precision | 67% | 70% | 50% |
| Conflicts that are only `VERSION`/generated/deps files | **107** (88 = `VERSION` alone) | 12 | 0 |
| Conflicts involving hand-written files | 165 | 65 | 0 |

Other hot files: `.travis.yml` (14), `store/db.go`, `manifests/config.yml`,
`.github/workflows/ci.yml` (8 each), `web/static/version` and `spec.gen.go` (7 each).

Reading: the same pattern at three sizes. A fifth to a quarter of adjacent commits would
conflict if made in parallel; overlap predicts that with ~⅔ precision; and on every repo a
large, mechanical slice is one or two "everyone touches it" files — here a release-number
file that should never be edited on a feature branch at all. Per-repo hot-file policy
(suppress, `merge=union`/`ours`, regenerate, or "bot-owned, never hand-edited") is the
single highest-leverage defusing step, and it is knowable from history before the first
worktree is created: the daemon can compute this table for a repo in minutes.

## E. Gate census (`census-gates-any.sh`, compile + vet)

Tests need Docker (Postgres + Elasticsearch; `make test` is `go test -p 1` against them) and
Docker is not running on this machine, so the gate here is **compile + vet**:
`go build ./... && go vet ./...` — 14 s warm build, 23 s vet — which catches the
rename/signature/duplicate-symbol class of "merges clean, breaks together". Sample: all
clean-with-overlap pairs plus random others, parents run on failure, as in S8.

**Runs.** Batch 1: 60 pairs across all eras (45 clean-with-overlap + 15 random) → 5 green,
55 red with every parent equally red: pre-2019-08 history has no `go.mod`; 2019–2023 fails
to build on Go 1.26; 2024–early-2025 fails only `go vet`'s newer `lostcancel` check. Batch 2:
all 26 clean-with-overlap pairs from 2024 onward with `-lostcancel=false` → 16 green, 10 red
on one more analyzer (`copylocks` on a 2024 generated mock), parents identical. 577 s.

| | |
|---|---|
| Distinct textually-clean merges that built and vetted | **18** |
| … on pairs whose parents touched the same files | **16** |
| Semantic-conflict candidates (parents pass, merge fails) | **0** |

## Reading across all four repos

| | muster | MDRostering | presidium | 
|---|---|---|---|
| Real merges: conflict rate | — | 1/39 | 44/372 (12%; 18 are `VERSION`/generated) |
| Adjacent pairs: textual conflict | 14% | 27% | 21% |
| Overlap → conflict precision | 50% | 70% | 67% (real merges 57%) |
| Live branches concurrent & current: pairwise conflict | — | — | 6/120, 0 hand-written |
| Gated clean merges → semantic conflicts | 25 → 0 | 40 → 0 | 18 → 0 |

1. **Semantic conflicts between textually-clean merges: 0 in 83 gated merges** across
   three repos, 42+ of them on same-file pairs. The verify gate's job is individually-red
   lands and environment drift, not cross-branch interference. Stop budgeting for the latter.
2. **Staleness is the dominant red.** 79 of 87 presidium branches older than 90 days conflict
   with `develop`; live, current branches almost never conflict with each other. The matrix
   needs `stale` vs `colliding` cells, a rebase nudge, and the §4.2 abandoned-tree sweep.
3. **Hot files are mechanical and knowable from history**: `VERSION` (88 + 21 conflicts),
   generated OpenAPI/mocks, lockfiles, a route handler, config. The daemon can compute a
   repo's hot-file table in minutes (these scripts) and propose the defuse policy.
4. **Gates rot with the toolchain**: 86 of 86 non-green trees here were toolchain drift.
   A queue must compare against the target's HEAD under the same toolchain, and a retry
   absorbs the flakes seen in S5.

Artifacts: `~/.muster-spikes/s9-presidium/` (`real-merges.tsv`, `branch-matrix.tsv`,
`pairwise.tsv`, `pairs.tsv`, `gates-batch1.tsv`, `gates.tsv`, `log-*`).
