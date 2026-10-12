---
id: connection-health-dot
type: decision
status: accepted
date: 2026-10-12
summary: The connection readout is a dot on its own tokens - green connected, yellow connecting or update restart, red lost - matching the banner bar a 3 s window.
features: [connection]
tags: [ux, user-decision]
files: [web/src/features/connection.ts, web/src/render/masthead.ts, web/src/style.css]
tests: []
refs: [plan:masthead-indicators, https://github.com/Zalaras/muster/issues/79, kb:adr/theme-banner-tokens-not-rose, kb:adr/update-restart-reloads-dashboard, kb:adr/connection-banner-only-after-first-hello]
supersedes: []
---
**Context.** The masthead showed the connection as text (`connected`, `connecting…`, `reconnecting…`). The developer asked for a coloured icon with the detail on hover (#79), yellow while musterd restarts or updates.

**Options.** For yellow: (A) any restart; (B) only the first connect and an update restart the dashboard itself started. For colour: (C) reuse the state colours; (D) dedicated tokens.

**Decision.** B and D. The dashboard cannot tell a manual restart or a crash from a lost connection, so those are red; it knows an update restart only through its own held restart record. The dot is red when the banner shows the daemon-down text (and when the socket drops during the post-update confirmation, kb:adr/connection-dot-red-during-update-confirmation), yellow when connecting before the first hello or while the update banner reads updating, green when connected. State colours keep their meanings (design-system §3), as the banner's did.

**Consequences.** `role="status"` keeps the present word as visually hidden text, so assistive technology and existing tests read the same words. A `data-health` attribute exposes the colour state. An update restart that misses the banner's 30 s window turns red with the banner.
