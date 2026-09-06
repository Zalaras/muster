---
name: triage
description: "Pulls open GitHub issues into TODO.md as backlog entries, and audits the two lists against each other."
argument-hint: "[issue-number | --all | --audit] [--comment]"
allowed-tools: Read, Edit, Grep, Glob, Bash, AskUserQuestion
---

> **Maintainer note:** This command lives in a skill and runs in the main session, on your
> session model. It is interactive by design — step 4 asks the user which section an issue
> belongs in, which a subagent could not do. Authored 2026-08-31 alongside `/land`, after the
> `issue-capture` feature left both ends of the issue loop undone by hand.

You are the triage agent. muster's masthead `Issue` button files issues; this command brings
them into `TODO.md` and keeps the two lists honest. **You never close an issue as "triaged"** —
see § The close policy.

## Arguments

Invoked with: **$ARGUMENTS**

| Argument | Meaning |
|---|---|
| *(none)* | Triage every untriaged open issue, then audit. |
| `<N>` | Triage issue #N specifically, even if already triaged. |
| `--all` | Re-examine every open issue, triaged or not. |
| `--audit` | Run § 5 only — no triage, no writes. |
| `--comment` | Also post a triage comment on each issue handled (off by default). |

## The close policy — read this before doing anything

An issue is **never** closed because it has been triaged. It closes when the fix reaches
`main`, via `closes #N` in the squash subject (`docs/conventions.md` § Commits; `/land`
composes it). Reasons, settled 2026-08-31 — do not re-litigate:

- Open/closed is the only status field that survives open-sourcing. Closing someone's report
  as "it's on our backlog" reads as a brush-off.
- An open list is what prevents the same friction being filed twice, and this button makes
  re-filing very cheap.
- The close is already free at the other end.

The one exception is a **duplicate or invalid** issue. That is a real resolution, not a filing
convention — see § 4b.

## 1. Work out the untriaged set

**An issue is triaged if and only if its issue URL appears in `TODO.md`.** There is no label,
no stored state, and no second list. This is self-healing: delete a TODO item and its issue
correctly reappears as untriaged.

```bash
gh issue list --state open --json number,title,body,createdAt
grep -oE 'issues/[0-9]+' TODO.md   # the triaged set
```

**Match on the `issues/N` URL, never on a bare `#N`** — measured on the real file, bare `#N`
has two false-positive sources: `#343a4a` (a hex colour in a design note) parses as issue #343,
and a cross-reference like "same seam as #4" makes #4 look triaged even when it has no entry of
its own. The markdown link `([#N](.../issues/N))` appears exactly once per issue, in the entry
that owns it. Every entry this command writes must therefore carry the full link, not a bare
`#N` — the bare form is for cross-references only.

Let `gh` auto-detect the repository from the `origin` remote. **Do not hardcode the repo slug** —
it already lives in `go.mod:1` and `Makefile:82`, and a third copy is a third thing to change.

Report the count before doing any work: `N open, M untriaged`.

## 2. Read and reduce each issue

The body has two parts: the prose the user typed, and a `## Snapshot` table plus a
`<details>` block of raw JSON. **Drop the raw JSON.** Keep the table facts — musterd version,
Claude Code version and drift, host — because they decide whether the report is still true
against the current tree. Check that before writing an entry: an issue filed against 0.1.0 may
already be fixed.

## 3. Draft the backlog entry

House style is set by the entries in `TODO.md` § "Reported issues (pre-v1 release)". Match it:

```markdown
- [ ] **<the problem, restated as work>** ([#N](https://github.com/<owner>/<repo>/issues/N))
  — <what is actually wrong, in your own words, with the exact error text if the issue quoted
  one>. <What has to be decided or done>. <Cross-reference, if any.>
```

Rules:

- **Restate as work, not as a complaint.** "tmux dependency is unhandled at first launch",
  not "tmux not installed".
- **Keep the user's specifics** — an exact error string, a suggested shortcut, a named file.
  Those are the parts a future session cannot reconstruct.
- **Cross-reference.** Grep `TODO.md` for related items before writing, and say so in the entry
  ("same seam as #4", "the M5+ `.btn:disabled` item is the same layer"). Two issues that share
  a fix should say so; one plan can close both.
- **Don't inflate.** If the issue is one sentence, the entry is two lines. Only add scope the
  issue implies (e.g. "re-check the ⌘1–9 shortcuts for the same collision") when it genuinely
  follows, and mark it as an addition.

## 4. Propose a section — ask, never decide silently

Where an item lands is a ranking judgement that belongs to the user. Present the candidates via
`AskUserQuestion` with a one-line rationale each:

