---
id: stack-storage-sqlite-pure-go
type: decision
status: accepted
date: 2026-08-16
summary: State is stored in SQLite through the pure-Go modernc driver in WAL mode; no cgo, no external database, no flat files.
features: [lifecycle]
tags: [store, deps]
files: [internal/store/store.go, go.mod]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, docs/conventions.md, kb:adr/stack-db-database-sql-hand-sql, kb:adr/release-builds-cross-compiled-on-linux]
supersedes: []
---
**Context.** The daemon holds live state in memory and needs a system of record for restarts and reconcile: sessions, repos, an append-only event log and usage samples. A single-user localhost tool wants zero operations.

**Options.** (A) JSON or other flat files, simple until the event log and history queries arrive. (B) An embedded key-value store, which pushes every query into Go code. (C) SQLite through the cgo driver, fast but binding the build to a C toolchain. (D) SQLite through a pure-Go driver in WAL mode.

**Decision.** D. SQLite is widely understood, queryable and extensible, and the pure-Go driver keeps the binary a single static artifact.

**Consequences.** Releases cross-compile with cgo disabled, which the driver permits. Access is through database/sql with hand-written SQL and embedded forward-only migrations, recorded separately. The event table can serve a future dead-session history without a schema change.
