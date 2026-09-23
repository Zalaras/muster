# Doc upkeep — what the orchestrator checks and fixes

Read from `orchestrate/SKILL.md` § Doc-Upkeep Backstop step 2. Each bullet names a file the
pipeline may have left stale and what a complete entry looks like.

**The split**: records are yours; the present-tense documents — `docs/features/*/spec.md` and
`docs/protocol.md` — belong to Step 7's `doc-reconcile`, which runs after review approves
(kb:adr/process-doc-reconcile-after-review). Amend `plans/<plan>/doc-delta.md` from the logs'
`doc-delta:` lines before spawning it.

- **`TODO.md`** — a finished backlog item (or sub-bullet): tick it, add its `✅ done <date> (plan
  …)` line, move the block to `docs/history/todo-done.md` under the same heading (a sub-bullet
  stays with its still-open parent). **Ticks and moves only** — a new open item is the user's to
  file (kb:adr/process-backlog-entries-are-the-users-to-file), the sole exception being one the
  approved plan's § Out of scope names, copied verbatim. Everything else this run found goes to
  `plans/<plan>/proposed-backlog.md`, where it waits for the user rather than evaporating.
  **A ticked item with a GitHub issue link → record the issue number** for
  Completion step 5, judging **full vs partial**: a plan can advance an issue without finishing it (a
  design-token issue may span two plans). Only a fully-resolved issue is a close candidate; a
  partial one is named in the completion summary as deliberately *not* closing, with what
  remains.
- **`plans/<plan>/proposed-backlog.md`** — where follow-up this run found is *proposed*, never
  filed. One `### <title as it would read in TODO.md>` block each, then the entry body ready to
  paste, under five lines: **Summary** (one line, ~100 characters — what `/land` prints when it
  puts the proposal to the user), **Source** (`review.md` Minor 2 `[orchestrator]`, Note 4, an impl
  log), **Change requested** (yes/no, quoting the reviewer — a `[note]` is always *no*, and
  hiding that is the failure this file exists to prevent), **Suggested section** (a hint only;
  the user chooses), **Pre-existing** (does this branch touch the code?). Say "nothing proposed"
  in the completion summary rather than inventing entries. `/land` step 2 is where the user
  decides each one; never write the file's `## Decisions` section yourself.
- **`docs/adr/`** — every `deviation:` line in an implementation log's `## Decisions`, and every
  `decisions/<slug>/decision.md` this run produced, has an ADR: write it (`status: proposed`,
  `refs: [plan:<plan-name>, <the log or decision file>]`, one decision per record), append
  `→ kb:adr/<slug>` to the log line, and name it in the completion summary. Routine
  implementation of an accepted ADR needs nothing. A deviation that contradicts an *accepted*
  ADR is not yours to record — it is an `[orchestrator:user-decision]` (Step 6 1a).
- **`docs/facts/`** — a new **measured** Claude Code fact (never an assumption) becomes a fact
  record with `verified:` the version measured and `guard:` the test that pins it; a fact
  proved wrong gets its ceiling pinned and a new record linked by `refs`, never a rewrite.
- **Diagrams** (kb:adr/knowledge-diagrams-are-mermaid-records) — for every file the branch
  changed, `go run ./tools/kb for <path>` names the `kb:diagram/` records depicting it; each is
  still true of what shipped or you update its fence now. A plan `## Diagrams` entry marked
  `delta of kb:diagram/<slug>` (or of a feature spec's inline diagram) is applied to that
  record. Say "no diagram touched" in the completion summary when none applies.
