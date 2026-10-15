# Plan: triage-rework

**Status**: Approved
**Work Type**: tooling (no release; a plan and a commit, not an `/orchestrate` run)
**Features**: triage

## Problem

`/triage` renders `**title** (#N) — dashboard: wrong-output.`; every such entry in the backlog
history was rewritten by hand, because the body's symptom, expected behaviour, quoted log line,
screenshot and snapshot facts never reach the entry. Any sanitiser count — a pasted `<img>`, a
URL, one `<` in a log line — pushes even the developer's own issue off the readable path (#92,
2026-10-15). 91 of 92 issues are the developer's. The tripwire is twelve English phrases, the
skill claims a "count reconciliation" check that does not exist, the section question blocks
every run, and labels (`docs/conventions.md` § Issue labels) have no path from triage.

## Decisions (settled with the developer 2026-10-15)

- Routing keys on **danger signals** (bidi, a rule-family hit, hidden zero-width text, an
  optional classifier score), never on sanitiser counts. Three routes: `held`, `normal`,
  `restricted` (the zero value; `PathFactsOnly` renamed).
- An outside report that is not held gets a **bounded summary from the Read-only proposer**
  (`symptom`, `expected`, each ≤ 240 printable-ASCII characters, no URL, no markup, no
  `issues/`, tripwire-checked), rendered with the prefix `Summary of an unverified report:`.
- **One entry template** for every route: HeaderSafe title, summary, quoted error, a fact line
  from the validated snapshot (date, musterd and Claude Code versions, view, state, image count)
  and the labels. The old facts-only template is deleted.
- New entries **default to `## Issues`**; `--section` overrides; the run never stops to ask. A
  backlog note records that the TODO structure and way of working need a cleanup pass.
- The **program applies labels** (`gh issue edit --add-label`, names validated against a Go list
  that a test checks against conventions § Issue labels). The **triage comment stays a manual
  `gh` call** in the skill, with its prompt.
- Twelve phrases become **eight rule families**; a `--scorer CMD` / `MUSTER_TRIAGE_SCORER`
  hook accepts a JSON-lines classifier (`{"id","text"}` → `{"id","p"}`; 0.5 restricts, 0.8
  holds). No model ships.
- A read-only `scan [--state all]` subcommand prints route and flags per issue for calibration.
- The **owner rule** — OWNER issues take the normal path unless a danger signal fires — is the
  **last code commit**, so the restricted path is exercised on all 92 real bodies first.
- Sessions may edit `TODO.md`; triage's job is only to pull issues in.

## Changes

1. `chore(triage)`: `route.go` (signals, `danger()`, `PathRestricted`, `Flags.Score`), new
   `rules.go` and `scorer.go`, `artifact.go` (`Counts.Images`, `SnapshotFields`, `ApplyScore`),
   `tools/triage/main.go` (`fetch --scorer`); tests incl. `testdata/adversarial/` and
   `testdata/benign/` corpora.
2. `chore(triage)`: `proposal.go` schema + `checkFreeText`, new `labels.go`, single
   `RenderEntry` + `factLine`, `Apply` returns filed numbers, new `Label()`, `apply --section
   --no-labels --dry-run`, `fetch --issue N`, `table` columns; tests incl. the real-hook test on
   the multi-line entry and the label-list ↔ conventions test.
3. `chore(triage)`: `scan` subcommand; `TestScanWritesNothing`.
4. Docs, four commits (`docs(triage):` is hook-reserved for TODO.md-only commits):
   `docs(skills)` — SKILL.md and `triage-proposer.md`; `docs(adr)` — six proposed ADRs
   (routing by signals; bounded proposer summary, supersedes
   `triage-program-not-model-between-github-and-todo`; every entry carries the HeaderSafe title,
   supersedes `triage-normal-path-carries-the-sanitised-title`; labels from validated names;
   section defaults to Issues; owner issues normal unless held, supersedes
   `triage-owner-filed-artifacts-readable-in-session`) with `docs/features/triage/spec.md`,
   `internal/triage/CLAUDE.md`, `tools/CLAUDE.md` and `make gen-kb`; `docs(conventions)` —
   § Commits "Closing issues", § Issue labels, root `CLAUDE.md` step 6; `docs(backlog)` —
   `TODO.md` preamble, #43 entry, the TODO-cleanup note.
5. `chore(triage)`: the owner rule in `Route`; flip the placeholder tests.
6. `docs(adr)`: flip the six ADRs to `accepted` and the three targets to `superseded` before
   `/land` (`closes #43`).

## Verification

- `make check` after every commit.
- After 3, owner rule off: `go run ./tools/triage scan --state all` → every non-held row
  `restricted`; held ≤ 2; no `scorer_failed`.
- After 5: `scan --state all` again → owner rows `normal` except `zero_width ≥ 1`; the one
  outside report `restricted`; the held set unchanged. An owner row restricted only for
  `html_escaped`/`links_stripped`/`non_ascii` is a bug.
- Dry run on #92: `fetch --issue 92`, one proposer, `apply --dry-run`; compare with the
  hand-written entry (`git show d6bbbbb2 -- TODO.md`); `git status` clean, labels on #92
  unchanged.

## Out of scope

A classifier model (hook only); reopening recurring closed issues (#54); moving the comment
into the program; the TODO structure cleanup itself.
