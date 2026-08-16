# Muster spike rig — stand-up recipe

> **Superseded (2026-08-16, H2).** The rig now lives in this repo — `test/rig/`
> (`newprobe.sh`, `capture/`, `failproxy/`) — and the live recipe is the
> `/interface-probe` skill (`.claude/skills/interface-probe/SKILL.md`). This file is
> kept as the historical record of the original `../ccc-spike` rig; paths below point
> at that checkout and are stale. Use the skill.

Follow this verbatim. Everything here was verified against **Claude Code 2.1.233** on
macOS on 2026-08-16. Findings and evidence live in `../A0-findings.md`.

## The one rule that matters

**Never touch `~/.claude/settings.json` or `~/.claude/settings.local.json`.** Damian has
live sessions running against them. Isolation comes from a **project-scoped
`.claude/settings.json`** inside your instance's scratch repo — nothing else.

Do **not** use `CLAUDE_CONFIG_DIR` to isolate a session you need to actually talk to the
API: it gives you a config dir with no credentials and the session dies with
`Not logged in · Please run /login`. Do not attempt to log in. (Details in
`../A0-findings.md`, Q1.)

Baseline for the paranoid, check before and after your run:

```bash
md5 -q ~/.claude/settings.json   # 20a641769314c762f0390de5495a9e31
```

## 1. Pick your instance index

One digit, `0`-`9`, unique per agent so we don't collide. It determines everything:

| Thing | Value |
|---|---|
| Capture port | `878<index>` (8780-8789; **5000/7000 are AirPlay, never use them**) |
| tmux socket | `ccc-spike-<index>` |
| Instance dir | `ccc-spike/instances/<index>/` |
| Scratch repo | `ccc-spike/instances/<index>/repo/` |
| Capture file | `ccc-spike/captures/capture-<index>.jsonl` |

## 2. Stamp out the instance

```bash
cd /Users/damian/Documents/code/Projects/ccc-spike
./rig/newspike.sh 3          # <- your index
. instances/3/env.sh         # exports SPIKE_PORT, SPIKE_REPO, SPIKE_SOCKET, ...
```

Idempotent — re-running rewrites the settings/scripts and leaves the repo and captured
data alone. It creates the scratch git repo (with a real commit, so git-dependent things
work), the status-line script, the hook wrapper, and **both** settings files.

### `CLAUDE_CONFIG_DIR` must NOT be set

Setting it is the easiest way to break your session: it gives you a config dir with no
credentials, and the session dies on the first prompt with
`Not logged in · Please run /login`.

`env.sh` used to export it. **That was a bug and it is now fixed** — `env.sh` explicitly
`unset`s it and leaves the path in the non-exported `SPIKE_CONFIG_DIR_UNAUTHENTICATED`.
If you stamped your instance before this fix, **re-run `./rig/newspike.sh <index>`**.
Sanity-check before launching:

```bash
. instances/3/env.sh
echo "${CLAUDE_CONFIG_DIR:-<unset>}"    # must print <unset>
```

## 3. Start the capture server

```bash
cd /Users/damian/Documents/code/Projects/ccc-spike
go build -o rig/capture/capture ./rig/capture
nohup ./rig/capture/capture -port 8783 -instance 3 \
  -dir /Users/damian/Documents/code/Projects/ccc-spike/captures \
  > captures/capture-3.log 2>&1 &
curl -s http://127.0.0.1:8783/health   # -> ok
```

Endpoints:

- `POST /hook/{event}` → appends to JSONL, replies `200` with an empty body.
- `POST /statusline` → appends to JSONL, replies `200` with the text `Muster-SPIKE`, which is
  what you'll see rendered in the TUI. That string is your proof the status line works.
- `GET /health` → `ok`.

To have hooks return a decision body (PermissionRequest work), pass
`-decision '{"decision":"allow"}'` or set `CCC_SPIKE_DECISION`. It applies to every
`/hook/*` response.

Credential-shaped headers (`authorization`, `cookie`, `x-api-key`, …) are stored as
`<redacted>` and never printed. Bodies are stored raw **and** parsed.

## 4. Launch a session in tmux

```bash
export PATH=/usr/local/bin:$PATH        # tmux 3.7b lives here
S=ccc-spike-3
R=/Users/damian/Documents/code/Projects/ccc-spike/instances/3/repo

tmux -L $S new-session -d -s s1 -x 200 -y 50 -c "$R"
tmux -L $S set-option -g escape-time 0
tmux -L $S set-option -g status off
tmux -L $S set-option -g focus-events on     # silences a TUI nag
tmux -L $S send-keys -t s1 \
  'export LANG=en_US.UTF-8 TERM=xterm-256color; cd '"$R"'; unset CLAUDE_CONFIG_DIR; /Users/damian/.local/bin/claude --model claude-haiku-4-5-20251001' Enter
```

`-L $S` is load-bearing: it uses a private tmux server so you never touch a real one.
`-x 200 -y 50` matters — a detached `new-session` is 80x24 otherwise and Claude Code's
TUI wraps into unreadable garbage. `LANG`/`TERM` matter or box-drawing renders as mojibake.

