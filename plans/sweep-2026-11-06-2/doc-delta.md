# Doc Delta: sweep-2026-11-06-2

**connection** — becomes true: on a terminal the save-port question is asked after binding and
before serving, and the daemon waits for the answer (default No; a signal at the prompt saves
nothing and exits 0). Stops being true: "the daemon serves while the prompt waits".
Already done on the branch: ADR `connection-port-save-prompt-before-serving` (proposed, supersedes
`connection-port-saved-per-profile-on-prompt`), `cmd/musterd/CLAUDE.md` invariant.
To check: `docs/features/connection/spec.md` § Transport and auth and
`.claude/skills/dev-loop/SKILL.md` flag line — amend only if a sentence states the order or is now false.

From the impl log: doc-delta: `rg "Save port|save prompt" docs/features/connection/spec.md` found no order sentence to amend.
