#!/usr/bin/env bash
# SubagentStop hook (.claude/settings.json): when a pipeline agent finishes, run comment-checks.py
# for its role. Exit 2 blocks the finish and hands stderr back to the agent, which fixes and
# commits in the same run. Blocks at most once per stop: a payload with stop_hook_active true is
# the agent's retry and always passes, so a false positive costs one turn, never a stuck agent —
# gates.sh --gates is the backstop for impl code.
#
# Settings, not agent frontmatter. Measured on 2.1.282 with a Haiku probe agent: hooks in an agent
# definition's frontmatter (PreToolUse, Stop, SubagentStop) never fired, while a project-settings
# SubagentStop hook did, carrying agent_type; its exit 2 kept the agent running on the stderr
# instruction and the retry arrived with stop_hook_active true. (A kb:fact waits until the canary
# verifies 2.1.282: check-kb refuses a fact above internal/claudecode/observed_versions.txt.)
#
# Parse as JSON, top level only: the payload's background_tasks[] carries every running agent's own
# agent_type, and a greedy grep picked the last one, so a parallel sibling's role was checked and the
# wrong agent blocked (interface probe on 2.1.284, 2026-09-29, capture-3; kb:fact/background-tasks-field).
in="$(cat)"
read -r active role < <(printf '%s' "$in" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(str(d.get("stop_hook_active") is True).lower(), d.get("agent_type") or "-")' 2>/dev/null)
[[ "$active" == true ]] && exit 0
case "$role" in daemon-impl|web-impl|daemon-tests|web-tests|e2e-specs) ;; *) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out="$(python3 .claude/skills/orchestrate/scripts/comment-checks.py "$role" 2>&1)"; then
  printf 'Finish blocked by the comment check for %s. Fix each line below, commit by pathspec, then finish:\n%s\n' "$role" "$out" >&2
  exit 2
fi
exit 0
