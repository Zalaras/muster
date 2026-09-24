---
id: process-adapter-run-seam-constructor-default
type: decision
status: accepted
date: 2026-09-24
summary: An adapter sets its production run func in its own constructor, unexported; function APIs wrap an unexported struct; the root never passes one.
features: []
tags: [pipeline, consensus]
files: [docs/conventions.md, internal/tmux/tmux.go, internal/tmux/preflight.go, internal/locate/spotlight.go]
tests: []
refs: [plan:maintainability-cleanup, plans/maintainability-cleanup/decisions/adapter-run-seam-shape/decision.md, kb:adr/process-composition-roots-registration-only]
supersedes: []
---
**Context.** Each adapter's subprocess test seam had its own shape. `tmux` and `locate` set an unexported production default in the constructor. `claudecode`, `ghissue` and `selfupdate` exported their production function for the composition root to pass back in. Two different exported functions were both named `RunCommand`, with different signatures.

**Options.** (A) Constructor default. The production run func is unexported and set in the constructor, and same-package tests overwrite it. (B) Root injection. The adapter exports its production run func, and `server.New` or `cmd/musterd` passes it in.

**Decision.** A. No test fakes an exported run func from outside its own package, because cross-package fakes already sit at consumer ports. Under B the default can be forgotten and fail silently: a nil `exeRun` turned swap detection off with no error. B also threads a never-varied value through the root, which kb:adr/process-composition-roots-registration-only forbids. A function-shaped API such as `CheckModel`, `ProbeVersion` or the token readers becomes an exported wrapper with no seam, delegating to an unexported struct that holds the fields. That is the `tmux.Preflight` → `preflighter` shape.

**Consequences.** Adapters export no production run function. Each output need (stdout, stderr, or both) has one signature. Tests outside the package fake at the consumer, never at the subprocess. This was settled by a consensus debate the developer requested.
