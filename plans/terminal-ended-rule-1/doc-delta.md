# Doc delta: terminal-ended-rule-1

**surfaces** — stops being true: ws.shell-activity (`docs/protocol.md`, the `terminals` message) says a list is broadcast "never when nothing changed". Becomes true: the one exception is the forced re-broadcast of a session's unchanged list on the next successful poll after a failed follow-up listing (as § Revisions already says). Wording consistency only; no wire shape changes.
