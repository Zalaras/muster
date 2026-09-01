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
type(scope): imperative summary (closes #N, closes #M)
```

- **Type** decides the release, so choose it deliberately: `feat` (minor) for new behaviour;
  `fix`, `perf` or `refactor` (patch) when that is what shipped; the remaining types
  (`docs`/`test`/`chore`/`ci`/`build`/`style`/`revert`) release nothing. Read the plan's
  description and the impl logs rather than guessing from the plan name.
- **`!` needs an explicit go-ahead from the user** — the commit-msg hook rejects it unless a
  human sets `MUSTER_BREAKING=1`, and this skill never sets it on its own. On 0.x it is safe
  when sanctioned: `release.yml` runs `svu next --v0`, so a breaking marker bumps minor, never
  1.0.0 (`docs/conventions.md` § Commits). The breaking-footer phrase is banned outright — never
  put it in a commit message; the hook rejects it anywhere, including bodies.
- **Summary** describes what shipped, not what the plan was called, and is **at most 72
  characters** before the `(closes …)` tail.

  **This subject is published verbatim as the release note.** `.goreleaser.yaml` sets
  `changelog.use: github` with `include: ^(feat|fix|perf|refactor)`, so every subject of those
  four types — and only those — becomes one bullet in the GitHub Release. Write it for that
  reader. Do **not** take the length of this repo's older subjects as the house style: measured
  2026-09-01, `main` carries subjects of 394, 272, 224 and 205 characters, and the `feat(m3)`
  one is a single 1,138-character sentence published as one changelog bullet (`3f1c7a3`; the
  longest overall is a 1,155-char docs retro, `5d4e1d6`). They are the mistake this rule exists
  to stop, not the model. `docs/conventions.md` § Commits has the right shape in its own worked
  example.

### The issue references

Read `closes_issues` from `plans/<plan>/orchestration-state.json` — orchestrate writes it at
completion for every issue the plan **fully** resolves. If the key is absent (an older plan),
fall back to grepping the `TODO.md` items the plan ticked for issue links, and ask the user to
confirm rather than inferring silently.

Append one reference per issue, lowercase: `... (closes #2, closes #4)`.

**The subject carries no `(plan <name>)` marker.** It is bookkeeping in a user-facing release
note, and the plan is always recoverable from the commit itself — the squash includes
`plans/<name>/`, so `git show --stat <sha> | grep plans/` names it. (Decision 2026-09-01, after
`v0.2.0` shipped a note in which 48 of 125 characters were bookkeeping.) If a plan closes no
issues, the subject simply has no tail.

**Only fully-resolved issues.** Ticking a TODO item and closing an issue are different claims —
a plan can advance an issue without finishing it. If orchestrate flagged an issue as partially
addressed, name it in the report as deliberately not closing.

## 3. Show before doing

Print, and get confirmation:

- the exact subject line;
- the issues it will close;
- `git log --oneline main..plan/<plan>` — what is being squashed;
- `git diff --stat main...plan/<plan>` — the size of what lands;
- the **predicted release**: `feat`→minor; `fix`/`perf`/`refactor`→patch; everything
  else→none. Note that `.github/workflows/release.yml` computes the actual version on push
  (`svu next --v0`, plus its perf/refactor patch shim).

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

1. the plan's squash commit exists on `main` — find it by the issues it closed
   (`git log --oneline --grep "closes #<N>"`) or by the plan directory it carries
   (`git log --oneline -- plans/<plan>/`); subjects no longer carry a `(plan <name>)` marker,
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
- Never use `!` in the subject without the user's explicit go-ahead (the hook gates it on
  `MUSTER_BREAKING=1`, which only a human sets), and never write the breaking-footer phrase
  anywhere in a commit message.
- Never delete a branch whose diff against `main` is non-empty.
