# Spec: Worktree lifecycle

**Plan**: worktree-lifecycle
**Created**: 2026-09-14
**Status**: Draft

## Goal

Let a session optionally launch into a **fresh git worktree**, created, set up and ready to work
in, so several Claude sessions can run on one codebase at once without treading on each other.

Today Muster only *recognises* a worktree it is pointed at (kb:adr/launch-hybrid-mru-directory-memory):
the user creates the tree by hand in a terminal, copies `.env` files, runs the install, and only
then launches. That manual dance is the thing being removed. This is the first half of SPEC §3.2
and the feature the merge queue was parked behind (kb:adr/worktree-merge-queue-daemon-driven).

## Background & Context

- **Muster creates the tree, not Claude** — `kb:adr/worktree-muster-owned-sibling-path`. `git
  worktree add` runs before the pane is spawned, so the path is known up front; the pane cwd, the
  session row, the branch display, the terminal and the editor button all key off it.
- Native `claude --worktree` is rejected for placement: it nests the tree at
  `<repo>/.claude/worktrees/<name>` inside the main working tree and locks it with a stale pid
  reason (`kb:fact/worktree-flag-defaults`).
- A `WorktreeCreate` hook overrides all of that: the hook creates the directory and prints its
  path, and Claude uses it (`kb:fact/worktree-create-hook-owns-path`). Muster registers one so a
  `--worktree` typed inside a session lands in Muster's location with Muster's setup.
- Git and GitHub work shells out to the CLIs (`kb:adr/stack-git-and-gh-clis-not-go-git`);
  `internal/gitutil/gitutil.go` already holds `IsRepo`, `Branch` and `IsWorktree`.
- The `repo` table already exists and the session row already carries a worktree column, null
  today — this feature fills it and repaints no schema (`kb:adr/launch-hybrid-mru-directory-memory`).
- The launch dialog already has a session title field (`web/src/features/launch.ts:43`, `body.title`
  → `--name`, `kb:fact/name-flag-reaches-title`), which supplies the default worktree name.
- Subprocess calls that read a child's output set a wait delay beside the timeout
  (`kb:adr/process-exec-waitdelay-on-pipe-owning-commands`).

## Scope

**In Scope:**

- An optional "new worktree" choice in the launch dialog, with a name field and an editable base
  branch, that creates the tree and launches the session in it.
- Placement: sibling of the checkout, `../<repo>-<name>`, by default; an optional global worktree
  root puts every tree under `<root>/<repo>/<name>`; a per-repo override sets a parent directory
  for that repo alone.
- Branch creation from the chosen base; live collision warning and a hard fail on launch.
- Setup on creation: copy untracked files (`.env` and friends) and run install steps, configurable
  per repo — SPEC §3.2 calls this must-have, and without it the tree is present but unusable.
- Removal: offered when the session ends, and a manual cleanup action for a tree whose session is
  gone. Never silent when work would be lost.
- Registering the `WorktreeCreate` hook so trees started from inside Claude land in Muster's place.

**Out of Scope:**

- The richer status view — dirty/clean, ahead/behind, abandoned-tree detection, ownership columns.
  A follow-up; it is a polling and display problem with its own protocol surface.
- Conflict handling and the merge queue — a separate, later feature
  (`kb:adr/worktree-merge-queue-daemon-driven`), explicitly parked behind this one.
- Inline diff review (`kb:adr/nongoal-diff-review-placeholder-button`), containers as isolation
  (`kb:adr/nongoal-containers-as-isolation`), session forking
  (`kb:adr/nongoal-session-forking-pause-checkout`).
- `claude --tmux`. Muster owns its tmux server and socket; the flag is not used.

## Requirements

**Creation**

1. The launch dialog gains an optional "in a new worktree" choice. Off, launching is unchanged.
2. **Name**: the user may type one; it defaults to the slugified session title; failing that, a
   generated random name. The name yields directory `../<repo>-<name>` and branch `<name>` — no
   `muster/` prefix, since these are ordinary branches that get pushed and landed.
3. **Base branch**: shown in the dialog, defaulting to the repo's default branch, click-to-edit to
   pick another existing branch.
4. **Location**, resolved in order: the repo's override if set; else the global worktree root if
   set, as `<root>/<repo>/<name>`; else the sibling `../<repo>-<name>`. Both settings are user
   settings the dashboard edits and default to unset, so a fresh install places siblings. A root or
   override that lies inside any git working tree is refused when set and when a launch resolves to
   it — nesting is what native `--worktree` gets wrong (`kb:fact/worktree-flag-defaults`). Neither
   lives in the daemon's data directory or beside the binary: trees are the user's source, not app
   state, and that path holds a space that already breaks shell quoting.
5. Creation is `git worktree add -b <branch> <path> <base>`, run by the daemon **before** the tmux
   pane is spawned. The pane's cwd is the new tree; `claude` is launched plain, without `--worktree`.
6. The tree's path is stored on the session row and is the single source of truth for the tether,
   the editor button and removal — never reconstructed from the name.
7. **Setup**, per repo and configurable: a list of untracked files to copy from the checkout
   (`.env` by default) and a list of commands to run in the new tree. These complete before the
   session starts; a session never begins in a half-set-up tree.

**Collisions**

