---
id: session-registry-names-running-sessions
type: fact
status: active
date: 2026-10-05
summary: ~/.claude/sessions/<pid>.json now names its running session — sessionId, name, nameSource, nameSince, status — and claude agents --json lists the same.
features: [rename, launch]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/no-running-session-signal]
verified: 2.1.289..2.1.289
guard: none
---
On 2.1.289 each running process's `~/.claude/sessions/<pid>.json` carries `sessionId`, `cwd`,
`kind` (`interactive`), `entrypoint`, `name`, `nameSource`, `nameSince`, `status` (`idle`,
`busy`), `startedAt`, `procStart`, `messagingSocketPath` and `peerProtocol`/`peerFeatures`.
2.1.283 had no session id there (kb:fact/no-running-session-signal).

`nameSource` values seen: `user` (`--name` or `/rename`), `hook`
(kb:fact/hook-output-sets-session-title) and `derived` (the generated title). The bundle also
names `auto`, `collision` and `peer`. The file follows `/clear` onto the new `sessionId` and is
rewritten the moment a rename lands, while status-line posts may lag
(kb:fact/slash-rename-immediate-no-hook).

`claude agents --json` prints the live sessions as `{cwd, kind, name, pid, sessionId, startedAt,
status}` without a TTY.

The sibling `<pid>.<hash>.key` file was not opened.

Evidence: probe sessions s1–s7, 2026-10-05; the developer's own registry file was read for its
keys only.