**Always** pass `--model claude-haiku-4-5-20251001` and keep prompts trivial ("say hi").
Damian's real subscription limits are being consumed. Note his global settings force
`claude-fable-5[1m]` + `effortLevel: high`, so the flag is what keeps you cheap — the
generated project settings also pin the model, but pass the flag anyway.

## 5. Dismiss the workspace-trust prompt

**First launch in a fresh directory always shows it**, and it blocks startup — no hooks
fire and no status line renders until you answer. Headless `claude -p` runs do **not**
record trust, so an interactive run hits it even if you ran headless there first.

```bash
tmux -L $S capture-pane -p -t s1 | tail -25    # look for "Quick safety check"
tmux -L $S send-keys -t s1 Enter               # "1. Yes, I trust this folder" is preselected
```

A bare `Enter` is enough — option 1 is already selected. Trust persists per directory, so
subsequent launches in the same repo go straight to the prompt box.

Claude Code takes **10-20 seconds** to reach an interactive prompt. Poll `capture-pane`;
don't assume a blank pane means failure.

## 6. Drive the session

```bash
tmux -L $S send-keys -t s1 'say hi'   # type the text
sleep 1                               # let the TUI settle
tmux -L $S send-keys -t s1 Enter      # then submit, as a SEPARATE call
```

Sending text and `Enter` in one `send-keys` is unreliable — the TUI can swallow the
newline. Always split them with a short pause.

Read the screen with `tmux -L $S capture-pane -p -t s1`. The bottom line shows
`Muster-SPIKE` (your status line) and the current mode.

## 7. Read what was captured

```bash
C=/Users/damian/Documents/code/Projects/ccc-spike/captures/capture-3.jsonl
jq -c '{event,at:.received_at}' "$C" | grep -v '"event":null'   # hooks
jq 'select(.path=="/statusline") | .body' "$C" | tail -40       # status line payloads
```

Each line is `{received_at, path, method, event, headers, body_raw, body, body_is_json}`.

## 8. Gotchas that cost me time

- **`SessionStart` never fires over `type:"http"`.** It only fires as `type:"command"`.
  Verified by putting an http and a command hook in the *same* hook block: the command one
  fired, the http one produced nothing, no warning anywhere. `newspike.sh` already wires
  the command wrapper (`hook-cmd.sh`), so you get `SessionStart` in your JSONL — but if you
  write your own settings, don't expect http to work for it. Every other event tested
  (`UserPromptSubmit`, `Stop`, `StopFailure`, `SessionEnd`) works fine over http.
- **`rate_limits` appears only after the session's first completed turn** — then it stays on
  every subsequent post. Startup posts carry no `rate_limits` key at all and a `null`
  `context_window.used_percentage`. Send one prompt before asserting on either; don't assert
  on a payload captured at startup.
- **Group payloads by `session_id` before you aggregate them.** This one cost me a wrong
  conclusion. Pooled across several short-lived sessions, `rate_limits` looked intermittent
  (2 of 12 posts) when it is really a clean latch — every session I ran happened to end
  right after its first turn, so the pooled ratio was measuring my teardown habits, not
  Claude Code. Any field that switches on mid-session and stays on will look like it
  flickers if you pool. Group first.

### Inducing `StopFailure` for free

If you need a turn-ended-in-error case, you do **not** need to burn tokens provoking one.
Point a session at the unauthenticated config dir and prompt it — it fails instantly, before
any API call, and emits a real `StopFailure` with `"error": "authentication_failed"`:

```bash
cd /Users/damian/Documents/code/Projects/ccc-spike/instances/3/repo
CLAUDE_CONFIG_DIR=/Users/damian/Documents/code/Projects/ccc-spike/instances/3/claude-config \
  /Users/damian/.local/bin/claude -p "hi" --model claude-haiku-4-5-20251001 </dev/null
```

Deterministic, ~1 second, zero tokens. It also emits `UserPromptSubmit` and `SessionEnd`,
so it's a cheap way to exercise a whole failure sequence. Note this yields the
`authentication_failed` flavour specifically — other `error` values are unverified.
- **Foreground `sleep` is blocked** in this harness. Put waits inside a backgrounded bash
  command (`run_in_background: true`) instead.
- `timeout`/`gtimeout` are **not installed**. Use backgrounded commands rather than
  wrapping things in a timeout.
- A blank `capture-pane` right after launch is normal; Claude Code just hasn't drawn yet.
- The status-line script must print something. If `curl` fails it prints
  `Muster-SPIKE(post-failed)` — a useful signal that your capture server isn't up.

## 9. Tear down (do this, an orphan burns tokens)

```bash
tmux -L ccc-spike-3 kill-server
pkill -f 'capture -port 8783'
ps aux | grep '[c]laude'      # confirm none of yours survived
md5 -q ~/.claude/settings.json  # still 20a641769314c762f0390de5495a9e31
```
