---
id: update-restart-reloads-dashboard
type: decision
status: accepted
date: 2026-09-25
summary: A window that saw an update restart shows the banner as updating while the daemon is down, reloads on reconnect, and confirms the version it came back as.
features: [update, connection]
tags: [ux]
files: [web/src/features/update*.ts, web/src/features/connection.ts, web/src/render/banner.ts]
tests: []
refs: [plan:settings-update-failures, kb:anchor/ws.update, kb:anchor/ws.hello, kb:adr/update-restart-is-in-place-reexec-not-shutdown, kb:adr/connection-banner-only-after-first-hello, kb:adr/theme-banner-tokens-not-rose]
supersedes: []
---
**Context.** An Update-and-restart showed "Restarting" in the status line for a moment. Then the socket dropped and the only thing left was the daemon-down alarm, for a restart the user asked for. When the daemon came back, the page kept running the old dashboard against a new binary that embeds a new one.

**Options.** (A) Leave the ordinary banner path. (B) Change the banner text while restarting, with no reload. (C) Change the banner text, reload on the first reconnect, and confirm on the fresh page from a per-tab handoff.

**Decision.** C, the developer's call. While the daemon is down the banner says it is updating and still explains pane noise, falling back to the unreachable text after 30 s. The first hello after the drop reloads the page, whatever its protocol version, so a protocol bump lands on the new dashboard rather than the mismatch screen. The fresh page shows "Updated to" for 3 s, only when the daemon reports the handed-off version.

**Consequences.** The restart record is per window and in memory, so a page reloaded by hand mid-restart shows the ordinary banner. The handoff sits in session storage, and a throwing storage loses only the confirmation. The confirmation uses a neutral style, because an update is information, not an alarm. The in-place re-exec decision's "ordinary banner path" consequence no longer describes the dashboard.
