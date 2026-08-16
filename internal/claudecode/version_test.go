package claudecode

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVersionRE(t *testing.T) {
	tests := []struct {
		name string
		out  string
		want string // "" means: expect no match
	}{
		{"native install format", "2.1.233 (Claude Code)", "2.1.233"},
		{"bare version", "2.1.233", "2.1.233"},
		{"multi-digit minor", "2.10.0 (Claude Code)", "2.10.0"},
		{"not a version", "command not found", ""},
		{"incomplete version", "2.1 (Claude Code)", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := versionRE.FindStringSubmatch(tt.out)
			if tt.want == "" {
				assert.Nil(t, m)
				return
			}
			require.NotNil(t, m)
			assert.Equal(t, tt.want, m[1])
		})
	}
}

func TestVersionDriftErrorIsMatchable(t *testing.T) {
	err := error(&VersionDriftError{Installed: "2.2.0", Pinned: PinnedVersion})

	var drift *VersionDriftError
	require.True(t, errors.As(err, &drift))
	assert.Equal(t, "2.2.0", drift.Installed)
	assert.Contains(t, err.Error(), PinnedVersion)
}
