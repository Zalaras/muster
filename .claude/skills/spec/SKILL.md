---
name: spec
description: "Interactive spec interviewer that guides you through defining requirements before planning. Produces a spec.md that feeds into /plan-work."
argument-hint: "<plan-name> \"<description>\""
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

> Maintainer note: a skill, not an agent — a multi-turn interview needs the main session (a subagent returns one message).

Interview the developer until the feature or task has a clear, complete specification, **before any
code is planned or written**, and write it to `plans/<plan-name>/spec.md`. You are done when the
developer has answered the approval question and the file is written with the `Status` their answer
set.

## Arguments

This command was invoked with: **$ARGUMENTS**

Expected format: `<plan-name> "<description>"`

- `plan-name`: kebab-case identifier (e.g., `session-list-ui`)
- `description`: a quoted string describing the work

If no arguments are provided, ask the developer for a plan name and description. Create
`plans/<plan-name>/` if it doesn't exist.

## How to interview

- Ask **one question at a time**. A draft you offer for confirmation ("here are the three
  requirements I heard — right?") counts as one question.
- Probe a vague answer before moving on; when the developer is unsure, suggest possibilities but
  leave the decision to them.
- Read the code to ask better questions (Grep, Glob), never to propose code: the spec names
  behaviour, and `/plan-work` decides what code delivers it.
- Where the work touches Claude Code's wire formats, the fact records are the measured truth —
  surface them rather than asking the developer to remember.
- Work through the sections below in order, and move on only when the current one is answered.

## Interview Flow

### 0. Which features does this touch?

Settle this first — it decides what you read before asking anything else. Match the area under
discussion against the `go:` / `web:` / `e2e:` globs in each `docs/features/*/spec.md` frontmatter,
**propose the list yourself**, and ask the developer to confirm or correct it. Never make them
enumerate the feature folders to answer a question the frontmatter already answers.

If nothing matches, this is a **new feature**. Say so: it will need its own `docs/features/<name>/`
folder, and `plan-lint` requires that spec to exist before `/orchestrate` runs.

A feature whose files the change will edit without changing what the feature does (a call site, a
fixture, a shared helper) is **Touches**, not Features: name it on its own header line so the plan
packs its spec and contract only (kb:adr/process-touched-features-widen-without-stopping).

**Then read what is already decided.** Run `go tool kb find <words>` for the feature's
vocabulary, then `kb ls --feature <f>`, and read `docs/features/<f>/spec.md` for each feature you
settled. (`kb pack` is not available here — it requires a `plans/<name>/plan.md` that does not exist
yet.) A spec states how its area behaves **today**, so your questions become "`reader` is read-only
today — does this change that?" rather than open-ended ones the developer has to answer from memory.
Accepted ADRs are settled — don't re-ask, don't re-litigate, and don't let the interview reintroduce
a `rejected` one (the cut features live there). `SPEC.md` pins product behaviour; the interview fills
only what it leaves open.

### 1. Goal
> What are we building and why?

- What problem does this solve?
- Why does it need to be done now (which `TODO.md` entry or issue does it close)?

### 2. Background & Context
> What does the implementer need to know going in?

- Which ADRs, facts and SPEC.md sections bear on this?
- Which kb diagrams cover the area (`kb ls --type diagram`, the feature spec's inline fences)? Read and cite them. Propose a new one only for a state machine or sequence prose cannot carry — the developer decides.
- Which other features' behaviour does this touch or depend on? Name the behaviour, not the code —
  "the rail decides session order", not "`rail.go` sorts by `mru`". What the implementer needs
  from the codebase is `/plan-work`'s to work out.

### 3. Scope
> What is and isn't being addressed here?

- What is explicitly included in this task?
- What is explicitly out of scope — things that might seem related but should not be touched?

### 4. Requirements
> What must become true for the developer using Muster?

**Every requirement states an observable consequence, never a mechanism.** "A session that missed its
hook shows the right state within a couple of seconds, without the developer touching anything" — not
"the reconciler re-reads the pane every 2s". This holds for daemon work too: half of Muster is
invisible, so its requirements are phrased as what becomes true for the person. If you find yourself
naming a command, a table, a file or an ordering, you have started planning — ask what the developer
would *observe* instead.

- What must the developer be able to do, and what must they see to know it worked?
- What must be true when things go wrong? (latency, resilience to hook loss, etc.)

Keep asking "anything else?" until the developer feels the list is complete.

### 5. Edge Cases & Considerations
> What could go wrong or behave unexpectedly?

- What happens with unexpected, missing, or out-of-order inputs? (Hooks are best-effort, at-most-once, unordered — most Muster features have a loss story.)
- Are there any failure states that need to be handled gracefully (daemon down, session killed, no data yet)?

### 6. Acceptance Criteria
> How will we know this is done?

- What does "done" look like from the developer's perspective and from a technical perspective?
- Are there specific scenarios that must be verified?

Frame each criterion as a testable statement. Suggest drafts from what the developer has shared and ask them to confirm or refine.

### 7. Feature Spec Delta

> Which sentences in the durable records change?

`docs/features/<name>/spec.md` is present-tense product truth that every agent reads as fact. This
section stages what this work does to it, per feature §0 named:

- **Becomes true** — the sentences that will describe the feature afterwards.
- **Stops being true** — the sentences that must come out.

Draft both halves from what the developer has told you and ask them to confirm. The deletions half is
required: a spec body is capped at 800 words and `check-kb` hard-fails past it, so additions
without removals eventually break the build — and a spec that only grows stops being a description
and becomes a changelog, which is what makes it useless.

Write each line as an **assertion about the target file**, not an instruction ("the reader serves
`.md` files under the session directory", not "make the reader serve `.md` files"). It is promoted
after review by `/doc-reconcile`, which verifies it against the code; an assertion can be re-checked,
an instruction can only be re-run.

A delta only — never a rewritten feature spec. If this work creates a new feature, say so and leave
the body to `/plan-work`, which must author the spec before `/orchestrate` will run.

### 8. References _(optional)_
> Are there any supporting materials?

ADR and fact ids, SPEC.md sections, mockups (`docs/design/mockups/`), related TODO.md items. If none, skip this section.

## Output

Summarize the full spec and ask the developer to **approve** it, in those words — this is the gate,
not a formality, and their answer sets the `Status` line. Write `Approved` when they confirm, `Draft`
when they want to keep thinking. `/plan-work` refuses a `Draft` spec.

Then write `plans/<plan-name>/spec.md` using this format (use absolute dates, never "today"):

```markdown
# Spec: <Title>

**Plan**: <plan-name>
**Created**: <date>
**Features**: <name>[, <name>] — or "new: <name>"
**Touches**: <name>[, <name>] — files edited, behaviour unchanged (omit the line when none)
**Status**: Approved | Draft

## Goal
<content>

## Background & Context
<content, citing records as kb:<type>/<slug> and SPEC.md sections by name>

## Scope
**In Scope:**
<content>

**Out of Scope:**
<content>

## Requirements
<content>

## Edge Cases & Considerations
<content>

## Acceptance Criteria
- [ ] <criterion>
- [ ] <criterion>

## Feature Spec Delta
**<feature>** — becomes true:
- <assertion about docs/features/<feature>/spec.md>

**<feature>** — stops being true:
- <the sentence that must come out, or "nothing">

## References
<content or "None">
```

After writing the file, give the developer its path and suggest `/plan-work <plan-name>` next; plan-work picks up the spec as its starting point.
