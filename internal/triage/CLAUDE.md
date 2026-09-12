# internal/triage — issue bodies into validated data

**Owns**: fetching a GitHub issue, sanitizing its body, the strict proposal schema, routing (tripwire and irregularity checks), rendering a `TODO.md` entry and splicing it in, plus the snapshot and tracked-link guards. Driven by `tools/triage`. **Features**: triage.

**Invariants** (violations are review-Critical):
- Nothing between GitHub and the `TODO.md` diff is a model holding tools; the proposer reads one sanitized artifact and returns JSON the schema validates (kb:adr/triage-program-not-model-between-github-and-todo, kb:adr/triage-sandboxing-rejected-for-read-only-proposer).
- Every input is untrusted, the snapshot JSON included; a malformed snapshot is dropped and counted (kb:adr/triage-snapshot-untrusted-drop-and-count).
- `Sanitize` transform order is fixed: bidi reject, truncate, strip image then link, defang URLs, HTML-escape ampersand first, escape non-ASCII. Each swap is a tested defect.
- Triage state is derived from `TODO.md` links, never stored; triage never closes an issue (kb:adr/triage-state-derived-from-todo, kb:adr/triage-auto-close-never).
- A schema value of the wrong kind is dropped, never coerced.
- A rendered entry carries no author-controlled heading; containing what `Sanitize` lets through is `RenderEntry`'s job.

**Exemplar**: `sanitize.go` — fixed-order transforms, sentinel refusals, constant markers; copy this shape for a new transform.

**Gotchas**:
- `TripwirePhrases` is a tripwire, not a filter: a hit routes to a human, a miss proves nothing.
- The output cap is not redundant; escaping grows a zero-width body roughly eightfold.
- `testdata/issue-9.md` is a genuine filed issue with an embedded snapshot; the snapshot tests read it.

<!-- kb:trailer -->
<!-- kb:hash 8630930233f9644e -->
- **triage** — GitHub issues into TODO.md through a program, and the pre-commit link guard. → `docs/features/triage/INDEX.md`
- 2 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
