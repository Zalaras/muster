// Package triage reduces public GitHub issue bodies to validated, enumerated data
// before any model holding tools can act on them.
//
// Zalaras/muster went public on 2026-09-10, so an issue body is attacker-controlled
// text. /triage used to read one straight into the main Claude session, which holds
// Bash and Edit, and wrote model-authored prose into TODO.md — a file every later
// /orchestrate, /plan-work and /triage --audit session reads with full tools. A payload
// did not have to fire during triage; it could lie dormant and fire in a more capable
// session later. That dormancy is the risk this package exists to remove.
//
// The design rule is that nothing between GitHub and the TODO.md diff is a model with
// tools. Everything reaching this package is untrusted, including the snapshot JSON:
// an author may edit their own issue body forever, and nothing binds that JSON to
// anything musterd produced. The schema buys a strict parser, never trust.
//
// # Transform order is load-bearing
//
// [Sanitize] applies six transforms in a fixed order. Each swap below is a real defect,
// and each has a test:
//
//  1. reject bidi overrides
//  2. truncate the input at a rune boundary
//  3. strip image then link syntax down to its text
//  4. defang autolinks and bare URLs
//  5. HTML-escape, ampersand FIRST, then the angle brackets
//  6. escape every remaining non-ASCII or control rune to a visible marker
//
// Running 5 before 4 hides an autolink's delimiters from the defanger, so the URL
// survives. Running 6 before 5 rewrites this package's own markers into entity text.
// Escaping the angle brackets before the ampersand is the worst of the three: the body
// text "&lt;script&gt;" becomes a live "<script>" tag, because the entities the author
// typed are decoded rather than escaped.
//
// # What survives, and why that is not enough
//
// Escaping the three HTML characters makes a tag impossible by construction, which a
// tag denylist never achieves. Markdown headings, lists, emphasis, code fences and
// tables survive untouched, because none of them use those characters — which is the
// point, and also a hazard: a body may still contain a line reading "## Reported issues
// (pre-v1 release)". Spliced into TODO.md that would forge a section heading. Containing
// it is [RenderEntry]'s job, not this file's.
//
// See docs/design/triage-hardening.md for the threat model and the residual risks.
package triage
