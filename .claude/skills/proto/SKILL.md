---
name: proto
description: "Builds a throwaway prototype in its own worktree and changes it on the developer's feedback until they accept it; `done` hands its log and screenshots to /spec. The prototype is never landed."
argument-hint: "<name> \"<description>\" | <name> done"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

> Maintainer note: a skill in the main session with no subagents — the loop is a conversation and the developer drives a long-lived daemon (kb:adr/process-prototype-first-track).

Put a working version of the idea in front of the developer fast, change it as they react, and stop
when they say it is what they want. The code is thrown away: `/spec` is drafted from what was
learned and the pipeline builds it again from the spec. Use this only when the requirements cannot
be written without seeing the thing — a new surface, a protocol change. Otherwise `/spec` or `/fix`.

## Arguments

This command was invoked with: **$ARGUMENTS**

- `<name> "<description>"` — start, or pick up again when `proto/<name>` already exists.
- `<name> done` — the developer has accepted it; see Done.

## Start

1. From the primary checkout on `main`: `make worktree NAME=<name> KIND=proto`, then `EnterWorktree`
   with `path: ../muster-proto-<name>`.
2. Create `plans/<name>/prototype-log.md`: the description, the date, and the weekly usage now —
   `sqlite3 -readonly ~/Library/Application\ Support/Muster/muster.db "select seven_day_pct from usage_sample order by at desc limit 1"`.
3. Build the quickest thing that shows the idea.
4. `make proto-run` in the background. It runs on its own data dir, tmux socket and port, so the
   developer's live sessions are out of reach. Give the developer `dashboardUrl` from
   `.proto-data/tokens.json`.

## What binds here

CLAUDE.md § Hard rules, all of them: they protect the developer's live sessions and subscription,
not the code. Nothing else does — no tests, no conventions, no doc upkeep, no gates, no commits
until Done. A session **you** launch to check something uses Haiku and a trivial prompt and is
killed straight after; the developer's own launches are theirs.

## The loop

On each round of feedback: change it, rebuild (`make web-build` and a reload for the dashboard;
restart `make proto-run` for Go), and append to the log:

```markdown
### Round <n> — <date>
- Asked: <what the developer asked for>
- Changed: <what they now see or can do>
- Accepted: <what they said is right as it stands>
- Changed mind: <what they wanted before → what they want now, and why>   (only when it happened)
```

Write what the developer **sees and does**, never how the code does it: the log feeds a spec, and
the code does not survive. The developer says when it is done; don't ask each round.

## Done

1. Screenshot each state the developer accepted into `plans/<name>/prototype/`, named for the
   state, with Playwright in headless Chromium against the running daemon (`npx playwright
   screenshot` from `web/` for a plain view; a throwaway script for a state that needs clicks).
2. Append the weekly usage now to the log.
3. Stop the daemon with SIGTERM. `tmux -L muster-proto-<name> ls` must then print "no server
   running"; anything listed is an orphan burning subscription — kill it.
4. Commit the whole tree on `proto/<name>` as `chore(proto): <name> as accepted`. `--no-verify` is
   allowed on this branch only.
5. `ExitWorktree` (keep), then copy `../muster-proto-<name>/plans/<name>/` into the primary's
   `plans/<name>/` — the log and screenshots are all that outlives the branch.
6. Run `/spec <name>`. It drafts from the log instead of interviewing.

The tree and branch stay for `/plan-work` to read; its Approval drops them. Two checks hold the
rest: the guard refuses to merge a `proto/` branch, and `/orchestrate` refuses to start while
`proto/<name>` exists.
