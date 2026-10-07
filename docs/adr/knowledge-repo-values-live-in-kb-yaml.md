---
id: knowledge-repo-values-live-in-kb-yaml
type: decision
status: accepted
date: 2026-10-07
summary: Every repo-specific value the kb tool reads (record dirs, closed lists, paths, budgets, pack scoping, refs, scope) is a strict kb.yaml; the model stays code.
features: [knowledge]
tags: [pipeline]
files: [kb.yaml, internal/kb/config.go, internal/kb/budget.go]
tests: [TestLoadConfig_RejectsAnUnknownKeyAtAnyDepth, TestLoadConfig_DefaultsAbsentKeysAndKeepsExplicitValues, TestCheck_OwnershipRootsComeFromTheConfig, TestPack_ProposedDecisionRolesComeFromTheConfig]
refs: [plan:kb-config, kb:adr/knowledge-pack-sections-scoped-by-role, kb:adr/stack-config-yaml-goccy-strict]
supersedes: []
---
**Context.** `internal/kb` is the one part of Muster's knowledge management another repo could
use, but it hardcoded about a dozen values that belong to this repo: the eight record
directories, the closed tag and role lists, the owned source roots, the word and line budgets,
which pack sections each pipeline role reads, the design documents and conventions sections per
role, the citation-scope exclusions, the tree skip list, and the paths of the protocol file, the
conventions file, the plans directory and the observed-versions record. Each was a package
variable a retro edited by hand, and none was visible as a setting.

**Options.** (A) Leave them in code and extract the tool later by forking it. (B) Move them into
one required `kb.yaml` at the repo root, parsed strictly, with the record model (types, statuses,
fields, citation syntax, generated-file markers) staying in code. (C) Environment variables or
flags per value.

**Decision.** B. `Load` reads `kb.yaml` first and fails without it or on any unknown key;
`dirs`, `tags` and `roles` are required, every other key defaults to the value this repo uses
so a fixture needs three keys. The config rides the `Index`, and the three functions that run
before an index exists take it as a parameter.

**Consequences.** The tool is one config file away from serving another repo, and extraction
becomes a module split rather than a fork. The per-role rationale that lived beside each list
moved into the yaml as comments, where the person changing a list reads it. Budgets are no
longer compile-time constants: `budget.go` keeps the type and the defaults, and a budget change
is a one-line commit to `kb.yaml`. Tests that pinned a hardcoded list now read it from the
index they loaded.
