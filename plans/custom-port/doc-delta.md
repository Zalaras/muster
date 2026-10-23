# Doc Delta: custom-port

Seeded from `plan.md` § Doc Delta and amended by the orchestrator with the implementation logs'
`doc-delta:` lines and review cycle 1 (correctness Minor 1).

**connection** — becomes true:
- `docs/features/connection/spec.md` § Transport and auth: the daemon binds `127.0.0.1` on the port from `-port`, else the profile's saved port (`<data-dir>/port`), else 8765; on a terminal it offers to save a flag-given port that differs from the one it would otherwise use, and saving `-port default` clears it.

**connection** — stops being true:
- `docs/features/connection/spec.md` § Transport and auth: "The daemon binds `127.0.0.1` on one port (`-addr`)" — replaced by the sentence above. The spec is at 821 words; the replacement must not grow it (trim elsewhere in the section if needed).

**Already handled by the orchestrator** (no doc-reconcile action):
- `.claude/skills/dev-loop/SKILL.md` `-addr` lines → `-port` (daemon-implementation.md doc-delta, commit 1346edd2).
- `kb:adr/connection-port-saved-per-profile-on-prompt` names the `<data-dir>/port` file (daemon-implementation.md doc-delta, commit 1346edd2).
