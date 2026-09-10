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
- Any `exec.CommandContext` that reads the child's stdout/stderr through a pipe (`Output()`,
  `CombinedOutput()`, or a `Stdout`/`Stderr` buffer plus `Run()`) must set `cmd.WaitDelay`
  before the call that drains the pipe. Without it, a grandchild still holding the pipe
  open — or a child that ignores its kill signal — makes the read block forever. `WaitDelay`
  bounds that wait: the timer starts when the context is done or when `Wait` sees the child
  exit, whichever comes first, and then force-closes the pipes. The grandchild case does not
  need the context to fire at all. One line, next to the command's own timeout.
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
- Every E2E spec drives a scratch `musterd` it gets from `web/e2e/helpers/fixtures.ts`,
  never a shared or pre-existing server (a stale one silently tests the wrong build). The
  spec declares its shape: `daemon` (fresh per test) whenever any test asserts
  daemon-global state — rail/grid order or counts, prefs, usage, theme, recents,
  auto-focus on "the only session" — or restarts/kills the daemon; `startDaemon(opts)`
  when spawn options depend on a value computed in the test; `fileDaemon()` (one per file)
  only when every test is title-scoped. A plan's **Fixture plan** header records the
  choice per spec. `web/scripts/e2e-lint.sh` (run by `npm run e2e` and the gates) fails
  any spec that calls `startScratchDaemon`, imports `@playwright/test`, or sleeps.
- Waits inherit `playwright.config.ts`'s expect timeout (15 s) and test timeout (60 s);
  `workers` caps the daemons alive at once. A spec may *shorten* a timeout, with a comment
  saying why, never lengthen one; a fixed hold exists only as `settleFor()` for a
  stays-unchanged check. Rationale and measurements: `docs/design/test-strategy.md`.
- Every subprocess call gets an injectable run func on the type that owns it; the implementer
  adds it and tests cross the boundary through it (`internal/locate.SpotlightFinder`, `tmux`'s
  preflighter, `claudecode`'s `execFunc`), never a `$PATH` shim — a fork per test is what made `make test`
  load-sensitive. Real tmux (per-test socket) appears only where the assertion is about a
  tmux-observable effect: PTY stream, geometry, liveness, pane env, server options.
- Don't test what the platform guarantees (SQLite constraint enforcement, tmux's own
  behavior, stdlib routing). Test Muster's behavior.
- The state machine, reconcile, and any JSON merge get exhaustive unit tests — they are
  the logic the whole tool rests on.

## Commits

Single-sentence semantic messages: `type(scope): imperative summary` — the eleven
standard types (the `@commitlint/config-conventional` list, settled 2026-09-01):
`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`,
`test`; scope optional. One extra, `review(<plan-name>)`, is legal **on plan branches
only** — it is the review agent's verdict commit and is squashed away by `/land`; it
never reaches `main`. One sentence, no body; if a commit needs paragraphs of
explanation, the explanation belongs in the docs the commit touches.

These types are **load-bearing**: `.github/workflows/release.yml` decides the release
from the commits since the last tag on every push to `main`.

| Type | Release |
|---|---|
| `feat` | minor |
| `fix`, `perf`, `refactor` | patch |
| everything else | none — the workflow exits green without releasing |

svu itself hardwires only `feat`→minor and `fix`→patch (measured 2026-09-01 against the
pinned v3.4.1; its config has no type→bump mapping), so `release.yml` carries a small
shim: when `svu next --v0` reports no bump but a `perf`/`refactor` commit exists since
the last tag, it forces `svu patch`.

**Keep a `feat`, `fix`, `perf` or `refactor` summary to 72 characters** (before any
`(closes #N)` tail). The cap binds exactly those four because such a subject is not only
for `git log` — **it is published verbatim as the release note.** `.goreleaser.yaml`
filters the changelog to `include: ^(feat|fix|perf|refactor)` — the notes show exactly
the types that cut the release, by construction, so the filter and this table cannot
drift apart. Some of this repo's early subjects run to 200–400 characters and the two
longest past 1,100 (measured 2026-09-01: a 1,155-char `docs` retro, `5d4e1d6`, and the
1,138-char `feat(m3)`, `3f1c7a3`); the feat one is published that way and is the reason
this limit exists. Do not copy them. Other types are not capped — a `docs(pipeline)`
subject may run long to carry a retro finding, since the include filter keeps it out of
the notes — but the one-sentence, no-body rule still binds every type.

**Breaking changes** (all measured 2026-09-01, svu v3.4.1, scratch repo):

- **`!` before the colon is the only sanctioned marker**, and it requires a deliberate
  human decision: the commit-msg hook rejects it unless `MUSTER_BREAKING=1` is set.
  Agents and skills never set that variable.
- **The `BREAKING CHANGE:` footer is banned from commit messages entirely**, and the
  hook rejects the phrase anywhere in a message. An earlier version of this file claimed
  the no-body rule made the footer inert ("silently ignored") — measured wrong, and
  doubly so: svu matches the phrase *anywhere* in the message (mid-sentence, hyphenated
  `BREAKING-CHANGE:` too), and commits carry bodies in practice (trailers on 47 commits,
  full retro paragraphs on `0b6f446`). Without the guards, a docs body merely
  *mentioning* the phrase would have forced a major.
- **On 0.x nothing can cut v1.0.0 by accident**: `release.yml` passes `svu next --v0`,
  which clamps every breaking marker to a minor bump while the current version is 0.x
  (measured: `feat!:` on v0.2.0 → v0.3.0). Cutting v1 is the deliberate act of removing
  `--v0` (TODO.md § Pre-v1 Cleanup). So a `!` on 0.x is honest history — it marks the
  breakage and bumps minor like any `feat`; at v1 it resumes meaning major.

**All of this is machine-enforced** by `.githooks/commit-msg` — armed per clone with
`make hooks` (`git config core.hooksPath .githooks`), binding humans and pipeline agents
on every branch: known type (plus `review` off-`main` only), the 72-char cap on the four
published types (enforced on `main` only — plan-branch subjects are squashed away and
never publish), the phrase ban, and the `MUSTER_BREAKING=1` gate on `!`.

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
