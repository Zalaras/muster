---
name: land
description: "Squash-merges an approved plan branch to main with a conventional subject that closes its issues, then deletes the branch."
argument-hint: "<plan-name>"
allowed-tools: Read, Grep, Glob, Bash, AskUserQuestion
---

> **Maintainer note:** This command lives in a skill and runs in the main session — it is the
> one step allowed to commit on `main`, and it ends in a push, so it must be able to stop and
> ask. Authored 2026-08-31. It exists because the merge was previously an undocumented
> end-of-session request: the subject convention lived only as a pattern in `git log`, and
> whether an issue closed depended on the merging session noticing that a ticked `TODO.md`
> item carried an issue link.

You land an approved plan branch on `main`. `/orchestrate` deliberately never merges or pushes
(`.claude/skills/orchestrate/SKILL.md` Completion step 5) — this is that missing step.

Plan name: **$ARGUMENTS**

## Why the close happens here

GitHub closes an issue when a commit whose message contains `closes #N` lands on the default
branch. That is the correct moment: the fix is on `main`, accepted, and the close event links to
the commit. Nothing earlier qualifies — a review verdict of `approved` is the reviewer's opinion
of the work, not the user's acceptance of it, and a plan branch can still be rejected or
reworked. So `/orchestrate` records the issue numbers and **you** put them in the subject.

## 1. Preflight — refuse, don't warn

Check all of these before touching anything. If any fails, stop and say exactly which:

1. `plans/<plan>/review.md` exists and contains `**Verdict**: approved` — **read it from disk**,
   never rely on the conversation (orchestrate's Completion step 1 makes the same point).
2. `plans/<plan>/orchestration-state.json` has `"status": "completed"`.
3. `git status --short` is clean, apart from untracked strays that are not part of the plan
   (e.g. a stray screenshot). Never `git add -A`, never stash.
4. `git rev-parse --verify plan/<plan>` succeeds.
5. The branch has something to land. **Do not use `git log main..plan/<plan>` for this** —
   measured 2026-08-31: the already-landed `plan/issue-capture` still showed 27 commits ahead,
   because a squash-merge creates a new commit rather than adding the branch's commits to
   `main`'s ancestry, so that range never empties. Use the tree test instead:

   ```bash
   test "$(git merge-tree --write-tree main plan/<plan> | head -1)" = "$(git rev-parse main^{tree})"
   ```

   Equal means merging would change nothing — already landed, so say "nothing to land" and stop.
   A squash of an empty range produces an empty commit, the worst outcome available here.

A plan that never went through `/orchestrate` (no state file, no review) is not landable by this
command. Say so and let the user commit it themselves.

## 2. Compose the subject

Format, per `docs/conventions.md` § Commits — one sentence, no body:

```
type(scope): imperative summary (plan <plan-name>)
```

- **Type** decides the release, so choose it deliberately: `feat` for new behaviour, `fix` for a
  defect, `docs`/`test`/`refactor`/`chore`/`ci` for the rest. Read the plan's description and the
  impl logs rather than guessing from the plan name.
- **`!` is never used** while Muster is on 0.x — `svu` would take it straight to 1.0.0
  (`docs/conventions.md`).
- **Summary** describes what shipped, not what the plan was called. `git log` on `main` shows the
  established length and shape (`1b145d1`, `a654795`, `f66dda6`).

### The issue references

Read `closes_issues` from `plans/<plan>/orchestration-state.json` — orchestrate writes it at
completion for every issue the plan **fully** resolves. If the key is absent (an older plan),
fall back to grepping the `TODO.md` items the plan ticked for issue links, and ask the user to
confirm rather than inferring silently.

Append one reference per issue: `... (plan <name>, closes #2, closes #4)`.

**Only fully-resolved issues.** Ticking a TODO item and closing an issue are different claims —
a plan can advance an issue without finishing it. If orchestrate flagged an issue as partially
addressed, name it in the report as deliberately not closing.

## 3. Show before doing

Print, and get confirmation:

- the exact subject line;
- the issues it will close;
- `git log --oneline main..plan/<plan>` — what is being squashed;
- `git diff --stat main...plan/<plan>` — the size of what lands;
- the **predicted release**: `feat`→minor, `fix`→patch, everything else→none. Note that
  `.github/workflows/release.yml` runs `svu` on push and computes the actual version.

Landing chooses the version bump. Make that visible rather than implicit.

## 4. Land

```bash
git checkout main
git merge --squash plan/<plan>
git commit -m "<subject>"
git push
```

`git push` is not in `.claude/settings.json`'s allowlist, so the point of no return prompts on
its own — leave it that way. The push triggers `release.yml`, which tags and publishes darwin
archives, and GitHub closes the referenced issues.

## 5. Delete the branch

A squash-merge leaves git considering the branch unmerged, so `git branch --merged` is useless
here and `-d` will refuse. `-D` is therefore required — which means the verification has to be
real. **`git diff main plan/<plan>` is not it**: it also reports everything `main` gained after
the branch landed, so a correctly-landed branch shows differences (measured on all four branches
2026-08-31).

Preferred check — the same tree test as preflight 5:

```bash
test "$(git merge-tree --write-tree main plan/<plan> | head -1)" = "$(git rev-parse main^{tree})"
```

A no-op merge is proof the branch holds nothing `main` lacks. If it is **not** a no-op, that is
usually staleness rather than lost work — `merge-tree` writes conflict markers into the tree when
an old branch collides with later work on `main`, which changes the tree hash without any content
being unlanded. Don't delete on that alone; establish all three:

1. the plan's squash commit exists on `main` (`git log --oneline --grep "(plan <plan>)"`),
2. the branch has **zero commits after** that squash landed (compare `git log -1 --format=%ci`
   on both) — this is the case that would actually lose work,
3. `git diff plan/<plan> <squash-sha>` shows only lines `main` later superseded, never lines the
   branch has and `main` lacks.

If any of the three is unclear, keep the branch and ask. A branch costs nothing; lost work does.

## 6. Report

- the squash SHA on `main` and the subject that landed;
- which issues will close, and any deliberately left open with the reason;
- the release workflow triggered and the predicted bump;
- the branch deleted, with the empty-diff verification stated as evidence.

Then remind the user that `/triage --audit` will show any issue whose close silently failed.

## Never

- Never land a plan whose review verdict is not `approved`.
- Never `git add -A`, never stash, never force-push, never amend a commit already on `main`.
- Never use `!` in the subject while Muster is on 0.x.
- Never delete a branch whose diff against `main` is non-empty.
