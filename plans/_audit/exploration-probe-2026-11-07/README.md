# Exploration probe — Haiku vs Opus on "does this helper already exist?" (2026-11-07)

Question: does pinning exploration to Haiku lose findings? Ground truth: ten cycle-1
maintainability Majors of the "Reuse before add" kind, each naming an existing helper the
implementer failed to find. For each, the pre-plan commit (`<landed>^`) was checked out in a
detached worktree and the same read-only brief (`run_probe.py`, `probe_cases.json`) was put to
Haiku and to Opus, three passes each, `--max-turns 30`, tools Read/Grep/Glob/read-only Bash.

| Model | Correct, 30 runs | Correct in all 3 passes | Median turns | Median secs | Avg cache reads / run | Avg output / run | List cost / run |
|---|---|---|---|---|---|---|---|
| Haiku | 28 / 30 | 8 / 10 | 5 | 12 s | 137,632 | 1,517 | $0.006 |
| Opus | 26 / 30 | 7 / 10 | 4 | 14 s | 149,238 | 982 | $0.183 |

Both models missed on the same three cases (c01 action button, c02 atomic write, c09 list
decoder); seven cases were found by both in every pass. Token volumes are nearly equal because
the cached prefix (CLAUDE.md, nested files, tool definitions: ~140k tokens per run) dominates.

Caveats: closed "find the owner" questions with task descriptions written by someone who knew
the answer, not open-ended exploration; n = 10 cases; list prices, not the subscription's
unpublished weighting. Read as: for targeted lookups in this repo, Haiku found at least as much as
Opus at roughly 30× lower list price; it is not evidence about open-ended exploration or about
reasoning over what it found.
