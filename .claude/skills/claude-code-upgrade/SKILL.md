---
name: claude-code-upgrade
description: "Drives the Claude Code version ritual: runs make canary against the installed binary, then records a green run as a verified version and commits it. Routes a red run to the red ritual instead of improvising a fix."
argument-hint: "[stable | latest | <version>]"
allowed-tools: Bash, Read, Edit, Grep
---

> Maintainer note: a skill in the main session because a red run needs a conversation, not a
> verdict; `docs/claude-code-versions.md` is the source of truth for *why* — this is only the driver.

`make canary` already ends with `go run ./tools/versions bump`, which appends the row and rewrites
the version fragments; what is left is judgement, and that is what the steps below are.

You drive a Claude Code version check to a committed conclusion. Invoked with: **$ARGUMENTS**
(empty = verify whatever is installed; otherwise an update target to move to first).

## Rules

1. **Records and generated files change only through their tools.** `bump` and `gen` own
   `internal/claudecode/observed_versions.txt` and everything between `versions:` marker comments
   in `README.md` and `docs/claude-code-versions.md` (the record's header: "Never edit a version
   elsewhere."); `make gen-kb` owns the generated kb files. When `make check` fails on one,
   regenerate it rather than editing it. Record only a version the canary actually went green on.
2. **A green bump edits no fact record.** `..canary` ceilings follow the record automatically and
   `guard: none` literal ceilings stay frozen at what was measured
   (`docs/claude-code-versions.md` § The green ritual); fact records move in the **red** ritual only.
3. **Stage by name, never `git commit -am`** — `bump` prints exactly that as its hint, and it
   would sweep up every unrelated dirty file in the tree.
4. **`~/.claude/settings.json` is out of bounds** (root `CLAUDE.md` hard rule) — the developer's
   live sessions depend on it. Nothing here needs it.
5. **A real run costs six haiku turns of the developer's subscription**, so run it here in the
   main session, never in a subagent (the harness wakes only the main session), and don't re-run to
   "be sure". The one exception is the named flake in step 5.

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

With an argument, run step 3 first and classify the version installed after it; the cases below
then apply to that version.

- **Installed == the ceiling** → an unforced canary skips its harness and live tiers (that is the
  designed behaviour, not a failure: nothing about the installed Claude Code has changed since the
  last green run). Say so and stop. Offer `MUSTER_CANARY_FORCE=1 make canary` for the one case that
  needs it — a change inside `internal/claudecode` itself, which an unforced run never exercises.
- **Installed is inside the range, below the ceiling** (`verified`) → already recorded; a canary
  would run in full and `bump` would edit nothing. Say so and stop, unless the developer asks for a
  re-check — then run step 4 and expect the "already inside the range" outcome in step 5.
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

~2.5–3 min. Keep the log — it is the evidence for whatever you claim next; read a failure to the
end before summarising it.

## 5. Read the outcome

**Green, and the installed version was outside the range.** `bump` has already appended the
row and regenerated the fragments in `README.md` and `docs/claude-code-versions.md`. Two
things remain:

```sh
make gen-kb   # the resolved ceiling is embedded in generated kb files — see below
make check
```

Every generated file that lists a `..canary` fact renders the **resolved** ceiling, so a
ceiling bump makes all of them stale — `docs/INDEX.md`, the per-feature `INDEX.md` files and
`.claude/rules/*.md`, around 21 files. `make check-kb` fails them "stale — regenerate with
make gen-kb" (`30c4cf8` left the tree red that way).

Then commit the record, both fragment files and every regenerated kb file **together** —
generated files ride the same commit as the record (`CLAUDE.md` doc upkeep). Stage exactly those:

```sh
git add internal/claudecode/observed_versions.txt README.md docs/claude-code-versions.md \
  docs/INDEX.md docs/features/*/INDEX.md .claude/rules/*.md
git status --short   # nothing may remain unstaged — anything that does is outside the bump: stop and ask
git commit -m "fix(versions): record Claude Code <version> as verified by make canary"
```

`fix` is deliberate, not cosmetic: the record is embedded into the shipped binary, so this is
a shipped change and cuts a patch release — which is what makes the drift warning stop for
anyone already on that version.

**Green, and the installed version was already inside the range.** `bump` printed that
nothing needed recording and edited nothing. There is nothing to commit. Say so in one line.

**A known flake.** Two failures are accepted gate flakiness rather than drift: run E's
`PermissionRequest` wait timing out (the model answered the plan prompt with text instead of
calling the tool), and the live tier's usage call returning a 5xx. **Rerun once** before
reading either as an interface change.

**Red.** Stop. A red canary is a real interface change and the fix is a hand-built adapter
inside `internal/claudecode` — `/plan-work`-sized work, not something to improvise mid-ritual.
Report:

- the failing assertion, quoted from the log, not paraphrased;
- the fact record it guards (`go run ./tools/kb ls --type fact`);
- that `docs/claude-code-versions.md` § "The red ritual" is the next step, and that rolling
  back with `claude update <version>` is available meanwhile.

Leave the fact record, the observed-versions record and the adapter as they are — the red ritual
changes them, through `/plan-work`.

## Report

Close with, in this order: installed version and how it got there (already installed, or
updated on request); the canary verdict; what the range is now; the files committed and the
commit subject; and an explicit line stating that no fact record was edited. If nothing needed
doing, say so in one line.