- `## Pre-v1 Cleanup` — blocks cutting v1.
- `## Reported issues (pre-v1 release)` — reported friction to fix before release.
- `## M5+ (v1.x, re-rank when reached)` — real, not urgent.

Recommend one, but let the user move it. Then insert the entry at the end of that section's
list, preserving the blank line between entries.

### 4b. Duplicate or invalid issues

If an issue duplicates another or describes something already fixed, propose closing it as such
and say which — `gh issue close N --reason "not planned" --comment "<why>"`. Requires explicit
approval every time. Keep this visibly distinct from ordinary triage: it is a resolution, not a
filing step.

## 5. Audit — always run this, even after a triage pass

Compare the two lists in both directions and report a table. **Never auto-fix; report and
suggest.**

Split `TODO.md` into entries on `- [ ]` / `- [x]` at column 0, find the entry whose
`issues/N` URL matches, and read that entry's own checkbox. Reading the checkbox off any block
that merely mentions `#N` attributes another item's state to this issue.

| Condition | Meaning | Suggest |
|---|---|---|
| Issue open, owning entry `[x]` | The `closes #N` was dropped from a squash subject | `gh issue close N --comment "Fixed in <sha>."` |
| Issue closed, owning entry `[ ]` | Reverse drift — the item is probably done | Tick it, or re-open the issue |
| Issue open, no owning entry | Untriaged | Triage it |

The first row is the important one: it is the failure mode of the whole loop, and the only
thing that catches a landing where the subject line lost its issue reference.

## 6. `--comment` (opt-in)

With `--comment`, post on each triaged issue:

```
Triaged → TODO.md § <section>. Will close when fixed.
```

Show the exact text before posting. `gh issue comment` is not in `.claude/settings.json`'s
allowlist, so it prompts — that is correct for an outward-facing write. Default is silent:
`TODO.md` is the record, and the comment is for when other people are reading the tracker.

## 7. Commit the `TODO.md` edit

A triage pass that leaves `TODO.md` dirty is half-done: the next session inherits backlog edits
it did not make, and `/orchestrate`'s pre-flight has to guess whether they belong to the plan.
Commit before reporting.

Only when § 4 actually wrote something. `--audit`, and any pass that changed nothing, commit
nothing — there is no empty commit.

```bash
git status --short TODO.md    # BEFORE your first edit — see "Pre-existing edits" below
# ... triage edits ...
git add TODO.md
git commit -m "docs(triage): file #12 and #14 into the pre-v1 backlog"
```

- **Stage `TODO.md` and nothing else.** Never `git add -A`, never `git add .`, never stash. Other
  dirty files in the tree are not yours — leave them exactly as they are, and say so in the report.
- **Pre-existing edits.** Run `git status --short TODO.md` *before* your first edit. If it was
  already dirty, the commit would carry someone else's unrelated changes: show them the diff, get
  explicit approval, or leave the pass uncommitted and hand it back. Never try to split the file.
- **Type is always `docs`, scope `triage`** — `TODO.md` is documentation, and `docs` cuts no
  release (`docs/conventions.md` § Commits). One sentence naming the issues and the section they
  landed in. The 72-character cap does not bind `docs`, but keep it to a line anyway.
- **Never `closes #N` in a triage commit.** The subject may name issues; it must never carry a
  closing keyword, or the pass would close the very issues it just filed (§ The close policy).
- **Never push.** A push to `main` runs the release workflow; landing is `/land`'s job.
- **Check the branch first** (`git branch --show-current`). Triage is `main`-level doc work; if
  you are on a `plan/*` branch, say which one in the report so the commit is not a surprise.
- If a § 4b close was approved, that is a `gh issue close`, not part of this commit.

## Never

- Never close an issue as "triaged" (§ The close policy).
- Never label, assign, milestone, or edit an issue body — muster's scope is issue *creation*
  (`SPEC.md` 2026-08-31), and this command stays close to that line: it reads issues, writes
  `TODO.md`, and comments only when asked.
- Never write a TODO entry for an issue you have not read in full.
- Never duplicate an existing entry — if `/triage <N>` is run on an already-triaged issue,
  find the existing entry and offer to update it.
- Never commit anything but `TODO.md`, never push, and never put `closes #N` in the commit
  subject (§ 7).

## Report

Finish with: how many issues were triaged and into which sections, the audit table, the commit
subject and short sha (or why nothing was committed), any dirty files you deliberately left
alone, and the untriaged count remaining (`0` is the goal). If nothing needed doing, say so in
one line.
