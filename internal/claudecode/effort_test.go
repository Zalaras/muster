package claudecode

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

func TestValidEffort(t *testing.T) {
	tests := []struct {
		in   string
		want bool
	}{
		{"low", true}, {"medium", true}, {"high", true}, {"xhigh", true}, {"max", true},
		{"", false}, {"HIGH", false}, {"auto", false}, {"ultracode", false}, {" high", false}, {"default", false},
	}
	for _, tt := range tests {
		t.Run("["+tt.in+"]", func(t *testing.T) {
			assert.Equal(t, tt.want, ValidEffort(tt.in))
		})
	}
	assert.Equal(t, []string{"low", "medium", "high", "xhigh", "max"}, EffortLevels)
}

// TestBuildArgv_Effort covers the argv half: --effort <level> follows
// --permission-mode on a launch and on a resume, appears only for a non-empty level, and
// appears exactly once.
func TestBuildArgv_Effort(t *testing.T) {
	tests := []struct {
		name   string
		params LaunchParams
		want   []string
	}{
		{
			name:   "a launch with a level",
			params: LaunchParams{Model: "opus", PermissionMode: "auto", Effort: "max"},
			want:   []string{"claude", "--model", "opus", "--permission-mode", "auto", "--effort", "max"},
		},
		{
			name:   "default launch sends no flag",
			params: LaunchParams{Model: "opus", PermissionMode: "auto"},
			want:   []string{"claude", "--model", "opus", "--permission-mode", "auto"},
		},
		{
			name:   "Resume button: model, resume, mode, effort",
			params: LaunchParams{Model: "claude-opus-4-5", ResumeSessionID: "abc", PermissionMode: "plan", Effort: "medium"},
			want:   []string{"claude", "--model", "claude-opus-4-5", "--resume", "abc", "--permission-mode", "plan", "--effort", "medium"},
		},
		{
			name:   "Resume-tab resume: no model, no name",
			params: LaunchParams{ResumeSessionID: "abc", PermissionMode: "default", Effort: "low"},
			want:   []string{"claude", "--resume", "abc", "--permission-mode", "default", "--effort", "low"},
		},
		{
			name:   "Resume with no past effort sends none",
			params: LaunchParams{ResumeSessionID: "abc", PermissionMode: "default"},
			want:   []string{"claude", "--resume", "abc", "--permission-mode", "default"},
		},
		{
			name:   "a level outside the five is passed verbatim, the caller validates",
			params: LaunchParams{ResumeSessionID: "abc", Effort: "ultra"},
			want:   []string{"claude", "--resume", "abc", "--effort", "ultra"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, BuildArgv("claude", tt.params))
		})
	}
}

func assistantEffortLine(model, effort string) string {
	return `{"type":"assistant","effort":"` + effort + `","message":{"model":"` + model + `"}}`
}

// TestPastSessions_Effort covers the transcript half against the measured shape
// (kb:fact/resume-does-not-restore-effort): every assistant line carries a top-level
// "effort" beside message.model, the last such line wins, and a session with no completed
// turn records none.
func TestPastSessions_Effort(t *testing.T) {
	dir := "/home/bob/proj"
	tests := []struct {
		name  string
		lines []string
		want  *string
	}{
		{
			name:  "the last assistant line's effort wins",
			lines: []string{assistantEffortLine("claude-opus-4-5", "high"), assistantEffortLine("claude-opus-4-5", "medium")},
			want:  ptr("medium"),
		},
		{
			name:  "no completed turn records none",
			lines: []string{permissionModeLine("default"), lastPromptLine("hi")},
			want:  nil,
		},
		{
			name:  "an assistant line without the key after one with it reads none",
			lines: []string{assistantEffortLine("claude-opus-4-5", "high"), assistantModelLine("claude-haiku-4-5")},
			want:  nil,
		},
		{
			name:  "only assistant lines record it",
			lines: []string{assistantEffortLine("claude-opus-4-5", "low"), `{"type":"api-request","effort":"max","params":{"output_config":{"effort":"max"}}}`},
			want:  ptr("low"),
		},
		{
			name:  "an open string is kept verbatim",
			lines: []string{assistantEffortLine("claude-opus-5", "ultracode")},
			want:  ptr("ultracode"),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			folder := filepath.Join(root, encodeProjectsDirName(dir))
			writePastTranscript(t, folder, "s1", append([]string{cwdLine(dir)}, tt.lines...)...)

			got, err := PastSessions(root, dir)
			require.NoError(t, err)
			assert.Equal(t, tt.want, mustFind(t, got, "s1").Effort)
		})
	}
}

// statusBodyWithEffort returns the pre-first-response status body with the raw JSON text of the
// effort key spliced into the inner payload; keyJSON "" leaves the payload without it.
func statusBodyWithEffort(t *testing.T, keyJSON string) []byte {
	t.Helper()
	payload := innerPayload(t, claudecodetest.EnvelopedStatusLinePreFirstResponse("claude-1", claudecodetest.StatusLinePreFirstResponseOpts{MusterSession: 1}))
	if keyJSON == "" {
		return payload
	}
	var m map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(payload, &m))
	m["effort"] = json.RawMessage(keyJSON)
	out, err := json.Marshal(m)
	require.NoError(t, err)
	return out
}

// TestInterpretStatus_Effort covers the reading: Effort is non-nil on every
// interpreted post, and Level is nil for an absent key (the measured shape of a model with
// no effort setting, kb:fact/status-line-effort-key) and for the defensive null, empty and
// wrong-shape readings; a level comes through verbatim.
func TestInterpretStatus_Effort(t *testing.T) {
	tests := []struct {
		name    string
		keyJSON string
		want    *string
	}{
		{"absent key", "", nil},
		{"low", `{"level":"low"}`, ptr("low")},
		{"xhigh", `{"level":"xhigh"}`, ptr("xhigh")},
		{"a level outside the five is verbatim", `{"level":"ultracode"}`, ptr("ultracode")},
		{"null level", `{"level":null}`, nil},
		{"empty level", `{"level":""}`, nil},
		{"object without level", `{}`, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := InterpretStatus(statusBodyWithEffort(t, tt.keyJSON))

			require.NotNil(t, got.Effort, "REQ-5: every interpreted post reports an effort reading")
			assert.Equal(t, tt.want, got.Effort.Level)
		})
	}

	t.Run("builder: a level and its absence on the full post", func(t *testing.T) {
		withLevel := InterpretStatus(innerPayload(t, claudecodetest.EnvelopedStatusLineFull("claude-1", claudecodetest.StatusLineFullOpts{EffortLevel: "high"})))
		require.NotNil(t, withLevel.Effort)
		assert.Equal(t, ptr("high"), withLevel.Effort.Level)

		without := InterpretStatus(innerPayload(t, claudecodetest.EnvelopedStatusLineFull("claude-1", claudecodetest.StatusLineFullOpts{})))
		require.NotNil(t, without.Effort)
		assert.Nil(t, without.Effort.Level)
	})
}

// TestInterpretStatus_EffortReadingsAreIndependent: the neutral reading owns its string,
// so a caller that keeps it is not tied to the decoder's buffers.
func TestInterpretStatus_EffortReadingsAreIndependent(t *testing.T) {
	payload := statusBodyWithEffort(t, `{"level":"high"}`)

	a := InterpretStatus(payload)
	b := InterpretStatus(payload)
	require.NotNil(t, a.Effort.Level)
	require.NotNil(t, b.Effort.Level)

	*a.Effort.Level = "changed"
	assert.Equal(t, "high", *b.Effort.Level)
}
