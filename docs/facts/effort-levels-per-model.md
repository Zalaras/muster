---
id: effort-levels-per-model
type: fact
status: active
date: 2026-10-15
summary: Each model has its own effort default and level set; --effort is clamped to it silently, and the status line reports the level applied.
features: [launch]
tags: [claude-code-format]
files: [internal/claudecode/launch.go, internal/claudecode/status.go]
tests: []
refs: [kb:fact/status-line-effort-key, kb:fact/effort-changes-mid-session, kb:fact/effort-flag-values]
verified: 2.1.300..2.1.300
guard: none
---
`claude --help` lists `--effort <level>` as `low, medium, high, xhigh, max`. What a session
actually runs at depends on the model. Measured from the status line's `effort.level` on the
first post, with no prompt sent and no saved effort:

| `--model` | resolves to | no flag | levels kept as given | clamped |
|---|---|---|---|---|
| `claude-haiku-4-5-20251001` | Haiku 4.5 | key absent | none, key absent for every value | — |
| `claude-sonnet-4-5-20250929` | Sonnet 4.5 | key absent | none, key absent for every value | — |
| `haiku` | `claude-haiku-5-5` | `medium` | all five | — |
| `sonnet` | `claude-sonnet-5-5` | `high` | all five | — |
| `opus` | `claude-opus-5-5` | `medium` | all five | — |
| `fable` | `claude-fable-5-1` | `high` | all five | — |
| `claude-opus-4-5-20251101` | Opus 4.5 | `high` | low, medium, high | `xhigh`, `max` → `high` |
| `claude-sonnet-4-6` | Sonnet 4.6 | `high` | low, medium, high, max | `xhigh` → `high` |
| `claude-opus-4-1-20250805` | **`claude-opus-5-5`** | `medium` | all five | — |

- Clamping is silent: no warning, no error. The status line shows the clamped level, so it, not
  the flag, is what the session runs at.
- The per-model levels and default come from a model list the server sends at startup (bundle
  keys `effort_levels`, `default_effort`), not a table in the binary, so they can change without
  a Claude Code release. A settings `maxEffortLevel` (also per model under `modelSettings`) caps
  every source, flag included.
- No hook payload carries effort: 64 `SessionStart` payloads across these launches had none.

Evidence: probe capture `capture-3.jsonl`, 2026-10-15, 63 tagged sessions
(`--name p_<model>_<effort>`), one status-line post read per session; Claude Code 2.1.300 per
every payload's `version`.
