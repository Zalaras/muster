package claudecode

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInterpretStatus_AddedDirs feeds InterpretStatus the workspace shapes
// kb:fact/added-dirs-in-status-line measured: the launch directory led the list spelled
// /tmp/... while project_dir read /private/tmp/..., entries verbatim and unresolved. The
// reported list reaches StatusUpdate untouched (normalising is the session package's job),
// and an absent or null key stays nil so "reported none" and "did not report" differ.
func TestInterpretStatus_AddedDirs(t *testing.T) {
	cases := []struct {
		name    string
		payload string
		want    *[]string
	}{
		{
			name:    "measured launch directory plus two added, order and spelling verbatim",
			payload: `{"workspace":{"added_dirs":["/tmp/muster-probe/instances/0/repo","/tmp/muster-probe/instances/0/extraB","/tmp/muster-probe/instances/0/extraA"],"current_dir":"/private/tmp/muster-probe/instances/0/repo","project_dir":"/private/tmp/muster-probe/instances/0/repo"}}`,
			want: &[]string{
				"/tmp/muster-probe/instances/0/repo", "/tmp/muster-probe/instances/0/extraB", "/tmp/muster-probe/instances/0/extraA",
			},
		},
		{
			name:    "launch directory alone",
			payload: `{"workspace":{"added_dirs":["/tmp/muster-probe/instances/0/repo"],"current_dir":"/private/tmp/muster-probe/instances/0/repo"}}`,
			want:    &[]string{"/tmp/muster-probe/instances/0/repo"},
		},
		{
			name:    "reported empty list is non-nil and empty",
			payload: `{"workspace":{"added_dirs":[],"current_dir":"/r"}}`,
			want:    &[]string{},
		},
		{
			name:    "relative and empty entries pass through for the session package to judge",
			payload: `{"workspace":{"added_dirs":["/r","sub",""],"current_dir":"/r"}}`,
			want:    &[]string{"/r", "sub", ""},
		},
		{name: "workspace without the key", payload: `{"workspace":{"current_dir":"/r","project_dir":"/r"}}`, want: nil},
		{name: "null key", payload: `{"workspace":{"added_dirs":null,"current_dir":"/r"}}`, want: nil},
		{name: "no workspace at all", payload: `{"cwd":"/r"}`, want: nil},
		{name: "empty payload", payload: `{}`, want: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := InterpretStatus([]byte(tc.payload))

			if tc.want == nil {
				assert.Nil(t, got.AddedDirs)
				return
			}
			require.NotNil(t, got.AddedDirs)
			assert.Equal(t, *tc.want, *got.AddedDirs)
		})
	}
}

// TestInterpretStatus_AddedDirsLeavesTheWorkingDirectoryAlone: reading the list must not
// disturb the directory Claude reports from the same workspace object.
func TestInterpretStatus_AddedDirsLeavesTheWorkingDirectoryAlone(t *testing.T) {
	got := InterpretStatus([]byte(`{"workspace":{"added_dirs":["/a","/b"],"current_dir":"/private/a"}}`))

	require.NotNil(t, got.Cwd)
	assert.Equal(t, "/private/a", *got.Cwd)
	require.NotNil(t, got.AddedDirs)
	assert.Equal(t, []string{"/a", "/b"}, *got.AddedDirs)
}
