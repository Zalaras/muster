---
id: lifecycle-migrations-add-tables-when-written
type: decision
status: accepted
date: 2026-08-22
summary: A migration ships only the tables its milestone writes; the spec's schema sketch is not frozen into the first migration.
features: [lifecycle]
tags: [store]
files: [internal/store/migrations/**, internal/store/migrate.go]
tests: [TestMigrate_AppliesInitSchema, TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations]
refs: [docs/history/spec-changelog.md, plan:m0-skeleton, kb:adr/stack-db-database-sql-hand-sql]
supersedes: []
---
**Context.** The spec sketches the full data model. A literal reading of the skeleton plan asked the first migration to create every table. Migrations are forward-only, so any column set frozen early and later found wrong would cost a churn migration.

**Options.** (A) Create the whole sketched schema in the first migration. (B) Create only the key-value and event tables the skeleton writes, and add each remaining table with the milestone that first writes it.

**Decision.** B, as an approved deviation recorded in review.

**Consequences.** Each milestone's plan names its migration and the columns it adds. Old rows never need backfilling for a table that did not exist yet. A reader learning the schema reads the migrations in order, not the spec.
