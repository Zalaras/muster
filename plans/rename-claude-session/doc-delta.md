# Doc delta: rename-claude-session

Seeded from plan.md § Doc Delta; the impl log's two `doc-delta:` lines are already folded in (a3f44803).

**rename** — becomes true:
- A dashboard rename reaches Claude Code's own name once: as the next prompt's hook reply, or as
  `--name` when the session is resumed first. A second prompt never re-sends the same name; a
  name Claude Code suffixes (kb:fact/session-name-uniqueness-flagged) stays suffixed, and the
  dashboard follows it (last rename wins, below).

**rename** — stops being true:
- "Rename does not change Claude Code's own session name" (the clause before "and does not touch
  the rail order").
- "Status posts keep refreshing Claude's name into its own column but never read or write the
  override" — after delivery a different Claude name now clears it.

**rename** — becomes true (last rename wins):
- Once a rename has reached Claude Code, a later different name from Claude Code (a `/rename`, or a
  suffix) clears the override, and the dashboard shows Claude Code's name.

**rename** — also stops being true (`docs/features/rename/spec.md` and `docs/protocol.md` § `kb:anchor/sessions.title`):
- "while an override is set, a post that changes only Claude's name broadcasts nothing" (protocol:
  "persists and broadcasts nothing") — true now only before delivery; after delivery a different
  name clears the override, persists and broadcasts one `sessionUpsert`.

**lifecycle** — stops being true (`docs/protocol.md` § The Session object, `titleOverride` comment):
- "Never touched by status posts, rebinds, resume or reconcile." — becomes: never touched by
  rebinds, resume or reconcile; a status post clears it once the rename has reached Claude Code and
  Claude Code reports a different name (kb:adr/rename-claude-change-after-delivery-clears-override).

**ingest** — stops being true (`docs/features/ingest/spec.md` § Transport and its "One post, end to end" diagram):
- "The handler returns `200` with an empty body at once and enqueues the raw body; a single worker
  parses it" — becomes: the handler enqueues the raw body and answers `200` at once; its only
  request-path work is an in-memory parse and session-state read to build a routed
  `UserPromptSubmit`'s rename reply; persistence, `seq` and state transitions stay in the single worker.
- In the diagram, `H-->>W: 200, empty body` becomes `200, empty body (or a routed UserPromptSubmit's
  rename reply)`, and the Note "no parsing, no DB work on the request path" becomes "no DB work on
  the request path; only the prompt-reply parse".

**ingest** — becomes true (`docs/protocol.md` § `kb:anchor/ingest`):
- The hook endpoint answers `200` with an empty body, except a routed `UserPromptSubmit` carrying
  a not-yet-sent rename, whose body is `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"…"}}`.
  The hook wrapper (`hook.sh`, not `status-line.sh`) prints a 2xx body to stdout.

**ingest** — stops being true:
- "Return `200` with empty body immediately" as an unconditional rule.

**launch** — becomes true (`docs/protocol.md` § `kb:anchor/sessions.resume`):
- The spawned argv is `claude --model <model.id> --resume <claudeSessionId> [--name <titleOverride>] [--permission-mode <latched>]`,
  `--name` present only when the override is set, not yet sent, and differs from Claude Code's last-known name.

**launch** — stops being true:
- The same sentence without `[--name <titleOverride>]`.

## From review cycle 2 (Note 3)

**ingest** — tighten when promoting: the request-path work is an in-memory parse of every hook body
plus a session-state read-and-mark (the send is recorded as it is built), not a read only; the
reply is built only for a routed `UserPromptSubmit`.
