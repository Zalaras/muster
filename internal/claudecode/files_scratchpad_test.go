package claudecode

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

func TestInterpretFiles_ScratchpadDirOnlyWhenWellFormedForItsOwnSession(t *testing.T) {
	const good = "/private/tmp/claude-501/-proj/claude-1/scratchpad"

	tests := []struct {
		name string
		dir  string
		want string
	}{
		{"well formed", good, good},
		{"absent", "", ""},
		{"the shape today's E2E payloads send", "/tmp/scratchpad", ""},
		{"relative", "claude-1/scratchpad", ""},
		{"trailing slash is not clean", good + "/", ""},
		{"dot-dot segment is not clean", "/private/tmp/x/../claude-1/scratchpad", ""},
		{"parent names another session", "/private/tmp/claude-501/-proj/claude-2/scratchpad", ""},
		{"last element is not scratchpad", "/private/tmp/claude-501/-proj/claude-1/tasks", ""},
		{"a nested folder under the scratchpad", good + "/sub", ""},
	}
	events := []struct {
		name    string
		typ     string
		payload func(dir string) []byte
	}{
		{"SessionStart", "SessionStart", func(dir string) []byte {
			return innerPayload(t, claudecodetest.EnvelopedSessionStartTranscript("claude-1", "/tmp/t.jsonl", claudecodetest.SessionStartOpts{ScratchpadDir: dir}))
		}},
		{"PostToolUse", "PostToolUse", func(dir string) []byte {
			return []byte(claudecodetest.RawPostToolUseFile("claude-1", "Write", "/x/a.md", claudecodetest.ToolFileOpts{ScratchpadDir: dir}))
		}},
		{"PreToolUse", "PreToolUse", func(dir string) []byte {
			return []byte(claudecodetest.RawPreToolUseTool("claude-1", "ExitPlanMode", claudecodetest.ToolFileOpts{ScratchpadDir: dir}))
		}},
	}

	for _, ev := range events {
		for _, tt := range tests {
			t.Run(ev.name+"/"+tt.name, func(t *testing.T) {
				assert.Equal(t, tt.want, InterpretFiles(ev.typ, ev.payload(tt.dir)).ScratchpadDir)
			})
		}
	}

	t.Run("a payload with no session_id never qualifies", func(t *testing.T) {
		assert.Empty(t, InterpretFiles("Stop", []byte(`{"scratchpad_dir":"/a/b/scratchpad"}`)).ScratchpadDir)
	})
	t.Run("a null scratchpad_dir yields none", func(t *testing.T) {
		assert.Empty(t, InterpretFiles("Stop", []byte(`{"session_id":"claude-1","scratchpad_dir":null}`)).ScratchpadDir)
	})
	t.Run("malformed JSON yields none", func(t *testing.T) {
		assert.Empty(t, InterpretFiles("Stop", []byte(`{`)).ScratchpadDir)
	})
}
