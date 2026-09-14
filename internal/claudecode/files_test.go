package claudecode

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// TestInterpretFiles is D6's guard: the written path surfaces only for a PostToolUse
// Write/Edit/MultiEdit, the transcript path surfaces on every hook type, and
// PlanMaybeReady is true exactly on SessionStart, PreToolUse/PostToolUse of
// ExitPlanMode, and a written path under the default plans directory — never on
// anything else.
func TestInterpretFiles(t *testing.T) {
	const transcriptPath = "/tmp/some-transcript.jsonl"

	tests := []struct {
		name           string
		eventType      string
		payload        []byte
		wantWritten    string
		wantPlanReady  bool
		wantTranscript string
	}{
		{
			name:           "SessionStart is a scan trigger and carries no written path",
			eventType:      "SessionStart",
			payload:        innerPayload(t, claudecodetest.EnvelopedSessionStartTranscript("claude-1", transcriptPath, claudecodetest.SessionStartOpts{})),
			wantPlanReady:  true,
			wantTranscript: transcriptPath,
		},
		{
			name:      "PreToolUse ExitPlanMode is a scan trigger",
			eventType: "PreToolUse",
			payload: []byte(claudecodetest.RawPreToolUseTool("claude-1", "ExitPlanMode",
				claudecodetest.ToolFileOpts{TranscriptPath: transcriptPath})),
			wantPlanReady:  true,
			wantTranscript: transcriptPath,
		},
		{
			name:      "PreToolUse of any other tool is not a scan trigger",
			eventType: "PreToolUse",
			payload: []byte(claudecodetest.RawPreToolUseTool("claude-1", "Bash",
				claudecodetest.ToolFileOpts{TranscriptPath: transcriptPath})),
			wantPlanReady:  false,
			wantTranscript: transcriptPath,
		},
		{
			name:      "PostToolUse ExitPlanMode is a scan trigger and writes nothing",
			eventType: "PostToolUse",
			payload: []byte(claudecodetest.RawPostToolUseFile("claude-1", "ExitPlanMode", "",
				claudecodetest.ToolFileOpts{TranscriptPath: transcriptPath})),
			wantPlanReady:  true,
			wantTranscript: transcriptPath,
		},
		{
			name:      "PostToolUse Write yields the written path",
			eventType: "PostToolUse",
			payload: []byte(claudecodetest.RawPostToolUseFile("claude-1", "Write", "/tmp/proj/TODO.md",
				claudecodetest.ToolFileOpts{TranscriptPath: transcriptPath})),
			wantWritten:    "/tmp/proj/TODO.md",
			wantTranscript: transcriptPath,
		},
		{
			name:      "PostToolUse Edit yields the written path",
			eventType: "PostToolUse",
			payload: []byte(claudecodetest.RawPostToolUseFile("claude-1", "Edit", "/tmp/proj/TODO.md",
				claudecodetest.ToolFileOpts{TranscriptPath: transcriptPath})),
			wantWritten:    "/tmp/proj/TODO.md",
			wantTranscript: transcriptPath,
		},
		{
			name:      "PostToolUse MultiEdit yields the written path",
			eventType: "PostToolUse",
			payload: []byte(claudecodetest.RawPostToolUseFile("claude-1", "MultiEdit", "/tmp/proj/TODO.md",
				claudecodetest.ToolFileOpts{TranscriptPath: transcriptPath})),
			wantWritten:    "/tmp/proj/TODO.md",
			wantTranscript: transcriptPath,
		},
		{
			name:      "PostToolUse of a non-writing tool yields no written path",
			eventType: "PostToolUse",
			payload: []byte(claudecodetest.RawPostToolUseFile("claude-1", "Bash", "/tmp/proj/TODO.md",
				claudecodetest.ToolFileOpts{TranscriptPath: transcriptPath})),
			wantWritten:    "",
			wantTranscript: transcriptPath,
		},
		{
			name:           "Stop is not a scan trigger but still carries the transcript path",
			eventType:      "Stop",
			payload:        []byte(claudecodetest.RawStop("claude-1", claudecodetest.StopOpts{})),
			wantTranscript: "/tmp/t.jsonl", // RawStop's fixed default
		},
		{
			name:           "SessionEnd is not a scan trigger but still carries the transcript path",
			eventType:      "SessionEnd",
			payload:        []byte(claudecodetest.RawSessionEnd("claude-1", "other")),
			wantTranscript: "/tmp/t.jsonl",
		},
		{
			name:           "Notification is not a scan trigger",
			eventType:      "Notification",
			payload:        []byte(claudecodetest.RawNotification("claude-1", "p1", "idle_prompt")),
			wantTranscript: "/tmp/t.jsonl",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sig := InterpretFiles(tt.eventType, tt.payload)
			assert.Equal(t, tt.wantWritten, sig.WrittenPath)
			assert.Equal(t, tt.wantPlanReady, sig.PlanMaybeReady)
			assert.Equal(t, tt.wantTranscript, sig.TranscriptPath)
		})
	}
}

// TestInterpretFiles_WrittenPathUnderDefaultPlansDirIsAScanTrigger covers the third
// PlanMaybeReady trigger (REQ-16): a write landing under the default plans directory
// must be treated as "the plan may be ready", even though it is neither SessionStart nor
// ExitPlanMode. $HOME is scoped to this test via t.Setenv (IsUnderDefaultPlansDir has no
// caller-supplied home parameter to thread through instead).
func TestInterpretFiles_WrittenPathUnderDefaultPlansDirIsAScanTrigger(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	planPath := filepath.Join(home, ".claude", "plans", "happy-otter.md")

	payload := []byte(claudecodetest.RawPostToolUseFile("claude-1", "Write", planPath, claudecodetest.ToolFileOpts{}))

	sig := InterpretFiles("PostToolUse", payload)

	assert.Equal(t, planPath, sig.WrittenPath)
	assert.True(t, sig.PlanMaybeReady, "a write under the default plans directory must trigger a scan")
}

// TestInterpretFiles_WrittenPathOutsideDefaultPlansDirIsNotAScanTrigger is the negative
// twin: an ordinary write elsewhere under the session directory must not itself trigger
// a scan (REQ-16 lists exactly three triggers).
func TestInterpretFiles_WrittenPathOutsideDefaultPlansDirIsNotAScanTrigger(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	payload := []byte(claudecodetest.RawPostToolUseFile("claude-1", "Write", "/tmp/proj/TODO.md", claudecodetest.ToolFileOpts{}))

	sig := InterpretFiles("PostToolUse", payload)

	assert.False(t, sig.PlanMaybeReady)
}
