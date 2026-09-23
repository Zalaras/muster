# Doc delta: frontmatter

Seeded from `plan.md` § Doc Delta. The implementation logs (fix attempts included) carry no
`doc-delta:` lines. The one mid-run plan amendment (key column: fixed layout, 40% width, keys wrap —
kb:adr/reader-frontmatter-key-column-may-break) changes no sentence below.

## reader (`docs/features/reader/spec.md`)

Becomes true:
- § Locating the plan: "The result is the Session object's `plan` (`kb:anchor/ws.session`): the path and whether the file exists — null until a transcript names one, and never null again once it has; a scan that finds nothing keeps the last plan."
- § The reader: "A leading YAML frontmatter block renders as a key/value table above the body (raw when not flat) and never reaches the outline."

Stops being true:
- § Locating the plan: "…the path and whether the file exists, null when the latest transcript names none." (replaced by the sentence above).

Body length: 687 words before, about 724 after; under the 800 cap with no other cut. The mermaid sentence in § The reader stays as it is.

## `docs/protocol.md`

The Session object's `plan` comment, per the plan's § Protocol Contract — already merged at plan approval (commit `docs(frontmatter): approved plan and planning-session edits`); verify it, do not re-apply.

## lifecycle (`docs/features/lifecycle/spec.md`)

Added to the plan's **Features** after review cycle 3 (the developer's call): the plan-retention rule
now lives in `Manager.ApplyPlanScan` (`internal/session/manager.go`), and four lifecycle-owned doc
comments were restated. Review cycle 4 (lifecycle in the pack) found no lifecycle spec sentence made
false and no new one required — "No sentence in the lifecycle spec is now false, and lifecycle's
generated contract slice already carries the new `plan` comment" (review.code.md cycle 4). Verify
that claim; add a sentence only if the spec's own coverage demands one.
