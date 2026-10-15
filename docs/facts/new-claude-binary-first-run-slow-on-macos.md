---
id: new-claude-binary-first-run-slow-on-macos
type: fact
status: active
date: 2026-10-15
summary: The first run of a newly written claude binary waits ~11 s on macOS with no CPU of its own; later runs are normal and killing the first does not reset it.
features: [connection, launch]
tags: [claude-code-format]
files: [internal/claudecode/version.go, internal/claudecode/modelcheck.go]
tests: []
refs: [plan:claude-version-watch, "https://github.com/Zalaras/muster/issues/81", "https://github.com/Zalaras/muster/issues/89", kb:fact/model-catalog-precheck-zero-token]
verified: 2.1.300..2.1.300
guard: none
---
Claude Code's native installer writes each update as a new ~250 MB file under
`~/.local/share/claude/versions/` and repoints the `claude` symlink. The first exec of a file
macOS has not seen is held before the process runs: measured on darwin x86_64, a fresh copy of
the 2.1.300 binary took 10.71 s for `--version` (user CPU 0.00) and then 0.03 s, and a second
fresh copy took 11.01 s for the model pre-check and then 0.87 s. The warm installed binary
answers `--version` in 0.02 s.

Killing the first run does not reset the cost: a fresh copy killed at 3 s then took 7.02 s,
then 0.04 s. The hold keeps going whether or not the process that triggered it waits.

So the first daemon process to run `claude` after a background update pays about 11 s, and a
5 s bound on that run always kills it. Four concurrent model checks on a warm binary, with six
live sessions, took 1.22 s each, so load is not the cause.

`guard: none`: the cost is macOS's, not Claude Code's, and no test can make a binary new to
the OS without copying 250 MB.
