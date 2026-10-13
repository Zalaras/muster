# Doc delta — plan `tmux-server-env-leak`

Seeded by the /fix session from `plan.md` § Doc Delta on 2026-10-13, then checked against the
implementation log (`daemon-implementation.md` says "doc-delta: none; the plan's ## Doc Delta for
surfaces still holds as written"). `doc-reconcile` promotes what is true of the code; `plan.md`
stays as approved.

The surfaces spec is well under its 800-word cap (the file is ~660 words including frontmatter),
so one clause can be added without a cut.

## From the plan

**surfaces** — becomes true:
- The shell pane carries no Muster session environment whatever environment the daemon itself was started in: the tmux client strips `MUSTER_SESSION` from its own environment before every tmux command, so the server it starts, whose global environment every pane inherits, never holds the daemon's own.

**surfaces** — stops being true:
- Nothing. The existing sentence "with no Muster session environment, so a nested `claude` cannot drive the parent's state" was already the claim; it now holds unconditionally. Extend that sentence rather than adding a second one.

## Reconcile notes

- The claim is verified by `TestNewSession_PaneNeverInheritsMusterSessionFromTheClientEnvironment` (`internal/tmux/tmux_test.go`) and by the two shell-registry tests passing with `MUSTER_SESSION=9` set (plan check D3).
- The ADR kb:adr/surfaces-shell-pane-carries-no-session-env stays accepted and unchanged: this is routine implementation making its consequence hold, not a new decision.
