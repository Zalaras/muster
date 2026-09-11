# Triage hardening

How `/triage` reads attacker-controlled text without giving it anywhere to land.
Implementation: `internal/triage/`, `tools/triage/`, `.claude/agents/triage-proposer.md`.

## Why

`Zalaras/muster` went public on 2026-09-10. Anyone can file an issue, so an issue body is
attacker-controlled text. Before this change `/triage` read one straight into the main
Claude session — which holds Bash and Edit — and wrote model-authored prose into
`TODO.md`.

Three facts set the shape of the fix:

1. **`allowed-tools` grants, it does not restrict.** The skill's frontmatter listed
   `Bash`, and per the Claude Code docs that *pre-approved unrestricted Bash, prompt-free,
   for the invoking turn* — the exact turn that ingested issue text. A subagent's `tools:`
   field is the opposite: a real allowlist. That asymmetry is why the proposer is a
   subagent and not a mode of the main session.
2. **`TODO.md` is the real target.** Every later `/orchestrate`, `/plan-work` and
   `/triage --audit` session reads it with full tools. A payload does not have to fire
   during triage; it can lie dormant and fire in a more capable session weeks later. The
   dormancy is the risk, not the triage moment.
3. **Bash deny rules are not a boundary.** The docs are explicit that a deny rule "covers
   the invocation Claude usually produces and isn't a security boundary around the
   program" — `Bash(curl *)` does not stop `/usr/bin/curl` or `sh -c 'curl …'`. Nothing
   here relies on one.

## Principles

1. Nothing between GitHub and the `TODO.md` diff is a model with tools.
2. Structure is a filter, not trust. **Everything in the body is untrusted, including the
   snapshot JSON.** An author can edit their own issue forever and nothing binds that JSON
   to anything `musterd` produced. Owning the schema buys a strict parser, never trust.
3. Total transforms over parsers. Escaping `&`, `<`, `>` makes a tag impossible by
   construction; a tag denylist never gets there.
4. Flags route automatically. They are not a review queue.
5. **Never auto-close.** An auto-close is an outward write driven by attacker input, it
   contradicts the skill's settled close policy, and on a public repo a false positive
   silently dismisses a real user's report. Suspicious issues are *held*.

## The pipeline

`tools/triage fetch` does 1–6, a subagent does 7, `tools/triage apply` does 8–10.

1. **Fetch** — `gh api repos/{owner}/{repo}/issues?state=open --paginate --slurp`. Field
   allowlist by explicit copy. Two silent bugs avoided: `--paginate` without `--slurp`
   concatenates raw arrays rather than emitting one document, and the REST issues endpoint
   **returns pull requests** (unlike `gh issue list`). The repo slug is read from `go.mod`
   and cross-checked against `gh repo view`, because gh resolves the repo from the working
   directory's origin — inside a fork's worktree the tool would otherwise triage one repo
   and splice URLs for another.
2. **Snapshot** — extract the `<details>` fenced JSON from the **raw** body (its wrapper is
   HTML, so sanitising first would destroy it), decode with `UseNumber()`, validate field
   by field. The rendered `## Snapshot` table is discarded and regenerated from the
   validated JSON: one validated source, not two.
3. **Text transforms** on the whole body — see the ordering invariants below.
4. **Codepoints** — everything outside printable ASCII becomes a visible `<U+XXXX>`
   marker. Escaped, never deleted: deletion hides that anything was there.
5. **Tripwire** — a small high-precision phrase list. A hit **holds**.
6. **Flags → route.**
7. **Proposer** — `triage-proposer`, `tools: Read`, one subagent per issue. The main
   session passes only the artifact *path*, so sanitised attacker text never enters its
   context.
8. **Validate** — enums, ack, verbatim-substring provenance, count reconciliation.
9. **Damian picks the section.** Unchanged; where an item ranks is his judgement.
10. **Apply** — render from a fixed template, splice, stage only `TODO.md`, one commit.

### Transform ordering invariants

`Sanitize` runs six steps in a fixed order. Each swap is a real defect with a test:

| # | Step | What breaks if it moves |
|---|---|---|
| 1 | reject bidi overrides | — |
| 2 | truncate at a rune boundary | later passes become unbounded work |
| 3 | strip image then link syntax | the `!` is stranded; alt text survives |
| 4 | defang autolinks and bare URLs | after step 5 the delimiters are gone and the URL survives |
| 5 | HTML-escape, **`&` first** | escaping `<`/`>` first turns the text `&lt;script&gt;` into a live `<script>` tag |
| 6 | escape non-ASCII to `<U+XXXX>` | run before step 5 and the markers themselves become `&lt;U+…&gt;` |

