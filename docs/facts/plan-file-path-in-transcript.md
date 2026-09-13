---
id: plan-file-path-in-transcript
type: fact
status: active
date: 2026-09-13
summary: A session's plan is <plansDir>/<slug>.md; only the transcript names it, via slug lines and planFilePath on plan_mode* attachment lines.
features: [lifecycle]
tags: [claude-code-format]
files: []
tests: []
refs: [docs/history/design/markdown-viewing.md, kb:fact/plan-mode-hook-sequence, kb:fact/hook-payload-fields]
verified: 2.1.233..2.1.269
guard: none
---
Claude Code writes a session's plan-mode plan to `<plansDir>/<slug>.md` — `plansDir` is
`settings.plansDirectory` resolved under the project root (it must stay inside it, else Claude
Code logs an error and falls back), otherwise `~/.claude/plans`. Subagents write
`<slug>-agent-<agentName>.md`; a `<slug>.workshop.md` sibling also exists. The slug is
per-session, minted when plan mode is first entered, and appears **nowhere on any hook
payload** — only in the transcript named by `transcript_path`:

- a top-level `slug` on every `user`, `assistant`, `attachment` and `system` line written after
  it is minted (not on `mode`, `permission-mode`, `cost-state`, `file-history-*` and the other
  bookkeeping lines);
- `attachment.planFilePath` (absolute, already resolved) plus `attachment.planExists` on lines
  `{"type":"attachment","attachment":{"type":"plan_mode"|"plan_mode_exit"|"plan_mode_reentry",…}}`.

`planFilePath` is the authoritative form; the slug is only a fallback (`~/.claude/plans/<slug>.md`).
A locator must accept every attachment type carrying `planFilePath`: seven transcripts had a
`plan_mode_exit` line and no `plan_mode` one.

Evidence: naming and resolution read from the installed bundles — the strings are identical in
2.1.268, 2.1.269 and 2.1.270; 281 transcripts on Damian's machine scanned — 39 entered plan
mode, written by every version from 2.1.233 to 2.1.270, and all 39 resolve a path (36
`plan_mode`, 34 `plan_mode_exit`, 1 `plan_mode_reentry` lines; 28 files exist), whole corpus in
268 ms. The range stops at 2.1.269 only because that is the canary's observed ceiling; 2.1.270
was measured too and holds.
Prototype locator: `internal/claudecode/plan.go` on branch `spike/markdown-viewing`.
