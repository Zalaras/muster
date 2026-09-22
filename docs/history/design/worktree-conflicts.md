> Frozen 2026-09-12; the decisions are ADRs: `go run ./tools/kb ls --type adr | grep -E 'worktree'`.
> Narrative kept for provenance; nothing here is current guidance.

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
- The predictable hot files are docs, not code: `TODO.md`, `docs/history/spec-changelog.md`,
  `docs/protocol.md`, `web/e2e/helpers/*`, plus a few code chokepoints (state machine,
  routes, `web/src/main.ts`).

## The developer's three ideas

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
- **Assessment:** skip the full version (the developer leans against it; agreed), but the
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
   (e.g. `docs/history/spikes/canary-fields.md`), never `TODO.md`. TODO.md: new backlog entries go
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

Correction from the developer after step 4: the debate drifted repo-specific. Worktree
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

The developer: a dedicated **integration session** for queueing merges is acceptable — user
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

### Status at end of 2026-09-01 session

**Decided (the developer):**
- Worktree conflict handling is muster-core, generic; this repo's pipeline is one
  adapter/consumer.
- An integration session for the merge queue is acceptable, user opt-in at setup.
- **Queue is daemon-driven** (state machine in musterd, git plumbing deterministic);
  the integration session is summoned for judgment only.

**Recommended, not yet confirmed:**
- Integration session is summonable by default, persistent as an opt-up.
- "Ready to integrate" is a branch state set from the dashboard.
- Escalation ladder v1 (replay → owning session via dashboard trigger → integration
  session → human); auto-inject to owner only as a later opt-in.

**Open decisions (next session):**
1. **Push policy** — does the queue push after merging, or hold? (Here a push cuts a
   release.) Per-repo config, but pick the default.
2. **Undo depth** — what "revert this land" must cover before automation is trusted
   to merge (local revert only? what if pushed? batched lands?).
3. Integration session details: model choice, permission mode, role prompt, failure
   handling specifics.
4. Whether the queue waits for the §4.2 worktree manager or ships radar-first
   (radar is unblocked; queue depends on ownership handoff).
5. Build order/timing overall — explicitly parked.
6. Adapter-side (this repo): the four debate caveats before anything reaches SPEC.md
   — doc-check⇄permutation-rule interlock, scoped-review-as-default budgeting,
   per-file-class teeth for "mechanical composition", tier-1 benign suppression.

Next session: start from this section; the requirements inventory above is the
skeleton for an eventual `/spec` pass on the feature.

## Spike results — 2026-09-06/07 (seven spikes, `docs/history/spikes/worktree/`)

Run beside the `v1-cleanup` pipeline in a separate worktree; isolation rules and per-spike
reports in `docs/history/spikes/worktree/README.md` and `S<N>-*.md`. What each settled, and what it
changes above:

1. **Worktree hooks (S1)** — `WorktreeCreate` is a *blocking, response-bearing* hook: the
   registered hook must create the tree and return its path (command: stdout; http:
   `hookSpecificOutput.worktreePath`); an empty reply aborts the launch. `WorktreeRemove`
   fires only on interactive exit, never headless, and removal is likewise delegated.
   Default with no hook: `<repo>/.claude/worktrees/<name>`, branch `worktree-<name>`,
   locked with `claude session <name> (pid N …)`. **Changes §4.2:** Muster owns creation,
   naming and setup scripts *through* `--worktree` via its existing command wrappers; the
   `worktree` table is written by the hook handler; cleanup needs a reconcile sweep
   (unlock stale locks, remove clean trees) because headless/crashed sessions never fire
   the remove hook. Measured on 2.1.263 (pin 2.1.246).
2. **Queue prototype (S3)** — rebase → verify → squash as a persisted state machine with no
   LLM: 7-point crash matrix all recover to one commit whose tree equals the verified tree;
   verify failure, conflict and forged-tree paths leave `main` untouched and the
   integration worktree clean. **Corrections to stack v2 item 4:** rerere handling is
   ~115 lines, not ~15 (no observable id for a replayed resolution; forget must re-create
   the conflict), and replay only pays off for re-attempts and twins against the *same*
   `main`. Rebase and `merge-tree` can disagree on conflict sets for multi-commit
   branches — the matrix must say which it shows.
3. **Owner handoff (S4)** — the primary rung works: a Haiku owner resolved a textual +
   semantic conflict correctly in 36 s and left a clean rebased tree. **Two amendments:**
   (a) in default/acceptEdits the owner blocks on Bash approval for `git rebase`, so the
   queue should do the mechanical rebase itself (S3) and hand the owner only the conflict
   hunks — a file edit acceptEdits covers; (b) the owner resolved a conflict on the verify
   script in its own favour and the gate passed by being rewritten — **the queue must run
   the target's verify command, never the candidate's**, and flag resolutions that touch
   gate files.
