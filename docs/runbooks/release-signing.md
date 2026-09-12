---
id: release-signing
type: runbook
status: active
date: 2026-09-11
summary: How checksums.txt is minisign-signed in CI, why local snapshots skip signing, how to rotate the key without locking out installs, and the M1 ritual.
features: [release, update]
tags: [security, pipeline]
files: [internal/selfupdate/minisign.pub, .goreleaser.yaml, .github/workflows/release.yml, Makefile]
tests: []
refs: [plan:auto-update, kb:adr/update-trust-root-minisign-signed-checksums, kb:adr/release-installer-verifies-sha256-against-checksums]
---

Every release's `checksums.txt` is signed with [minisign](https://jedisct1.github.io/minisign/)
so `internal/selfupdate` (and `musterd -update`) can verify a release before ever installing it —
there is no unsigned fallback.

## The keypair

- **Public key**: `internal/selfupdate/minisign.pub`, committed to the repo and
  `//go:embed`-ed into every build (`selfupdate.PublicKey()`). Current fingerprint (the
  key ID minisign prints, and the suffix of the public key file's own comment line):

  ```
  7FA9D01D017D739A
  ```

- **Private key + passphrase**: never committed, never handled by Claude (CLAUDE.md hard
  rule). Damian generated them by hand:

  ```
  minisign -G -p internal/selfupdate/minisign.pub -s <private-key-path>
  ```

  and stored the two halves as GitHub Actions repository secrets:

  | Secret | Contents |
  |---|---|
  | `MINISIGN_SECRET_KEY` | the raw contents of the generated private key file |
  | `MINISIGN_PASSWORD` | the passphrase chosen at generation time |

`.github/workflows/release.yml` materialises `MINISIGN_SECRET_KEY` to a runner-local temp
file (`$RUNNER_TEMP/minisign.key`, wiped at the end of the job) and exports it as
`MINISIGN_KEY_FILE`; `.goreleaser.yaml`'s `signs:` block runs `minisign -S` against that
file, reading `MINISIGN_PASSWORD` from stdin, and produces `checksums.txt.minisig`
alongside every release's `checksums.txt`.

## Local snapshots never sign

`make release-check` passes `goreleaser release --snapshot --clean --skip=sign` — a local
snapshot has neither secret, and GoReleaser's `signs:` block carries no `ignore_errors`
(deliberately: a missing secret must fail a *real* release rather than publish an
unsigned `checksums.txt`), so signing is skipped outright for snapshots instead of
failing the local build.

## Rotation

If the private key or passphrase is ever compromised or needs rotating:

1. Generate a new keypair the same way.
2. Ship **one transitional release** signed with the **old** key that updates
   `internal/selfupdate/minisign.pub` to the **new** public key — this is the only way an
   already-installed musterd can trust the new key at all, since verification only ever
   trusts the key compiled into the binary it's running.
3. Update the `MINISIGN_SECRET_KEY`/`MINISIGN_PASSWORD` secrets to the new pair.
4. Every release after that point is signed with the new key.

A key rotation that skips step 2 (ships the new public key in a release signed with the
*new* key, not the old one) locks out every existing install: they'd need the new key to
verify the very release that introduces it.

The key change from `647ADECB8044F4A2` to `7FA9D01D017D739A` (2026-09-11) was **not** a
rotation and owes no transitional release: the first key was a placeholder committed with
the feature and was replaced before it ever signed anything. v0.12.0 embeds it but was
signed with `7FA9D01D017D739A`, so no v0.12.0 install can self-update — reinstall rather
than `-update` from it. Every release from v0.12.1 embeds the key that signs it.

## The M1 ritual

**M1** (the plan's manual acceptance item): the first real release cut after
the feature landed must carry `checksums.txt.minisig`, and a release binary run with
`-update` against a *following* release must verify it successfully with the compiled-in
key. Concretely:

1. Confirm the first release's assets include
   `checksums.txt.minisig` (GitHub Releases page or `gh release view --json assets`).
2. Wait for (or trigger) a second release.
3. Run the *first* release's `musterd -update` and confirm it downloads, verifies, and
   installs the second release's binary (`musterd -version` reports the new version
   afterward). Start from **v0.12.1**, not v0.12.0 — see the note under Rotation.

**M2**: read `.goreleaser.yaml`'s `signs:` block and confirm it has no `ignore_errors` (or
any other error-suppression key) — a missing secret must fail the release, never publish
an unsigned `checksums.txt` (edge case 35).

**Both run 2026-09-12**, v0.12.1 → v0.12.2 via the dashboard: v0.12.1 badged Settings,
offered `v0.12.2`, `Update` swapped the binary to the release archive's own hash while the
process still reported `v0.12.1`, `Restart now` re-exec'd in place (same PID) onto
`v0.12.2`. `signs:` clean.
