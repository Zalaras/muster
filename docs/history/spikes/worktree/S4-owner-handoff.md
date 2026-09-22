# S4 — Owner-handoff (measured 2026-09-07, Claude Code 2.1.263, Haiku 4.5)

**Question.** The product's primary escalation rung is "hand the conflict to the live owning
session". Does injecting a conflict notice into an idle owner yield a correct rebase, and
what does the tree look like when the owner cannot succeed?

**Rig.** `s4-owner/setup.sh` + `run.sh`, scratch repo under `~/.muster-spikes/s4-owner/`
(outside `~/Documents`). `main` has `lib.sh`/`main.sh`/`verify.sh`; branch A changes
`greet()` to take a name; branch B (checked out in the owner's worktree) adds `farewell()`
and a call site. Landing A and rebasing B conflicts textually in both files *and*
semantically (B's call site uses the old signature). The owner is a real interactive
`claude` in a private tmux socket; the run lands A, waits for the owner to be idle, then
`send-keys` the notice a daemon would send: branch, files, what moved on main, "rebase,
resolve preserving both intents, run ./verify.sh until it passes, stop, don't push".

## Runs

| Run | Setup | Outcome |
|---|---|---|
| 1 | acceptEdits, idle = `❯` visible | **harness bug** — `❯` stays on screen while Claude works; measured 2 s in and `/exit`ed a working session |
| 2 | idle = no "esc to interrupt"/thinking indicator | owner stopped at **`git rebase` approval prompt** — acceptEdits covers edits, not Bash |
| 3 | + `--allowedTools "Bash(git:*),…"` | **success in 36 s**: rebase finished, both intents kept (`greet "$1"` + `farewell`, `greet world` + `farewell`), `verify OK`, `status --porcelain` empty, no rebase in progress, merge-base == main |
| 4 | as 3, but `main`'s `verify.sh` rewritten to always fail | owner "resolved" the `verify.sh` conflict by **taking B's version**, then reported success. Tree clean, merge-base == main, verify passes — because the gate was replaced. Confound: B had also legitimately edited `verify.sh`, so the conflict was real; the owner still chose the side that made the gate pass without flagging it. |

## Findings

1. **The rung works.** An owner with the task in context resolves a textual+semantic
   conflict correctly and leaves a clean, rebased tree — in under a minute on Haiku.
2. **Permission mode gates the handoff.** In default/acceptEdits the owner blocks on Bash
   approval for `git rebase`; the daemon would see `Needs-Input`, which is the honest
   surface — but "auto-inject" can never be fire-and-forget. Either the notice is a
   dashboard action the user watches, or the queue does the mechanical `rebase` itself
   (spike 3) and only hands the *conflict hunks* to the owner, whose resolution is a
   file edit that acceptEdits does cover. The second is cleaner and matches stack v2.
3. **Never let the candidate branch own the gate.** The owner will resolve a conflict on
   the verify script in its own favour. The queue must run the verify command from the
   target's tree (or from per-repo config outside the tree), and a resolution that
   touches the verify script/config should be flagged, not accepted.
4. **State from panes is unreliable, twice over** — the `❯` marker and the approval prompt
   both fooled a pane-based idle check. Muster's hooks-only rule (`Stop`/`Notification`)
   is the right idle source; the harness only used pane text because it has no daemon.
5. Not measured: mid-turn injection (the daemon must wait for `Stop`), an owner that gives
   up, and Opus/Sonnet behaviour. Cost: 4 Haiku sessions, all torn down.
