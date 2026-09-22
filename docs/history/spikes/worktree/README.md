# Worktree-conflict spikes — isolation rules and index

Seven spikes proposed 2026-09-06 from `docs/design/worktree-conflicts.md` §"Open decisions".
They run **beside** a live `/orchestrate v1-cleanup` pipeline that has priority. Everything
here is designed so the pipeline cannot notice us.

## Isolation rules (binding for every spike)

1. **Never work in the primary checkout** (`Projects/muster`, on `plan/v1-cleanup`). All
   spike edits happen in this worktree (`Projects/muster-spikes`, branch
   `spike/worktree-conflicts`, off `main`). Never `checkout`/`switch`/`stash`/`commit`
   there. Reads of it are allowed only as `git --no-optional-locks …` (no index writes,
   no `index.lock` races with the pipeline's git).
2. **Scratch repos, logs, sockets live in `~/.muster-spikes/<spike>/`** — outside
   `~/Documents` so Claude Code never inherits Muster's or Damian's CLAUDE.md, and outside
   `/tmp` so a week-long log survives the periodic cleaner.
3. **tmux only via a private socket path**: `tmux -S ~/.muster-spikes/<spike>/tmux.sock`.
   Never `-L muster`, never the default server. Kill the server at the end of each run.
4. **Ports**: probe rig owns 8780–8789 (`test/rig/newprobe.sh`); everything else binds
   `127.0.0.1:0` and reads the port back. 5000/7000 are AirPlay.
5. **Real Claude launches** (spikes 1, 4, 6) burn the subscription the pipeline is also
   using: `--model claude-haiku-4-5-20251001`, trivial prompts, torn down when done.
   **Deferred until `plans/v1-cleanup/orchestration-state.json` reads `completed`**,
   except spike 1's single headless probe.
6. **Playwright / `make e2e` runs** (spike 5's gate phase) also wait for the pipeline —
   its `e2e-validate` step is timing-sensitive. When they do run: `nice -n 19`,
   one worker.
7. Never read or modify `~/.claude/settings.json`; never set `CLAUDE_CONFIG_DIR` for a
   session that must reach the API. Never log hook payloads world-readable.

## Spike index

| # | Spike | Question it settles | LLM? | Status |
|---|-------|---------------------|------|--------|
| 1 | Native worktree hooks probe | Do `WorktreeCreate`/`WorktreeRemove` fire, and what does `--worktree` do, on the installed binary? | 3 Haiku turns | **done** → `S1-worktree-hooks.md` |
| 2 | Passive tier-1 radar | Is live filename-intersection signal or noise on real worktrees; what suppression list? | none | ran 2026-09-06→07, stopped on request; 4,986 samples in `~/.muster-spikes/radar/samples.jsonl`, 0 overlap between the two muster worktrees (expected: the spike only adds files); `radar-analyze.sh` to read; needs real parallel work to say more |
| 3 | Daemon-driven queue prototype | Can rebase→verify→squash be a deterministic, restart-safe state machine with no LLM? | none | **done** → `S3-queue.md`, code in `s3-queue/` (11 tests + 7-point crash matrix pass, re-run independently) |
| 4 | Owner-handoff | Does injecting "your branch conflicts with X" into an idle owning session yield a correct rebase and a clean tree on failure? | 4 Haiku sessions | **done** → `S4-owner-handoff.md` |
| 5 | Semantic-conflict census | Among landed squash pairs, how many pass alone but fail together? | none (gates only) | step 1 **done** → `S5-census.md`; step 2+3 **done** (0 semantic conflicts in 25 pairs; 4 repo findings incl. 3 flaky tests) |
| 6 | Adversarial resolver probe | Does task context beat diff-only when the answer is not recoverable from either diff? | 6 Haiku runs | **done** → `S6-resolver.md` (ctx 3/3, diff 2/3) |
| 8 | Second-repo census (MDRostering) | Do the muster-history numbers hold on a larger, differently-shaped repo? | none | **done** -> `S8-mdrostering.md` (39 real merges: 1 conflict; 281 adjacent: 27% textual; 0 semantic in 40 gated) |
| 9 | Team-repo census (presidium-services, 71 authors) | Do the findings hold on a real team repo with live branches? | none | **done** -> `S9-presidium-services.md` (372 real merges 12% conflict; 113 live branches: staleness dominates; 0 hand-written collisions among current branches; 0 semantic in 18 gated) |
| R | Literature & industry check | Does published data support or contradict S5/S8/S9's claims? | none | **done** -> `research-merge-conflicts.md` (20 sources; semantic-conflict rate scales with team size; agent PRs conflict 20–42%; Clash is prior art) |
| 10 | Rebase-on-base-change replay | Does rebasing whenever the base moves reduce conflicts? | none | **done** -> `S10-rebase-replay.md` (no: 2–6× the resolved volume, same-size episodes, earlier; 3/44 vanish) |
| 7 | Undo / push-policy | What does "revert this land" need, including after a release-cutting push? | none | **done** → `S7-undo.md` |

Findings for each go in `spikes/worktree/S<N>-<name>.md` in this worktree; the roll-up
lands in `docs/design/worktree-conflicts.md` when the branch is merged, after the pipeline.

## Guards

`s4-owner/run.sh`, `s6-resolver/run.sh` and `census-gates.sh` read
`plans/v1-cleanup/orchestration-state.json` from the primary checkout (a plain file read)
and refuse unless `status` is `completed`. Override only deliberately:
`MUSTER_SPIKES_ALLOW_LLM=1` (4, 6) / `MUSTER_SPIKES_ALLOW_E2E=1` (5).

## Where the conclusions live

Roll-up and the proposed implementation: `docs/design/worktree-conflicts.md`, sections
"Spike results — 2026-09-06/07" and "Proposed implementation — discussion 2026-09-07".
Literature check: `research-merge-conflicts.md`. Per-spike detail: `S<N>-*.md`.
