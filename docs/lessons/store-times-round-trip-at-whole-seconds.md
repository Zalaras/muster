---
id: store-times-round-trip-at-whole-seconds
type: lesson
status: active
date: 2026-11-03
summary: A session row's endedAt is stored as whole-second RFC3339, so a test seeding time.Now() and comparing the read-back exactly is red on any tree.
features: [lifecycle]
tags: [testing, store]
roles: [daemon-tests]
files: [internal/store/store.go, internal/session/manager_test.go]
tests: []
refs: [plan:sweep-2026-11-03-1, plans/sweep-2026-11-03-1/daemon-implementation.md]
---
**What happened.** The red-first reconcile tests seeded `endedAt` with `time.Now().UTC().Add(-time.Hour)` and asserted the stored value came back unchanged. The store's `encodeTime` writes `time.RFC3339`, so it keeps whole seconds only. The assertion could never pass, and its red at authoring looked like the defect holding.

**Cost.** The implementation finished with two tests still red, and a daemon-tests fix-mode spawn took about 28 minutes to truncate two seeds.

**What changed.** Truncate any time you seed into a session row (`.Truncate(time.Second)`) before comparing it with a read-back. A red-first test's failure message has to name the defect, not a precision mismatch.
