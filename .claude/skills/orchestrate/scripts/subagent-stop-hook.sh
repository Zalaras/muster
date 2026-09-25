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
in="$(cat)"
case "$in" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac
role="$(printf '%s' "$in" | sed -nE 's/.*"agent_type"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')"
case "$role" in daemon-impl|web-impl|daemon-tests|web-tests|e2e-specs) ;; *) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out="$(python3 .claude/skills/orchestrate/scripts/comment-checks.py "$role" 2>&1)"; then
  printf 'Finish blocked by the comment check for %s. Fix each line below, commit by pathspec, then finish:\n%s\n' "$role" "$out" >&2
  exit 2
fi
exit 0
