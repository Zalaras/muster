---
id: fable-model-alias
type: fact
status: active
date: 2026-09-11
summary: fable is a valid --model alias: the bundle's alias switch has case"fable":case"mythos" beside haiku/sonnet/opus.
features: [launch]
tags: [claude-code-format]
files: [web/src/features/launch.ts]
tests: []
refs: []
verified: 2.1.251..2.1.267
guard: none
---
`fable` is accepted by `--model`: the installed bundle's model-alias switch contains
`case"fable":case"mythos"` alongside `haiku`/`sonnet`/`opus`, and the resolver has a
`case"fable"` branch. Muster passes the literal string `fable` to `--model` verbatim.

Evidence: static inspection of `~/.local/share/claude/versions/2.1.251`, 2026-08-30. Not
driven by `make canary` (the canary launches haiku only, by the subscription rule); re-verify
by static inspection on a version bump.
