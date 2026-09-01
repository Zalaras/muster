# Worktree conflict handling — research & options

Research/discussion session 2026-09-01. Post-v1 groundwork for the worktree manager
(SPEC §4.2). Creating worktrees and assigning sessions is the easy half; this note is
about the hard half — **several worktrees touching the same files without knowledge of
each other until merge time**. Nothing here is decided; this is the option analysis and
external survey to build on over the next few sessions. When decisions land, they go to
`SPEC.md` per the usual changelog rule.

Context specific to this repo (but the design should generalize into muster):

- Plans run on `plan/<name>` branches; `/land` squash-merges serially, and already uses
  `git merge-tree --write-tree` for no-checkout merge inspection.
- Plans carry an **Affected Files** manifest — machine-readable overlap data exists.
- The predictable hot files are docs, not code: `TODO.md`, `SPEC.md` changelog,
  `docs/protocol.md`, `web/e2e/helpers/*`, plus a few code chokepoints (state machine,
  routes, `web/src/main.ts`).

## Damian's three ideas

### 1. Cross-worktree session manager that talks to each orchestrator

- **Pros:** musterd already *is* the cross-session daemon — the natural home; the only
  fully proactive option; real-time, could prevent wasted work before it happens.
- **Cons:** steering a mid-pipeline LLM orchestrator is fragile (what should it do with
  "someone touched your file" mid fix-wave?); anything lock-shaped risks stalls or
  deadlock; sees only textual overlap, not semantic conflicts; the "talks to the
  orchestrator" half is bespoke to this setup.
- **Assessment:** keep the **observation** half, drop the **control** half — the daemon
  watches and surfaces signals (see conflict radar below); agents and the human act on
  them. Signals, not commands. No surveyed tool does even the observation half.

### 2. Merge-time resolver agent armed with plans + commits

- **Pros:** zero coordination overhead; most parallel branches never conflict, so cost
  is paid only on collision; and it fills a genuine gap — every tool with an "AI
  resolve" button (Conductor, Vibe Kanban, Sculptor, Orca) feeds it **only the diff**;
  none feed the original task context by default. Muster's plans are exactly that
  context, and generally the daemon knows every session's task/prompt.
- **Cons:** purely reactive; the dangerous failure is the *semantic* conflict that
  resolves cleanly but is wrong — so a resolved merge must re-enter the gates
  (`make check` + e2e); resolution alone is never "done". Plan-based flavor is
  repo-specific but generalizes to "task context per branch".
- **Assessment:** the workhorse. Refinement from the survey: prefer bouncing conflicts
  to the **owning agent/session** (which has the task in context) over a third-party
  resolver — the "abort-don't-guess" pattern (funador's queue; Cursor community warns
  explicitly against third-agent resolution).

### 3. Partition files at plan time

- **Pros:** the cheapest conflict is the avoided one; Affected Files manifests already
  exist, so the data is free.
- **Cons:** the full version needs all in-flight plans in view; predicted file sets
  drift from actual; over-constrains parallelism to prevent rare collisions.
- **Assessment:** skip the full version (Damian leans against it; agreed), but the
  lightweight one is nearly free: `/plan-work` (or the daemon) diffs a new plan's
  Affected Files against in-flight plans' manifests and **warns, never blocks**.

## Additional ideas (Claude)

- **Conflict radar** — the muster-shaped feature. `git merge-tree --write-tree`
  computes conflicts between any two branches with **no checkout** (`/land` already
  uses it). The daemon periodically runs it pairwise across in-flight `plan/*` branches
  and vs `main`; the dashboard shows a conflict matrix and escalates the moment two
  plans start colliding, while context is fresh. Textual conflicts only. Open niche —
  ships in no surveyed tool (only Sculptor's auto-flagging and Overstory's
  `merge --dry-run` gesture at it).
