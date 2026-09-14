# Doc upkeep — what the orchestrator checks and fixes

Read from `orchestrate/SKILL.md` § Doc-Upkeep Backstop step 2. Each bullet names a file the
pipeline may have left stale and what a complete entry looks like.

- **`TODO.md`** — a finished backlog item (or sub-bullet): tick it, add its `✅ done <date> (plan
  …)` line, move the block to `docs/history/todo-done.md` under the same heading (a sub-bullet
  stays with its still-open parent). A new follow-up goes into the right milestone rather than
  evaporating. **A ticked item with a GitHub issue link → record the issue number** for
  Completion 2c, judging **full vs partial**: a plan can advance an issue without finishing it (a
  design-token issue may span two plans). Only a fully-resolved issue is a close candidate; a
  partial one is named in the completion summary as deliberately *not* closing, with what
  remains.
- **`docs/adr/`** — every `deviation:` line in an implementation log's `## Decisions`, and every
  `decisions/<slug>/decision.md` this run produced, has an ADR: write it (`status: proposed`,
  `refs: [plan:<plan-name>, <the log or decision file>]`, one decision per record), append
  `→ kb:adr/<slug>` to the log line, and name it in the completion summary. Routine
  implementation of an accepted ADR needs nothing. A deviation that contradicts an *accepted*
  ADR is not yours to record — it is an `[orchestrator:user-decision]` (Step 6 1a).
- **`docs/facts/`** — a new **measured** Claude Code fact (never an assumption) becomes a fact
  record with `verified:` the version measured and `guard:` the test that pins it; a fact
  proved wrong gets its ceiling pinned and a new record linked by `refs`, never a rewrite.
- **`docs/protocol.md`** — must match what shipped. If plan-work merged the delta at approval and an approved mid-run adjustment changed it, reconcile the doc now. Then `make gen-kb` so `contract.md` follows.
