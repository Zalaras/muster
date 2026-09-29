---
id: transcript-session-lines
type: fact
status: active
date: 2026-09-27
summary: A transcript's title is its last custom-title, else ai-title line; last-prompt, permission-mode and model lines too, all in its last 35 KB.
features: [launch]
tags: [claude-code-format]
files: []
tests: [TestTranscriptSessionLines]
refs: [plan:resume-and-dangerously-allow, kb:fact/transcript-dir-encoding, kb:fact/name-flag-reaches-title]
verified: 2.1.283..canary
guard: TestTranscriptSessionLines
---
Lines of a session transcript that name it, one JSON object per line, each with `sessionId`:

- `{"type":"custom-title","customTitle":…}` — written for `--name`, and again every turn, beside
  an `agent-name` line with the same value.
- `{"type":"ai-title","aiTitle":…}` — Claude Code's generated title.
- `{"type":"last-prompt","lastPrompt":…,"leafUuid":…}` — the latest prompt text.
- `{"type":"permission-mode","permissionMode":…}` — the mode, rewritten as it changes. Absent
  from many files.
- `assistant` lines carry `message.model` (e.g. `claude-haiku-4-5-20251001`) and `entrypoint`:
  `cli` for interactive, `sdk-cli` for `-p`.

Across the developer's transcripts in one folder (about 210): 166 have an `ai-title`, none a
`custom-title`; the last title line sat at most 34,355 bytes from the end (median 13,853) in files
up to 24 MB, so a tail read finds it without a full scan. The 44 without one are
stubs of 2–6 KB, sessions quit before any assistant turn, or `-p` runs, which persist and are
resumable but get no title. Timestamps are on `user`/`assistant` lines; the file's mtime is the
last write.

Evidence: probe runs A and C (capture-3, 2026-09-27) and a keys-and-offsets-only scan of the
developer's transcripts (no content read).