4. **Resolver context (S6)** — 3 adversarial pairs, Haiku both arms: with task context 3/3
   correct; diff-only 2/3, losing B's intent exactly where the diff alone reads as "main
   deleted, B re-added". Verify passed in all 6, including the wrong one (it rewrote a
   test) — so the "only content present in a parent, only inside conflict hunks" rule must
   be enforced mechanically. Directional (n = 3); repeat with ~10 pairs and Sonnet/Opus
   before a number goes in SPEC.
5. **Undo / push policy (S7)** — squash reverts are clean unless a later land touched the
   same hunks (then reverse-order only); every revert push on a release-on-push repo cuts a
   release. **Default: hold (merge locally, don't push) for repos flagged
   `releases_on_push`**, push otherwise — resolves open decision 1. Per land record
   `pre_sha`, `post_sha`, pushed?, tag. Resolves open decision 2's floor: unpushed top ⇒
   reset, else revert, detect revert conflicts up front.
6. **Census (S5)** — 29 adjacent landed pairs rebuilt as parallel branches: 25 textually
   clean, 4 conflict (all docs). Filename overlap over-predicts 2:1. Gate runs on the 25
   clean merges: **0 semantic conflicts** — every merge red was one of three
   load-sensitive tests failing on trees where identical code passes; 16 of 25 merges
   had a spurious red, so a queue needs one retry + parent-HEAD comparison to tell flake
   from regression. Side finding: `e0319f8` landed on `main` with a red e2e suite
   (preflight `claude --version` vs the old sleep-loop stub) — the kind of individually-red
   land the verify gate exists to catch.
6b. **Second repo (S8, MDRostering: Go+React, 440 commits, 39 real merges)**: real
   merges 38/39 clean, 1 lockfile conflict, `merge-tree` ~80 ms/pair; adjacent pairs 27%
   textual (hot: committed `src/dist/`, `pkg/api/server.go`); **0 semantic conflicts in
   40 gated clean merges, 26 of them same-file pairs**. Overlap-as-signal precision 5% on
   real merges vs 70% on adjacent pairs: tier-2 `merge-tree` must drive the matrix, and
   the suppression/defuse list must accept directories.
6c. **Team repo (S9, SPANDigital/presidium-services: Go, 3,933 commits, 71 authors, 113
   live branches)**: real merges 328/372 clean (18 of 44 conflicts are `VERSION`/generated);
   89/113 unmerged branches conflict with `develop`, but Damian's correction stands: those are
   mostly abandoned branches, evidence for the cleanup sweep only, not for concurrency; among the 16 branches
   both recent and current, 6/120 pairs conflict, all dependabot/generated, **0 hand-written**;
   0 semantic conflicts in 18 gated clean merges. Adds to the design: `stale` vs `colliding`
   cells, a rebase nudge, the abandoned-branch sweep, and a history-derived hot-file table
   (`VERSION`-style bot files) as the first thing the daemon computes for a repo.
6d. **Literature check (`docs/history/spikes/worktree/research-merge-conflicts.md`, 20 sources)** — the
   "0 semantic conflicts" result is what small-team data looks like, not a law: Brun 2011
   measured 1% build + 6% test conflicts among 5,355 clean-looking merges, and Mergify's 2026
   queue data has a green PR breaking main 0.77% of the time at 2–5 engineers rising to 12.5%
   at 40+. Overlap as a predictor is confirmed weak (Leßenich 2018: none of 7 indicators;
   Owhadi-Kareshk 2019: safe-merge F1 0.95 vs conflict F1 0.6). Two 2026 agent-PR studies
   put co-active agent PR conflict at 20–42%, in source code — agents collide far more than
   the human histories we measured, which *raises* the radar's value for Muster's workload.
   Ghiotto 2020: 87% of conflict chunks resolve from chunk content alone — the coverage of
   the "parent content only" resolver rule. Brindescu 2020: manually-resolved conflict code
   is 26× more bug-prone — re-review after resolution is not optional. Prior-art correction:
   **Clash (2026) does ship live pairwise merge-tree across worktrees**, and blocks writes via
   a PreToolUse hook — the control half we rejected.
6e. **Rebase-on-every-base-change replay (S10, presidium's 44 real conflicting merges)** —
   event-based rebasing does **not** reduce conflict: the same region re-conflicts on each
   later base commit, total resolved hunks are 2.3–5.8× the one-shot merge's, and each
   episode is about the same size. It buys earliness only (first collision at ~23% of the
   branch's life); 3/44 conflicts vanish through path dependence. **Policy:** auto-rebase
   while `merge-tree` says it is clean (idle session, clean tree — 73–88% of base moves),
   stop at the first predicted conflict and surface it once; never nag per base move; bot
   files (`VERSION`, lockfiles) excluded. Cadence rules are a proxy this signal replaces.
7. **Passive radar (S2)** — running since 2026-09-06 on the muster repo's worktrees;
   analysis in `radar-analyze.sh`. Needs a week of real parallel work before it says
   anything; no linked worktrees existed anywhere under `code/` before this spike.

Open decisions from the 2026-09-01 status: **1 and 2 resolved above (S7)**; 3 (integration
session details) partly informed by S4/S6 — permission mode must allow git, and the resolver
needs a mechanical hunk-scope check; 4 (radar-first vs wait for §4.2) — S1 makes §4.2 cheap
enough to build first, since ownership falls out of the hooks; 5 (build order) still parked.

## Proposed implementation — discussion 2026-09-07 (after the spikes and the literature check)

Build order, each piece standing on the one before. 1 and 2 go through `/spec` first.

1. **Worktree manager through Claude Code's own hook.** Launch with `--worktree <name>`; the
   daemon's `WorktreeCreate` handler creates the tree (naming policy, setup scripts: copy
   `.env`, install steps) and returns the path. Ownership comes from the hook payloads and
   the lock reason. Reconcile-on-start sweeps trees left by headless exits and crashes:
   remove if clean, flag if dirty or unpushed. (S1.)
2. **Radar, `merge-tree` only.** Per repo every ~30 s: each worktree against the base and
   pairwise, ~100–150 ms a cell. Cells: green · stale (behind, still clean) · colliding.
   Filename overlap is *not* shown — it is wrong most of the time (S8/S9, Leßenich,
   Owhadi-Kareshk). A per-repo hot-file list, computed from history in minutes with the
   census scripts and applied automatically with a one-line notice and an edit link, keeps
   `VERSION`-style files from painting cells red. (S5/S8/S9.)
3. **Auto-rebase while free, warn once.** Idle session + clean tree + clean `merge-tree` ⇒
   rebase the worktree with the queue's abort-safe machinery and tell the session via its
   next `UserPromptSubmit` context. First *predicted* conflict ⇒ stop, attention state,
   files listed, no further nagging: forcing rebases past that point multiplies same-size
   resolutions 2–6× for no smaller final conflict (S10). Cadence rules are the proxy this
   replaces.
4. **Land queue** from the S3 prototype: daemon-driven rebase → verify → merge in its own
   integration worktree; state persisted before every step (7-point crash matrix green).
   Verify failure also runs the target's HEAD; "base already red" and a single retry
   separate flake and drift from regression (S5/S8/S9: every red we saw was one of those).
   Push policy per repo; default **hold** where a push cuts a release; undo records pre/post
   SHAs (S7).
5. **Resolution ladder, automatic by default, human last.** (a) mechanical: rerere replay,
   hot-file driver, repo-supplied regenerate command; (b) **the owning session** at idle —
   has the task in context, resolved a real conflict correctly in 36 s (S4); (c) a
   summoned integration session fed both branches' task context (S6: context 3/3 vs
   diff-only 2/3, n=3); (d) human via Needs-Input. Guardrails, because the agent *will*
   otherwise rewrite the gate (S4 run 4, S6 p3): edit conflict hunks only; content present
   in a parent or a mechanical composition of both (Ghiotto: covers ~87% of chunks); never
   touch verify/test files; gates and a scoped review re-run before landing (Brindescu:
   manually-resolved conflict code is 26× more bug-prone).

**Hot files without per-language knowledge.** Muster knows two mechanical strategies and no
ecosystems: *pick a side* (`merge=ours`/`theirs` in `.gitattributes`, the fix for `VERSION`)
and *run the repo's regenerate command* (one optional string, same slot as the verify
command — `npm install --package-lock-only && go mod tidy` and the like). Anything without a
rule falls through to the ladder, i.e. to an LLM. Detection is mechanical; resolution
without a rule is not.

**Settings.** Global defaults with per-repo override: base branch · merge style (squash /
merge commit / rebase; squash default because undo and the "verified tree == landed tree"
check are simplest with one commit) · push policy (hold / auto) · verify command · regenerate
command · hot-file list · auto-rebase-while-clean on/off · ladder depth before a human is
asked.

**Open (honest) risks.** Auto-rebasing a worktree under an idle-but-about-to-resume session;
agents holding stale line numbers after a rebase; permission mode blocking the owner's
mechanical steps (S4 run 2) — hence the queue does the git and hands over hunks only;
resolver hunk-scope enforcement needs per-file-class teeth (union is mechanical and still
corrupts an in-place edit).
