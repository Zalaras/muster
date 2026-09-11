# Spec: Auto-update for musterd

**Plan**: auto-update
**Created**: 2026-09-10
**Status**: Draft

## Goal

musterd can update itself to the latest GitHub Release without disturbing the user's
existing setup: Claude sessions keep running, the dashboard comes back, and nothing
happens that the user did not ask for.

Muster ships as a GitHub Release binary with no update path: a user who installs once via
`scripts/install.sh` never learns a newer version exists, and updating means finding and
re-running the installer by hand. This is the last open half of the pre-v1 install item in
`TODO.md` (the install-instructions half shipped with the installer on 2026-09-10). The repo
is public with a `curl | sh` front door, so there are now real installs to keep current.

## Background & Context

- **Distribution is settled** (SPEC changelog 2026-08-31, 2026-09-10): GoReleaser builds
  `musterd_{version}_darwin_{amd64,arm64}.tar.gz` plus `checksums.txt` and publishes a
  GitHub Release on every qualifying push to `main`; `scripts/install.sh` installs into
  `~/.local/bin` after checking the archive's SHA-256 against `checksums.txt`. It resolves
  "latest" through the `/releases/latest` **redirect**, not the API, because unauthenticated
  `api.github.com` is limited to 60 requests/hour per IP. The updater reuses that choice.
- **Homebrew is a separate, unscheduled TODO item.** This spec must not depend on it, but
  must behave sensibly once a brew-installed musterd exists (see Non-installer binaries).
- **Version plumbing exists**: `cmd/musterd/main.go` has `var version = "dev"` set by
  GoReleaser's `-X main.version`; the protocol 2 `hello` message already carries the daemon
  version to the dashboard (`docs/protocol.md` §5.1). `musterd -version` prints it.
- **Settings surface exists**: the masthead `Settings` button opens `#settings-dialog`,
  whose fields persist through `PUT /api/prefs` and are echoed to every UI socket as a
  `prefs` message (`docs/protocol.md` §3.3, §5.5). The auto-update toggle is one more pref.
- **Restart survivability is settled** (SPEC §M4 reconcile): Claude sessions live in tmux on
  the dedicated `muster` socket, owned by the daemon, and reconcile re-adopts them after a
  daemon restart. The dashboard reconnects through the existing banner. **Plain-terminal
  shells do not survive**: SPEC records that the daemon forgets shell sockets on restart and
  reconcile kills every plain-terminal shell (plan `plain-terminal-session`).
- **Shutdown prompt**: `-on-exit ask` prompts once on a TTY about live sessions. A
  self-restart is not a shutdown and must not trigger it.
- **Precedent for outbound HTTP from the daemon**: `internal/ghissue` (GitHub API with a
  10 s timeout and an `HTTPClient` seam) and `internal/usage` (Anthropic usage endpoint with
  `-usage-api-url` as a test seam). The updater follows the same seam pattern so E2E can
  point it at a local fake release server.
- **Deliberate contrast**: Claude Code's own auto-updater is left on and unmanaged by Muster
  (`docs/claude-code-versions.md`). Nothing here touches it.
- **SPEC's cut "notifications" feature** means OS/push notifications. The badge dot on the
  Settings button is an in-dashboard indicator, not a notification, and is in scope.

## Scope

**In Scope:**

- A daemon-side update check against the GitHub Release, gated by a persisted pref.
- A badge dot on the masthead Settings button while a newer release is known.
- Settings dialog: running version, available version, the auto-update toggle, and two
  apply buttons (**Update**, **Update and restart**) with a confirm step on the second.
- The apply path: download the arch-matching archive, verify SHA-256 against
  `checksums.txt`, verify `checksums.txt`'s minisign signature against a public key compiled
  into the binary, atomically replace the running binary on disk.
- Self-restart via in-place re-exec for **Update and restart**.
- `musterd -update` CLI flag (swap only).
- GoReleaser `signs:` configuration so every release publishes `checksums.txt.minisig`.
- Detection of non-installer binaries (`dev` builds, Homebrew prefix, unexpected paths) and
  the degraded behaviour for each.
