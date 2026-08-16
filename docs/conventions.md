# Code conventions

Patterns the build agents (and any session writing code) follow. Chosen 2026-08-16 with
Damian, deliberately *before* the first line of daemon code, so the multi-agent pipeline
never invents patterns mid-run. Library decisions are recorded in SPEC §5; this file is
the how-we-write-code companion. If a convention here needs to change, change it here
first — never diverge silently in code.

## Stack (settled — do not substitute)

| Concern | Choice |
|---|---|
| HTTP server | stdlib `net/http`, Go 1.22+ method/path routing (`mux.HandleFunc("POST /hook/{event}", …)`) |
| WebSocket | `coder/websocket` |
| Logging | `zerolog`, one root logger constructed in `main`, passed down (no package-level globals) |
| SQLite | `modernc.org/sqlite` driver, WAL mode, `database/sql` + hand-written SQL |
| Migrations | numbered `.sql` files, `//go:embed`-ed, applied at startup, forward-only |
| Assertions | `testify` (`require` for setup, `assert` for verdicts) |
| PTY / files | `creack/pty`, `fsnotify` |
| Git/GitHub | `os/exec` + `git` / `gh` CLIs — never go-git |
| Frontend | Vite + TypeScript, **no framework**; xterm.js 6.0.0 / addon-fit 0.11.0 (pinned) |
| Web unit tests | Vitest (logic only); Playwright for E2E |

## Go

- Accept interfaces, return structs. Interfaces live where they are *consumed*.
- Errors: wrap with `fmt.Errorf("…: %w", err)`; no silent failures; sentinel errors only
  where a caller genuinely branches on them.
- `context.Context` is the first parameter of anything that blocks, does I/O, or should
  die on shutdown. The daemon must shut down gracefully — nothing ignores ctx.
- No `init()` magic, no package-level mutable state. Wiring happens in `main`.
- Middleware (auth token check) is a plain `func(http.Handler) http.Handler`.
- Tests: table-driven, `t.Run` subtests. Never rely on test execution order and never
  mutate state shared with other tests in the package.
- Business logic never lives in HTTP handlers; handlers decode, delegate, encode.
- Everything Claude-Code-format-specific stays in `internal/claudecode/` (CLAUDE.md hard
  rule — the review agent treats a leak as a critical issue).

## TypeScript / web

- Strict TS, no `any`. Plain ES modules organized per feature; no framework, no
  state-management library.
- One WebSocket client module owns the daemon connection (reconnect with backoff);
  everything else subscribes to it. Never a second ad-hoc socket.
- DOM: build via small render functions / `<template>` elements; no innerHTML with
  interpolated data.
- Handle the three states every view has: no data yet (**render "unknown", never an
  empty gauge** — SPEC §2.3), data, and daemon-down.
- Unit-test logic (protocol decoding, state derivation, formatting) with Vitest;
  interaction and rendering are Playwright's job.

## Testing (both sides)

- E2E fakes Claude Code by default: synthesize hook / status-line POSTs from the real
  captured payloads in `spikes/` — fast, free, deterministic. A **real** `claude` may
  only appear in the canary suite and interface probes (haiku-only, per CLAUDE.md).
- The E2E harness allocates a fresh port per run and never attaches to an existing
  server (`reuseExistingServer: false` — the port is pinned via env because Playwright
  re-evaluates its config per worker). Reusing a stale server silently tests the wrong
  build; keep both properties when the harness evolves (M0 scratch daemon and beyond).
- Don't test what the platform guarantees (SQLite constraint enforcement, tmux's own
  behavior, stdlib routing). Test Muster's behavior.
- The state machine, reconcile, and any JSON merge get exhaustive unit tests — they are
  the logic the whole tool rests on.

## Comments

Default to none. Add one only when the *why* is non-obvious (hidden constraint, subtle
invariant, workaround for measured Claude Code behavior — cite `spikes/FINDINGS.md`
sections). Don't explain what well-named code already says; don't narrate history.
