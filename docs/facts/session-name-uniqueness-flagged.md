---
id: session-name-uniqueness-flagged
type: fact
status: active
date: 2026-10-05
summary: Duplicate session names are refused only while server flag tengu_session_name_uniqueness is on; it was off on 2026-10-05, and duplicates were allowed.
features: [rename, launch]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/slash-rename-immediate-no-hook, kb:fact/session-registry-names-running-sessions]
verified: 2.1.289..2.1.289
guard: none
---
**Measured, flag off.** The account's cached GrowthBook features read
`tengu_session_name_uniqueness: false` (refreshed during the probe). Then nothing was refused or
suffixed. Three live sessions in one directory all took `ProbeBravo71`, by `/rename` and by
`--name` at launch. A case variant (`probebravo71`) and the name of an ended session were taken
too. A `--debug-file` log showed no `[session-name]` line, so the check never ran.
`CLAUDE_INTERNAL_FC_OVERRIDES` did not switch the flag on.

**Read from the 2.1.289 bundle, flag on — not measured.** The developer has seen it on. The
check runs against every *live* session on the machine, from the registry in any directory and
including sessions Muster did not start. Ended sessions don't count. Names compare normalised
(case-folded):

- `/rename` and a hook-set title gives way to **any** live holder of the name.
- `--name` at launch gives way only to holders that started earlier.
- Renaming to your own current name is kept.
- A kept name is checked again 3 s later. If a holder claimed it first (`nameSince`), the
  session gives way then, so a rename that printed success can flip afterwards.
- Giving way takes `<name>-<adjective>-<noun>` (e.g. `-calm-brook`), the base cut to fit the
  length cap, then `-<adjective>-<noun>-<n>` after 16 tries. The command prints
  `Session renamed to: <new> ("<asked>" is held by another live session on this machine)`, the
  registry reads `nameSource: "collision"`, and peers that messaged the session are told its
  new name.
- If the uniqueness check itself fails, the asked-for name is kept.

So whether a name Muster sends comes back exactly as sent depends on a flag Anthropic can flip
without a Claude Code release, and on every other session the developer has running.

Evidence: probe sessions s1–s5 on capture-3, 2026-10-05; the bundle at
`~/.local/share/claude/versions/2.1.289`.
