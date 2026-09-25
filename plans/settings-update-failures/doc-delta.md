# Doc delta: settings-update-failures

Seeded from plan.md § Doc Delta; amended with every `doc-delta:` line from the implementation logs (fix waves included).


**update** — becomes true:
- `docs/features/update/spec.md` § Install kinds says: at startup the binary classifies its
  install from the resolved executable path as installer, dev, homebrew or unmanaged. Installer
  and unmanaged are re-derived at the start of every release check, so a blocker that clears
  enables Update without a restart. An unmanaged remedy names the binary's path and the reason:
  an unwritable directory with the error, or the enclosing git checkout.
- § Applying says any failure leaves the old binary untouched and reports one sentence naming
  what failed and why. The full error goes to the daemon log.
- § Restarting says every window that saw the restart shows the banner as updating while the
  daemon is down (falling back to unreachable after 30 s), reloads on its first reconnect, and
  confirms `Updated to v…` for 3 s when the daemon it reached runs that version.
- `docs/protocol.md` carries the `update` `install`/`remedy`/`apply.error` semantics and the
  `update.check`/`update.apply` wording above.

**update** — stops being true:
- "At startup the binary classifies its install from the resolved executable path as installer,
  dev, homebrew or unmanaged." (replaced by the sentence above)
- "any failure leaves the old binary untouched and reports an error with a remedy sentence"
  (replaced)
- `docs/protocol.md`'s `install` comment "constant for the daemon's life", and the 502 example
  `requesting https://example.test/releases/latest: connection refused`.

**connection** — becomes true:
- `docs/features/connection/spec.md` adds, after the daemon-down banner sentence: except after an
  update restart, when the banner reads as updating (kb:spec/update).

**connection** — stops being true:
- nothing.


## Amendments from the run

- Implementation-log `doc-delta:` lines (daemon-implementation.md:28, :121, :207, :268; web-implementation.md Fix Attempts 1–3) add no claim beyond the above. Two refinements the fix waves made true, for the sentences above:
  - A failed check's or apply's wire sentence never contains a URL for *any* failure class, including the unclassified fallback (a malformed redirect or base URL reads `update check failed: the release host's response couldn't be read`).
  - The restart-reload also applies when the returning daemon speaks another protocol version: the window reloads and the protocol-mismatch screen is never shown.
- **Features** now also names `surfaces` (decisions/features-scope-shellactivity-test): a test call-site only, so there is no surfaces claim to promote.
