# Doc delta: search-bar-text-length

Seeded from `plan.md` § Doc Delta. No impl logs exist (the main session wrote the fix), so no
`doc-delta:` lines to fold in. The sentence below was written into the spec during the run
(`69adc095`); verify it against the code rather than add it again.

## reader-find — `docs/features/reader-find/spec.md`

Becomes true:
- The count reads `<i> of <n>`, or `No results` while the query is empty or matches nothing, and
  holds room for `999 of 999`, so the bar keeps one width as the count changes.

Stops being true:
- The count is blank for an empty query and reads `no matches` for a miss.
