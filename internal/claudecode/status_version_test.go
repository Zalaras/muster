package claudecode

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// TestInterpretStatus_Version feeds InterpretStatus the status-line `version` shapes
// (kb:fact/status-version-matches-installed: the top-level string equals `claude --version`)
// and the absences: a missing key, an explicit null, an empty or unparseable string and a
// non-string value all leave Version nil.
func TestInterpretStatus_Version(t *testing.T) {
	cases := []struct {
		name    string
		payload string
		want    string
	}{
		{"measured bare version", `{"version":"2.1.317","session_id":"s"}`, "2.1.317"},
		{"suffix is dropped to the leading triple", `{"version":"2.1.317 (Claude Code)"}`, "2.1.317"},
		{"stub pre-release suffix", `{"version":"2.1.318-e2e-stub"}`, "2.1.318"},
		{"multi-digit minor", `{"version":"2.10.0"}`, "2.10.0"},
		{"key missing", `{"session_id":"s"}`, ""},
		{"explicit null", `{"version":null}`, ""},
		{"empty string", `{"version":""}`, ""},
		{"two components is not a version", `{"version":"2.1"}`, ""},
		{"not a version", `{"version":"unknown"}`, ""},
		{"a number is not a version", `{"version":2}`, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := InterpretStatus([]byte(tc.payload))
			if tc.want == "" {
				assert.Nil(t, got.Version)
				return
			}
			require.NotNil(t, got.Version)
			assert.Equal(t, tc.want, *got.Version)
		})
	}
}

// TestInterpretStatus_VersionBesideTheRestOfThePost: the version rides on a real post shape
// and a non-string version costs the other fields nothing.
func TestInterpretStatus_VersionBesideTheRestOfThePost(t *testing.T) {
	body := claudecodetest.EnvelopedStatusLineFull("claude-1", claudecodetest.StatusLineFullOpts{SessionName: "My Session", Version: "2.1.317"})

	got := InterpretStatus(innerPayload(t, body))

	require.NotNil(t, got.Version)
	assert.Equal(t, "2.1.317", *got.Version)
	require.NotNil(t, got.Title)
	assert.Equal(t, "My Session", *got.Title)
	require.NotNil(t, got.Context)

	broken := InterpretStatus([]byte(`{"version":{"x":1},"session_name":"kept","model":{"id":"m","display_name":"M"}}`))
	assert.Nil(t, broken.Version)
	require.NotNil(t, broken.Title)
	assert.Equal(t, "kept", *broken.Title)
	require.NotNil(t, broken.Model)
}
