---
id: process-one-name-per-feature
type: decision
status: accepted
date: 2026-09-11
summary: One name per feature is shared by the web controller, the server handler file, the E2E spec prefix and its helper; existing specs kept their names.
features: []
tags: [pipeline]
files: [web/src/features/*.ts, internal/server/usage.go, web/e2e/tiles.spec.ts, web/e2e/rail-cards.spec.ts, docs/conventions.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:code-breakup, docs/conventions.md, kb:adr/process-composition-roots-registration-only]
supersedes: []
---
**Context.** Breaking the two composition roots into features raised a naming question across three trees: a feature's web controller, its server handler and its E2E specs had no shared vocabulary, and two E2E files had become grab-bags holding tests from half a dozen features.

**Options.** (A) Name each side independently and map between them in a plan. (B) One vocabulary table shared by web, server and E2E, so the controller file, the handler file, the spec prefix and the helper module carry the same name; split the two grab-bag spec files along those seams and leave every other existing spec where it is.

**Decision.** B. The table lived in the plan and its outcome is the conventions rule that spec files and helpers are named for the same seam as the controller.

**Consequences.** The knowledge base's feature registry uses the same names, so a record's feature is also the directory a reader looks in on every side. New specs follow the rule; old spec names are history and not worth a rename churn. The test count across the split was an acceptance check so nothing was dropped.
