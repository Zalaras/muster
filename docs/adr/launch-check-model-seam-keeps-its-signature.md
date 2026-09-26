---
id: launch-check-model-seam-keeps-its-signature
type: decision
status: accepted
date: 2026-09-26
summary: The launcher's checkModel seam keeps its (ctx, dir, model) signature; only the production closure now reads the catalog cache, and dir is ignored there.
features: [launch]
tags: []
files: [internal/server/launcher.go]
tests: []
refs: [plan:maintainability-regressions, plans/maintainability-regressions/daemon-implementation.md, kb:adr/launch-model-check-cached-per-binary-identity]
supersedes: []
---
**Context.** The plan moved the launch pre-check onto the model catalog cache, which runs every check in a daemon-chosen directory, so the launch directory no longer feeds the verdict. `sessionLauncher.checkModel` is also a test seam: existing launcher tests set it directly with the `func(ctx, dir, model) (claudecode.ModelVerdict, error)` shape, and the implementation agent may not edit tests.

**Options.** (A) Narrow the seam to the cache's own shape and have the test agent repair the literals. (B) Keep the seam's shape and route only the production closure through the cache.

**Decision.** B, recorded as a `deviation:` in the daemon implementation log. The plan says the nil-means-skip seam for test literals stays.

**Consequences.** The seam carries a `dir` argument that production ignores. Narrowing it later is a mechanical change across the launcher tests.
