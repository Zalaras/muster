---
id: comment-pass
type: spec
status: active
date: 2026-10-06
summary: The orchestrator's comment pass — strip a plan branch's added comments, a Sonnet judge keeps the load-bearing few, a ledger the gates verify.
features: [comment-pass]
tags: [pipeline]
files: [.claude/agents/comment-judge.md, .claude/skills/orchestrate/scripts/gates.sh]
go: [tools/commentpass/**, internal/commentpass/**]
web: []
e2e: []
protocol: []
refs: [kb:adr/process-comment-pass-owns-code-comments, kb:diagram/pipeline-execution-order]
---
The comment pass is how code comments are policed in the build pipeline: on the diff, by a
program and one narrow judge, never by the author or the reviewers
(kb:adr/process-comment-pass-owns-code-comments). It is a development workflow; nothing here
ships in a release.

Once per review cycle, before the gates, the orchestrator runs `go run ./tools/commentpass
strip <plan> --out <dir>` in the plan's worktree. The tool finds every comment block the branch
added since its merge base with `main` — committed, uncommitted or in an untracked file — in
`cmd/`, `internal/` and `web/src/`, test files excluded, plus every pre-existing comment that
names a top-level identifier the diff removed. Go comments come from `go/scanner`; TypeScript
comments from a small scanner that steps over strings, template literals and regex literals.
Directives the toolchain parses (`go:build`, `go:embed`, `go:generate`, `nolint`, `line`,
`biome-ignore`, `@ts-expect-error`) are never candidates and split any block they sit in. A
block the branch edited is a whole candidate, shown with its previous text. A block the ledger
already keeps is skipped unless `--all`.

`strip` snapshots each touched file's bytes, removes every candidate, formats the result and
writes it to the tree, then writes `candidates.json` (the manifest) and `candidates.md`: per
file, the stripped file once, then each candidate with its id, the line it sat above or on,
its origin and its exact text. A file that no longer parses with its comments removed refuses
the whole run before any write.

The orchestrator spawns `comment-judge` — Sonnet, holding Read and Write only, the plan
withheld — with the two paths. It reads nothing but `candidates.md` and writes `verdicts.json`:
every id exactly once, keep or drop, one sentence per keep naming the code line the comment
protects. Keep means all of: deleting it would likely make a reader who never saw the plan
break the code; the constraint cannot be a test, a type or a name; the statement is true of
the stripped file shown.

`apply <plan> <verdicts.json> --cycle N --message <msg>` refuses a verdict set that misses,
repeats or invents an id or keeps without a reason, and a tree that changed since `strip`.
It then reconstructs each file from its snapshot minus only the dropped spans — so a
keep-all verdict restores the original byte for byte and nothing is ever re-inserted by
anchor — appends the cycle to `plans/<plan>/comment-pass.json` with every keep's reason, and
commits the tracked files and the ledger by pathspec.

`verify <plan>` runs in the baseline gates. It recomputes the branch's added comment blocks
and fails on any whose key — path plus a hash of its whitespace-normalised text — is not a
ledger keep, or on any added block when no ledger exists. `drop <plan> <path:line>...` is the
orchestrator's answer to a reviewer's `[note]` naming a false or stale comment: it removes
the block holding each line, refusing a directive or an out-of-scope path, records an
orchestrator cycle and commits.

Review files no finding on a comment at any severity. The `comment-checks.py` regex hook stays
as the per-role early warning and the only check that reaches test files.
