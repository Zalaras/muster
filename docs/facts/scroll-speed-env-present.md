---
id: scroll-speed-env-present
type: fact
status: active
date: 2026-09-11
summary: CLAUDE_CODE_SCROLL_SPEED is present in the installed bundle; the static canary tier asserts every LaunchEnv key by byte string.
features: [launch, surfaces]
tags: [claude-code-format]
files: [internal/claudecode/launch.go]
tests: [TestLaunchEnv]
refs: [spikes/S6-scroll-bandwidth.md, "#13"]
verified: 2.1.267..canary
guard: TestInstalledBinaryCarriesInterfaceStrings
---
The environment variable `CLAUDE_CODE_SCROLL_SPEED` is present as a byte string in the
installed Claude Code bundle. The guard iterates every key of the production
`claudecode.LaunchEnv()` rather than spelling the name, so a rename or removal fails the
canary; presence says nothing about semantics — the five-lines-per-notch effect stays measured
in `spikes/S6-scroll-bandwidth.md`.

Evidence: 2.1.267 static tier, 2026-09-10 (issue #13 follow-up).
