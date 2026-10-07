# Worker rules — what every pipeline worker follows

Read by `daemon-impl`, `web-impl`, `daemon-tests`, `web-tests`, `e2e-specs` and `doc-reconcile`
at the start of their step. Each agent's own file names its commit subject and its verdicts; this
file holds what they share.

## Git

Work on the `plan/<plan-name>` branch the orchestrator created. At the end of your step commit your
own files, your `plans/<plan-name>/` log included:

- `git add` only files you changed, named individually, and commit by pathspec
  (`git commit -- <files>`) — the index is shared and a peer's `git mv` is already staged.
- The subject is the one your agent file names, one sentence plus the harness trailers. A fix-mode
  commit appends ` (review cycle <N>)` with the cycle number your prompt states, or
  ` (pre-review fix)` when it says no review has run.
- Commit even when your gate is red for a defect you may not fix, adding one body line
  `gate red: <what fails, whose defect>` — the one body `docs/conventions.md` §Commits allows here.
  Uncommitted work beside other agents' is the hazard, not a red commit.
- To look at earlier state use `git diff` / `git show HEAD:<path>`; to undo your own edit, edit it
  back. `git stash`, `checkout -- <path>`, `reset`, `clean` and `rebase` all touch files other
  agents hold.
- Leave files you did not change alone, including another agent's uncommitted ones — name them in
  your log instead. Pushing and committing on `main` are the developer's (`/land`).

## Evidence

Claims need evidence. When you deviate from the plan, abandon an approach, reverse a change or
escalate a defect, quote the command output that justified it — the build error, the failing
assertion diff, the `rg` result and its count. Never assert a blast radius you have not measured:
"this would break dozens of call sites" is not a reason unless you ran the search and can paste it.
A confident, plausible, wrong justification is worse than none, because the reviewer may accept it.

The rule covers claimed *effects* and *absences*, not just decisions. A runtime, filesystem or
security outcome ("the file is no longer world-readable", "the handler returns immediately") is
verified by measurement and the measurement pasted into the log — the `ls -l`, the curl, the query
output — not inferred from the diff. A claim that a symbol, path or wording no longer exists
anywhere needs the tree-wide grep pasted.

## Comments

Write no comments: the comment pass strips every comment a branch adds to production code and a
judge decides what returns (kb:adr/process-comment-pass-owns-code-comments). A path, `make` target
or `musterd` flag any comment cites must exist — `go run ./tools/kb refs`, inside `make check-kb`,
fails the gate otherwise.

## Verdicts

A worker's log ends in a `**Verdict**` the orchestrator acts on. The shared vocabulary:

- `pass` — your step's work is done and its gate is green.
- `implementation-bug` — your work is correct, but the implementation does not match the plan or
  protocol contract, or cannot be tested as built (the plan may be what is wrong). Paste the evidence;
  the orchestrator routes it back to the impl agent.
- `blocked` — you cannot proceed for a reason no pipeline agent can fix; the orchestrator stops and
  reports.

Some agents add verdicts of their own (e2e-specs' `authored` / `harness-only`, doc-reconcile's
`reconciled` / `contradiction`); their files define them. A `blocked` or `implementation-bug`
verdict naming a real obstacle is a good outcome — the failure is a green verdict hiding one.
