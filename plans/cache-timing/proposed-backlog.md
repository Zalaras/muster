# Proposed backlog — cache-timing

Proposed, not filed: the developer files what they want into `TODO.md`.

- **Two session comments say the cache is never changed in place** — the `applyStatusUpdate`
  doc comment in `internal/session/status.go` and the `Session.Clone` doc in
  `internal/session/session.go` say a changed cache is always a fresh pointer; a keep-alive post
  now updates the held request count and reported expiry in place. The comments should say what
  the code does. (review cycle 1, note)

## Decisions (the developer, 2026-10-15)

- Two session comments say the cache is never changed in place — deferred
