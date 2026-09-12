# internal/store — SQLite, hand-written SQL, migrations

**Owns**: opening the database in WAL mode, embedded numbered migrations in `migrations/`, and the row types and queries for kv, events, sessions, repos and usage samples. Callers pass neutral values: no Claude Code vocabulary, no `internal/usage` or `internal/session` types. **Features**: lifecycle, launch, usage.

**Invariants** (violations are review-Critical):
- `database/sql` with hand-written SQL; no ORM, no query builder (kb:adr/stack-db-database-sql-hand-sql, kb:adr/stack-storage-sqlite-pure-go).
- Migrations are forward-only, numbered `NNNN_name.sql`, and add a table only when the code writing it lands (kb:adr/lifecycle-migrations-add-tables-when-written).
- The store stamps receipt timestamps and assigns `seq` itself; a caller-supplied time is ignored (kb:adr/ingest-seq-assigned-at-ingest).
- One connection (`SetMaxOpenConns(1)`): the ingest worker is the single writer and SQLITE_BUSY never surfaces.
- The database file and its `-wal`/`-shm` sidecars are chmodded 0600 on open; the test asserts all three.
- Every row type is this package's own storage twin; mapping to domain types happens in the caller.

**Exemplar**: `usage.go` — a `*Row` struct plus `Insert*`/`List*` methods with inline SQL.

**Gotchas**:
- Times are RFC3339 UTC text, nanosecond precision for receipt stamps; parse on read, never compare as strings.
- Ended rows are swept on the next start; live rows whose pane is gone are kept as ended (kb:adr/lifecycle-ended-rows-swept-next-start).
- "The file is now private" is proven with `ls -l` on all three files, not the diff (kb:lesson/effect-claimed-from-the-diff).
- Don't test SQLite's own constraint enforcement.

<!-- kb:trailer -->
<!-- kb:hash b9d85623319f9372 -->
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **lifecycle** — The session state machine, liveness, reconcile on start, shutdown policy, resume to idle. → `docs/features/lifecycle/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- 13 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
