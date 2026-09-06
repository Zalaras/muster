# Decision: shell pip hue

**Plan**: plain-terminal-session
**Raised by**: review cycle 1, Major 3 (`[orchestrator:user-decision]`)
**Reached by**: user decision (Damian, 2026-09-05)
**Outcome**: Option B — the pip gets its own token

## Question

The `shell` segment's pip used `--teal`, which `docs/design/design-system.md` §3 reserves
for the Working state ("a state colour may **only** mean that state"). REQ-4 of the
approved plan specified a teal pip and the approved mockup carried it, so this was a
design-system vocabulary question for Damian, not a defect for an agent or a `/decide`
debate.

## Options (verbatim from review.md)

- **Option A — keep teal, record the exemption**: add a line to design-system §3 naming
  "a running shell" as a second sanctioned meaning for `--teal`, so the next reviewer does
  not re-raise it. Zero code change.
- **Option B — give the pip its own token**: add a new `--shell-pip` token to every
  `[data-theme]` block in `web/src/style.css` and point `.surfseg .pip` at it, leaving §3's
  four state hues untouched. One new token per theme, one CSS line changed, and
  `make contrast` must be re-run.

## Outcome

**Option B.** §3's rule stands unbroken: the four state hues keep their single meanings and
the shell pip carries a `--shell-pip` token in every theme block. Implemented by web-impl in
review cycle 1's fix wave; REQ-4 in `plan.md` amended to match.
