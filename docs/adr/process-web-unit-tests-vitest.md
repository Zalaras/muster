---
id: process-web-unit-tests-vitest
type: decision
status: accepted
date: 2026-08-16
summary: Dashboard logic gets Vitest unit tests alongside the Playwright E2E suite; neither replaces the other.
features: []
tags: [testing, pipeline]
files: [web/vitest.config.ts, web/package.json]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md]
supersedes: []
---
**Context.** The dashboard is framework-free TypeScript, and the pipeline has a dedicated web-tests role. Playwright already drove the whole stack, but pure functions such as sorting, formatting and protocol decoding wanted fast, isolated tests.

**Options.** (A) Playwright only, with E2E specs covering logic through the UI. (B) Add a unit runner: Vitest, which shares Vite's config and transforms. (C) Jest with a separate transform pipeline.

**Decision.** B.

**Consequences.** Web unit tests live beside their modules as test files and run in the check target; E2E specs stay for behaviour that needs a real daemon. The web-tests agent writes Vitest, the e2e-specs agent writes Playwright, and a test that needs the DOM and a daemon belongs to the latter.
