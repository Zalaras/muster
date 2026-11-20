package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// gatesOut is the shape gates.sh prints, trimmed from a real run.
const gatesOut = `== baseline gates (plan p)
PASS  build go build ./...
NOTE  test scope: ./cmd/musterd
PASS  test make test PKG='./cmd/musterd'
FAIL  render-test make render-test
WARN  size size-warn.sh --changed  (1 hits — never fails)
== authored checks from plans/p/plan.md
FAIL  D2   make test
FAIL
PASS  E1   make e2e SPECS='e2e/terminals.spec.ts'
== summary: 31 lines, 2 failed, 1 warn-only; logs in /tmp/x
  FAIL	render-test	make render-test
  FAIL	D2	make test
`

func TestParseGates(t *testing.T) {
	g := parseGates(gatesOut)
	assert.Equal(t, 3, g.Pass)
	assert.Equal(t, 2, g.Fail, "the bare FAIL and the summary's repeats are not counted again")
	assert.Equal(t, 1, g.Warn)
	assert.Equal(t, []string{"render-test", "D2"}, g.Failed)
	assert.Equal(t, "E1", g.Last)
	assert.True(t, g.Done)

	partial := parseGates("== baseline gates (plan p)\nPASS  build go build ./...\n")
	assert.Equal(t, GateRun{Pass: 1, Last: "build"}, partial, "a run still going has no summary yet")
}

func TestGatesReadsForegroundAndBackgroundRuns(t *testing.T) {
	l, tree, dir := fixture(t)
	at := func(m int) string { return t0.Add(time.Duration(m) * time.Minute).Format(time.RFC3339Nano) }
	line := func(v map[string]any) string {
		v["cwd"] = tree
		b, _ := json.Marshal(v)
		return string(b) + "\n"
	}
	use := func(id string, m int) string {
		return line(map[string]any{"type": "assistant", "timestamp": at(m), "message": map[string]any{"id": "m" + id,
			"content": []map[string]any{{"type": "tool_use", "id": id, "name": "Bash", "input": map[string]any{"command": "scripts/gates.sh p"}}}}})
	}
	result := func(id string, m int, text string) string {
		return line(map[string]any{"type": "user", "timestamp": at(m), "message": map[string]any{
			"content": []map[string]any{{"type": "tool_result", "tool_use_id": id, "content": text}}}})
	}
	out := filepath.Join(t.TempDir(), "bk.output")
	require.NoError(t, os.WriteFile(out, []byte("== baseline gates (plan p)\nPASS  build go build ./...\nFAIL  lint make lint\n"), 0o644))
	appendFile(t, filepath.Join(dir, "sess.jsonl"),
		use("g1", 1), result("g1", 9, gatesOut), // foreground: the result carries the output
		use("g2", 20), result("g2", 20, "Command running in background with ID: bk. Output is being written to: "+out))

	runs := l.Gates(tree, t0, t0.Add(time.Hour), t0.Add(30*time.Minute))
	require.Len(t, runs, 2)
	assert.Equal(t, 2, runs[0].Fail)
	assert.NotEmpty(t, runs[0].End, "the foreground run ended with its result")
	assert.Empty(t, runs[1].End, "the backgrounded run is still going")
	assert.Equal(t, 1, runs[1].Pass, "read from its output file so far")
	assert.Equal(t, "lint", runs[1].Last)
}

func TestToolLabelRunsNotMentions(t *testing.T) {
	bash := func(cmd string) block { b := block{Name: "Bash"}; b.Input.Command = cmd; return b }
	for cmd, want := range map[string]string{
		"GATES_LOG_DIR=$TMPDIR/g-c1 .claude/skills/orchestrate/scripts/gates.sh p": "gates",
		"cd /x && .claude/skills/orchestrate/scripts/gates.sh p --full-e2e":        "gates",
		"bash .claude/skills/orchestrate/scripts/gates.sh p":                       "gates",
		"grep -n LOG_DIR .claude/skills/orchestrate/scripts/gates.sh":              "",
		"sed -n 1,40p .claude/skills/orchestrate/scripts/gates.sh":                 "",
		".claude/skills/orchestrate/scripts/gates.sh p --e2e-scope":                "",
		"D=$TMPDIR/gates-p-c1; grep -l x $D/*":                                     "",
		"make e2e SPECS='a.spec.ts'":                                               "e2e sweep",
	} {
		assert.Equal(t, want, toolLabel(bash(cmd)), cmd)
	}
}

func TestGatesPathsAndCurrentGate(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("TMPDIR", tmp)
	out, logDir := gatesPaths(`GATES_LOG_DIR=$TMPDIR/gates-p-c1c .claude/skills/orchestrate/scripts/gates.sh p > $TMPDIR/gates-p-c1c.out 2>&1; echo "exit $?" >> $TMPDIR/x`)
	assert.Equal(t, filepath.Join(tmp, "gates-p-c1c.out"), out)
	assert.Equal(t, filepath.Join(tmp, "gates-p-c1c"), logDir)

	require.NoError(t, os.MkdirAll(logDir, 0o755))
	for i, name := range []string{"01-build.log", "02-test.log", "03-e2e.log"} {
		f := filepath.Join(logDir, name)
		require.NoError(t, os.WriteFile(f, nil, 0o644))
		require.NoError(t, os.Chtimes(f, t0, t0.Add(time.Duration(i)*time.Minute)))
	}
	assert.Equal(t, "e2e", currentGate(logDir), "the newest log is the gate running now")
}