- Protocol additions needed to carry update state to the UI and trigger the apply.

**Out of Scope:**

- **Unattended apply.** The pref governs checking only; the binary never changes without a
  click or a flag.
- **The Homebrew tap** itself (separate TODO item). Only the "installed by brew, defer to
  brew" detection is in scope.
- **Restarting the daemon from the CLI.** `musterd -update` swaps the file; the user
  restarts musterd however they run it.
- **Preserving plain-terminal shells across restart.** SPEC leaves that in M5+; this spec
  only warns about the loss.
- **Managing Claude Code's updater** or version. Unchanged.
- **Rollback UI.** A failed apply leaves the old binary; there is no "go back a version"
  control. Re-running the installer with `--version` remains the manual path.
- **OS notifications, cost tracking, containers, resource gauges** (cut features; stay cut).

## Requirements

### Setting

- R1. One boolean pref, **auto-update check**, persisted alongside the existing prefs and
  echoed in the `prefs` message like the others. **Default on.**
- R2. **Off means off**: with the pref off the daemon makes no update-related network
  request of any kind, shows no badge, and shows no "available" version. The user has
  chosen to watch releases themselves; `musterd -update` remains available to them.
- R3. Toggling the pref off clears any currently-known available version; toggling it on
  triggers an immediate check.

### Check

- R4. The check runs **in the daemon**, never in the browser. Cadence: once at startup and
  then every 24 hours while the pref is on.
- R5. "Latest" is resolved through the `/releases/latest` redirect (the installer's
  measured choice), not `api.github.com`. The base URL is a flag seam like `-usage-api-url`
  (e.g. `-update-base-url`) so tests can point it at a local server; the same seam serves
  the download step.
- R6. Only a **strictly newer** semver than the running version counts as available. Equal
  or older produces nothing.
- R7. A failed check (offline, non-2xx, malformed redirect) is logged at debug level and
  retried at the next cadence tick. No badge, no UI error. Checks have a bounded timeout
  consistent with the existing outbound-HTTP timeouts (`internal/ghissue`).
- R8. A binary whose version is `dev` (or otherwise not a release semver) never checks.

### Dashboard

- R9. While a newer release is known, a **badge dot** is shown on the masthead Settings
  button. It disappears when the update is applied, when the pref is turned off, or when a
  subsequent check finds nothing newer.
