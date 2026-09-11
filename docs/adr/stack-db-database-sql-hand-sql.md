---
id: stack-db-database-sql-hand-sql
type: decision
status: accepted
date: 2026-08-16
summary: Database access is database/sql with hand-written SQL and embedded, numbered, forward-only migrations; no ORM.
features: [lifecycle]
tags: [deps, store, user-decision]
files: [internal/store/store.go, internal/store/migrate.go, internal/store/migrations/**]
tests: [TestMigrate_AppliesInitSchema, TestMigrate_SecondCallIsANoOp]
refs: [docs/history/spec-changelog.md, docs/conventions.md]
supersedes: []
---
**Context.** The data model is a few small tables in SQLite through a pure-Go driver. Damian knew GORM but found it heavy for this size.

**Options.** (A) GORM or another ORM. (B) A query builder. (C) database/sql with hand-written SQL, and schema changes as numbered SQL files embedded in the binary.

**Decision.** C.

**Consequences.** Every query is visible in the store package and testable against a scratch database. Migrations are applied in order once and recorded in a migrations table, which makes them forward-only: a column is never edited in place, only added by a later file. Row-to-struct mapping is written by hand, so a new column touches the migration, the scan and the wire mapping together.
