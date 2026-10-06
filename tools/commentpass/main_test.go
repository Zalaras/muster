package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func chdirRoot(t *testing.T) {
	t.Helper()
	root := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(root, "go.mod"), []byte("module fixture\n"), 0o644))
	t.Chdir(root)
}

func TestRun_RefusalPaths(t *testing.T) {
	chdirRoot(t)
	cases := map[string]struct {
		args []string
		want string
	}{
		"no args":             {nil, "usage: commentpass"},
		"no plan":             {[]string{"strip"}, "usage: commentpass"},
		"unknown subcommand":  {[]string{"judge", "x"}, `unknown subcommand "judge"`},
		"strip without out":   {[]string{"strip", "x"}, "--out DIR is required"},
		"apply without flags": {[]string{"apply", "x", "v.json"}, "usage: commentpass apply"},
		"apply without cycle": {[]string{"apply", "x", "v.json", "--message", "m"}, "usage: commentpass apply"},
		"verify extra arg":    {[]string{"verify", "x", "extra"}, "usage: commentpass verify"},
		"drop without ref":    {[]string{"drop", "x", "--cycle", "1", "--message", "m"}, "usage: commentpass drop"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			var out bytes.Buffer
			err := run(tc.args, &out)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.want)
		})
	}
}

func TestRun_RequiresRepoRoot(t *testing.T) {
	t.Chdir(t.TempDir())
	err := run([]string{"verify", "x"}, &bytes.Buffer{})
	require.ErrorContains(t, err, "must run from the repo root")
}

func TestParseMixed_FlagsAfterPositionals(t *testing.T) {
	chdirRoot(t)
	var out bytes.Buffer
	err := run([]string{"drop", "x", "internal/a.go:3", "--cycle", "2", "--message", "m"}, &out)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "usage:", "flags after the positional parse; the failure is git's")
}