- R10. The Settings dialog shows: the running version, the available version (or "up to
  date" / "checking disabled"), the auto-update toggle, and two buttons:
  - **Update** — apply the swap (R14–R18), then show "Updated to vX.Y.Z. Restart musterd to
    finish." The running daemon keeps reporting the old version until restarted.
  - **Update and restart** — a confirm step, then the swap, then the self-restart (R19).
- R11. The **confirm step** for Update and restart names the open plain-terminal shells that
  will close (count, at minimum), because reconcile kills them on restart. With none open
  the confirm still appears but says so. Cancel does nothing.
- R12. Apply progress is visible in the dialog (downloading / verifying / installing) and a
  failure is shown in the dialog with the error and a remedy, leaving the old binary in
  place (R18).
- R13. The apply buttons are absent when the version is `dev` and **disabled with the remedy
  shown** for non-installer binaries (R21). The badge and the available version still show
  in the latter case.

### Apply (shared by the buttons and the CLI)

- R14. Download the archive matching the running binary's `runtime.GOARCH` for the
  available version, plus `checksums.txt` and `checksums.txt.minisig`, from the release.
- R15. Verify the **minisign signature** of `checksums.txt` against a public key compiled
  into the binary. Verification is offline. Refuse on any failure.
- R16. Verify the archive's SHA-256 against the signed `checksums.txt`. Refuse on mismatch.
- R17. Extract the `musterd` member (the archive also carries README.md) to a temp file
  **beside** the running binary, set its mode, then `rename` it over the binary's real path
  (symlinks resolved via `os.Executable` + `EvalSymlinks`), so a crash mid-write cannot
  leave a half-written musterd.
- R18. Any failure at R14–R17 leaves the previous binary untouched and reports the error and
  remedy (UI: dialog; CLI: stderr, non-zero exit).
- R19. **Self-restart** (Update and restart only): after a successful swap, re-exec the new
  binary in place with the same arguments and environment (same PID, same terminal). This
  bypasses `-on-exit` handling entirely: sessions are always left running. Reconcile
  re-adopts them on startup; the dashboard reconnects and the `hello` carries the new
  version.
- R20. Concurrent applies (two dashboard windows, or the CLI plus a button) are
  **serialised**; the second reports the outcome of the first rather than racing on the
  file. Note the CLI runs in a separate process, so the serialisation for that case is a
  file-level guard, not an in-memory one.

### Non-installer binaries

- R21. Detection runs once at startup from the resolved binary path:
  - version `dev` / non-semver → no check, no badge, no buttons; `-update` exits non-zero
    with "not a release build".
  - path under a Homebrew prefix (`/opt/homebrew`, `/usr/local/Cellar`, or the `brew
    --prefix` of a found `brew`) → check and badge normally; apply disabled with
    "installed by Homebrew — run `brew upgrade musterd`"; `-update` prints the same and
    exits non-zero.
  - any other path the installer would not have written (not writable by the current user,
    or inside a git working tree) → check and badge normally; apply disabled with a remedy
    naming the installer one-liner; `-update` prints the same and exits non-zero.

### CLI

- R22. `musterd -update`: performs R14–R18 for the latest release (or reports "already up
  to date" and exits 0), prints "updated to vX.Y.Z — restart musterd to finish", exits 0.
  Never restarts anything. Honours `-update-base-url`.

### Release pipeline

- R23. `.goreleaser.yaml` gains a `signs:` block producing `checksums.txt.minisig` with
  minisign. The **private key and its passphrase are a CI secret Damian creates and stores
  by hand** (hard rule: Claude never handles credentials). The public key is committed
  (inside `internal/…`, next to the verifier) and the spec/plan records the fingerprint.
- R24. A release without a valid `.minisig` is refused by R15 — the updater has no
  unsigned fallback.

### Non-functional / constraints

- All GitHub-release knowledge (URL shapes, archive naming, checksum file names) lives in
  one package; nothing about Claude Code's formats is involved, so `internal/claudecode`
  is untouched.
- The check must never delay startup or the `hello`; it runs asynchronously after listen.
- No hook payloads or session data are involved; standard logging rules apply.
- Follows `docs/conventions.md` (HTTP/WS/logging patterns, test seams as flags).

## Edge Cases & Considerations

- **Offline / GitHub down**: R7. Silent retry; a stale "available" version from an earlier
  successful check is kept until a later check contradicts it or the pref is turned off.
- **Redirect resolves to a pre-release or draft**: `/releases/latest` excludes those by
  GitHub's definition; nothing extra needed. If the tag does not parse as semver, treat as
  a failed check.
- **Arch**: download by `runtime.GOARCH`, never by `uname`. A universal binary is not
  produced today; if one is later, the plan revisits R14.
- **Gatekeeper**: Go's `net/http` download sets no `com.apple.quarantine` xattr, matching
  the installer's behaviour (curl also sets none). The swapped binary runs unprompted.
- **Rename across filesystems**: the temp file is created in the binary's own directory so
  `rename` is atomic and same-filesystem.
- **Running from a symlink** (`~/.local/bin/musterd -> …`): resolve to the real file before
  writing; the symlink is left alone.
- **Re-exec while a shutdown is in progress**: refuse the apply if the daemon is already
  shutting down.
- **Re-exec failure** (exec returns an error after the swap): log it and exit non-zero; the
  new binary is on disk and sessions are in tmux, so a manual restart recovers fully. The
  dialog's reconnect banner is what the user sees.
- **Dashboard window mid-apply**: progress is broadcast to all UI sockets, so a second
  window shows the same state; on restart both reconnect.
- **Clock/version skew**: comparison is semver on the tag, never on timestamps.
- **Disk full during download/extract**: fails at R17 before the rename; old binary stays.
- **Pref off while a check is in flight**: the result is discarded (R2 must hold: no badge).
- **`-update` invoked while a daemon is running**: allowed; the daemon keeps running the old
  code (Darwin permits replacing a running executable's file via rename) and its next
  `hello` still reports the old version until restarted. Its dialog should reflect the new
  on-disk state at its next check ("installed vX.Y.Z, restart to finish") — the plan decides
  whether that is worth a filesystem check or is left to the CLI's printed instruction.

## Acceptance Criteria

- [ ] With the pref on and a newer release published on the (fake) release server, the
      Settings badge appears within one poll interval and the dialog shows the running and
      available versions.
- [ ] With the pref off, the fake release server records **zero** requests from the daemon
      across a full poll interval plus startup, and no badge is shown.
- [ ] Turning the pref off clears the badge and available version; turning it on triggers
      a check without waiting for the next tick.
- [ ] **Update** replaces the binary on disk (verified by `musterd -version` on the file and
      by its hash), the running daemon's `hello` still reports the old version, and the
      dialog says to restart musterd.
- [ ] **Update and restart** returns the dashboard on the new version after one reconnect,
      with every pre-existing Claude session still listed and attachable, and the tmux
      server on the `muster` socket never restarted.
- [ ] The Update-and-restart confirm step lists the open plain-terminal shell count; after
      the restart those shells are gone and Claude sessions are not.
- [ ] A tampered `checksums.txt`, a missing or invalid `.minisig`, or an archive whose
      SHA-256 does not match is refused with the error shown, and the on-disk binary's hash
      is unchanged.
- [ ] `musterd -update` swaps the binary and prints the restart line (exit 0); prints
      "already up to date" when nothing is newer (exit 0); exits non-zero with the stated
      remedy for a `dev` build, a Homebrew-prefix path, and a verification failure.
- [ ] A daemon reporting version `dev` shows no badge and no apply buttons, and the fake
      release server records zero requests.
- [ ] A binary under a Homebrew prefix (simulated path) shows the badge and available
      version with apply disabled and the `brew upgrade` remedy visible.
- [ ] A release equal to or older than the running version produces no badge.
- [ ] Two simultaneous applies result in exactly one download/swap; the second reports the
      first's outcome.
- [ ] Re-exec preserves the daemon's flags: a daemon started with a non-default `-addr` and
      `-data-dir` comes back on the same address and data dir.
- [ ] A real release cut by CI carries `checksums.txt.minisig`, and a release build verifies
      it against the compiled-in key (`make canary`-style manual check documented in the
      plan; not an automated E2E).

## References

- `TODO.md` — "Auto-update for `musterd`" item (split out 2026-09-10) and the adjacent
  Homebrew-tap item.
- `SPEC.md` changelog 2026-08-31 (distribution settled), 2026-09-01 (release policy),
  2026-09-10 (repo public; installer). SPEC §M4 reconcile; plain-terminal shells
  restart note (plan `plain-terminal-session`).
- `scripts/install.sh` — redirect-based latest resolution, checksum verification, temp-dir
  and member-selection rationale (reused wholesale).
- `.goreleaser.yaml` — archive naming, `checksums.txt`, `-X main.version`.
- `docs/protocol.md` §3.3 (`PUT /api/prefs`), §5.1 (`hello`, daemon version), §5.5
  (`prefs` echo).
- `internal/ghissue`, `internal/usage` — outbound-HTTP seam and timeout precedents.
- `docs/claude-code-versions.md` — Claude Code's own updater is left alone.
- Prior art for the non-installer behaviour (interview 2026-09-10): GitHub CLI (no check on
  `DEV`; "brew upgrade gh" hint on brew installs), Tailscale `update`, rustup `self update`,
  Claude Code's npm-install handling, Syncthing's `noupgrade` build flag.
