# S7 — Undo and push policy (measured 2026-09-06)

**Question.** What does "revert this land" need before automation is trusted to merge, and
what should the queue's push default be when a push cuts a release?

**Rig.** `~/.muster-spikes/s7-undo/`: a bare remote whose `post-receive` hook cuts a tag
`v0.1.N` on every push to `main` (stand-in for the real repo's release-on-push). Lands are
`git merge --squash` + commit, recording the pre-land SHA, as `/land` does. Zero LLM.

**Cases and outcomes.**

| Case | Setup | Outcome |
|---|---|---|
| A | land f1, push; land f2, push | one release per push (v0.1.1, v0.1.2) — as expected |
| B | revert the *older* land f1 while f2 (disjoint files) sits on top | `git revert <squash>` clean; the revert push cuts **another** release (v0.1.3) |
| C | re-land f1 after its revert, branch untouched | squash re-applies cleanly (no merge-commit ancestry to fight); v0.1.4 |
| D | undo an **unpushed** land, nothing landed after | `git reset --hard <pre-SHA>` — main == origin/main again, no release |
| E | f3 rewrites the line f1 introduced; rebase f3 (conflict, resolved), land, push | v0.1.7 |
| F | revert f1 now that f3 built on its line | **CONFLICT** on `a.txt` — a squash revert is not undoable once a later land touched its hunks |
| G | revert f3 first, then f1 | both clean — reverse-chronological revert works |
| E' | revert only f4 out of a push that carried two lands | clean (disjoint) |

**What the queue's undo must record and do.**

- Per land: `pre_sha`, `post_sha` (the squash commit), branch name, and whether it was pushed
  (and the tag the push produced, if the repo releases on push).
- Unpushed and top-of-main ⇒ **reset** to `pre_sha` (case D). Anything else ⇒ **revert**
  the squash commit (B, E', G) — never reset a pushed main.
- Revert can conflict when a later land touched the same hunks (F). The queue must detect
  this up front with `git merge-tree --write-tree` against the reverse patch (or just
  `git revert --no-commit` in the integration worktree and abort on conflict) and offer
  the reverse-order path (G: revert the later lands first) rather than leaving a half-revert.
- A revert is itself a land: it goes through the same rebase → verify → merge path and, on
  a release-on-push repo, **cuts a release**. Reverting a bad release therefore ships a
  fix release; it cannot un-cut the bad tag.

**Push-policy recommendation.** Default **hold** (merge locally, do not push) for repos
flagged `releases_on_push`, and **push** otherwise. Hold keeps undo in the cheap reset
class (D) for the whole batch; the dashboard shows "N lands unpushed" with one Push button
(and one Reset-to-pre-batch button). Repos that don't release on push lose nothing by
pushing immediately, and their undo is a revert either way.

Unmeasured: interaction with a branch protection rule or a merge queue on the remote —
irrelevant for the single-user case.
