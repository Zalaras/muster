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
4. `make proto-run` in the background. It runs on its own data dir, tmux socket and port (from the
   name, so prototypes run side by side), so the developer's live sessions are out of reach. Give
   the developer the URL `make proto-url` prints, at `<name>.localhost` — never `dashboardUrl`
   from `.proto-data/tokens.json`: opened on `127.0.0.1`, a prototype replaces the auth cookie of
   the developer's own Muster and logs it out. Tell them how to give feedback without leaving the
   page: click **Feedback** (or hold Alt and click anything), type what should change, repeat,
   then **Send**.
5. Arm `Monitor` on `tail -n0 -F .proto-data/feedback-events.log` at the longest timeout. Each
   line is one sent batch; the notes and the elements they point at are in
   `plans/<name>/prototype-feedback.jsonl` (selector, text, size, colours, a clip of the markup).
   On expiry re-arm, first reading any batch newer than the last one you handled.

## What binds here

CLAUDE.md § Hard rules, all of them: they protect the developer's live sessions and subscription,
not the code. Nothing else does — no tests, no conventions, no doc upkeep, no gates, no commits
until Done. A session **you** launch to check something uses Haiku and a trivial prompt and is
killed straight after; the developer's own launches are theirs.

## The loop

A round is a batch sent from the page or a message in chat; both count the same. Change it,
rebuild (`make proto-web` for the dashboard — a plain `make web-build` drops the feedback
overlay; restart `make proto-run` for Go), write `done <batch>` to `.proto-data/feedback-status`
so the page offers a reload, and append to the log:

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
3. `make proto-stop`. It stops the daemon and its sessions and fails if a tmux session survived —
   an orphan burns subscription, so kill it as the message says.
4. Commit the whole tree on `proto/<name>` as `chore(proto): <name> as accepted`. `--no-verify` is
   allowed on this branch only.
5. `ExitWorktree` (keep), then copy `../muster-proto-<name>/plans/<name>/` into the primary's
   `plans/<name>/` — the log and screenshots are all that outlives the branch.
6. Run `/spec <name>`. It drafts from the log instead of interviewing.

The tree and branch stay for `/plan-work` to read; its Approval drops them. Two checks hold the
rest: the guard refuses to merge a `proto/` branch, and `/orchestrate` refuses to start while
`proto/<name>` exists.
