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

> **Superseded 2026-09-01** by "Revised stack (v2)" below, after the red-team debate.

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

## Experiment log — 2026-09-01, steps 1–3 verified on real history

Scratch-clone simulation: `move-tiles` (7f8a312) and `usage-model-bar` (a740fa3)
reconstructed as parallel branches off the common base 7f8a312^ (B rebuilt by
cherry-picking a740fa3 onto the base; the reconstruction itself conflicted in 2 files,
proving these adjacent plans would have collided had they truly run in parallel).

1. **Radar works and is cheap**: `git merge-tree --write-tree` between the branches ran
   in ~45 ms, exit 1, named the conflicting files. Crucially, only **2 of the 7
   overlapping files actually conflicted** (TODO.md, `web/src/main.ts`) — the other 5
   (SPEC.md, design-system.md, views.spec.ts, index.html, style.css) auto-merged.
   Overlap ≠ conflict: the radar has far fewer false positives than an Affected-Files
   warning, which would have flagged all 7.
2. **`merge=union` caveat sharpened**: with `TODO.md merge=union` the conflict
   disappears (merge-tree respects `info/attributes`) — but the result **duplicates the
   ticked line**, because TODO.md items are edited in place, not appended. Union is only
   safe for genuinely append-only files; hot doc files must be *restructured*
   append-only (or given a custom merge driver) before this defusing is applied.
3. **Land queue reproduces history byte-for-byte**: landing A (squash), rebasing B onto
   the new main, and resolving the 2 conflicts with the historically-correct content
   yielded a tree **identical to the real a740fa3 tree** (`git diff --stat` empty). The
   serialized rebase-resolve-land flow loses nothing.
4. **rerere replays**: with `rerere.enabled` + `rerere.autoUpdate`, a second branch
   hitting the same conflicts rebased with zero unresolved files — resolutions recorded
   once, replayed automatically, retry tree also matched history. rr-cache is in the
   shared `.git`, so this covers all worktrees.

No blocking issue found; mechanics validated. Ground truth exists for the resolver
probe: a blind agent resolution of this pair's conflicts can be diffed against a740fa3.

## Experiment log — 2026-09-01, step 4: resolver probes + red-team debate

### Blind resolver probes (measured, Opus)