Step 5 before step 6 also makes the markers **unforgeable**: an author typing the literal
text `<U+200B>` gets `&lt;U+200B&gt;`, so every real `<` in the output opens a marker this
package wrote.

### Flags and routing

| Condition | Route |
|---|---|
| bidi override, or a tripwire phrase | **held** — never sent to a model, reported to Damian |
| no flags **and** `author_association ∈ {OWNER, MEMBER}` | normal — today's richer prose entry |
| anything else | facts-only — enums and one quoted substring, no model-authored prose |

Flags dominate association: the question is what the text does, not who sent it. Nothing
falls back to comparing the login against a name — a login is not the check.

On this repo OWNER/MEMBER means "filed from Damian's own dashboard button", so the normal
path is effectively self-filed-only.

### Why drop-and-count, not reject

The snapshot schema **has already drifted**: issue #9 was filed by musterd 0.2.1 and
carries `claudeCode.{pinned,drift}`, while `internal/server/issue.go` now emits
`{installed,floor,verified,status}`. A validator written against the current struct would
drop three fields on a self-filed issue. So `internal/triage/schema.go` is a *union* of
every shape ever emitted, retired rows marked as such, and an unknown or malformed field is
dropped and counted rather than rejecting the block.

`internal/server/issue_snapshot_drift_test.go` asserts one direction — every path the
server can emit has a row — and `schema_test.go` asserts the retired rows survive a tidy-up.

Second-order effect worth knowing: any `snapshot_unknown_fields ≥ 1` routes facts-only, so
the day `musterd` gains a snapshot field, **every** issue routes facts-only until
`schema.go` is updated. That is the correct fail-safe, and the drift test is what stops it
arriving as a surprise.

## Residual risk

Stated rather than papered over.

- **The proposer's reply enters the main session's context unconditionally.** That is how
  the Agent tool works; a `tools: Read` agent cannot write its answer to a file instead. If
  the proposer is successfully injected, its output is model-authored text in a session
  holding Bash and Edit. What bounds it: the reply is enum-constrained and tiny, a
  non-JSON reply is an immediate hold, and the skill writes the reply to a file for the
  validator rather than acting on it. **Not closed.**
- **Snapshot values are claims.** "Already fixed against the current tree" is an
  attacker-influenceable judgement; the regenerated table says so in its header.
- **The tripwire has poor recall** by construction — paraphrase, translation or encoding
  walks past it. Nothing depends on it. Its accepted false positives (muster is a Claude
  Code tool, so issues legitimately discuss prompt handling) cost a held issue, never a
  close.
- **`make hooks` is opt-in.** The `pre-commit` entry-template check is the only mechanical
  enforcer of "no forged entry reaches `TODO.md`", so `tools/triage apply` refuses to run
  unless `core.hooksPath` is `.githooks`.
- **The pre-commit check is deliberately narrow.** It validates the entry *header* — that
  `#N` equals its own URL's `N`, and that the line carries no angle brackets. It does not
  police continuation lines: 321 lines of `TODO.md` carry em-dashes and entries legitimately
  end in `✅ done <date> (plan …)`, so anything stricter would block ordinary hand edits.
  The narrow half is the half that holds against an adversary.
- **`error_string` is the one attacker-derived field that reaches `TODO.md`.** It is capped
  at 80 bytes, rejected for `<`, `>`, `|`, `](` and backticks, and must be found verbatim
  in the *sanitised* body — so a quote cannot launder pre-sanitising text back in.

## What was considered and rejected

- **Sandbox / Docker.** Containment is for execution; the proposer has none, and
  capability removal beats isolation for a job that only reads. Claude Code's Seatbelt
  sandbox also cannot give a hard network boundary from project settings —
  `sandbox.network.strictAllowlist` is user/managed scope only — and it would add
  permission prompts, which is added involvement.
- **Dropping the snapshot JSON.** It carries the version facts triage needs.
- **Auto-closing on a tripwire hit.** See principle 5.
- **Human review of sanitised issues.** Involvement stays flat: Damian picks a section,
  approves a duplicate-close, and reads the held list.
