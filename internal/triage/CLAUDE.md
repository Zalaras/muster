# internal/triage — issue bodies into validated data

**Owns**: fetching a GitHub issue, sanitizing its body, the bounded proposal schema and label lists, routing (rule families, zero-width text, an optional scorer), rendering a `TODO.md` entry and splicing it in, labelling, plus the snapshot and tracked-link guards. Driven by `tools/triage`. **Features**: triage.

**Invariants** (violations are review-Critical):
- A program owns fetch through commit and labels; the only model in the path is the Read-only proposer, whose reply the schema validates and the tripwire re-checks (kb:adr/triage-bounded-proposer-summary-reaches-the-backlog, kb:adr/triage-sandboxing-rejected-for-read-only-proposer).
- Every input is untrusted, the snapshot JSON included; a malformed snapshot is dropped and counted (kb:adr/triage-snapshot-untrusted-drop-and-count).
- `Sanitize` transform order is fixed: bidi reject, truncate, strip image then link, defang URLs, HTML-escape ampersand first, escape non-ASCII. Each swap is a tested defect.
- Triage state is derived from `TODO.md` links, never stored; triage never closes an issue (kb:adr/triage-state-derived-from-todo, kb:adr/triage-auto-close-never).
- A schema value of the wrong kind is dropped, never coerced.
- A rendered entry carries no author-controlled heading; containing what `Sanitize` lets through is `RenderEntry`'s job. Every title goes through `HeaderSafe` first — `Sanitize` preserves markdown deliberately, and `*` alone makes the pre-commit hook refuse the commit — and the header never wraps (kb:adr/triage-every-entry-carries-the-header-safe-title).
- `PathRestricted` is the zero value of `Path`, so an unset or unknown route renders the unverified form. Set `Route` explicitly in every `Artifact` literal rather than leaning on it.
- Counts never route; signals do. Only an `OWNER`-filed artifact on the normal path may be read in the main session; `Readable` is the one predicate (kb:adr/triage-routing-by-signals-not-counts, kb:adr/triage-owner-issues-normal-unless-held).
- Label names reach `gh` from `labels.go` alone, which a test holds to conventions § Issue labels (kb:adr/triage-labels-from-validated-names).

**Exemplar**: `sanitize.go` — fixed-order transforms, sentinel refusals, constant markers; copy this shape for a new transform.

**Gotchas**:
- `RuleFamilies` is a tripwire, not a filter: a hit holds for a human, a miss proves nothing; the report prints a family name, never a phrase.
- `testdata/adversarial` and `testdata/benign` are quoted issue bodies, excluded from kb citation checks; the former must never route normal, the latter never hold.
- The output cap is not redundant; escaping grows a zero-width body roughly eightfold.
- `testdata/issue-9.md` is a genuine filed issue with an embedded snapshot; the snapshot tests read it.

<!-- kb:trailer -->
<!-- kb:hash 2d8ac542abb84d79 -->
- **triage** — GitHub issues into TODO.md through a program, with a Read-only proposer's bounded summary and labels, and the pre-commit link guard. → `docs/features/triage/INDEX.md`
- 8 records name files in this directory: `go tool kb for <path>` lists them for one file.
<!-- /kb:trailer -->
