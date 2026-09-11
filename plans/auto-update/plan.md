# Plan: auto-update

**Created**: 2026-09-10
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: update.spec.ts startDaemon (the fake release server's URL, the scratch versioned binary path and the simulated Homebrew prefix are computed per test; several tests restart the daemon)
**Description**: musterd checks the GitHub Release for a strictly newer version (pref-gated, daemon-side, 24 h), badges the Settings button, and applies a minisign-verified swap of its own binary on an explicit click or `musterd -update`, with an in-place re-exec that leaves every Claude session running.

## Overview

Muster ships as a GitHub Release binary with no update path: a `curl | sh` install never learns
that a newer release exists. `plans/auto-update/spec.md` (interview 2026-09-10) settles the shape:
one boolean pref, **default on**, that governs *checking only*; apply is always explicit — an
**Update** button (swap the file, then "restart musterd to finish"), an **Update and restart**
button (swap, confirm, in-place re-exec), or `musterd -update` (swap only). "Latest" resolves
through the `/releases/latest` redirect exactly as `scripts/install.sh` does (the API is
rate-limited to 60/h unauthenticated; the redirect is unmetered). Verification is two-layer: the
release's `checksums.txt` must carry a valid **minisign** signature against a public key compiled
into the binary, and the archive's SHA-256 must match that signed file. There is no unsigned
fallback.

All GitHub-release knowledge (redirect shape, asset naming, checksum and signature file names,
the minisign format) lives in one new package, `internal/selfupdate`; `internal/server` owns the
poller, the apply serialisation and the wire; `cmd/musterd` owns the `-update` flag, the install
classification at startup, and the re-exec. Nothing here touches `internal/claudecode` or Claude
Code's own updater. The restart is not a shutdown: it never reaches the `-on-exit` prompt, never
kills a session, and reconcile (SPEC §M4) re-adopts every Claude session on the way back up.
Plain-terminal shells do not survive (settled by plan `plain-terminal-session`), so the confirm
step names them.

Detection of non-installer binaries happens once at startup from the resolved executable path:
a non-release version string is a `dev` build (never checks, no buttons); a path under a Homebrew
prefix badges but defers to `brew upgrade`; a path the installer would not have written (not
writable, or inside a git working tree) badges but names the installer as the remedy. The
release pipeline gains a GoReleaser `signs:` block so every release publishes
`checksums.txt.minisig`; the private key and its passphrase are CI secrets Damian creates and
stores by hand, and the public key is a committed file the plan treats as a prerequisite.

## Requirements

### Must Have
- [ ] REQ-1: A boolean pref `updateCheck` (default `true`) is persisted with the other prefs, accepted by `PUT /api/prefs`, echoed in `prefs` and `snapshot`.
- [ ] REQ-2: With `updateCheck` false the daemon makes **no** request to the update base URL — not at startup, not on a tick, not for an in-flight result — and `update.available`/`update.checkedAt` are null.
- [ ] REQ-3: Turning the pref off clears `available` and `checkedAt` and broadcasts; turning it on runs a check immediately (not at the next tick).
- [ ] REQ-4: The check runs in the daemon: once asynchronously after listen (never delaying `hello`), then every `-update-check-interval` (default 24 h) while the pref is on.
- [ ] REQ-5: "Latest" is the tail of the `{base}/latest` redirect's `Location`; `-update-base-url` is the base (default `https://github.com/Zalaras/muster/releases`; empty disables checking **and** apply entirely, the `IssueAPIURL` shape). The same base serves `{base}/download/{tag}/<asset>`.
- [ ] REQ-6: Only a release **strictly newer** than the running version (semver on `major.minor.patch`) becomes `available`; equal or older leaves it null.
- [ ] REQ-7: A failed check (transport error, non-3xx, no `Location`, tag not `v<semver>`) is logged at debug, changes nothing on the wire, and is retried next tick. The check has a 10 s timeout.
- [ ] REQ-8: A running version that is not exactly `v?MAJOR.MINOR.PATCH` (`dev`, `v0.10.0-4-ge5102b8`, anything `-dirty`) classifies the install as `dev`: never checks, never badges, `-update` exits non-zero with "not a release build".
- [ ] REQ-9: While `available` is non-null and `installed` is null, the masthead Settings button carries a badge dot and the accessible name `Settings, update available`; otherwise the plain `Settings` button with no dot.
- [ ] REQ-10: The Settings dialog gains an **Updates** section: running version, available version (or `up to date` / `checking disabled` / `not checked yet` / `not checked (development build)`), the `Check for updates daily` checkbox, a status line, and the two buttons **Update** and **Update and restart**.
- [ ] REQ-11: **Update and restart** opens a confirm dialog that lists the open plain-terminal shells (count and session titles) that will close, or says none are open; **Restart** proceeds, **Cancel** does nothing.
- [ ] REQ-12: Apply progress (`downloading` → `verifying` → `installing` → `done` | `restarting`) is broadcast as `update.apply.phase` and rendered in the status line of every connected window; a failure renders `Update failed: <message>` with the remedy and leaves the old binary in place.
- [ ] REQ-13: Both apply buttons are **absent** for a `dev` install and **disabled with the remedy in the status line** for `homebrew`/`unmanaged` installs (badge and available version still shown).
- [ ] REQ-14: Apply downloads, for `runtime.GOARCH`, the archive `musterd_<ver>_<os>_<arch>.tar.gz` (GoReleaser's `name_template`, os `darwin`), plus `checksums.txt` and `checksums.txt.minisig`, from `{base}/download/{tag}/`, with a 120 s overall timeout.
- [ ] REQ-15: `checksums.txt.minisig` must verify (offline) against the compiled-in public key; both minisign signature modes (legacy `Ed`, prehashed `ED`) are accepted; any failure refuses.
- [ ] REQ-16: The archive's SHA-256 must equal the signed `checksums.txt` line for that asset; mismatch or missing line refuses.
- [ ] REQ-17: The `musterd` member is extracted to a temp file **in the running binary's real directory** (`os.Executable` → `filepath.EvalSymlinks`), chmod 0755, then `os.Rename`d over the real path; a symlink at the invoked path is left alone.
- [ ] REQ-18: Any failure in REQ-14..17 leaves the previous binary byte-identical and reports error + remedy (UI: status line; CLI: stderr, non-zero exit).
- [ ] REQ-19: `restart:true` re-execs the new binary **in place** (`syscall.Exec`, same PID, same `os.Args`, `os.Environ()` plus `MUSTER_RESTARTED=1`) after a graceful stop (HTTP, WS, ingest, store) that never consults `-on-exit` and never kills a session. The restarted daemon skips auto-open when `MUSTER_RESTARTED` is set.
- [ ] REQ-20: Concurrent applies are serialised: within the daemon a second `POST /api/update/apply` while one is in flight returns 202 and observes the same broadcast; across processes (`-update` vs daemon) a non-blocking flock on `<exedir>/.musterd-update.lock` makes the loser fail with "another musterd update is in progress".
- [ ] REQ-21: Install classification at startup from the resolved path: `dev` (REQ-8) | `homebrew` (path under `/opt/homebrew`, `/usr/local/Cellar`, `/usr/local/Homebrew`, or `$HOMEBREW_PREFIX` when set) | `unmanaged` (directory not writable by the current user, or a `.git` entry in the directory or an ancestor **below** `$HOME`) | `installer` (everything else). `homebrew`'s remedy is `installed by Homebrew — run brew upgrade musterd`; `unmanaged`'s names the installer one-liner.
- [ ] REQ-22: `musterd -update` performs REQ-14..18 for the latest release: prints `updated to vX.Y.Z — restart musterd to finish` (exit 0); `already up to date` (exit 0); the REQ-21 remedy or the verification error (exit 1). Never restarts anything. Honours `-update-base-url` and `-update-public-key-file`.
- [ ] REQ-23: `.goreleaser.yaml` gains a `signs:` block producing `checksums.txt.minisig` with `minisign`; `release.yml` installs minisign and materialises the secret key from `MINISIGN_SECRET_KEY` / `MINISIGN_PASSWORD` secrets. The public key is `internal/selfupdate/minisign.pub`, `//go:embed`-ed — **Damian commits it before `/orchestrate` runs** (D5 gates it).
- [ ] REQ-24: A release with a missing or invalid `.minisig` is refused (no unsigned fallback).

### Should Have
- [ ] REQ-25: After a successful swap (`installed` non-null), the **Update** button is disabled and **Update and restart** reads **Restart now**: the same confirm, then `POST /api/update/apply {"restart":true}` skips the download (on-disk already at target) and re-execs.
- [ ] REQ-26: A swap performed by another process (`musterd -update` while the daemon runs) is detected: at each tick the daemon stats its own executable; when size/mtime differ from the startup stat and this daemon did not swap it, it runs `<exe> -version` (5 s timeout), parses `musterd v?X.Y.Z`, and sets `installed` — the dialog then says "Updated to vX.Y.Z. Restart musterd to finish."
- [ ] REQ-27: `GET /api/update/restart-impact` returns the plain-terminal shells currently alive on the socket with their session titles, so the confirm step (REQ-11) names them.

### Nice to Have
- [ ] REQ-28: The startup log line names the install kind and, for `homebrew`/`unmanaged`, the remedy once.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval).

### §3.3 `PUT /api/prefs` — new field

```jsonc
{ "updateCheck": true }   // optional: boolean — whether the daemon checks GitHub Releases for a newer musterd (auto-update, 2026-09-10)
```

Defaults before any PUT gain `"updateCheck":true`. Error 400 `invalid_request` when the value is
not a JSON boolean. A change of `updateCheck` has side effects beyond the `prefs` echo: `false`
clears `update.available`/`update.checkedAt` and broadcasts `update`; `true` triggers an
immediate check (REQ-3). A persisted non-boolean loads as `true`.

### §5.2 `snapshot` — new fields

`prefs` carries `updateCheck`; a new top-level `update` object (shape below) is always present.

### §5.5 `prefs` — new field

The echo carries `updateCheck`.

### WS daemon→UI `update` (new §5.7)

```jsonc
{ "type": "update", "update": {
    "running": "0.10.0",                  // string — the daemon's version as built; release builds are bare MAJOR.MINOR.PATCH (GoReleaser's {{.Version}}); dev builds are the raw string ("dev", "v0.10.0-4-ge5102b8")
    "install": "installer",               // "installer" | "dev" | "homebrew" | "unmanaged" — startup classification, constant for the daemon's life
    "remedy": null,                        // string iff install is "homebrew" | "unmanaged" (the one-line remedy to show); null otherwise
    "available": "0.11.0",                // string|null — a strictly newer release from the last successful check; null when none, when updateCheck is false, when install is "dev", or when checking is disabled by flag
    "checkedAt": "2026-09-10T20:00:00Z",  // RFC3339|null — the last successful check; null before one and after the pref is turned off
    "installed": null,                     // string|null — a version swapped onto disk (by this daemon, or detected per REQ-26) that the running process has not yet restarted into
    "apply": { "phase": "idle",           // "idle" | "downloading" | "verifying" | "installing" | "restarting" | "failed" | "done"
               "version": null,           // string|null — the release being / last applied; null iff phase is "idle"
               "error": null } } }         // string|null — message plus remedy sentence; non-null iff phase is "failed"
```

Sent on every change to any field (check result, pref toggle, each apply phase, REQ-26
detection); `snapshot.update` carries the current object, so a reconnecting window needs no
replay. `running` duplicates `hello.daemon.version` deliberately — the dialog renders from one
object. `available` and `installed` may both be non-null (swap done, restart pending); the
badge rule is `available != null && installed == null` (REQ-9). After a restart the new daemon
starts with `installed: null`, `apply.phase: "idle"`.

### HTTP: POST /api/update/apply (new §3.17)

**Auth**: UI cookie (401 `unauthorized`).
**Request:**
```json
{ "restart": false }
```
`restart` optional, default `false`. **Response 202**, no body — progress arrives as `update`
messages. Semantics: if `installed` already equals `available` (or `available` is null and
`installed` is set — REQ-25's restart-only case) the download is skipped; otherwise REQ-14..18
run with phases broadcast; then, iff `restart` is true, phase `restarting` is broadcast and the
daemon re-execs (REQ-19). A POST while `apply.phase` is one of `downloading`/`verifying`/
`installing`/`restarting` also returns 202 without starting a second apply (REQ-20); its
`restart` value is ignored — the first request's wins.
**Errors:**
- 400: `{"error": {"code": "invalid_request", "message": "invalid JSON body"}}`
- 404: `{"error": {"code": "not_found", "message": "updates are disabled for this daemon"}}` — `-update-base-url ""`, or install is `dev`
- 409: `{"error": {"code": "update_unsupported", "message": "installed by Homebrew — run brew upgrade musterd"}}` — install is `homebrew`/`unmanaged`; `message` is `update.remedy`
- 409: `{"error": {"code": "nothing_to_apply", "message": "no newer release is known"}}` — `available` and `installed` both null
- 409: `{"error": {"code": "shutting_down", "message": "musterd is shutting down"}}`

### HTTP: GET /api/update/restart-impact (new §3.18)

**Auth**: UI cookie (401 `unauthorized`). No body.
**Response 200:**
```json
{ "shells": [ { "sessionId": 3, "title": "fix auth" } ] }
```
One entry per `muster-<n>-shell` tmux session alive on the daemon's socket (the set reconcile
kills on restart — protocol §3.16/§7.5); `title` is the owning session's current title or
`null` when that session is unknown. `[]` when none. Computed on request from tmux, never
cached (shells have no wire representation elsewhere). Errors: none beyond auth.

## Schema Changes

No schema changes required. `updateCheck` joins the existing prefs JSON blob under the `prefs`
kv key (loaded with the same silent-default fallback as the other fields). Update state
(`available`, `checkedAt`, `installed`, `apply`) is in-memory only — a restart is exactly the
event that should reset it.

## UI Specifications

Design authority: `docs/design/design-system.md` §5 (Modal, Buttons, Segmented control, Form
fields), §3 (colour is meaning — the badge dot and the status line use **no state colour**),
§6.1/§6.8 (unknown renders as words; stale is labelled). Reference render: the Settings modal in
`docs/design/mockups/a-instrument.html` (440 px, `.form`/`.hint`/`.modal-foot`). The Updates
section extends that modal below the theme picker; the confirm dialog follows `#end-dialog`'s
440 px confirm shape (`render/confirm.ts`).

### Views

- **Masthead Settings button** (`#settings-button`) — unchanged text `Settings`. While the badge
  rule holds it carries `data-update="available"`, `aria-label="Settings, update available"`, and
  its child `<span class="update-dot" aria-hidden="true"></span>` becomes visible (a 6 px filled
  circle in `--fg-muted`, top-right of the button — neutral token, never `--amber`/`--rose`).
  Otherwise no `aria-label`, no `data-update`, dot hidden.
- **Settings dialog → Updates section** (`#settings-update`, a `<fieldset>` with `<legend>Updates</legend>`
  after the theme `<p class="hint">`):
  - a `<dl class="update-versions">`: `<dt>Running</dt><dd id="update-running">`,
    `<dt>Available</dt><dd id="update-available">`.
  - `<label class="check"><input type="checkbox" id="update-check-toggle" name="updateCheck"> Check for updates daily</label>`
    — applied on change, no Save; the checked state is only ever set from the `prefs`
    broadcast/snapshot (the theme picker's INV-7 rule).
  - `<p class="hint" id="update-status" role="status">` — progress, result, failure or remedy text.
  - `<div class="update-actions">` with `<button type="button" id="update-apply-button" class="btn">Update</button>`
    and `<button type="button" id="update-restart-button" class="btn key">Update and restart</button>`.
- **Restart confirm dialog** (`#update-restart-dialog`, `<dialog class="modal confirm">`):
  `<h2>Restart musterd?</h2>`, `<p id="update-restart-body">`, footer buttons
  `<button id="update-restart-confirm" class="btn key">Restart</button>` and
  `<button id="update-restart-cancel" class="btn">Cancel</button>`.

### Text rules (`web/src/render/update.ts`, pure `buildUpdateViewModel(update, prefs)`)

| Field | Rule |
|---|---|
| Running | `v` + `running` when `install != "dev"`; otherwise `running` + ` (development build)` |
| Available | `install == "dev"` → `not checked (development build)`; else `!prefs.updateCheck` → `checking disabled`; else `available` → `v` + `available`; else `checkedAt == null` → `not checked yet`; else `up to date` |
| Toggle | checked iff `prefs.updateCheck`; enabled always except `install == "dev"` (disabled, still reflects the pref) |
| Buttons visible | iff `install != "dev"` |
| Buttons enabled | `install == "installer"` and phase not in flight and (`available != null` or `installed != null`); **Update** additionally disabled when `installed != null` (REQ-25) |
| Restart button label | `Restart now` when `installed != null`, else `Update and restart` |
| Status line | phase `downloading` → `Downloading v<version>…`; `verifying` → `Verifying v<version>…`; `installing` → `Installing v<version>…`; `restarting` → `Restarting musterd…`; `failed` → `Update failed: <error>`; `done` or `installed != null` → `Updated to v<installed>. Restart musterd to finish.`; else `remedy` when non-null; else empty |
| Badge | `available != null && installed == null` |

`aria-busy="true"` on `#settings-update` while a phase is in flight.

### User Flows

1. **Badge → dialog.** A newer release is found → dot appears on Settings. Click Settings →
   dialog shows `Running v0.10.0`, `Available v0.11.0`, toggle checked, buttons enabled.
2. **Update.** Click **Update** → `POST /api/update/apply {}` → status line walks
   `Downloading v0.11.0…` → `Verifying v0.11.0…` → `Installing v0.11.0…` → `Updated to v0.11.0.
   Restart musterd to finish.`; Update disabled, second button now `Restart now`; badge gone.
3. **Update and restart.** Click → `GET /api/update/restart-impact` → confirm dialog body:
   `2 plain-terminal shells will close: fix auth, spike. Claude sessions keep running and are
   re-adopted after the restart.` (or `No plain-terminal shells are open. Claude sessions keep
   running and are re-adopted after the restart.`). **Restart** → `POST /api/update/apply
   {"restart":true}` → phases → `Restarting musterd…` → socket drops → daemon-down banner
   (existing) → reconnect → `hello` carries the new version; Settings shows `Running v0.11.0`,
   `Available up to date`.
4. **Toggle off.** Uncheck → `PUT /api/prefs {"updateCheck":false}` → `prefs` echo unchecks it,
   `update` broadcast clears available → dot gone, `Available checking disabled`, buttons
   disabled. Re-check → immediate check → dot back within seconds.
5. **Failure.** Any verification error → status `Update failed: signature on checksums.txt did
   not verify — the release may be tampered with; nothing was installed`; buttons re-enabled;
   binary unchanged.

### States

- **No data yet**: before the first `snapshot` the dialog cannot open (main.ts already closes it
  when not connected); the badge is absent. `checkedAt == null` renders `not checked yet` —
  never an empty field.
- **Data**: as above.
- **Daemon down**: the Settings dialog closes (existing behaviour, main.ts `status !==
  "connected"`), the confirm dialog closes too; the badge keeps its last state until the next
  `snapshot` re-derives it. During a restart this is exactly the observed sequence.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Settings button | `button` | `/^Settings/` | name `Settings` normally, `Settings, update available` (via `aria-label`) while badged; `data-update="available"` iff badged |
| Badge dot | — | — | `#settings-button .update-dot`, visible iff badged; `aria-hidden` |
| Updates section | — | legend `Updates` | `fieldset#settings-update`; `aria-busy="true"` while in flight |
| Running readout | — | `v0.10.0` / `v0.10.0-4-ge5102b8 (development build)` | `#update-running` |
| Available readout | — | `v0.11.0` \| `up to date` \| `checking disabled` \| `not checked yet` \| `not checked (development build)` | `#update-available` |
| Update-check toggle | `checkbox` | `Check for updates daily` | `#update-check-toggle` |
| Update button | `button` | `Update` (exact) | `#update-apply-button`; absent for dev |
| Update and restart button | `button` | `Update and restart` → `Restart now` after a swap | `#update-restart-button`; absent for dev |
| Status line | `status` | see Text rules | `#update-status`, `role="status"` |
| Restart confirm dialog | `dialog` | `Restart musterd?` | `#update-restart-dialog`, `aria-labelledby` its `<h2>` |
| Confirm body | — | `/^(\d+) plain-terminal shells? will close: / ` or `No plain-terminal shells are open.` | `#update-restart-body` |
| Confirm Restart | `button` | `Restart` (exact) | `#update-restart-confirm` |
| Confirm Cancel | `button` | `Cancel` | `#update-restart-cancel` |

### Invariants

- **INV-1** — `prefs.updateCheck == false` ⇒ zero requests to the update base URL, from every source state: startup with the pref persisted off, a tick after toggling off, a check in flight when the toggle lands (its result is discarded and no follow-up request is made). Asserted by D14, D16, E2, E3.
- **INV-2** — `update.available != null` ⇒ `install != "dev"` ∧ `prefs.updateCheck` ∧ `available > running` (semver). Asserted by D9, D15, E8, E10.
- **INV-3** — On any refusal in REQ-14..17 (bad signature, missing `.minisig`, wrong key, tampered `checksums.txt`, SHA mismatch, missing archive member, disk-full during extract) the on-disk binary's SHA-256 equals its pre-apply value. Asserted from **each** failure point by D10, D11 and E7.
- **INV-4** — `apply.error != null` ⇔ `apply.phase == "failed"`; `apply.version == null` ⇔ `apply.phase == "idle"`. Asserted by D19 across every phase transition.
- **INV-5** — A restart never kills, restarts or re-creates a Claude tmux session: the tmux server PID on the socket and every `muster-<n>` session's pane PID are unchanged across the re-exec; the only tmux sessions gone afterwards are `muster-<n>-shell` ones. Asserted by E5, E6 with one and with two Claude sessions present.
- **INV-6** — The badge is shown iff `available != null && installed == null`, from every path that changes either field: check result, pref off, pref on, apply done, REQ-26 detection, reconnect snapshot. Asserted by W5 (table) and E1, E3, E4.
- **INV-7** — The re-exec'd daemon receives exactly `os.Args` and `os.Environ()` plus `MUSTER_RESTARTED=1`; no flag is added, dropped or reordered. Asserted by D22, E12.

### Carried-over measurements (re-checked)

- **Redirect-based latest** (measured by `scripts/install.sh` with `curl -I`, i.e. HEAD, against `github.com/Zalaras/muster/releases/latest`, 2026-09-10). Re-checked against this plan: same host, same path, same method (the Go client issues HEAD with `CheckRedirect` returning `http.ErrUseLastResponse`) — still valid. The parser accepts a `Location` that is absolute or path-relative and takes the last path segment.
- **`checksums.txt` line format** (`<hex>  <asset>`, two spaces — GoReleaser's `checksum` artefact, exercised by the installer's `shasum -c`). Re-checked: the Go parser splits on whitespace and matches the asset by exact basename, so one or two spaces both work.
- **`detach-on-destroy` / tmux socket ownership** (plan m2-terminal): not carried — the re-exec never touches the tmux server; the new daemon reconnects through the same socket path as any restart does today (SPEC §M4 reconcile, already E2E-covered by `reconcile.spec.ts`).

## Affected Files

### Daemon
- `internal/selfupdate/doc.go` — package doc: the one home of GitHub-release knowledge (D4).
- `internal/selfupdate/semver.go` — `ParseRelease(s) (Version, bool)` (strict `^v?\d+\.\d+\.\d+$`), `Compare`, `String()` (bare) — its own three-int parser; never imports `internal/claudecode`.
- `internal/selfupdate/release.go` — `LatestTag(ctx, client, base) (string, error)` (HEAD `{base}/latest`, no redirect following, 10 s timeout); `AssetName(ver, goos, goarch)`; `DownloadURL(base, tag, asset)`.
- `internal/selfupdate/verify.go` — `VerifyChecksums(pubKey, checksums, minisig []byte) error` via `github.com/aead/minisign` (both modes); `ChecksumFor(checksums []byte, asset) ([32]byte, error)`; `ErrBadSignature`, `ErrChecksumMismatch`, `ErrNoChecksumLine`.
- `internal/selfupdate/apply.go` — `Apply(ctx, Options{Client, Base, Tag, ExePath, PubKey, Progress func(Phase)}) error`: download all three to a temp dir, verify, extract `musterd`, write `<exedir>/.musterd-<tag>.tmp`, chmod 0755, rename; every error wrapped with the remedy sentence. 120 s overall timeout.
- `internal/selfupdate/lock.go` — `AcquireLock(exeDir) (release func(), error)`: `O_CREATE` + `syscall.Flock(LOCK_EX|LOCK_NB)`; `ErrInProgress`.
- `internal/selfupdate/install.go` — `Classify(version, exePath string, env func(string) string, home string, access func(dir string) error) Install{Kind, Path, Remedy}`; `InstallerRemedy`, `HomebrewRemedy` consts.
- `internal/selfupdate/exeversion.go` — `ProbeVersion(ctx, run execFunc, exePath) (string, error)` for REQ-26: runs `<exe> -version`, parses `musterd v?X.Y.Z`; `execFunc` is the injectable run seam (`cmd.WaitDelay` set).
- `internal/selfupdate/minisign.pub` — **Damian's public key, committed by hand before `/orchestrate`**; `//go:embed`-ed by `PublicKey()`.
- `internal/server/update.go` — `updateManager`: state, `Start`/`Stop`/`Refresh`/`SetCheckEnabled`, tick (check + REQ-26 stat/probe), apply serialisation (mutex + `inFlight`), `restartRequests chan struct{}`, `updateMessage`/`UpdateInfo` wire types, `handleApplyUpdate`, `handleRestartImpact`.
- `internal/server/state.go` — `Snapshot.Update UpdateInfo`; `PrefsInfo.UpdateCheck bool`.
- `internal/server/prefs.go` — `updateCheck` in `prefsRequest`, defaults, load fallback, validation; after persist, `s.updates.SetCheckEnabled(v)` when the value changed.
- `internal/server/server.go` — `Config{UpdateBaseURL string; UpdateCheckInterval time.Duration; UpdatePublicKey []byte; Install selfupdate.Install; ExePath string; ExeRun execFunc}`; construct the manager when `UpdateBaseURL != ""`; routes for the two endpoints; `Start`/`Shutdown` hooks; `RestartRequests() <-chan struct{}`; `ShellsAlive(ctx)` for REQ-27 (via the tmux client's session listing + `tmux.IsShellSessionName`).
- `cmd/musterd/main.go` — flags `-update` (bool), `-update-base-url`, `-update-check-interval` (default 24h, must be > 0), `-update-public-key-file` (test seam: overrides the embedded key); startup classification (`os.Executable` → `EvalSymlinks` → `selfupdate.Classify`), the REQ-28 log line; `MUSTER_RESTARTED` handling (skip auto-open, `os.Unsetenv`); a new `case <-srv.RestartRequests():` in the shutdown select that runs the graceful stop **without** `resolveOnExit`, closes the store, then `syscall.Exec`.
- `cmd/musterd/update.go` — `runUpdate(ctx, stdout, stderr, base, pubKey, version, install) error` for the `-update` flag (REQ-22); `reexec(exePath) error`.
- `.goreleaser.yaml` — `signs:` block (Implementation Notes).
- `.github/workflows/release.yml` — install minisign, write `$RUNNER_TEMP/minisign.key` from the secret, export `MINISIGN_KEY_FILE`/`MINISIGN_PASSWORD` to the GoReleaser step.
- `Makefile` — `release-check` passes `--skip=sign` (a local snapshot has no key).
- `go.mod` / `go.sum` — add `github.com/aead/minisign` (pinned).

### Web
- `web/index.html` — badge span inside `#settings-button`; the Updates fieldset in `#settings-dialog`; `#update-restart-dialog`.
- `web/src/protocol.ts` — `Prefs.updateCheck` (default `true` when absent), `UpdateInfo`, `UpdateApply`, `UpdateMessage`, `Snapshot.update`, `parseUpdate`, `parseMessage` case `"update"`.
- `web/src/ws.ts` — `onUpdate?: (update: UpdateInfo) => void`.
- `web/src/api.ts` — `PrefsRequest.updateCheck?: boolean`; `applyUpdate(restart: boolean): Promise<ApiResult<null>>`; `fetchRestartImpact(): Promise<ApiResult<RestartImpact>>`.
- `web/src/render/update.ts` — **pure** `buildUpdateViewModel(update: UpdateInfo | null, prefs: Prefs | null): UpdateViewModel` (every string in Text rules); `renderUpdateSection(elements, vm)`; `renderSettingsBadge(button, badged)`; `renderRestartImpact(el, shells)`; `initRestartConfirm(elements, handlers)`.
- `web/src/render/settings.ts` — elements/handlers extended: `updateToggle`, `applyBtn`, `restartBtn`, `onToggleUpdateCheck`, `onUpdate`, `onUpdateAndRestart`; `setChecked` gains the toggle.
- `web/src/main.ts` — `update` state, `onUpdate` handler, badge + section re-render on `snapshot`/`update`/`prefs`; the two button flows; confirm wiring; close the confirm on disconnect.
- `web/src/style.css` — `.update-dot`, `#settings-update`, `.update-versions`, `.update-actions`, `.check` — tokens only (`make contrast` gate).
- `web/e2e/helpers/daemon.ts` — options `updateBaseURL?: string` (default: pass `-update-base-url ""` — structurally no network), `updateCheckInterval?: string`, `updatePublicKeyFile?: string`, `binary?: string` (run this executable instead of `bin/musterd`), `env?: Record<string,string>` (e.g. `HOMEBREW_PREFIX`); export `buildVersionedMusterd(version: string): Promise<string>` (`go build -ldflags "-X main.version=<v>" -o <run-tmp>/musterd-<v> ./cmd/musterd`, cached per run) and `stageBinary(src, dir)` (copy 0755 into a fresh `mkdtemp` **outside** the repo so it classifies `installer`).

### E2E (e2e-specs)
- `web/e2e/helpers/releases.ts` — `FakeReleaseServer`: `/latest` → 302 `Location: {self}/tag/<tag>`; `/download/<tag>/<asset>` serving in-memory assets; `requestCount` per path; `hold()`/`release()`; `setLatest(tag)`; `publish({tag, binaryPath, arch})` builds the tar.gz (`musterd` + `README.md`), `checksums.txt`, and signs it with an in-process **Ed25519 minisign** keypair (Node `crypto`, legacy `Ed` mode — format in Implementation Notes); `writePublicKey(path)`; `tamper(kind)` for E7.
- `web/e2e/update.spec.ts` — E1–E15.

## Edge Cases

1. Offline / GitHub down at startup and every tick: debug log, `available` keeps its last value (possibly null), no UI error, retried next tick. → D17
2. `/latest` redirects to a tag that is not `v<semver>` (a draft/pre-release cannot reach `latest`, but a hand-made tag can): treated as a failed check. → D8
3. Redirect `Location` is path-relative or absolute: both parsed to the last segment. → D8
4. Available version equal to or older than running (rollback published, or a stale mirror): `available` null, `up to date`. → E10
5. Pref off while a check is in flight: the result is discarded, no badge appears, and no further request is made. → D16
6. Pref persisted off across a daemon restart: no request at startup either. → E2
7. Toggle on: immediate check (not a 24 h wait); coalesced if one is already running. → E3
8. `dev` build (`make build` stamps `git describe`, e.g. `v0.10.0-4-ge5102b8`): no request, no badge, no buttons; `-update` exits 1 "not a release build". → E8
9. A local build on an exact tag checkout (`git describe` = `v0.10.0`) looks like a release but lives inside the repo's git tree → `unmanaged`, badge with installer remedy, apply refused. → E13
10. Dotfiles repo at `$HOME`: a `.git` at `$HOME` itself does not make `~/.local/bin/musterd` unmanaged (the walk stops below `$HOME`). → D13
11. Binary under `/opt/homebrew/…` or `$HOMEBREW_PREFIX/…`: `homebrew`, badge shown, apply 409 `update_unsupported`, `-update` prints the brew remedy and exits 1. → E9
12. Exe directory not writable: `unmanaged` with the installer remedy. → D13
13. Tampered `checksums.txt` (signature no longer verifies): refused at `verifying`, binary hash unchanged. → E7
14. Missing `.minisig` (404): refused, no unsigned fallback. → E7
15. `.minisig` signed by a different key: refused. → E7
16. Archive SHA-256 differs from the signed line: refused at `verifying`. → E7
17. `checksums.txt` verifies but has no line for this arch's asset: refused with `ErrNoChecksumLine`. → D10
18. Archive lacks a `musterd` member (only README): refused at `installing`, nothing renamed. → D11
19. Disk full / write error during extract: temp file removed, rename never reached. → D11
20. Invoked path is a symlink (`~/.local/bin/musterd -> …`): the real target is replaced, the symlink untouched. → D11
21. Two dashboard windows click Update simultaneously: one download, both status lines walk the same phases. → E11
22. `musterd -update` while the daemon is mid-apply (or vice versa): the second fails with "another musterd update is in progress" (flock), the first completes. → D12
23. `musterd -update` succeeds while the daemon runs: the daemon keeps running old code; at its next tick the stat differs, `-version` is probed, `installed` is set and the dialog says restart. → E14
24. `-version` probe of the swapped file fails or hangs (5 s): `installed` stays null, debug log, retried next tick. → D24
25. Apply requested while shutdown is in progress: 409 `shutting_down`. → D18
26. `restart:true` but `syscall.Exec` returns an error: logged, process exits 1; the new binary is on disk, sessions are in tmux, the reconnect banner is what the user sees. → D22
27. Re-exec must not re-open the browser: `MUSTER_RESTARTED=1` suppresses `-open`. → D22
28. Re-exec with non-default `-addr`/`-data-dir`/`-tmux-socket`: preserved verbatim (INV-7). → E12
29. Plain-terminal shells open at restart: named in the confirm; gone afterwards; Claude sessions intact (INV-5). → E6
30. No shells open: confirm still appears and says so. → E6
31. Daemon-down mid-apply from the client's view (restart phase): dialog and confirm close, banner shows, reconnect re-derives badge/section from `snapshot.update`. → E5
32. Snapshot from a pre-plan daemon (no `update` key, no `prefs.updateCheck`): `updateCheck` defaults true, `update` null → section renders `unknown`-shaped text (`not checked yet`) and no badge, never throws. → W6
33. `-update-base-url ""` (every E2E daemon by default, and dev use): no manager constructed; apply/impact endpoints 404 `not_found`; section shows `not checked yet` for a release build. → D18
34. Hook loss / duplication / `/clear` rebinding / pane death without `SessionEnd`: not reached — this plan adds no ingest path and keys nothing on `session_id`; the restart's effect on sessions is reconcile's, already covered by `reconcile.spec.ts`. → untested: no new code path is keyed on hook delivery or session identity
35. First release after landing has no `.minisig` because the CI secrets are missing: GoReleaser's `signs` step fails the release rather than publishing unsigned (the `signs` block has no `ignore_errors`). → untested: cannot be driven locally without the CI secret; the reviewer verifies the block has no error suppression (M2)

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e, `M*` manual. One clause
per criterion.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` passes.
- **D3**: `make lint` passes.
- **D4**: no release-URL construction outside `internal/selfupdate` (the negative grep in the block; test files are excluded because they fake the release server and legitimately spell its paths).
- **D5**: `internal/selfupdate/minisign.pub` exists and is non-empty (Damian's prerequisite).
- **D6**: `goreleaser check` accepts the `signs:` block.
- **D7**: `ParseRelease` accepts exactly `v?MAJOR.MINOR.PATCH` and rejects `dev`, `v0.10.0-4-ge5102b8`, `0.10.0-dirty`, `1.2`.
- **D8**: `LatestTag` returns the tag from a 302 `Location` (absolute and relative) and errors on 200, on no `Location`, and on a tail that is not `v<semver>`.
- **D9**: `Compare` orders semver numerically and only a strictly greater version is reported available.
- **D10**: `VerifyChecksums`/`ChecksumFor` accept a valid legacy-mode and a valid prehashed-mode signature, and refuse a tampered file, a foreign key, a truncated signature, a mismatched SHA and a missing asset line — with the binary's hash unchanged after each refusal.
- **D11**: `Apply` writes the temp file in the real binary's directory, renames it over the resolved path, leaves a symlink untouched, and on a missing member or a write failure removes the temp file and leaves the binary byte-identical.
- **D12**: `AcquireLock` fails fast with `ErrInProgress` while another holder has the lock, and the daemon's apply reports that error as phase `failed`.
- **D13**: `Classify` returns the table in REQ-21 for: `dev` string; `/opt/homebrew/bin/x`; `/usr/local/Cellar/musterd/1/bin/x`; `$HOMEBREW_PREFIX/bin/x`; a non-writable dir; a `.git` in the exe dir, in a parent below `$HOME`; a `.git` at `$HOME` (→ `installer`); a plain writable dir (→ `installer`).
- **D14**: with `updateCheck` false the counting fake client records zero requests across construction, `Start`, three ticks and `Refresh`.
- **D15**: `SetCheckEnabled(false)` clears `available`/`checkedAt` and broadcasts one `update`; `SetCheckEnabled(true)` triggers a tick before the interval elapses.
- **D16**: a tick whose response arrives after `SetCheckEnabled(false)` leaves `available` null and broadcasts nothing.
- **D17**: a failed check keeps the previous `available`/`checkedAt`, emits one debug log, and broadcasts nothing.
- **D18**: `POST /api/update/apply` returns 400 on bad JSON, 404 when no manager or install `dev`, 409 `update_unsupported` for homebrew/unmanaged with `message == remedy`, 409 `nothing_to_apply`, 409 `shutting_down`, and 202 for a second request while in flight without starting a second download.
- **D19**: a successful apply broadcasts phases `downloading`, `verifying`, `installing`, `done` in order with `version` set, and a failure broadcasts `failed` with `error` set; INV-4 holds after every broadcast.
- **D20**: `{"restart":true}` broadcasts `restarting` after `done` and sends exactly one value on `RestartRequests()`.
- **D21**: `run([]string{"-update", …})` against an httptest release server exits 0 printing `updated to vX.Y.Z — restart musterd to finish` on success and `already up to date` when equal, and exits non-zero printing the remedy for `dev`, for a Homebrew path, and for a bad signature (binary hash unchanged).
- **D22**: the restart path calls `syscall.Exec` with the resolved exe, `os.Args` verbatim and `os.Environ()` plus `MUSTER_RESTARTED=1`, never calls `resolveOnExit`, and a startup with `MUSTER_RESTARTED` set skips `openDashboard` and unsets the variable.
- **D23**: `GET /api/update/restart-impact` lists each alive `muster-<n>-shell` with its session's title (null for an unknown session) and `[]` when none.
- **D24**: REQ-26 detection sets `installed` from a changed stat plus a successful probe, and leaves it null when the probe fails or times out.
- **D25**: `ProbeVersion` parses `musterd 0.11.0 (Claude Code verified …)` and `musterd v0.11.0` and rejects `musterd dev`.
- **D26**: the check request carries a 10 s deadline and `Apply` a 120 s deadline (asserted via a hanging fake server).

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: `make contrast` passes.
- **W4**: `make e2e-lint` passes.
- **W5**: `buildUpdateViewModel` is table-tested over every Text-rules row: each `install` kind × pref on/off × `available` null/set × `installed` null/set × each `apply.phase`.
- **W6**: `parseMessage` decodes an `update` message and a `snapshot` with and without `update`/`prefs.updateCheck` (defaults: `null` / `true`) without throwing.
- **W7**: no `any` in new web code.
- **W8**: the badge dot and the status line use only neutral tokens (`--fg-muted`/`--fg-dim`), never a state token.
- **W9**: the confirm dialog is a 440 px `.modal.confirm` per design-system §5 with the header and footer rules.
- **W10**: the toggle's checked state and the buttons' labels are only ever set from `prefs`/`update` broadcasts, never optimistically on click.

### E2E
- **E1**: pref on, fake release newer: the Settings button becomes `Settings, update available` with the dot visible, and the dialog shows `Running v<old>` and `Available v<new>`.
- **E2**: pref turned off then daemon restarted: after startup plus two `-update-check-interval`s the fake server's `/latest` count is 0 and no badge is shown.
- **E3**: unchecking the toggle clears the badge and shows `checking disabled`; re-checking increments the fake `/latest` count within the expect timeout and restores the badge.
- **E4**: **Update**: the staged binary's `-version` reports the new version and its SHA-256 equals the published archive's member; `hello.daemon.version` and `Running` still show the old version; the status line reads `Updated to v<new>. Restart musterd to finish.`; the badge is gone.
- **E5**: **Update and restart**: after one reconnect the dialog shows `Running v<new>` and `Available up to date`, every pre-existing Claude session is still listed and its terminal attaches, and the tmux server PID on the socket is unchanged.
- **E6**: with two Claude sessions and one plain shell open, the confirm body reads `1 plain-terminal shell will close: <title>…`; after the restart the shell tmux session is gone and both Claude panes' PIDs are unchanged; with no shells the body reads `No plain-terminal shells are open.…`.
- **E7**: each of tampered `checksums.txt`, missing `.minisig`, foreign-key `.minisig`, and SHA-mismatched archive yields `Update failed: …` in the status line and an unchanged binary hash.
- **E8**: a `bin/musterd`-shaped dev build: no badge, no Update buttons in the dialog, `Available not checked (development build)`, fake `/latest` count 0.
- **E9**: binary staged under `$HOMEBREW_PREFIX/bin`: badge shown, `Available v<new>`, both buttons disabled, status line contains `brew upgrade musterd`.
- **E10**: fake latest equal to running, then older: `Available up to date`, no badge.
- **E11**: two pages click **Update** while the fake server holds the archive: after release, the archive path's request count is 1 and both pages show `Updated to v<new>…`.
- **E12**: a daemon started with a non-default `-addr` and scratch `-data-dir`/`-tmux-socket` comes back on the same port and data dir after **Update and restart**.
- **E13**: binary staged inside a scratch `git init` tree: badge shown, buttons disabled, status line names the installer command.
- **E14**: `musterd -update` run against the fake server while the daemon runs (interval 2 s): the dialog shows `Updated to v<new>. Restart musterd to finish.` and `Restart now` without any click.
- **E15**: after **Update**, clicking **Restart now** shows the confirm, and **Restart** brings the dashboard back on the new version with no second archive download.

### Manual
- **M1**: the first real release cut after landing carries `checksums.txt.minisig`, and a release binary run with `-update` against a *following* release verifies it with the compiled-in key (ritual recorded in `docs/release-signing.md`).
- **M2**: the `signs:` block carries no error suppression, so a missing secret fails the release rather than publishing unsigned (edge case 35).

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. `D4`'s scope excludes `_test.go` and `web/e2e` deliberately: tests fake the
release server and legitimately spell its paths; production code may not.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "/download/[v]" cmd/ internal/ web/src --glob '!internal/selfupdate/**' --glob '!**/*_test.go'
D5 test -s internal/selfupdate/minisign.pub
D6 goreleaser check
W1 make web-build
W2 make web-test
W3 make contrast
W4 make e2e-lint
E1 make e2e
```

### Reviewer-Verified

- **D7**–**D26**: unit-level claims verified by reading the named tests and running `make test`.
- **W5**, **W6**: verified by reading the Vitest tables.
- **W7**: no `any` types in new web code.
- **W8**: badge/status tokens are neutral (read `style.css`).
- **W9**: confirm dialog matches §5 Modal.
- **W10**: no optimistic local state for toggle/labels (read `main.ts`).
- **E2**–**E15**: each spec exists and passes under `make e2e`.
- **M1**, **M2**: as stated.

## Implementation Notes

### Boundary and seams
- `internal/selfupdate` is to GitHub Releases what `internal/claudecode` is to Claude Code: URL
  shapes, asset naming, checksum/signature file names and the minisign format live there and
  nowhere else (D4). It knows nothing about the server, the store or tmux.
- Seams follow `docs/conventions.md`: `-update-base-url` (empty disables — the `IssueAPIURL`
  shape, so a zero-value `Config` never reaches github.com), `-update-check-interval`,
  `-update-public-key-file` (E2E signs with its own key; production always uses the embedded
  one), an injectable `execFunc` for the `-version` probe (never a `$PATH` shim), and the HTTP
  client via `Config.HTTPClient` (already exists).
- Timeouts: check 10 s (`internal/ghissue`'s outbound precedent), whole apply 120 s, probe 5 s
  (`versionCheckTimeout`). Every `exec.CommandContext` that reads a pipe sets `cmd.WaitDelay`.

### Minisign
- Library: `github.com/aead/minisign` (pure Go, Ed25519 + BLAKE2b, supports both `Ed` legacy and
  `ED` prehashed algorithms). Adding it is a stack decision recorded in `docs/conventions.md`'s
  table and SPEC §5 at approval. Alternative considered: hand-rolled Ed25519 (stdlib) + BLAKE2b
  (`golang.org/x/crypto`) — more code, same dependency count.
- Formats the E2E fake must produce (and the Go tests exercise via the library's signer):
  - **Public key file**: line 1 `untrusted comment: …`; line 2 base64 of `"Ed"` ‖ `key_id`(8
    bytes) ‖ `pk`(32 bytes).
  - **Signature file**: line 1 `untrusted comment: …`; line 2 base64 of `alg`(2 bytes: `Ed` =
    Ed25519 over the raw file, `ED` = Ed25519 over BLAKE2b-512(file)) ‖ `key_id`(8) ‖
    `sig`(64); line 3 `trusted comment: …`; line 4 base64 of Ed25519 over `sig` ‖ the trusted
    comment's bytes. `key_id` must match the public key's.
  - Node 24's `crypto` provides Ed25519 (`generateKeyPairSync("ed25519")`, `sign(null, data,
    key)`, raw key via JWK export) and `blake2b512` — the fake can use legacy `Ed` and skip BLAKE2b.
  - A real `minisign -S` (≥ 0.8) writes prehashed `ED`; GoReleaser's `signs` runs the binary, so
    the verifier accepts both.
- **GoReleaser block** (verify against the v2 schema as the existing `before.hooks` comment did):
  ```yaml
  signs:
    - id: checksums
      artifacts: checksum
      cmd: minisign
      args: ["-S", "-s", "{{ .Env.MINISIGN_KEY_FILE }}", "-m", "${artifact}", "-x", "${signature}", "-t", "muster {{ .Version }}"]
      signature: "${artifact}.minisig"
      stdin: "{{ .Env.MINISIGN_PASSWORD }}"
  ```
  `release.yml` adds, before the GoReleaser step: `sudo apt-get install -y minisign`; a step
  writing `${{ secrets.MINISIGN_SECRET_KEY }}` to `$RUNNER_TEMP/minisign.key` (mode 0600) and
  exporting `MINISIGN_KEY_FILE`; and `MINISIGN_PASSWORD: ${{ secrets.MINISIGN_PASSWORD }}` in the
  GoReleaser step's `env`. **Damian generates the keypair** (`minisign -G -p
  internal/selfupdate/minisign.pub -s <private>`), commits the `.pub`, and creates both secrets —
  Claude never handles the private key or passphrase (CLAUDE.md hard rule). `make release-check`
  passes `--skip=sign`.
- New doc `docs/release-signing.md` (daemon-impl): key generation, the two secrets, the public-key
  fingerprint, rotation (a new key ships in a release signed by the old one), and the M1 ritual.

### Apply mechanics
- Darwin permits renaming over a running executable's file; the running process keeps its mapped
  pages. `os.Executable()` on darwin returns the path used at exec; after the rename it names the
  new file, which is what `syscall.Exec` needs.
- Temp file beside the target keeps the rename same-filesystem and atomic (spec edge case). Name
  it `.musterd-<tag>.tmp`; remove on any failure.
- Go's `net/http` sets no `com.apple.quarantine` xattr (same as `curl`, the installer's path).
- The flock file `.musterd-update.lock` lives beside the binary; `LOCK_NB` — the loser reports
  `ErrInProgress`. In-process serialisation is a mutex plus `inFlight`; a second POST returns 202.

### Re-exec
- Go opens every fd `CLOEXEC`, so the listener, the SQLite handles and the WS sockets close at
  exec; the new process rebinds `-addr` (Go sets `SO_REUSEADDR`). Still run the graceful path
  first — `httpServer.Shutdown`, `srv.Shutdown`, `st.Close()` — so the WAL is checkpointed and
  no ingest event is lost mid-queue.
- `run()` returns a sentinel `errRestart{exe}`; `main` performs `syscall.Exec(exe, os.Args,
  append(os.Environ(), "MUSTER_RESTARTED=1"))` and treats a returned error as fatal (exit 1).
  The restart path never enters the `-on-exit` block; sessions are always left running.
- `MUSTER_RESTARTED` suppresses `-open` (a second browser tab would otherwise open every
  restart, since stdin is still the TTY) and is `os.Unsetenv`'d after being read.

### E2E harness
- `bin/musterd` is stamped `git describe` (`v0.10.0-4-ge5102b8` today) → `dev` by REQ-8, so every
  existing spec's daemon never checks; `daemon.ts` additionally passes `-update-base-url ""` by
  default so the guarantee is structural, not incidental.
- Update specs build real binaries with `go build -ldflags "-X main.version=0.1.0"` / `0.2.0`
  (cached per run — a warm relink is ~1–2 s) and stage the "running" one in a scratch dir
  outside the repo. The fake release's archive carries the `0.2.0` build, so **Update and
  restart** genuinely re-execs a newer musterd. `-web-dist` is in `os.Args` and survives.
- Homebrew simulation is `HOMEBREW_PREFIX=<scratch>/brew` in the daemon's env (what `brew
  shellenv` exports) — no fake flag. Unmanaged simulation is `git init` in the staging dir.

### Doc upkeep (orchestrator, not impl agents)
- `TODO.md`: tick the "Auto-update for `musterd`" item; add a follow-up item "installer verifies
  `checksums.txt.minisig` too" (out of scope here, cheap once the key exists).
- `SPEC.md` changelog: auto-update shipped — pref default on, check-only, explicit apply,
  minisign trust root, restart semantics, install kinds; §5 stack row for `aead/minisign`.
- `docs/design/design-system.md` §5 Modal: the Settings dialog now holds the theme picker **and**
  the Updates section; note the neutral badge dot on the Settings button.
- `README.md`: an "Updating" paragraph (Settings → Update, `musterd -update`, brew users use
  `brew upgrade` once the tap exists).
- `docs/protocol.md`: merged at approval (this plan's delta), version unchanged (additive).

### Prerequisites before `/orchestrate`
1. `internal/selfupdate/minisign.pub` committed (D5).
2. `MINISIGN_SECRET_KEY` and `MINISIGN_PASSWORD` repository secrets created — needed by the first
   release after landing, not by the pipeline.
