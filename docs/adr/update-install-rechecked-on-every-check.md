---
id: update-install-rechecked-on-every-check
type: decision
status: accepted
date: 2026-09-25
summary: The installer-or-unmanaged half of the install classification is re-derived at the start of every release check; dev and homebrew stay fixed from startup.
features: [update]
tags: [security, ux]
files: [internal/selfupdate/install.go, internal/server/updatemanager.go, cmd/musterd/main.go]
tests: []
refs: [plan:settings-update-failures, "#53", kb:anchor/ws.update, kb:anchor/update.check, kb:anchor/update.apply, kb:adr/update-check-runs-in-daemon-daily]
supersedes: [update-install-kinds-decide-who-may-apply]
---
**Context.** The install was classified once at startup and was fixed for the daemon's life. In #53 a daemon classified as unmanaged. That kept Update disabled with a newer release available, and the same binary could update once musterd was restarted. Whatever failed the write probe or the git-tree walk at that startup had cleared, and nothing looked again.

**Options.** (A) Keep the startup classification and rely on a better remedy text. (B) Re-run the write probe and the git-tree walk at the start of every release check, automatic or user-initiated, before the network request and regardless of its outcome. Broadcast when the kind or remedy changes. (C) Re-probe at apply time only.

**Decision.** B. The classification answers "may this daemon replace its binary now", and a check is when the answer starts to matter. A probe costs one temp-file create. C would leave the buttons disabled with no way to get to an apply.

**Consequences.** Everything the superseded decision settled carries forward unchanged:
- The four kinds, and only installer may apply.
- The Homebrew check runs before the writability check.
- Apply serialisation, and a symlink at the invoked path left alone.

Only installer and unmanaged may swap. Dev and homebrew are decided by version and path and are never re-derived. The update manager's classification becomes shared state under its mutex. The apply refusal reads the current classification. `musterd -update` classifies once in its own short-lived process.