- **Serialized land queue with rebase-and-revalidate.** Extend `/land`: rebase onto
  fresh `main`, resolve conflicts (idea 2's resolver), re-run gates, squash-merge; next
  branch repeats. Industry pattern (GitHub merge queue / bors) and the only mechanism
  that catches "both pass alone, fail together". Cost: landing is serial and each land
  re-runs e2e.
- **Structurally defuse the hot files first.** Most conflicts here will be doc-upkeep,
  not code: `merge=union` in `.gitattributes` for append-only files, changelog-style
  appends, per-plan directories (already the case for `plans/`). Kills the most
  frequent conflicts for free and de-noises the radar.
- **Turn on `git rerere`.** The rr-cache lives in the shared `.git`, so recorded
  resolutions replay across all worktrees automatically — ideal when every open branch
  rebases over the same landed change. One config line.

## Recommended stack (tentative, not yet decided)

1. Defuse hot files + `git rerere` (free, do first).
2. Conflict radar in musterd (daemon watches, dashboard warns).
3. Serialized land queue, with the plan-aware resolver (idea 2) inside it; conflicts
   bounce to the owning session first, third-party resolver as fallback; resolved
   merges re-enter the gates.
4. Lightweight Affected-Files overlap warning at plan approval (idea 3, warn-only).

Idea 1 survives as the radar; full plan-time partitioning is dropped.

## Survey — what other tools do (2026-09-01)

Headline: almost everyone treats worktree isolation itself as "the conflict solution"
and is purely reactive at merge; the emerging default is an "AI resolve" button over
the conflicted diff. **No tool feeds original task context into resolution by
default**, and **no tool ships live cross-worktree overlap warnings** — the two gaps
muster is positioned to fill.

Named patterns found:

1. **Isolation-as-solution (punt)** — merge left to raw git: claude-squad,
   container-use, uzi, Codex cloud, Orca, Crystal.
2. **Partition up front** — disjoint dirs/file sets, "you own these dirs" prompt
   scoping, overlap-zone registry. Convention-only everywhere; no tool enforces it
   (Conductor guidance, Cursor practice, Autonoma writeup).
3. **Rebase from main early and often** — first-class "pull main into worktree" step
   so drift never accumulates (Crystal, Vibe Kanban, universal advice).
4. **Serialize the merges** — parallel generation, sequential merging; real FIFO
   queues in funador/claude-code-merge-queue and Overstory; discipline elsewhere.
5. **Agent resolves, diff-context only** — Vibe Kanban's "Resolve Conflicts" button
   (best shipped UX: rebase-conflict state machine, agent prompt, manual fallback,
   abort protection), Conductor's editable `/resolve-merge-conflicts`, Sculptor's
   hand-back, Orca's "Resolve with AI", Haack's skill.
6. **Abort-don't-guess, retry by owner** — auto-abort conflicted rebases, resolution
   goes to the owning agent (funador).
7. **Escalation ladder** — clean → git 3-way → structural merge (Mergiraf) → AI
   resolve → redo the work → human (Overstory).
8. **Shared-tree instant detection** — GitButler virtual branches: no worktrees, edits
   auto-routed to per-session branches, overlap visible immediately; same-file parallel
   writes are its admitted failure mode.
9. **Conflicts as data, deferred resolution** — Jujutsu (jj): conflicts are
   first-class in-commit objects, merges never block, resolve at review time; the only
   model where overlap is a normal representable state.
10. **Best-of-N — don't merge at all** — N agents, same task, keep one branch (Cursor,
    uzi, Orca fan-out). Orca variant: hunk-level checkboxes compose a winner from N
    worktrees into a fresh merge worktree, human as the merge function.
11. **Pre-merge conflict preview** — only Sculptor's auto-flagging and Overstory's
    `merge --dry-run`; live overlap warnings across *running* worktrees exist nowhere.

Notable per-tool details worth remembering:

- **Orca ADE**: "Resolve with AI" next to "Review conflicts" on any
  merge/rebase/cherry-pick conflict; 3-pane diff with per-hunk checkboxes; diff
  annotations batched back to the owning agent (a lighter alternative to resolving —
  make the branch owner rework it).
- **Anthropic's official worktrees doc** covers isolation enforcement, cleanup,
  `.worktreeinclude` — and is silent on merging.
- Marketing-level claims (Sculptor's auto-flagging, Orca's cross-agent hunk
  composition) are not publicly documented at implementation level.

## References

- Vibe Kanban rebase-conflict flow (best shipped reactive UX):
  <https://vibekanban.com/docs/core-features/resolving-rebase-conflicts>
- Phil Haack — Mergiraf + agent-skill layered resolution:
  <https://haacked.com/archive/2026/03/25/resolve-merge-conflicts/> · <https://mergiraf.org/>
- funador/claude-code-merge-queue (local FIFO land queue, abort-don't-guess; closest
  in spirit to what musterd could own):
  <https://github.com/funador/claude-code-merge-queue>
- Overstory escalation-ladder queue: <https://github.com/jayminwest/overstory>
- GitButler parallel Claude sessions: <https://blog.gitbutler.com/parallel-claude-code>
  · <https://trigger.dev/blog/parallel-agents-gitbutler>
- jj first-class conflicts: <https://jj-vcs.github.io/jj/latest/conflicts/> ·
  <https://wavect.io/blog/git-worktrees-vs-jujutsu-ai-coding-agents/>
- Autonoma — proactive strategies (frozen base snapshots, disjoint file sets,
  overlap-zone registry, serialize + behavioral verify):
  <https://getautonoma.com/blog/parallel-ai-agent-prs>
- Orca ADE review/merge docs: <https://www.onorca.dev/docs/review/commit-push> ·
  <https://www.onorca.dev/docs/review/diff-viewer>
- Claude Code official worktrees doc (isolation only, no merge story):
  <https://code.claude.com/docs/en/worktrees>
