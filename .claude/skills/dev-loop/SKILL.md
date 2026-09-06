---
name: dev-loop
description: "Builds and runs musterd locally against the real data dir for manual testing. Covers where the dashboard URL and tokens live and how to stop cleanly."
allowed-tools: Bash, Read
---

> **Maintainer note:** Authored at m0-skeleton completion per the plan's Implementation
> Notes (next-steps item 3's deferred dev-loop skill). Runs in the main session — it
> starts a long-lived process the user interacts with.

Run the Muster daemon locally for manual testing.

## Build and run

```bash
make run
```

This builds `bin/musterd` and the dashboard assets (`internal/webui/assets/`), then runs
the daemon against the **real** data dir (`~/Library/Application Support/Muster`) serving
those assets from disk (`-web-dist internal/webui/assets` — the dev override, so the
edit-TS → `make web-build` → reload loop needs no Go relink), listening on
`127.0.0.1:8765`. The startup log line includes `dashboard_url` — that URL (with the UI
token baked in) is what to open in the browser.

Because `make run` occupies the terminal, launch it in the background
(`run_in_background`) or tell Damian to run `! make run` himself if he wants to watch
the logs.

`make run` now also opens the dashboard in the default browser once it's up (plan
tmux-installation REQ-6, default `-open=true`) — a real terminal stdin is required for
this to fire, so it does nothing when launched via `run_in_background` (no terminal
stdin there). Pass `-open=false` to suppress it either way; the dashboard URL is on the
startup log line regardless.

## Where things live

- **`~/Library/Application Support/Muster/tokens.json`** (0600, rewritten every
  startup): `{"dashboardUrl", "uiToken", "ingestToken"}`. Read this if you need the
  dashboard URL or an ingest URL after startup.
- **`~/Library/Application Support/Muster/muster.db`** — SQLite (WAL). Query read-only
  with `sqlite3` if you need to inspect ingested events; never write to it while the
  daemon runs.
- Tokens persist in the `kv` table, so URLs and cookies survive restarts.

## Custom instances

Flags: `-addr` (default `127.0.0.1:8765`), `-data-dir`, `-web-dist` (default `""` —
empty serves the dashboard embedded in the binary at build time; non-empty serves that
directory from disk, as `make run` does with `internal/webui/assets`), `-debug`. For a throwaway instance that must not touch the real data dir,
pass a scratch `-data-dir` (that is exactly what the E2E harness does — prefer
`make e2e` if the goal is verification rather than manual poking).

## Stopping

**Sessions survive daemon shutdown by policy** (`-on-exit`, default `ask` on a TTY — SPEC
changelog 2026-08-27): the `muster` socket and every `claude` it launched outlive musterd
unless you choose otherwise at the prompt, and reconcile re-adopts them on the next start. A
`claude` left running with nothing tracking it burns subscription, so after the daemon exits
verify:

```bash
tmux -L muster ls   # must print "no server running" — anything listed is an orphan
```

If something is listed, `tmux -L muster kill-session -t <name>` (or `kill-server` if it's
all orphans). Reconcile marks the row dead on the next start.

Send SIGINT/SIGTERM (Ctrl-C in the foreground, `kill <pid>` otherwise) — shutdown is
graceful: contexts cancelled, ingest queue drained, DB closed. Don't `kill -9` unless
it's wedged; find a stray instance with `lsof -i @127.0.0.1:8765`.
