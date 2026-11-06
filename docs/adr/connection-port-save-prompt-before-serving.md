---
id: connection-port-save-prompt-before-serving
type: decision
status: accepted
date: 2026-11-06
summary: The save-port prompt is asked after the bind and before serving, and the daemon waits for it; opt-in save, default No and no fallback stand.
features: [connection]
tags: [ux, user-decision]
files: [cmd/musterd/main.go, cmd/musterd/port.go]
tests: [TestPortProc_SavePromptIsAskedBeforeServingAndStaysTheLastLine, TestPortProc_InterruptAtSavePromptSavesNothingAndExitsZero, TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered]
refs: [plan:sweep-2026-11-06-2, kb:adr/connection-port-flag-replaces-addr, kb:adr/connection-dashboard-auto-opens-on-terminal, "#120"]
supersedes: [connection-port-saved-per-profile-on-prompt]
---
**Context.** The save prompt ran on its own goroutine while the daemon served. The version check, usage poll and update check started at the same moment and logged to the same stderr, so the question was buried by log lines at once. Left unanswered and then interrupted, it counted as No without a word, and the developer believed the port had been saved (#120).

**Options.** (A) Keep serving while the prompt waits, re-print it after the startup lines and log when it lapses. (B) Ask before serving and wait for the answer. (C) Save a flag-given port without asking.

**Decision.** B, the developer's choice. The port is still the `-port` value, else the one saved in this profile's data dir (`<data-dir>/port`), else 8765. When the flag's port differs from what the daemon would otherwise use, and stdin is a real terminal and this is not an update re-exec, the daemon binds the port and then asks `Save port N for future starts? [y/N]`. Nothing serves and no background startup work runs until it is answered. Only y/yes saves, and saving `default` clears the saved port. A signal at the prompt saves nothing and exits 0. A busy port still fails startup naming `-port`, before any prompt; nothing falls back to a free port.

**Consequences.** The prompt is the last line on the terminal until it is answered. A daemon started with a new port on a terminal does not serve hooks or the dashboard until the developer answers, so a Claude session's hooks during that wait are lost (hook delivery is best-effort anyway). Starts without a terminal, after a restart, or with an unchanged port never wait.
