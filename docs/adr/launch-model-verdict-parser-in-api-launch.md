---
id: launch-model-verdict-parser-in-api-launch
type: decision
status: accepted
date: 2026-09-26
summary: The GET /api/models verdict type and parser live in web/src/api/launch.ts beside the other launch-endpoint parsers, not in a protocol/ module.
features: [launch]
tags: []
files: [web/src/api/launch.ts]
tests: []
refs: [plan:maintainability-regressions, plans/maintainability-regressions/web-implementation.md, plans/maintainability-regressions/review.maintainability.cycle1.md]
supersedes: []
---
**Context.** The plan's Affected Files put the `GET /api/models` response decoder in a new models module under `web/src/protocol/`. The maintainability review (cycle 1, Minor 5) measured the siblings. The `protocol/` modules are wire concepts the WebSocket stream carries, and every HTTP-only response keeps its type and parser in its `api/<family>.ts` (`parseRepo`, `parseBrowseResult`, `parseIssueCapture`, `parseReaderListing`, `parseRestartImpact`, `parseLocatedFile`). `GET /api/models` is HTTP-only, and its one runtime importer is `api/launch.ts`.

**Options.** (A) Keep a models module in `protocol/` and say why this wire differs. (B) Put the type and parser in `api/launch.ts`, unexported like its siblings, and test them through `checkModels` as the siblings are tested.

**Decision.** B, recorded as a `deviation:` in the web implementation log.

**Consequences.** `protocol/` keeps eight modules, all WebSocket concepts. The decoder's malformed-body cases are asserted through `checkModels` with a faked response in `api/launch.test.ts`, not by importing the parser directly.
