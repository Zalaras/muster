package claudecode

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// toolUseLine is an assistant line of the kind that fills a real transcript between the
// prompt and its interrupt.
func toolUseLine(promptID string) string {
	return `{"type":"assistant","promptId":"` + promptID + `","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"Bash","input":{"command":"sleep 30"}}]}}`
}

func jsonl(lines ...string) string { return strings.Join(lines, "\n") + "\n" }

// TestScanInterrupt covers D7 and D8 at the pure layer: both measured marker texts match
// under their own promptId only, and every other shape the transcript holds does not
// (kb:fact/interrupt-recorded-in-transcript).
func TestScanInterrupt(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		promptID string
		want     bool
	}{
		{"mid-stream interrupt for the prompt", jsonl(claudecodetest.InterruptLine("p1", false)), "p1", true},
		{"interrupt for tool use for the prompt", jsonl(claudecodetest.InterruptLine("p1", true)), "p1", true},
		{"interrupt after a tool_use line", jsonl(toolUseLine("p1"), claudecodetest.InterruptLine("p1", true)), "p1", true},
		{"interrupt line without a trailing newline", claudecodetest.InterruptLine("p1", false), "p1", true},
		{"interrupt for an older prompt only", jsonl(claudecodetest.InterruptLine("p0", false), toolUseLine("p1")), "p1", false},
		{"interrupt for a newer prompt only", jsonl(claudecodetest.InterruptLine("p2", false)), "p1", false},
		{"plan-feedback rejection: tool_result only, never the text", jsonl(claudecodetest.PlanRejectionLine("p1")), "p1", false},
		{"rejection then a normal continuation", jsonl(claudecodetest.PlanRejectionLine("p1"), toolUseLine("p1")), "p1", false},
		{"empty input", "", "p1", false},
		{"typed prompt whose content is a plain string", jsonl(`{"type":"user","promptId":"p1","message":{"role":"user","content":"[Request interrupted by user] is what I typed"}}`), "p1", false},
		{"typed prompt as a text block that merely mentions the marker", jsonl(`{"type":"user","promptId":"p1","message":{"role":"user","content":[{"type":"text","text":"please explain [Request interrupted by user]"}]}}`), "p1", false},
		{"marker text on an assistant line", jsonl(`{"type":"assistant","promptId":"p1","message":{"role":"assistant","content":[{"type":"text","text":"[Request interrupted by user]"}]}}`), "p1", false},
		{"a tail cut mid-line is skipped, the interrupt after it still matches", `ool_use","id":"tu1"}]}}` + "\n" + claudecodetest.InterruptLine("p1", false) + "\n", "p1", true},
		{"a garbage line does not hide a later interrupt", jsonl("not json", claudecodetest.InterruptLine("p1", false)), "p1", true},
		{"line without a promptId never matches a real one", jsonl(`{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]}}`), "p1", false},
		{"empty promptId does not match a line carrying one", jsonl(claudecodetest.InterruptLine("p1", false)), "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, scanInterrupt(strings.NewReader(tt.input), tt.promptID))
		})
	}
}

// TestPromptInterrupted covers the file layer: a missing transcript is (false, nil), an
// unreadable path is an error the sweep logs and retries, and only the 64 KB tail is read
// (the interrupt is the last line of its prompt).
func TestPromptInterrupted(t *testing.T) {
	write := func(t *testing.T, content string) string {
		t.Helper()
		path := filepath.Join(t.TempDir(), "t.jsonl")
		require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
		return path
	}

	t.Run("D7: true for both marker texts under the matching promptId", func(t *testing.T) {
		for name, forToolUse := range map[string]bool{"mid-stream": false, "for tool use": true} {
			t.Run(name, func(t *testing.T) {
				path := write(t, jsonl(toolUseLine("p1"), claudecodetest.InterruptLine("p1", forToolUse)))

				got, err := PromptInterrupted(path, "p1")

				require.NoError(t, err)
				assert.True(t, got)
			})
		}
	})

	t.Run("D7: false for a plan-feedback tool_result-only transcript", func(t *testing.T) {
		path := write(t, jsonl(toolUseLine("p1"), claudecodetest.PlanRejectionLine("p1")))

		got, err := PromptInterrupted(path, "p1")

		require.NoError(t, err)
		assert.False(t, got)
	})

	t.Run("D8: false when the interrupt belongs to another prompt", func(t *testing.T) {
		path := write(t, jsonl(claudecodetest.InterruptLine("p0", false), toolUseLine("p1")))

		got, err := PromptInterrupted(path, "p1")

		require.NoError(t, err)
		assert.False(t, got)
	})

	t.Run("D10: a missing file is false with no error", func(t *testing.T) {
		got, err := PromptInterrupted(filepath.Join(t.TempDir(), "absent.jsonl"), "p1")

		require.NoError(t, err)
		assert.False(t, got)
	})

	t.Run("D10: a directory in place of the file is an error, not an interrupt", func(t *testing.T) {
		got, err := PromptInterrupted(t.TempDir(), "p1")

		require.Error(t, err)
		assert.False(t, got)
	})

	t.Run("an interrupt inside the tail of a file far larger than the tail is found", func(t *testing.T) {
		filler := strings.Repeat(toolUseLine("p1")+"\n", 2*transcriptTailBytes/len(toolUseLine("p1")))
		path := write(t, filler+claudecodetest.InterruptLine("p1", false)+"\n")

		got, err := PromptInterrupted(path, "p1")

		require.NoError(t, err)
		assert.True(t, got)
	})

	t.Run("an interrupt that sits beyond the tail window is not read", func(t *testing.T) {
		filler := strings.Repeat(toolUseLine("p2")+"\n", 2*transcriptTailBytes/len(toolUseLine("p2")))
		path := write(t, claudecodetest.InterruptLine("p1", false)+"\n"+filler)

		got, err := PromptInterrupted(path, "p1")

		require.NoError(t, err)
		assert.False(t, got, "the interrupt is the last line of its prompt, so a line pushed out of the tail belongs to a long-closed prompt")
	})
}
