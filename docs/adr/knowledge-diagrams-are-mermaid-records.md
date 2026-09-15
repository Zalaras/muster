---
id: knowledge-diagrams-are-mermaid-records
type: decision
status: accepted
date: 2026-09-15
summary: Diagrams are mermaid, in a closed kind list; system-wide ones are diagram records under docs/diagrams, feature ones sit inline in the feature spec.
features: [knowledge]
tags: [pipeline]
files: [internal/kb/mermaid.go, docs/conventions.md]
tests: [TestCheck_HoldsADiagramToOneFenceWhoseKeywordMatchesItsKind, TestPack_CarriesFeatureDiagramsToEveryRoleAndSystemDiagramsToPlanningRolesOnly]
refs: [kb:spec/knowledge, kb:spec/reader]
supersedes: []
---
**Context.** The kb held prose only. Agents reconstruct the system's shape (which container talks to which, the session state machine, the hook sequence, the store schema) from scattered records on every run, and Damian has no picture of a codebase written almost entirely by agents. A diagram format had to sit in markdown, be readable by an LLM as text, and be rendered by the docs reader later without a build step.

**Options.** (A) Free-form images under `docs/images/`. (B) Mermaid fences, one closed list of kinds, stored as typed records the kb tool indexes, packs and checks; feature-scoped diagrams inline in the feature's spec; plans free to embed any allowed kind (plus Code-level class diagrams, plans only). (C) A diagram CLI dependency to render and validate.

**Decision.** B. Eight kinds, one mermaid keyword each: `context` C4Context, `container` C4Container, `component` C4Component, `domain` classDiagram, `state` stateDiagram-v2, `sequence` sequenceDiagram, `er` erDiagram, `flow` flowchart. A system-wide diagram is a `docs/diagrams/<slug>.md` record with a required `kind`, exactly one mermaid fence whose keyword is the kind's, a prose body under the default budget, and `files` globs naming what it depicts so `kb for <path>` surfaces it. A mermaid fence anywhere in a record must open with one of the eight keywords; its source is not budgeted as prose. Validation is the keyword check only: no mermaid CLI.

**Consequences.** Feature diagrams reach every pipeline role through `kb pack`; system diagrams reach the planning and review roles. A plan that changes a diagrammed area updates the diagram in the same run, and review treats a stale diagram as doc drift. The docs reader renders mermaid fences later (`TODO.md`, Pre-v1 Cleanup); until then GitHub renders them. Anything outside the eight kinds is a proposal to extend this list, not a fence.
