---
name: claude-code-upgrade
description: "Drives the Claude Code version ritual: runs make canary against the installed binary, then records a green run as a verified version and commits it. Routes a red run to the red ritual instead of improvising a fix."
argument-hint: "[stable | latest | <version>]"
allowed-tools: Bash, Read, Edit, Grep
---

> **Maintainer note:** Authored 2026-09-13. This runs in the main session, not a subagent:
> a real `make canary` burns six haiku turns of the developer's subscription, and a red run needs
> a conversation rather than a verdict. `docs/claude-code-versions.md` stays the source of
> truth for *why* the range works the way it does — this skill is only the driver, so don't
> restate its rationale here.
>
> Most of the ritual is already automated: `make canary` ends with
> `go run ./tools/versions bump`, which appends the row and rewrites the version fragments.
> What is left is judgement, and that is what the steps below are.

You drive a Claude Code version check to a committed conclusion. Invoked with: **$ARGUMENTS**
(empty = verify whatever is installed; otherwise an update target to move to first).

## Iron rules (violating any of these is a critical failure)

1. **Never hand-edit `internal/claudecode/observed_versions.txt`**, and never edit anything
   between `versions:` marker comments in `README.md` or `docs/claude-code-versions.md`.
   `bump` and `gen` own both. The record's own header says it: "Never edit a version elsewhere."
2. **A green bump edits no fact record.** Facts spell their ceiling two ways, and the
   difference is load-bearing: `guard: <test>` carries `verified: <floor>..canary`, a symbolic
   ceiling `internal/kb` resolves against the record automatically; `guard: none` carries a
   literal ceiling deliberately frozen at what was last measured. Raising those by hand would
   assert ~19 things nobody measured, and `make check` would stay green while you did it.
   Fact records move in the **red** ritual only.
3. **Never `git commit -am`** — `bump` prints exactly that as its hint, and it would sweep up
   every unrelated dirty file in the tree. Stage deliberately.
4. **Never read or modify `~/.claude/settings.json`** (root `CLAUDE.md` hard rule) — the developer's
   live sessions depend on it. Nothing here needs it.
5. **A real run costs six haiku turns.** Don't re-run to "be sure". The one exception is the
   named flake in step 5.

## 1. Preflight — refuse, don't warn

```sh
git status --porcelain          # must be empty
git rev-parse --abbrev-ref HEAD # main — a version bump is not plan work
claude -version
```

Check all three before touching anything; if any fails, stop and say exactly which. A dirty
tree is not cosmetic: `bump` **refuses** outright when the record has uncommitted changes
(it never overwrites work in progress on the one file it writes), and a clean tree is what
keeps the commit reviewable.

Then report where things stand — installed version, the current range, and the
classification (`unknown | below | verified | above`):

```sh
cat internal/claudecode/observed_versions.txt
```

## 2. Decide whether there is anything to do

- **Installed == the ceiling**, and no argument was given → an unforced canary skips its
  harness and live tiers (that is the designed behaviour, not a failure: nothing about the
  installed Claude Code has changed since the last green run). Say so and stop. Offer
  `MUSTER_CANARY_FORCE=1 make canary` for the one case that needs it — a change inside
  `internal/claudecode` itself, which an unforced run never exercises.
- **Installed is outside the range** (`below` or `above`) → there is something to record.
  Proceed.

## 3. Move versions only if asked

Only when `$ARGUMENTS` names a target. **Confirm with the developer first**, and say why you're
asking: there is exactly one `claude` binary on this machine and it is used for all of the
developer's work, not just Muster's managed sessions. Muster does not get to move it as a side effect.

```sh
claude update <target>   # stable | latest | a specific version
claude -version          # re-read; everything downstream keys on this
```

Rolling *back* is the same command with a version, and is the standing escape hatch if a new
release turns out to be red.

## 4. Run the canary

```sh
make canary 2>&1 | tee <scratchpad>/canary-<version>.log
```

~2.5–3 min. Keep the log — it is the evidence for whatever you claim next. Don't summarise a
failure you haven't read to the end.

## 5. Read the outcome

**Green, and the installed version was outside the range.** `bump` has already appended the
row and regenerated the fragments in `README.md` and `docs/claude-code-versions.md`. Two
things remain, and the first is the one the ritual doc used to omit:

```sh
make gen-kb   # the resolved ceiling is embedded in generated kb files — see below
make check
```

Every generated file that lists a `..canary` fact renders the **resolved** ceiling, so a
ceiling bump makes all of them stale — `docs/INDEX.md`, the per-feature `INDEX.md` files and
`.claude/rules/*.md`, around 21 files. `make check-kb` fails them "stale — regenerate with
make gen-kb". This is not hypothetical: commit `30c4cf8` committed only the record and the two
fragments and left the tree red until an unrelated commit repaired it by accident.

Then commit the record, both fragment files and every regenerated kb file **together** —
generated files ride the same commit as the record (`CLAUDE.md` doc upkeep):

```sh
git add -A && git status   # read it before committing
git commit -m "fix(versions): record Claude Code <version> as verified by make canary"
```

`fix` is deliberate, not cosmetic: the record is embedded into the shipped binary, so this is
a shipped change and cuts a patch release — which is what makes the drift warning stop for
anyone already on that version.

**Green, and the installed version was already inside the range.** `bump` printed that
nothing needed recording and edited nothing. There is nothing to commit. Say so in one line.

**A known flake.** Two failures are accepted gate flakiness rather than drift: run E's
`PermissionRequest` wait timing out (haiku answered the plan prompt with text instead of
calling the tool), and the live tier's usage call returning a 5xx. **Rerun once** before
reading either as an interface change.

**Red.** Stop. A red canary is a real interface change and the fix is a hand-built adapter
inside `internal/claudecode` — `/plan-work`-sized work, not something to improvise mid-ritual.
Report:

- the failing assertion, quoted from the log, not paraphrased;
- the fact record it guards (`go run ./tools/kb ls --type fact`);
- that `docs/claude-code-versions.md` § "The red ritual" is the next step, and that rolling
  back with `claude update <version>` is available meanwhile.

Do not edit a fact record, the observed-versions record, or an adapter here.

## Never

- Never record a version the canary did not actually go green on.
- Never edit a generated file by hand to make `make check` pass — regenerate it.
- Never delegate the canary run to a subagent: each real run costs tokens, and the harness
  wakes only the main session.
- Never widen the commit beyond the bump. If the tree had unrelated work in it, you skipped
  step 1.

## Report

Close with, in this order: installed version and how it got there (already installed, or
updated on request); the canary verdict; what the range is now; the files committed and the
commit subject; and an explicit line stating that no fact record was edited. If nothing needed
doing, say so in one line.
