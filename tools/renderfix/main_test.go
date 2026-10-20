//go:build renderfix

package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/server"
)

func TestRun_RefusesBadUsage(t *testing.T) {
	for _, args := range [][]string{nil, {"gen", "extra"}, {"bogus"}} {
		var out bytes.Buffer
		err := run(args, &out)
		require.Error(t, err, "args %v", args)
		assert.Empty(t, out.String())
	}
}

func TestRun_ListPrintsEveryScenario(t *testing.T) {
	var out bytes.Buffer
	require.NoError(t, run([]string{"list"}, &out))
	assert.Equal(t, strings.Join(server.RenderScenarioNames(), "\n")+"\n", out.String())
}

func TestGenThenCheck_StaleMissingAndUnexpected(t *testing.T) {
	ctx := context.Background()
	dir := filepath.Join(t.TempDir(), "fixtures")

	var out bytes.Buffer
	require.NoError(t, cmdGen(ctx, dir, &out))
	for _, name := range server.RenderScenarioNames() {
		assert.Contains(t, out.String(), "wrote "+filepath.Join(dir, name+".json"))
	}

	out.Reset()
	require.NoError(t, cmdCheck(ctx, dir, &out))
	assert.Contains(t, out.String(), "up to date")

	stale := filepath.Join(dir, "three-states.json")
	data, err := os.ReadFile(stale)
	require.NoError(t, err)
	i := bytes.LastIndexByte(data, '}')
	require.Positive(t, i)
	data[i] = ']'
	require.NoError(t, os.WriteFile(stale, data, 0o644))
	missing := filepath.Join(dir, "empty.json")
	require.NoError(t, os.Remove(missing))
	unexpected := filepath.Join(dir, "retired.json")
	require.NoError(t, os.WriteFile(unexpected, []byte("{}\n"), 0o644))

	err = cmdCheck(ctx, dir, &out)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "stale: "+stale)
	assert.Contains(t, err.Error(), "missing: "+missing)
	assert.Contains(t, err.Error(), "unexpected: "+unexpected)
	assert.True(t, strings.HasSuffix(err.Error(), "run `make gen-render-fixtures`"), err.Error())

	out.Reset()
	require.NoError(t, cmdGen(ctx, dir, &out))
	assert.Contains(t, out.String(), "wrote "+stale)
	assert.Contains(t, out.String(), "wrote "+missing)
	assert.NotContains(t, out.String(), "groups.json")
}