Two clean-room repos were frozen at the identical conflicted rebase (usage-model-bar
onto move-tiles' main; history stripped so ground truth could not leak). One resolver
got both `plan.md`s; the other got only the diff/commit messages (plans/ removed).

- **Both scored 100%** — byte-identical to the real historical resolution on both
  `TODO.md` and `web/src/main.ts` — and both independently detected and correctly
  repaired a construction defect in branch B (an orphaned callback body missing its
  `installTileDrag(` opener; an artifact of the reconstruction script, noted honestly).
- **Caveat (adversary's, valid):** this weakens but does not kill the "plan context is
  the differentiator" claim — the pair was textually gnarly yet *semantically disjoint*,
  and a conflict reconstructed from history is one a model can pattern-match. The probe
  says nothing about conflicts whose correct answer isn't recoverable from either diff.

### Red-team debate (Opus advocate vs Opus adversary, one rebuttal round + verdicts)

Six ranked attacks; final verdicts: **all six absorbed by amendments, none fatal**, one
adversary claim retracted (orchestrate SKILL.md churn is 1/13 squashes, not 6/12 — its
edits are serial main-session retro commits). The advocate's three concessions — real
flaws in the v1 stack:

1. **"Resolution re-enters the gates" was a false floor.** `/land` step 4 runs *zero*
   gates today, and no gate reads the churn-dominant files (per-squash: `TODO.md`
   13/13, `SPEC.md` 12/13, `docs/protocol.md` 9/13). A semantic collision between two
   textually disjoint plans (state-machine change vs sort-rule change) passes every
   suite; the impl/test boundary rules guarantee nobody writes the crossing test.
2. **"Bounce to the owning session" named a rung that essentially never exists** —
   subagents are gone at land time, the orchestrator is a main-session skill, and
   CLAUDE.md's boundaries make no single agent legal for a conflict spanning
   `internal/` and `web/e2e/`.
3. **v1 stack item 1 was two mistakes in one line**: `rerere.autoUpdate` silently
   re-stages a gate-rejected resolution on the queue's own retry (non-idempotent), and
   `merge=union` is wrong for the hottest file.

### Revised stack (v2) — carries all debate amendments

1. **`/land` runs gates**: `make check && make e2e` on the rebased tree *before* the
   squash. Everything else assumes this floor exists.
2. **Bind approval to a tree**: `orchestration-state.json` gains `base_sha`,
   `reviewed_tree`, `parent_branch`. Post-rebase, `git diff <reviewed_tree> HEAD` is
   the delta no reviewer saw — empty ⇒ approval stands; non-empty ⇒ review scoped to
   that diff only. (Adversary caveat: with TODO/SPEC in ~every squash, the non-empty
   path is the *default*, not the exception — budget scoped review per land; it is
   still gate-minutes + small review, not O(N²) Opus-hours.) Stacked plans rebase with
   `git rebase --onto main <parent-tip> plan/<child>`, killing the spurious-conflict
   class squash-landing a parent otherwise creates.
3. **Defuse hot files narrowly**: `merge=union` ONLY for genuinely append-only files
   (e.g. `spikes/canary-fields.md`), never `TODO.md`. TODO.md: new backlog entries go
   to `TODO.d/<plan>.md` fragments; the file stays plain 3-way (in-place ticks on
   different lines merge cleanly; same-line ticks *should* conflict for a human); the
   queue **refuses to auto-resolve TODO.md when base→ours is a permutation** — the only
   rule in the exchange that protects the priority ordering. Folding fragments back
   into TODO.md stays a *human* step, never the queue's. `make doc-check` (grep-level:
   triage `issues/N` links, no duplicates, priority paragraph, changelog dates) folds
   into `make check` — note it cannot see a permutation, so it depends on the
   refusal rule; the two are load-bearing on each other.
4. **rerere: `enabled=true`, `autoUpdate=false`.** The queue `git add`s deliberately,
   records rr-cache ids per path at stage time, `git rerere forget`s them on gate
   failure, and logs every replay. ~15 lines of queue code.
5. **Two-tier radar**: tier 1 live (~30 s): per-worktree `git status --porcelain` +
   `git diff --name-only HEAD`, pairwise filename intersection, warn-only — closes the
   blind window while an agent step is mid-flight; **suppress known-hot benign files**
   (TODO.md/SPEC.md) or it cries wolf on every pair. Tier 2 on commit: `merge-tree`,
   authoritative, cells labelled `stale` vs `colliding` against the merge base.
6. **Serialized land queue** with escalation: rerere replay → `/orchestrate <plan>
   --resolve` (re-enters the plan's own context/roles/gates via the resume path — this
   replaces the dead "owning session" rung) → dedicated `merge-resolver` agent role,
   boundary-exempt for conflict hunks only, permitted to emit only content present in a
   parent or a mechanical composition of both (adversary caveat: "mechanical
   composition" needs per-file-class teeth — union is mechanical and still corrupts an
   in-place tick) → human. Resolved merges re-enter gates **plus** a scoped review over
   the union hunks and both plans' Requirements.
7. **Affected-Files overlap warning** at plan approval, warn-only (unchanged).

Open items before any of this reaches `SPEC.md`: the four debate caveats above, and
sizing `/orchestrate --resolve` against the existing resume machinery.

## Generalization — muster feature vs. this repo's adapter (2026-09-01)

Correction from Damian after step 4: the debate drifted repo-specific. Worktree
conflict handling is a **muster feature** — target repos will NOT have plans/,
/orchestrate, review.md, TODO.md conventions, or our gates. Re-cut of stack v2:

### Muster core (any repo, pure git + sessions)

- **Two-tier radar** — tier 1 (`git status --porcelain` + `git diff --name-only HEAD`
  per worktree, filename intersection), tier 2 (`merge-tree` between branches).
  Dashboard conflict matrix, `stale` vs `colliding`. Per-repo config: benign-file
  suppression list (here TODO.md/SPEC.md; elsewhere e.g. CHANGELOG, lockfiles).
- **Merge queue** — serialize: rebase → run the repo's configured **verify command**
  (here `make check && make e2e`; elsewhere `npm test`; empty = none) → merge
  (squash/merge/rebase configurable). `--onto <parent-tip>` for stacked branches.
  Queue records the tree the verify ran on; UI flags "verified tree ≠ merge tree".
- **rerere wrapper** — `enabled=true`, `autoUpdate=false`, record rr ids at stage,
  forget on verify failure, log replays. Nothing repo-specific in it.
- **Resolution escalation ladder** — and here the debate's A4 finding *inverts*:
  in the pipeline the owning agent is dead by land time, but in general muster usage
  **the owning session is a live tmux session the daemon already manages**. So the
  generic ladder is: (a) rerere replay → (b) **hand the conflict to the owning
  session** (daemon injects a "your branch conflicts with X on these files" prompt —
  the session has the task in context; this is muster's natural differentiator and
  no surveyed tool does it) → (c) spawn a resolver session fed per-branch task
  context → (d) human via dashboard. "Bounce to owner" is dead only in *our*
  pipeline; for the product it's the primary rung.
- **Task context for resolvers** — the generic analog of "plans": session titles,
  branch commit messages, and session prompt history. ⚠ Constraint: hook payloads
  carry prompt text and must never be logged world-readable (CLAUDE.md hard rule);
  feeding a resolver session context must respect that boundary — likely via the
  transcript path handed to a spawned session, not via stored copies.

### This repo's adapter (conventions, not musterd features)

Affected-Files overlap warning at plan approval; review.md/`reviewed_tree` approval
binding and the scoped re-review; `make doc-check`; `TODO.d/<plan>.md` fragments and
the permutation-refusal rule; `/orchestrate <plan> --resolve`. These consume muster's
generic hook points: pre-merge command, verify command, resolver-context provider,
per-repo hot-file policy. The pipeline is one consumer of the feature, not its shape.

## Muster-core v1 shape — session discussion 2026-09-01 (continued)

Damian: a dedicated **integration session** for queueing merges is acceptable — user
opt-in at repo setup. Feature to be fully defined now; build order/timing is a later
discussion.

### Settled direction

- **Queue driver fork**: recommend **daemon-driven queue, session-on-demand** — the
  queue is a daemon state machine (`queued → rebasing → verifying →
  awaiting-resolution/confirm → merging → done/failed`) doing git plumbing free and
  deterministically; the integration session is summoned only for judgment (conflict
  resolution, verify-failure diagnosis). Alternative (session runs the whole queue,
  like /land today) burns tokens on mechanics and makes queue reliability an LLM
  property. Integration session default = summonable; "persistent" is an opt-up.
- The integration session resolves the earlier "defer rung (c)" — muster launches
  sessions natively, so the resolver is just a session with a role, not new machinery.
- Queue never operates in a live session's worktree (git also refuses same branch in
  two worktrees): it works in its own integration worktree after an ownership handoff.
