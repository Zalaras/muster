//go:build canary

package canary

import (
	"bufio"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Views over runs O and P (harness_state_test.go).

// TestCompactHookSequence guards kb:fact/compact-hook-sequence on the events Muster registers:
// /compact fires PreCompact under a fresh prompt_id, then SessionStart{source:"compact"} on the
// same session_id and prompt_id, with no UserPromptSubmit and no Stop-family event for it, and
// the idle_prompt about a minute later carries that never-closed prompt_id.
func TestCompactHookSequence(t *testing.T) {
	f := harness(t)
	require.NoError(t, f.compact.err, "run O did not complete")
	p := f.compact.compactPromptID

	pre := f.hookAfter(sessionCompact, "PreCompact", f.compact.compactAt)
	require.NotNil(t, pre, "no PreCompact after /compact")
	trigger, _ := pre.payload["trigger"].(string)
	assert.Equal(t, "manual", trigger, "PreCompact.trigger for a typed /compact")

	start := f.compactSessionStart()
	require.NotNil(t, start, "no SessionStart{source:\"compact\"}")
	assert.True(t, start.at.After(pre.at), "SessionStart{compact} must follow PreCompact")
	assert.Equal(t, f.compact.claudeSessionID, start.ev.SessionID, "compaction must keep the session_id")
	require.NotNil(t, start.ev.PromptID, "SessionStart{compact} carries no prompt_id")
	assert.Equal(t, p, *start.ev.PromptID, "SessionStart{compact} must carry PreCompact's prompt_id")

	with := f.hooksWithPrompt(sessionCompact, p)
	for _, banned := range []string{"UserPromptSubmit", "Stop", "StopFailure"} {
		assert.NotContainsf(t, with, banned, "compaction's prompt now has a %s; its hooks: %v", banned, with)
	}
	assert.Contains(t, with, "SubagentStop", "the summarising agent's SubagentStop under the compaction's prompt_id")

	require.NotNil(t, f.compact.compactIdle, "no idle_prompt carrying the compaction's prompt_id within %s", orphanIdleWait)
	t.Logf("hooks under the compaction's prompt_id: %v; idle_prompt %s after SessionStart",
		with, f.compact.compactIdle.at.Sub(start.at).Round(time.Second))
}

// TestLocalCommandOrphanIdlePrompt guards kb:fact/local-command-orphan-idle-prompt: /context
// fires no hook, and the idle_prompt that follows carries a prompt_id no other hook ever named.
func TestLocalCommandOrphanIdlePrompt(t *testing.T) {
	f := harness(t)
	require.NoError(t, f.compact.err, "run O did not complete")
	idle := f.compact.contextIdle
	require.NotNil(t, idle, "no idle_prompt after /context")
	require.NotNil(t, idle.ev.PromptID, "the idle_prompt after /context carries no prompt_id")

	before := f.hooksBetween(sessionCompact, f.compact.claudeSessionID, f.compact.contextAt, idle.at)
	assert.Emptyf(t, before, "/context fired hooks before its idle_prompt: %v", before)
	with := f.hooksWithPrompt(sessionCompact, *idle.ev.PromptID)
	assert.Equalf(t, []string{"Notification{idle_prompt}"}, with,
		"the idle_prompt's prompt_id must belong to no other hook; got %v", with)
	t.Logf("idle_prompt %s after /context", idle.at.Sub(f.compact.contextAt).Round(time.Second))
}

// TestInterruptBeforeOutputLeavesNoTrace guards kb:fact/interrupt-before-output-leaves-no-trace:
// Esc while the turn's first request is still in flight emits no hook, and the transcript keeps
// the prompt's user line but gets no interrupt line, so the production interrupt reader finds
// nothing.
func TestInterruptBeforeOutputLeavesNoTrace(t *testing.T) {
	f := harness(t)
	r := f.earlyInterrupt
	require.NoError(t, r.err, "run P did not reach the interrupt")
	require.NotEmpty(t, r.promptID, "run P's UserPromptSubmit carried no prompt_id")
	require.True(t, r.promptRestored,
		"the prompt never came back to the input box after Escape, so the absence below would prove nothing")

	seen := f.hooksBetween(sessionEarlyInterrupt, r.claudeSessionID, r.interruptAt, r.quietUntil)
	window := r.quietUntil.Sub(r.interruptAt).Round(time.Second)
	assert.Emptyf(t, seen, "an Esc before any output now emits hooks; the %s window after Escape saw %v", window, seen)

	require.NotEmpty(t, r.transcriptPath, "UserPromptSubmit carried no transcript_path")
	assert.True(t, transcriptHasUserLine(t, r.transcriptPath, r.promptID),
		"the transcript has no user line for the prompt, so the missing interrupt line would prove nothing")
	interrupted, err := claudecode.PromptInterrupted(r.transcriptPath, r.promptID)
	require.NoError(t, err)
	assert.False(t, interrupted, "an Esc before any output now writes the interrupt line; the sweep would close the turn")
}

// transcriptHasUserLine reports whether the transcript at path holds a `user` line for promptID.
// Lines are decoded for type and promptId only; nothing is printed.
func transcriptHasUserLine(t *testing.T, path, promptID string) bool {
	t.Helper()
	file, err := os.Open(path)
	require.NoError(t, err)
	defer func() { _ = file.Close() }()
	r := bufio.NewReader(file)
	for {
		line, err := r.ReadBytes('\n')
		var l struct {
			Type     string `json:"type"`
			PromptID string `json:"promptId"`
		}
		if json.Unmarshal(line, &l) == nil && l.Type == "user" && l.PromptID == promptID {
			return true
		}
		if err != nil {
			return false
		}
	}
}
