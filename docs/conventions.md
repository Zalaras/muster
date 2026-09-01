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
- **Doc comments must not contain `''` or a pair of backticks.** `gofmt` (Go ≥ 1.19)
  reformats *doc* comments — the comment block directly above a declaration — and
  rewrites two adjacent straight apostrophes to `”` (U+201D) and paired backticks to
  `“`. Reproduced on go1.26.6 (2026-08-25): `// escapes each quote as '\''` became
  `'\”`, silently, on `gofmt -w`. It bit three agents in one pipeline run. Describe a
  quoting rule in prose in godoc ("a single quote becomes quote, backslash, quote,
  quote") and keep the literal in code or in a comment *inside* the function body,
  which gofmt leaves alone. Non-ASCII quotes in a `.go` file are a bug, not style.

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

## Commits

Single-sentence semantic messages: `type(scope): imperative summary` — types `feat`,
`fix`, `docs`, `test`, `refactor`, `chore`, `ci`; scope optional. One sentence, no body;
if a commit needs paragraphs of explanation, the explanation belongs in the docs the
commit touches.

**Keep a `feat` or `fix` summary to 72 characters** (before any `(closes #N)` tail).
The cap binds those two types specifically, because such a subject is not only for
`git log` — **it is published verbatim as the release
note.** `.goreleaser.yaml` sets `changelog.use: github` with `exclude` filters for
`docs|chore|test|ci|style|refactor`, so exactly the `feat`/`fix` subjects reach the
GitHub Release, one bullet each. Some of this repo's early subjects run to 200-400
characters and one to 1,900; they are published that way and are the reason this limit
exists. Do not copy them. Other types are not capped — a `docs(pipeline)` subject may
run long to carry a retro finding, since the filters keep it out of the notes — but the
one-sentence, no-body rule still binds every type.

These types are **load-bearing**: `.github/workflows/release.yml` runs `svu` over the
commits since the last tag on every push to `main`, and the type decides the release.

| Type | Release |
|---|---|
| `feat` | minor |
| `fix` | patch |
| `feat(x)!:` — `!` before the colon | major |
| `docs`, `test`, `refactor`, `chore`, `ci` | none — the workflow exits green without releasing |

Two consequences of the one-sentence rule above:

- **`!` is the only way to signal a breaking change.** The conventional-commits
  alternative is a `BREAKING CHANGE:` footer, which requires a body — which this
  convention forbids. Don't reach for one; it would be silently ignored.
- **While Muster is on 0.x, don't use `!` at all.** svu follows semver strictly, so a
  breaking marker on `0.x` jumps straight to `1.0.0` rather than bumping the minor.
  Breaking changes ride along as `feat` until the pre-v1 sections in `TODO.md` close and
  v1 is cut deliberately.

**Closing issues.** Issues on `Zalaras/muster` (filed from the dashboard's masthead `Issue`
button) are triaged by hand into `TODO.md`; the commit that fixes one closes it with a
trailing `closes #N` in the summary line — e.g. `fix(launch): preflight tmux and name the
remedy (closes #2)`; lowercase, and one `closes #N` per issue. The subject carries no
`(plan <name>)` marker — the squash includes `plans/<name>/`, so the plan is recoverable
from the commit's own file list (decision 2026-09-01). That is the only issue automation Muster has: the daemon creates
issues and never reads, labels, or syncs them (`SPEC.md` 2026-08-31 changelog). `/land`
composes that subject from the plan's `closes_issues`, so the reference is not left to whoever
happens to run the merge; `/triage --audit` reports any issue still open whose `TODO.md` item is
ticked, which is how a dropped reference gets caught.

## Comments

Default to none. Add one only when the *why* is non-obvious (hidden constraint, subtle
invariant, workaround for measured Claude Code behavior — cite `spikes/FINDINGS.md`
sections). Don't explain what well-named code already says; don't narrate history.
