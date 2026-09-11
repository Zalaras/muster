## What happened

Need to support API usage billing as well

## Snapshot

| field | value |
| --- | --- |
| musterd | 0.2.1 |
| Claude Code | 2.1.247 installed · 2.1.246 pinned · drift |
| host | darwin/arm64 |
| dashboard | 1 sessions, 1 alive · view focus 2x2 · rail manual |
| state | working since 2026-09-01T11:56:10Z |
| alive | true |
| model | claude-opus-5[1m] |
| permission mode | auto (last known, source hook) |
| context | 4% · 41783 / 1000000 tokens |
| compactions | 0 |
| tmux | muster-1:@0 |
| session | created 2026-09-01T11:53:39Z · claude session bound |
| events | seq 1-22, 22 routed · last 2026-09-01T11:56:42Z |
| recent events | status_line, PostToolUse, PreToolUse, PostToolUse, PreToolUse, PostToolUse, status_line, PreToolUse, PostToolUse, status_line |

<details>
<summary>raw snapshot</summary>

````json
{
  "capturedAt": "2026-09-01T11:56:43Z",
  "scope": "session",
  "musterd": {
    "version": "0.2.1"
  },
  "claudeCode": {
    "pinned": "2.1.246",
    "installed": "2.1.247",
    "drift": true
  },
  "host": {
    "os": "darwin",
    "arch": "arm64"
  },
  "dashboard": {
    "sessionsTotal": 1,
    "sessionsAlive": 1,
    "view": "focus",
    "density": "2x2",
    "railSort": "manual"
  },
  "session": {
    "state": "working",
    "stateSince": "2026-09-01T11:56:10Z",
    "alive": true,
    "endedAt": null,
    "model": {
      "id": "claude-opus-5[1m]"
    },
    "permissionMode": {
      "value": "auto",
      "source": "hook"
    },
    "context": {
      "usedPct": 4,
      "totalInputTokens": 41783,
      "windowSize": 1000000
    },
    "compactions": 0,
    "tmuxTarget": "muster-1:@0",
    "createdAt": "2026-09-01T11:53:39Z",
    "claudeSessionIdBound": true,
    "events": {
      "firstSeq": 1,
      "lastSeq": 22,
      "count": 22,
      "lastReceivedAt": "2026-09-01T11:56:42Z",
      "recentTypes": [
        "status_line",
        "PostToolUse",
        "PreToolUse",
        "PostToolUse",
        "PreToolUse",
        "PostToolUse",
        "status_line",
        "PreToolUse",
        "PostToolUse",
        "status_line"
      ]
    }
  }
}
````

</details>

<sub>Filed from the Muster dashboard. Allowlisted snapshot only — no prompt text, hook payload bodies, status-line JSON, pane captures, directory paths, repository names or account usage.</sub>
