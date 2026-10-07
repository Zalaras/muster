---
id: stack-config-yaml-goccy-strict
type: decision
status: accepted
date: 2026-10-07
summary: kb.yaml is parsed by github.com/goccy/go-yaml in strict mode; record frontmatter keeps the hand-rolled flat scanner; the frozen go.yaml.in fork was rejected.
features: [knowledge]
tags: [deps, user-decision]
files: [go.mod, kb.yaml]
tests: []
refs: [plan:kb-config, kb:adr/knowledge-repo-values-live-in-kb-yaml, docs/conventions.md, https://github.com/goccy/go-yaml, https://github.com/yaml/go-yaml]
supersedes: []
---
**Context.** The repo settings moving out of `internal/kb`
(kb:adr/knowledge-repo-values-live-in-kb-yaml) include maps — a directory per record type,
design documents per role, conventions sections per role, a whitelist of token to reason — and
the hand-rolled frontmatter scanner is deliberately flat: scalars and lists only, no nesting,
because a record's schema is fixed and strictness is the point. A config file needs a real
YAML decoder that still refuses unknown keys.

**Options.** (A) `gopkg.in/yaml.v3`: archived in April 2026 and unmaintained. (B)
`go.yaml.in/yaml/v3`: the YAML organisation's continuation of the same code, a drop-in
import-path swap, already an indirect dependency here, but frozen to security fixes with its
successor still a release candidate. (C) `github.com/goccy/go-yaml`: independent, written from
scratch, actively maintained, MIT, with `Strict()` enabling unknown-field rejection as a
first-class decode option. (D) Extend the flat scanner with dotted keys and encode sections as
path suffixes.

**Decision.** C, chosen by the developer. New code with no legacy to match should not pin a
frozen library, and the strict option is exactly the contract `kb.yaml` needs. The frontmatter
scanner stays as it is: records keep their fixed flat schema.

**Consequences.** One new direct dependency, `github.com/goccy/go-yaml`; `go.yaml.in/yaml/v3`
stays indirect through another module. `LoadConfig` decodes with `yaml.Strict()` into a typed
struct and applies defaults to nil fields afterwards, never by pre-filling, so an explicit empty
list stays empty. The Stack table in `docs/conventions.md` says which parser serves which
file.
