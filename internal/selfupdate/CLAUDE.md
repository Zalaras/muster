# internal/selfupdate — GitHub Releases knowledge, one package

**Owns**: resolving `{base}/latest` by redirect, GoReleaser asset naming, `checksums.txt` and its minisign signature, archive download and swap-in, install-kind classification, the cross-process update lock and semver comparison. Knows nothing of HTTP handlers, the store or tmux: `internal/server` owns the poller and wire, `cmd/musterd` owns the flag and re-exec (kb:adr/update-release-knowledge-in-selfupdate-package). **Features**: update.

**Invariants** (violations are review-Critical):
- Trust root is the compiled-in `minisign.pub`; checksums verify against it before any archive is trusted, and nothing installs on a failed check (kb:adr/update-trust-root-minisign-signed-checksums, kb:adr/stack-selfupdate-minisign-library).
- Latest is a HEAD against the redirect, never the REST API (kb:adr/release-latest-resolved-via-redirect-not-api).
- Install kind decides who may apply; homebrew and unmanaged get a remedy, not an apply (kb:adr/update-install-kinds-decide-who-may-apply).
- Restart is an in-place re-exec after graceful shutdown, never a plain exit (kb:adr/update-restart-is-in-place-reexec-not-shutdown).
- Every network call is bounded by `CheckTimeout` or the apply phase's own deadline.

**Exemplar**: `release.go` — one bounded network call, a redirect stop that leaves the shared client untouched, sentinel errors whose text doubles as UI status.

**Gotchas**:
- Tests sign with `testkeys_test.go`; the real public key never verifies a test fixture.
- `AcquireLock` is a non-blocking flock beside the binary; call the release exactly once.
- Sentinel error text is user-facing: name the fact and the remedy in one sentence, ending "nothing was installed".
- The redirect's `Location` may be absolute or relative; only its last segment is a tag.

<!-- kb:trailer -->
<!-- kb:hash 02839e13c29b1818 -->
- **update** — Release check, minisign-verified apply, in-place restart with sessions re-adopted. → `docs/features/update/INDEX.md`
- 7 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
