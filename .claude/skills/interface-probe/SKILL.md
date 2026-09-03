---
name: interface-probe
description: "Runs a controlled probe against the real pinned Claude Code binary to answer a wire-format question (hook payloads, status-line JSON, CLI behaviour), using the isolated rig in test/rig/. Findings land in spikes/."
argument-hint: "<question to settle>"
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

> **Maintainer note:** This skill runs in the main session — it drives tmux
> interactively and holds a conversation about ambiguous captures, which a subagent
> can't. It is the live version of the historical spike recipe (`spikes/RIG.md`);
> the rig itself lives in `test/rig/` and is shared with the M4 canary/E2E harness.
> The automated counterpart is `make canary` (`test/canary/harness_test.go`), which
> drives the same production chain but cannot answer *new* questions — that is this
> skill's job. Everything here was verified against Claude Code **2.1.233** — on a version bump,
> re-verify via `docs/claude-code-pin.md` before trusting the gotchas.

You are running an interface probe: a controlled experiment against the **real**
Claude Code binary to settle a question the docs can't be trusted to answer
(they have been wrong before — e.g. `SessionStart` over HTTP). The question to
settle: **$ARGUMENTS**

## Iron rules (violating any of these is a critical failure)

1. **Never read or modify `~/.claude/settings.json` or `settings.local.json`.**
   Damian has live sessions on them. Isolation comes from the project-scoped
   `.claude/settings.json` the rig writes into each instance's scratch repo —
   nothing else. Record a baseline before the run and verify it after:
   `md5 -q ~/.claude/settings.json` (compare the two hashes; don't assume a value).
2. **Never set `CLAUDE_CONFIG_DIR` for a session that must reach the API.** It
   yields a config dir with no credentials and dies with `Not logged in`. Do not
   attempt to log in. (Its one legitimate use: zero-token `StopFailure` induction,
   below.)
3. **Real sessions burn Damian's subscription.** Always `--model
   claude-haiku-4-5-20251001`, trivial prompts ("say hi"), and tear down when done —
   an orphan keeps burning. Prefer the zero-token inductions wherever they answer
   the question.
4. **tmux only via the instance's private socket** (`tmux -S "$PROBE_SOCKET"` — env.sh exports a socket *path*, so `-S`, never `-L`),
   never the user's default server.
5. Ports are `878<index>` (8780–8789). **5000/7000 are AirPlay — never use them.**

## 1. Stamp an instance

Pick a single-digit index whose port is free (`lsof -nP -iTCP:878<i> -sTCP:LISTEN`).

```bash
cd <repo-root>
./test/rig/newprobe.sh 3               # <- your index
. /tmp/muster-probe/instances/3/env.sh # exports PROBE_PORT, PROBE_REPO, PROBE_SOCKET, PROBE_CAPTURE ...
echo "${CLAUDE_CONFIG_DIR:-<unset>}"   # must print <unset>
```

Instances deliberately live in `/tmp/muster-probe` (override: `MUSTER_PROBE_HOME`),
**outside the repo tree**: Claude Code loads CLAUDE.md from every parent directory,
so a scratch repo inside muster/ or ~/Documents contaminates the probe session with
Muster's and Damian's instructions. Captures still land in `test/rig/captures/`.

Idempotent — re-running rewrites settings/scripts, leaves the repo and captures
alone. The generated settings register **every** hook event at the capture server
(http, 2 s timeouts), plus a `type:"command"` wrapper for `SessionStart` (which
silently never fires over http), plus the status line.

## 2. Start the capture server

```bash
go build -o bin/probe-capture ./test/rig/capture
nohup bin/probe-capture -port $PROBE_PORT -instance $PROBE_IDX \
  -dir test/rig/captures > test/rig/captures/capture-$PROBE_IDX.log 2>&1 &
curl -s http://127.0.0.1:$PROBE_PORT/health   # -> ok
```

- `POST /hook/{event}` → appends to JSONL, replies 200 empty (or a canned body via
  `-decision '{"decision":"allow"}'` / `MUSTER_PROBE_DECISION` — for
  PermissionRequest work).
- `POST /statusline` → appends, replies `MUSTER-PROBE` — seeing that string render
  in the TUI is your proof the status line works. `MUSTER-PROBE(post-failed)`
  rendered means your capture server is down.
- Credential-shaped headers are stored `<redacted>`; payloads are never printed to
  stdout (they contain prompt text — never copy them anywhere world-readable).

## 3. Drive a session

**Headless** (preferred when the question doesn't need the TUI — hooks fire in
`-p` mode too):

```bash
cd $PROBE_REPO && /Users/damian/.local/bin/claude -p "say hi" \
  --model claude-haiku-4-5-20251001 </dev/null
```

**Interactive** (TUI/status-line/mode questions):

```bash
export PATH=/usr/local/bin:$PATH        # tmux 3.7b
tmux -S "$PROBE_SOCKET" new-session -d -s s1 -x 200 -y 50 -c "$PROBE_REPO"
tmux -S "$PROBE_SOCKET" set-option -g escape-time 0
tmux -S "$PROBE_SOCKET" set-option -g status off
tmux -S "$PROBE_SOCKET" set-option -g focus-events on
tmux -S "$PROBE_SOCKET" send-keys -t s1 \
  'export LANG=en_US.UTF-8 TERM=xterm-256color; cd '"$PROBE_REPO"'; unset CLAUDE_CONFIG_DIR; /Users/damian/.local/bin/claude --model claude-haiku-4-5-20251001' Enter
```

- `-x 200 -y 50` is load-bearing (default 80x24 wraps the TUI into garbage);
  `LANG`/`TERM` prevent mojibake.
- **First launch in a fresh repo blocks on the workspace-trust prompt** — no hooks,
  no status line until answered. Poll `tmux -S "$PROBE_SOCKET" capture-pane -p -t s1`
  for "Quick safety check", then answer it. On 2.1.233 option 1 ("trust") was preselected
  and a bare `Enter` sufficed; **on 2.1.259 "No, exit" is preselected** — send `Down`,
  then `Enter`. Read the pane's `❯` marker rather than assuming either.
  Headless runs do **not** record trust; interactive hits it anyway.
- Startup takes 10–20 s; a blank pane is normal, poll — don't conclude failure.
- Type and submit **separately**: `send-keys -t s1 'say hi'`, wait ~1 s, then
  `send-keys -t s1 Enter`. One combined call gets the newline swallowed.
- Foreground `sleep` is blocked in this harness — put waits inside a backgrounded
  bash command. `timeout`/`gtimeout` are not installed.

## 4. Induction recipes (deterministic, zero real tokens)

**`StopFailure` / `authentication_failed`** — fails before any API call, ~1 s,
also emits `UserPromptSubmit` + `SessionEnd`, so it exercises a whole failure
sequence for free:

```bash
cd $PROBE_REPO
CLAUDE_CONFIG_DIR=/tmp/muster-probe/instances/$PROBE_IDX/claude-config \
  /Users/damian/.local/bin/claude -p "hi" --model claude-haiku-4-5-20251001 </dev/null
```

(Only this flavour fails before the API; other `error` values need the proxy.)

**`StopFailure` / API-error flavours** — `ANTHROPIC_BASE_URL` *is* honoured under
subscription OAuth. Plain mode fails every request (zero tokens); `-upstream`
mode lets N `/v1/messages` through first to induce a genuinely **mid-turn** death:

```bash
go build -o bin/probe-failproxy ./test/rig/failproxy
bin/probe-failproxy -port 879$PROBE_IDX -status 500 &            # every call fails
# or: bin/probe-failproxy -port 879$PROBE_IDX -upstream https://api.anthropic.com -fail-after 1 &
cd $PROBE_REPO && ANTHROPIC_BASE_URL=http://127.0.0.1:879$PROBE_IDX \
  /Users/damian/.local/bin/claude -p "say hi" --model claude-haiku-4-5-20251001 </dev/null
```

## 5. Read the captures

```bash
jq -c '{event,at:.received_at}' "$PROBE_CAPTURE" | grep -v '"event":null'
jq 'select(.path=="/statusline") | .body' "$PROBE_CAPTURE" | tail -40
```

Each line: `{received_at, path, method, event, headers, body_raw, body, body_is_json}`.

Analysis traps (each produced a wrong conclusion once — see `spikes/FINDINGS.md`):

- **Group by `session_id` before aggregating.** Any field that latches on
  mid-session looks intermittent when pooled across short-lived sessions.
- **`rate_limits` appears only after the first completed turn**; startup posts have
  no `rate_limits` and null `context_window.used_percentage`. Send a prompt before
  asserting on either.
- Cheap fast sessions are good for payload *shapes*, bad for anything *temporal* —
  keep a long-lived session in the sample when the question is "when".
- Flagging a gap is not a licence to assert the conclusion the gap forbids.

## 6. Tear down (always — an orphan burns tokens)

```bash
tmux -S "$PROBE_SOCKET" kill-server 2>/dev/null
pkill -f "probe-capture -port $PROBE_PORT"; pkill -f probe-failproxy
ps aux | grep '[c]laude'                 # none of YOURS survived (Damian's own sessions will be here — leave them)
md5 -q ~/.claude/settings.json           # matches your baseline
```

## 7. Where findings land

Per CLAUDE.md doc upkeep, before the session ends:

- New wire-format fact → `spikes/canary-fields.md`; substantive → `spikes/FINDINGS.md`
  (update the "Still open" list; keep evidence counts, e.g. "n of m sessions").
- A settled SPEC open question → `SPEC.md` §9 + changelog entry.
- Tick anything this closes in `TODO.md`.
- State the Claude Code version the evidence was captured against (from
  `SessionStart`/status-line payloads), and whether it matches the pin.
