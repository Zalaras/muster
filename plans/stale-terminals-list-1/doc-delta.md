# Doc delta: stale-terminals-list-1

Seeded from plan.md § Doc Delta. No implementation log, fix waves included, carries a
`doc-delta:` line.

**surfaces**
- Becomes true: A window ignores a terminals list older than a spawn, close or rename reply it has
  already acted on, so a late list never undoes one. (`web/src/features/surfaces.ts`,
  `web/src/terminal/terminalsrev.ts`; the wire side is already in `docs/protocol.md` under
  `kb:anchor/ws.shell-activity` and `kb:anchor/sessions.shell` § Revisions, committed before this
  batch in `bca51d54` — do not edit it.)
- Stops being true: nothing.

**connection**
- Becomes true: nothing in `docs/features/connection/spec.md`; `snapshot.terminalsRev` is already
  in `docs/protocol.md` under `kb:anchor/ws.snapshot` (`bca51d54`).
- Stops being true: nothing.
