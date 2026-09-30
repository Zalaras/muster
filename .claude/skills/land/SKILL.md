---
name: land
description: "Squash-merges an approved plan branch to main with a conventional subject that closes its issues, then deletes the branch."
argument-hint: "<plan-name>"
allowed-tools: Read, Grep, Glob, Bash, Edit, AskUserQuestion
---

> Maintainer note: a skill in the main session because it is the one step that commits on `main`
> and pushes, so it must be able to stop and ask (kb:adr/process-land-decides-proposed-backlog).

You land an approved plan branch on `main`. `/orchestrate` deliberately never merges or pushes
(`.claude/skills/orchestrate/SKILL.md` Completion step 8) — this is that missing step.

Plan name: **$ARGUMENTS**

## Why the close happens here

GitHub closes an issue when a commit whose message contains `closes #N` lands on the default
branch. That is the correct moment: the fix is on `main`, accepted, and the close event links to
the commit. Nothing earlier qualifies — a review verdict of `approved` is the reviewer's opinion
of the work, not the developer's acceptance of it, and a plan branch can still be rejected or
reworked. So `/orchestrate` records the issue numbers and **you** put them in the subject.

## 1. Preflight — refuse, don't warn

Check all of these before touching anything. If any fails, stop and say exactly which:

1. `plans/<plan>/review.md` exists and contains `**Verdict**: approved` — **read it from disk**,
   never rely on the conversation (orchestrate's state script refuses `completed` on the same test).
2. `plans/<plan>/orchestration-state.json` has `"status": "completed"`.
3. `git status --short` is clean, apart from untracked strays that are not part of the plan
   (e.g. a stray screenshot). Leave those strays where they are: stage nothing with `git add -A`,
   and never stash.
4. `git rev-parse --verify plan/<plan>` succeeds.
5. The branch has something to land. **Do not use `git log main..plan/<plan>` for this** —
   a squash-merge never empties that range.
   Use the tree test instead:

   ```bash
   test "$(git merge-tree --write-tree main plan/<plan> | head -1)" = "$(git rev-parse main^{tree})"
   ```

   Equal means merging would change nothing — already landed, so say "nothing to land" and stop.
   A squash of an empty range produces an empty commit, the worst outcome available here.
6. The plan's worktree is there and idle: `make worktrees` lists `../muster-<plan>` on
   `plan/<plan>` (kb:adr/process-pipeline-runs-in-sibling-worktree), and no `claude` has it as
   its cwd (`lsof -a -d cwd -c claude -Fn` prints no `n<that path>` line) — end that session
   first; this command runs from the primary checkout, on `main`. A plan from before worktrees
   has no tree: then step 2 and preflight 7 use `git checkout plan/<plan>` here instead.
7. For each name in the plan's `**Features**`, `go run ./tools/kb ls --feature <f> --status
   proposed` lists no record with `refs: plan:<plan>`, and `make -C ../muster-<plan> check-kb`
   exits 0 on the branch. A `proposed` ADR here means orchestrate's Completion step 4 was skipped —
   send it back rather than flipping it yourself. The only files this command ever edits are
   `TODO.md` and `proposed-backlog.md` files, in step 2, on the developer's answers.

A plan that never went through `/orchestrate` (no state file, no review) is not landable by this
command. Say so and let the developer commit it themselves.

## 2. Decide the proposed follow-ups

A run files nothing into `TODO.md` beyond what the approved plan's `## Out of scope` names, copied
verbatim; everything else it proposes in `plans/<plan>/proposed-backlog.md`
(kb:adr/process-backlog-entries-are-the-users-to-file). This is where the developer decides, so the
decisions ride the same squash as the fix (kb:adr/process-land-decides-proposed-backlog).

**Scope.** This plan's file, plus every other `plans/*/proposed-backlog.md` **as it is on
`main`** (`git show main:<path>`) that has no `## Decisions` section, or a Decisions line marked
`deferred` — the sweep catches plans committed without `/land`. A swept file is edited on the
plan branch only when `git diff --quiet main plan/<plan> -- <path>` holds; otherwise leave it for
the next `/land` and say so. Nothing open → "no proposals", one line, and go to step 3.

**Verify before showing.** For each proposal, check it still holds: grep the symbol or line it
names, `git log -S` for a fix. Mark one fixed since as **already done** with the commit or line
as evidence, and one that repeats another proposal or an open `TODO.md` entry as **duplicate of
#N**, each with that evidence.

**Print** a numbered list grouped by plan, one short line each — the block's **Summary** line
where it has one — tagging **Asked** where **Change requested** is yes, then a tally: distinct,
already done, duplicates. **Ask in prose, not an `AskUserQuestion` menu**: the developer answers per
number — yes, not doing, defer, or a changed wording ("add as an investigation"). Asked to
explain one, explain it plainly and wait.

**Apply**, on `plan/<plan>` in its worktree — edit `../muster-<plan>/TODO.md` and the
`proposed-backlog.md` files there and commit with `git -C ../muster-<plan>` (the branch is
checked out in that tree, so a `git checkout plan/<plan>` here is refused):

- File only what the developer chose. Each yes → `TODO.md`, in the section they name, else at the end of **Pre-v1**, under a
  `Filed <date> by the developer from the plans' proposed-backlog.md files` lead line: `- [ ] **Title** — body … From \`plans/<plan>/\`.` An
  entry that would reverse an accepted ADR names it.
- Every decision → one line in a `## Decisions (the developer, <date>)` section appended to its
  file: `filed: TODO.md § <section>, "<title>"`, `not doing`, `already done: <evidence>. Not
  filed.`, or `deferred`.
- Commit the files by name, `docs(<plan>): file follow-ups from proposed-backlog`, then
  `make -C ../muster-<plan> check-kb` and `../muster-<plan>/.claude/skills/orchestrate/scripts/dead-refs.py --all`
  (it works in its own checkout) exit 0, and `git merge-tree --write-tree main plan/<plan>`
  exits 0 (1 means the edit now conflicts with `main` — stop and ask).

## 3. Compose the subject

Format, per `docs/conventions.md` § Commits — one sentence, no body:

```
type(scope): imperative summary (closes #N, closes #M)
```

- **Type** decides the release, so choose it deliberately: `feat` (minor) for new behaviour;
  `fix`, `perf` or `refactor` (patch) when that is what shipped; the remaining types
  (`docs`/`test`/`chore`/`ci`/`build`/`style`/`revert`) release nothing. Read the plan's
  description and the impl logs rather than guessing from the plan name.
- **`!` needs an explicit go-ahead from the developer** — the commit-msg hook rejects it unless a
  human sets `MUSTER_BREAKING=1`, and this skill never sets it on its own. On 0.x it is safe
  when sanctioned: `release.yml` runs `svu next --v0`, so a breaking marker bumps minor, never
  1.0.0 (`docs/conventions.md` § Commits). Mark a breaking change with `!` only: the hook rejects
  the breaking-footer phrase anywhere in a message, bodies included.
- **Summary** describes what shipped, not what the plan was called, and is **at most 72
  characters** before the `(closes …)` tail.

  **This subject is published verbatim as the release note.** `.goreleaser.yaml` sets
  `changelog.use: github` with `include: ^(feat|fix|perf|refactor)`, so every subject of those
  four types — and only those — becomes one bullet in the GitHub Release. Write it for that
  reader, taking the shape from `docs/conventions.md` § Commits' worked example — not from this
  repo's older subjects, which run to 1,138 characters (`3f1c7a3`) and are the mistake this rule
  exists to stop.

### The issue references

Read `closes_issues` from `plans/<plan>/orchestration-state.json` — orchestrate writes it at
completion for every issue the plan **fully** resolves. If the key is absent (an older plan),
grep the plan's ticked items in `docs/history/todo-done.md` for issue links and ask the developer to
confirm.

Append one reference per issue, lowercase: `... (closes #2, closes #4)`.

**The subject carries no `(plan <name>)` marker.** It is bookkeeping in a user-facing release
note, and the plan is always recoverable from the commit itself — the squash includes
`plans/<name>/`, so `git show --stat <sha> | grep plans/` names it (`v0.2.0`'s note was 48 of 125
characters bookkeeping). If a plan closes no
issues, the subject simply has no tail.

**Only fully-resolved issues.** Ticking a TODO item and closing an issue are different claims —
a plan can advance an issue without finishing it. If orchestrate flagged an issue as partially
addressed, name it in the report as deliberately not closing.

## 4. Show before doing

Print, and get confirmation:

- the exact subject line;
- the issues it will close;
- `git log --oneline main..plan/<plan>` — what is being squashed;
- `git diff --stat main...plan/<plan>` — the size of what lands;
- the backlog items the branch adds — `git diff main...plan/<plan> -- TODO.md | grep '^+- \[ \]'`
  — and, for each, whether step 2 filed it or the plan's `## Out of scope` names it. Anything else is a run filing
  work you did not approve (kb:adr/process-backlog-entries-are-the-users-to-file): say so here
  rather than after the merge;
- the **predicted release** — landing chooses the version bump, so make it visible:
  `feat`→minor; `fix`/`perf`/`refactor`→patch; everything else→none.
  `.github/workflows/release.yml` computes the actual version on push (`svu next --v0`, plus its
  perf/refactor patch shim).

## 5. Land

```bash
git checkout main
git merge --squash plan/<plan>
git commit -m "<subject>"
git push
```

`git push` is not in `.claude/settings.json`'s allowlist, so the point of no return prompts on
its own — leave it that way. Push plainly: no force-push, and no amending a commit already on
`main`. The push triggers `release.yml`, which tags and publishes darwin
archives, and GitHub closes the referenced issues.

## 6. Delete the branch

A squash-merge leaves git considering the branch unmerged, so `git branch --merged` is useless
here and `-d` will refuse. `-D` is therefore required — which means the verification has to be
real. **`git diff main plan/<plan>` is not it**: it also reports everything `main` gained after
the branch landed, so a correctly-landed branch shows differences (measured 2026-08-31).

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

Then, in order: `git worktree remove ../muster-<plan>` without `--force` — a refusal means the
tree is dirty or still in use, so stop and ask — and only then `git branch -D plan/<plan>`, which git refuses
while the branch is checked out in a tree. `git worktree remove` is deliberately not in
`.claude/settings.json`'s allowlist: like `git push`, the point of no return prompts on its own.

## 7. Report

- the squash SHA on `main` and the subject that landed;
- which issues will close, and any deliberately left open with the reason;
- the proposals decided in step 2 — filed (and where), not doing, already done, deferred;
- the release workflow triggered and the predicted bump;
- the branch deleted, with the step 6 verification (the no-op tree test, or the three checks)
  stated as evidence.

Then remind the developer that `/triage --audit` will show any issue whose close silently failed.
