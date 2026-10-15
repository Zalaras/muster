---
id: effort-flag-values
type: fact
status: active
date: 2026-10-15
summary: --effort takes low..max case-insensitively; an unknown value warns on stderr and starts at the default; ultracode is accepted as xhigh plus ultracode.
features: [launch]
tags: [claude-code-format]
files: [internal/claudecode/launch.go]
tests: [TestInstalledBinaryCarriesInterfaceStrings]
refs: [test/rig/captures/capture-3.jsonl, kb:fact/effort-levels-per-model]
verified: 2.1.300..2.1.300
guard: TestInstalledBinaryCarriesInterfaceStrings
---
`claude --help` lists `--effort <level>` as `low, medium, high, xhigh, max`. The `/effort`
command offers more (`auto`, `ultracode [on|off]`); the flag treats them differently:

- Values are case-insensitive: `XHIGH` is accepted silently.
- An unknown value (`auto`, `bogus`) prints `Warning: Unknown --effort value '<v>' — ignoring it
  and using the default effort. Valid values: low, medium, high, xhigh, max.` to stderr, and the
  session starts at the default. The launch does not fail.
- `--effort ultracode` is accepted silently: the level becomes `xhigh`, clamped as `xhigh` is
  (kb:fact/effort-levels-per-model), and the TUI footer reads `◉ xhigh · ultracode`. The status
  line carries the level only; nothing in it says ultracode.
- A retired model id can be served as another model: `--model claude-opus-4-1-20250805` ran as
  `claude-opus-5-5`, and the status line's `model.id` named the one running.

Evidence: probe instance 3, 2026-10-15; stderr from `--bare --no-session-persistence -p ""` runs
(zero tokens) and tagged interactive sessions; 2.1.300.
