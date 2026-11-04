# Doc Delta — restart-latest-claude

Seeded from `plan.md` § Doc Delta and amended by the orchestrator with every `doc-delta:` line
from the implementation logs and review cycle 1 (code Major 2, Minors 1–2). `plan.md` stays as
approved; this file is what doc-reconcile promotes.

**actions** — becomes true:
- `docs/features/actions/spec.md` has a **Restart** paragraph: Restart applies to live sessions whose Claude Code is older than the installed one, only as one batch from the masthead readout (`kb:anchor/sessions.restart-many`); a free session (idle with no background tasks, or failed) is stopped and resumed in place at once, a busy one is queued and restarted by the daemon the moment it is free; the queue survives a daemon restart and is cleared by death, Remove or the session no longer being behind; there is no per-session restart and no cancel.
- After a daemon restart a reloaded pending mark is held daemon-side, off the wire (`restartPending: false`, `behind: false`) and unfired, until the daemon's first installed-version result: still behind → the mark returns and a free session restarts then; no longer behind, installed unknown, or the binary unresolvable → the mark is cleared (kb:adr/restart-pending-marks-held-until-installed-known).
- The spec's `protocol:` list includes `sessions.restart-many`.

**actions** — stops being true:
- "Three actions apply to a session: Stop, Resume and Remove." becomes four, naming Restart.

**connection** — becomes true:
- `docs/features/connection/spec.md` § What the dashboard shows: when a live session runs an older Claude Code than the installed one, the readout becomes a button with a neutral dot (`claude <oldest>→<installed patch>` when major.minor match, e.g. `claude 2.1.316→318`, else `claude →<installed>`; or `claude ↻N queued` while restarts wait), opening a panel with Ignore and Restart…; Ignore lasts for the tab and the installed version.
- The readout's one reserved width is 18ch (the notice label `claude 2.1.316→318`); in the notice shape the version-warning glyph sits outside the box instead of inside it, clear of the neighbouring Settings control.

**connection** — stops being true:
- The readout box is sized to hold "the widest realistic version plus its glyph" in every shape: in the notice shape the glyph is outside it.

**lifecycle** — becomes true:
- `docs/features/lifecycle/spec.md` § Wire: a status post also sets the session's running Claude Code version (`claudeVersion.running`, the leading major.minor.patch of the status line's `version`); it is null after launch, resume and every death, and kept by `/clear` and across a daemon restart. "Status posts … never a state-machine field" stays true.

**lifecycle** — stops being true:
- nothing.

**ingest** — becomes true:
- `docs/features/ingest/spec.md` "Signals and their sources" table gains a row: Running Claude Code version | the status line's top-level `version`, leading major.minor.patch, read in `internal/claudecode` alone (kb:fact/running-session-version-sources).

**ingest** — stops being true:
- nothing.

**protocol** (`docs/protocol.md`, owned by doc-reconcile; the contract's invariants are unchanged by the developer's decision, only these two prose sentences, review cycle 2 code Major 3) — stops being true / becomes true:
- `sessions.restart-many`: "and, after a daemon restart, once reconcile completes if it is free already" becomes "and, after a daemon restart, on the daemon's first installed-version result if it is free and still behind then; until that result the reloaded mark is held off the wire and does not fire (kb:adr/restart-pending-marks-held-until-installed-known)".
- `ws.session` `restartPending`: "Kept by /clear and a daemon restart" becomes "Kept by /clear; across a daemon restart it is held daemon-side and reads false until the first installed-version result re-derives it — still behind → true again, otherwise cleared".
