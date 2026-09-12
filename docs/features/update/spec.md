---
id: update
type: spec
status: active
date: 2026-09-12
summary: Release check, minisign-verified apply, in-place restart with sessions re-adopted.
features: [update]
tags: [security]
go: [internal/server/update*.go, internal/selfupdate/**]
web: [web/src/features/update.ts, web/src/render/update*.ts]
e2e: [web/e2e/update.spec.ts, web/e2e/helpers/update.ts, web/e2e/helpers/releases.ts]
protocol: [update.apply, update.restart-impact, ws.update]
refs: [kb:adr/update-check-runs-in-daemon-daily, kb:adr/update-check-pref-governs-checking-only, kb:adr/update-install-kinds-decide-who-may-apply, kb:adr/update-trust-root-minisign-signed-checksums, kb:adr/update-restart-is-in-place-reexec-not-shutdown, kb:adr/update-release-knowledge-in-selfupdate-package, kb:adr/release-latest-resolved-via-redirect-not-api, kb:adr/stack-selfupdate-minisign-library]
---
musterd can find, verify and install a newer release of itself and restart into it without
losing a session.

**Checking.** The daemon checks after it starts listening and then on the
`-update-check-interval`, by reading the releases-latest redirect of `-update-base-url`,
never the REST API and never from the browser (kb:adr/update-check-runs-in-daemon-daily,
kb:adr/release-latest-resolved-via-redirect-not-api). The `updateCheck` preference governs
checking only; turning it off clears the available version and stops every update-related
request (kb:adr/update-check-pref-governs-checking-only). An empty base URL disables
checking and apply, as every test daemon sets.

**Install kinds.** At startup the binary classifies its install from the resolved
executable path as installer, dev, homebrew or unmanaged. Only installer may apply; dev is
silent, and the other two show a one-line remedy
(kb:adr/update-install-kinds-decide-who-may-apply).

**Applying.** `kb:anchor/update.apply` downloads the architecture's archive with the
release's checksums file and its minisign signature, verifies the signature against a key
compiled into the binary, verifies the archive's SHA-256 against the signed file, extracts
the binary beside the running one and renames it over the resolved path
(kb:adr/update-trust-root-minisign-signed-checksums, kb:adr/stack-selfupdate-minisign-library).
Progress arrives as `kb:anchor/ws.update` phases; any failure leaves the old binary
untouched and reports an error with a remedy sentence. A second apply during one in flight
is ignored. `musterd -update` performs the same check and apply from the command line and
exits.

**Restarting.** With restart requested, the daemon stops its listeners and store gracefully,
never consults the on-exit policy and kills no session, then execs the new binary in place
under the same PID and arguments; reconcile re-adopts every Claude session on the way up
(kb:adr/update-restart-is-in-place-reexec-not-shutdown). Shell surfaces do not survive, so
the Update-and-restart confirm names them from `kb:anchor/update.restart-impact`.

**Dashboard.** The Settings dialog's Updates section shows running and available versions,
the daily-check toggle, status text and the two apply buttons; the Settings button wears a
dot while a newer release is available and not yet swapped in. All release knowledge lives
in one package (kb:adr/update-release-knowledge-in-selfupdate-package).

Muster never installs an update on its own.