8. A branch that already exists, or a target directory that already exists, warns live in the
   dialog as the name is typed, and fails the launch if still colliding at submit. Never silently
   reuse an existing tree — that is exactly what native `--worktree` does wrong.

**Removal**

9. When a session in a Muster-created tree ends, removal is offered.
10. A tree that is **dirty, or holds commits not merged anywhere**, is never removed without an
    explicit confirm naming what would be lost. A clean tree with no unique commits removes on one
    click.
11. A manual cleanup action removes a tree whose session is long gone, under the same rules.
12. Removal is `git worktree remove` plus branch deletion only when the branch is safe to delete.

**Hook**

13. Muster registers a `WorktreeCreate` hook in the project-scoped `.claude/settings.json` it
    already writes. It creates the tree at Muster's path with Muster's branch name, runs the same
    setup, records it, and prints the path as its last stdout line.

**Non-functional**

14. Claude-Code-format knowledge (the hook payload, its output contract) stays inside
    `internal/claudecode/`; git mechanics stay in `internal/gitutil/`.
15. Every git subprocess sets a timeout and a wait delay
    (`kb:adr/process-exec-waitdelay-on-pipe-owning-commands`).

## Edge Cases & Considerations

- **Setup fails** (install errors, a missing `.env` to copy) — the launch fails loudly with the
  command's output; it does not start a session in a broken tree. Whether the tree is rolled back
  or left for inspection is a planning decision.
- **Creation succeeds, the pane fails to spawn** — an orphan tree with no session. The manual
  cleanup action is the backstop; the tree must be recorded before the pane is attempted so it is
  never invisible.
- **Daemon restart mid-create** — reconcile must not treat a recorded tree with no live session as
  a tree to delete; it is a cleanup candidate, never an automatic removal.
- **The user deletes the tree by hand**, or removes it from another terminal. The session row's
  path goes stale; the session must degrade rather than error repeatedly.
- **A repo with no default branch resolvable**, a detached HEAD, or no remote — the base-branch
  default has to fall back to the current HEAD rather than fail.
- **Two repos share a name** under a global root — `<root>/<repo>/` collides. Key the repo
  directory on the checkout's basename and refuse the second repo with the reason until its
  override is set, rather than inventing a disambiguated name.
- **The checkout is itself a worktree** — creating a sibling of a sibling. `git worktree add` from
  a linked worktree works and attaches to the same common dir; the naming must not compound
  (`../repo-a-b`).
- **Nested-tree legacy**: a tree Claude created before the hook was registered sits in
  `.claude/worktrees/` and is locked with a dead pid. Removal needs `remove -f -f`; Muster should
  recognise these rather than pretend they do not exist.
- **Hook loss does not apply here** — creation is synchronous and its failure is visible. But the
  `WorktreeCreate` hook has a timeout like any other, and setup commands can outrun it; the hook
  path may need to do less work than the dialog path.

## Acceptance Criteria

- [ ] Launching with the worktree choice off behaves exactly as it does today.
- [ ] Launching with it on creates `../<repo>-<name>` on branch `<name>` from the chosen base, and
      the session's pane cwd, session row and branch display all read the new tree.
- [ ] The name field defaults to the slugified session title, and to a generated name when the
      title is empty.
- [ ] The base branch shows the repo's default branch and can be edited to another existing branch.
- [ ] With neither setting the tree is a sibling; with a global root it is `<root>/<repo>/<name>`;
      a per-repo override wins over the root for that repo only.
- [ ] Setting a root or override that lies inside a git working tree is refused with the reason,
      and no tree is created there.
- [ ] Configured setup runs before the session starts: a copied `.env` and the install's effects
      are present in the tree at the session's first prompt (measured in the tree, not inferred).
- [ ] Typing a name matching an existing branch or directory warns in the dialog, and submitting it
      fails the launch with that reason; no tree is created and no existing tree is reused.
- [ ] Ending a session in a clean, fully-merged tree offers removal, and removal deletes both tree
      and branch.
- [ ] A dirty tree, or one with unmerged commits, is not removed without an explicit confirm that
      names the uncommitted or unmerged work.
- [ ] The manual cleanup action removes a recorded tree whose session no longer exists.
- [ ] With Muster's `WorktreeCreate` hook registered, `claude --worktree x` inside a session creates
      the tree at Muster's location with Muster's branch name — not in `.claude/worktrees/`.
- [ ] A failed setup step fails the launch and surfaces the command output.

## References

- `kb:adr/worktree-muster-owned-sibling-path` — its "no central worktree root" clause is amended
  by requirement 4; `/plan-work` writes the superseding ADR (sibling default, optional global root,
  per-repo override; nesting refused). `kb:adr/launch-hybrid-mru-directory-memory`,
  `kb:adr/stack-git-and-gh-clis-not-go-git`, `kb:adr/worktree-merge-queue-daemon-driven`,
  `kb:adr/process-exec-waitdelay-on-pipe-owning-commands`
- `kb:fact/worktree-flag-defaults`, `kb:fact/worktree-create-hook-owns-path`,
  `kb:fact/name-flag-reaches-title`
- SPEC.md §3.2 Worktree manager (its "prefer native `--worktree`" line is superseded by the ADR),
  §3.3 Start from PR / issue (the next consumer of this feature)
- `docs/history/design/worktree-conflicts.md` — frozen research behind the merge queue
- `internal/gitutil/gitutil.go`, `web/src/features/launch.ts`
