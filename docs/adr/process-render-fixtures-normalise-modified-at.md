---
id: process-render-fixtures-normalise-modified-at
type: decision
status: accepted
date: 2026-11-12
summary: Render fixtures normalise the reader listing's modifiedAt like every other time key, so file ages in render tests come from the test clock, not the fixture.
features: [reader]
tags: [testing]
files: []
tests: []
refs: [plan:claude-tmp-files, kb:adr/process-render-fixtures-generated-from-daemon]
supersedes: []
---
**Context.** #121 put real file mtimes on the wire (`plan.modifiedAt`, each scratch file's `modifiedAt`). Recorded raw, they change on every `make gen-render-fixtures` run and `check-render-fixtures` goes red for no product reason.

**Decision.** `modifiedAt` joins the fixture normaliser's time keys. The normaliser renumbers instants in the order it meets them, so the values stay distinct but not in their real order — the newest scratch file can read as the earliest. The plan file's mtime is set an hour before the scenario's instants so it never shares a second with a session timestamp, which had merged two values and shifted every later one.

**Consequences.** A render test that asserts an age or an order by age drives it from its own pinned clock, never from fixture `modifiedAt` values.