- "Ready to integrate" is a **branch** state set from the dashboard, decoupled from
  the session (session may live on for follow-ups).
- Empty verify command ⇒ merge requires explicit dashboard confirm (resolution diff
  shown); green verify ⇒ auto per config.
- Escalation ladder v1: rerere replay → owning session (dashboard-triggered inject
  when idle) → integration session → human. Auto-inject is a later opt-in policy.
- Deferred: rerere forget-wrapper (matters only once automation resolves), full
  merge-style generality (squash + merge suffice), queue-order optimization.

### To define next (requirements inventory — each a future spec section)

1. Integration session spec: lifecycle, own worktree, role prompt, permission mode,
   model choice/cost controls, failure handling (dies mid-resolution → daemon aborts
   rebase, entry failed, tree clean).
2. Queue data model: entries/states, SQLite persistence, one queue per repo; user
   controls reorder/cancel/retry/pause.
3. Entry + exit semantics: how a branch is marked ready; post-land worktree policy
   (auto-remove / keep / ask).
4. Per-repo config schema: verify command + timeout, merge style, **push policy**
   (auto vs hold — here a push cuts a release), suppression list, auto vs confirm.
5. Conflict→owner handoff loop: prompt template, idle detection, re-enqueue after
   owner resolves.
6. Undo story: record pre-merge main SHA per land; "revert this land" action —
   trust requires one-click undo.
7. Protocol delta: WS (queue state, conflict matrix) + REST (enqueue, reorder,
   confirm, send-to-owner). Plan-time detail.
8. Resolver context sourcing without violating the never-log-prompt-text rule
   (transcript paths + commit messages, never stored copies).

### Additional ideas (this round)

- **Post-land freshness sweep**: after each land, recompute the matrix and flag each
  remaining session whose touched files changed — "main moved; you now conflict on X."
  Automatic "rebase early" nudge while owner context is hottest. Core-worthy.
- **Conflict preview**: clicking a red matrix cell shows the actual conflict hunks
  (merge-tree yields the conflicted blobs) — decide *which side should move* from the
  dashboard.
- **Queue-order suggestion** from the pairwise matrix (land conflict-free first).
  Deferred nice-to-have.
- **Ownership tracking rides Claude Code's native worktree hooks**
  (`WorktreeCreate`/`WorktreeRemove`, SPEC §4.2 preference) — no bespoke registration.
