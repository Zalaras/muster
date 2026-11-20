package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// asst is one assistant transcript line with usage.
func asst(id string, at time.Time, cwd, model string, in, out, read, w5, w1 int64) string {
	b, _ := json.Marshal(map[string]any{
		"type": "assistant", "timestamp": at.Format(time.RFC3339Nano), "cwd": cwd,
		"message": map[string]any{"id": id, "model": model, "usage": map[string]any{
			"input_tokens": in, "output_tokens": out, "cache_read_input_tokens": read,
			"cache_creation_input_tokens": w5 + w1,
			"cache_creation":              map[string]any{"ephemeral_5m_input_tokens": w5, "ephemeral_1h_input_tokens": w1},
		}},
	})
	return string(b) + "\n"
}

func appendFile(t *testing.T, path string, lines ...string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	require.NoError(t, err)
	defer f.Close()
	for _, l := range lines {
		_, err = f.WriteString(l)
		require.NoError(t, err)
	}
}

// fixture lays out a projects dir for one worktree; returns the ledger, the tree and its dir.
func fixture(t *testing.T) (*Ledger, string, string) {
	t.Helper()
	root := t.TempDir()
	tree := filepath.Join(t.TempDir(), "muster-p")
	require.NoError(t, os.MkdirAll(tree, 0o755))
	l := newLedger(root)
	return l, tree, l.projectDir(tree)
}

func agent(t *testing.T, dir, id, typ string, lines ...string) {
	t.Helper()
	base := filepath.Join(dir, "sess", "subagents", "agent-"+id)
	appendFile(t, base+".jsonl", lines...)
	appendFile(t, base+".meta.json", fmt.Sprintf(`{"agentType":%q,"description":"d"}`, typ))
}

func TestLedgerCountsEachMessageOnceAndOnlyInsideTheWindow(t *testing.T) {
	l, tree, dir := fixture(t)
	from, to := t0, t0.Add(time.Hour)
	sess := filepath.Join(dir, "sess.jsonl")
	appendFile(t, sess,
		asst("m0", t0.Add(-time.Minute), tree, "claude-opus-5-5", 1, 1000, 0, 0, 0), // planning before the run
		asst("m1", t0.Add(time.Minute), tree, "claude-opus-5-5", 10, 100, 1000, 0, 50),
		asst("m1", t0.Add(time.Minute), tree, "claude-opus-5-5", 10, 100, 1000, 0, 50), // repeated line
	)
	// A session that never worked in the tree is not the run's, though it shares the folder.
	appendFile(t, filepath.Join(dir, "other.jsonl"), asst("m2", t0.Add(2*time.Minute), "/elsewhere", "claude-opus-5-5", 1, 999, 0, 0, 0))
	main, _ := l.window(tree, from, to)
	assert.Equal(t, Tokens{Input: 10, Output: 100, CacheRead: 1000, CacheWrite1h: 50,
		Cost: (10*4 + 100*20 + 1000*0.20 + 50*4*2) / 1e6}, main)

	// Appended lines are picked up on the next pass without re-reading the start.
	appendFile(t, sess, asst("m3", t0.Add(3*time.Minute), tree, "claude-opus-5-5", 0, 10, 0, 0, 0))
	main, _ = l.window(tree, from, to)
	assert.Equal(t, int64(110), main.Output)
}

func TestRunTokensAttributesAgentsToSteps(t *testing.T) {
	l, tree, dir := fixture(t)
	at := func(m int) time.Time { return t0.Add(time.Duration(m) * time.Minute) }
	agent(t, dir, "a1", "e2e-specs", asst("x1", at(1), tree, "claude-sonnet-5-5", 0, 100, 0, 0, 0))
	agent(t, dir, "a2", "daemon-impl", asst("x2", at(12), tree, "claude-sonnet-5-5", 0, 200, 0, 0, 0))
	agent(t, dir, "a3", "e2e-specs", asst("x3", at(41), tree, "claude-sonnet-5-5", 0, 300, 0, 0, 0)) // validate mode
	agent(t, dir, "a4", "review-work", asst("x4", at(51), tree, "claude-sonnet-5-5", 0, 400, 0, 0, 0))
	agent(t, dir, "a5", "comment-judge-c1", asst("x5", at(50), tree, "claude-sonnet-5-5", 0, 500, 0, 0, 0))
	agent(t, dir, "a6", "Explore", asst("x6", at(20), tree, "claude-haiku-5-5", 0, 600, 0, 0, 0))
	agent(t, dir, "a7", "web-impl", asst("x7", at(-30), tree, "claude-sonnet-5-5", 0, 9999, 0, 0, 0)) // an earlier run's

	steps := map[string][]Attempt{
		"e2e-specs":    {{Start: ts(0), Finish: sp(ts(10))}},
		"daemon-impl":  {{Start: ts(11), Finish: sp(ts(30))}},
		"e2e-validate": {{Start: ts(40), Finish: sp(ts(48))}},
		"review":       {{Start: ts(50)}},
	}
	by, total := l.RunTokens(tree, t0, at(60), steps)
	out := map[string]int64{}
	for k, v := range by {
		out[k] = v.Output
	}
	assert.Equal(t, map[string]int64{"e2e-specs": 100, "daemon-impl": 200, "e2e-validate": 300,
		"review": 400, "review › correctness": 400, "comment pass": 500, "other": 600}, out)
	assert.Equal(t, 1, by["review › correctness"].Agents, "a reviewer's share counts its spawns")
	assert.Equal(t, int64(2100), total.Output)
}

func TestPriceForPicksTheLongestPrefix(t *testing.T) {
	assert.Equal(t, prices["claude-opus-5-5"], priceFor("claude-opus-5-5"))
	assert.Equal(t, prices["claude-opus-5"], priceFor("claude-opus-5"))
	assert.Equal(t, prices["claude-haiku-4"], priceFor("claude-haiku-4-5-20251001"))
	assert.Equal(t, unknownModel, priceFor("something-new"))
}

func TestProjectDirEncoding(t *testing.T) {
	l := newLedger("/p")
	assert.Equal(t, "/p/-Users-bob-code-muster-run-dashboard", l.projectDir("/Users/bob/code/muster-run_dashboard"))
}

func TestLedgerFindsASessionThatLeftItsWorktree(t *testing.T) {
	root := t.TempDir()
	primary := filepath.Join(t.TempDir(), "muster")
	tree := primary + "-p"
	l := newLedger(root, primary)
	// ExitWorktree moved the whole transcript into the primary checkout's folder, and the
	// session kept orchestrating from there: its later messages and agents carry the primary.
	appendFile(t, filepath.Join(l.projectDir(primary), "sess.jsonl"),
		asst("m1", t0.Add(time.Minute), tree, "claude-opus-5-5", 0, 100, 0, 0, 0),
		asst("m2", t0.Add(2*time.Minute), primary, "claude-opus-5-5", 0, 900, 0, 0, 0))
	agent(t, l.projectDir(primary), "a1", "daemon-impl", asst("x1", t0.Add(3*time.Minute), tree, "claude-opus-5-5", 0, 50, 0, 0, 0))
	agent(t, l.projectDir(primary), "a2", "review-work", asst("x2", t0.Add(4*time.Minute), primary, "claude-opus-5-5", 0, 7, 0, 0, 0))
	// Another session in the primary checkout that never entered the tree is not the run's.
	appendFile(t, filepath.Join(l.projectDir(primary), "other.jsonl"), asst("o1", t0.Add(2*time.Minute), primary, "claude-opus-5-5", 0, 5000, 0, 0, 0))
	writeAgent := filepath.Join(l.projectDir(primary), "other", "subagents", "agent-a3")
	appendFile(t, writeAgent+".jsonl", asst("x3", t0.Add(3*time.Minute), primary, "claude-opus-5-5", 0, 5000, 0, 0, 0))
	appendFile(t, writeAgent+".meta.json", `{"agentType":"web-impl"}`)

	by, total := l.RunTokens(tree, t0, t0.Add(time.Hour), nil)
	assert.Equal(t, int64(1000), by["orchestrator"].Output, "all the run session's messages, before and after it left")
	assert.Equal(t, int64(7), by["review"].Output, "an agent the run's session spawned from the primary is the run's")
	assert.Equal(t, int64(1057), total.Output)
	assert.Equal(t, t0.Add(4*time.Minute).UTC(), l.LastActive(tree, t0, t0.Add(time.Hour)).UTC())
}

func TestLiveReadsRunningAgentsAndOpenGates(t *testing.T) {
	l, tree, dir := fixture(t)
	now := time.Now()
	use := func(id, cmd string) string {
		b, _ := json.Marshal(map[string]any{"type": "assistant", "timestamp": now.Format(time.RFC3339Nano), "cwd": tree,
			"message": map[string]any{"id": "m-" + id, "content": []map[string]any{{"type": "tool_use", "id": id, "name": "Bash", "input": map[string]any{"command": cmd}}}}})
		return string(b) + "\n"
	}
	result := func(id string) string {
		b, _ := json.Marshal(map[string]any{"type": "user", "timestamp": now.Format(time.RFC3339Nano), "cwd": tree,
			"message": map[string]any{"content": []map[string]any{{"type": "tool_result", "tool_use_id": id}}}})
		return string(b) + "\n"
	}
	sess := filepath.Join(dir, "sess.jsonl")
	appendFile(t, sess, use("t1", "GATES_LOG_DIR=x .claude/skills/orchestrate/scripts/gates.sh p"), use("t2", "ls"))
	agent(t, dir, "a1", "review-browser-c1", asst("x1", now, tree, "claude-opus-5-5", 0, 1, 0, 0, 0))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "sess", "subagents", "agent-a1.meta.json"),
		[]byte(`{"agentType":"review-browser-c1"}`), 0o644))
	agent(t, dir, "a2", "web-impl", asst("x2", now, tree, "claude-opus-5-5", 0, 1, 0, 0, 0))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "sess", "subagents", "agent-a2.meta.json"),
		[]byte(`{"agentType":"web-impl","finished":true}`), 0o644))

	assert.Equal(t, []string{"gates", ReviewPrefix + "browser"}, l.Live(tree, now.Add(-time.Hour), now))

	appendFile(t, sess, result("t1"))
	assert.Equal(t, []string{ReviewPrefix + "browser"}, l.Live(tree, now.Add(-time.Hour), now), "gates closed by its result")
}

func TestLiveKeepsBackgroundGatesOpenUntilNotified(t *testing.T) {
	l, tree, dir := fixture(t)
	now := time.Now()
	write := func(v map[string]any) string {
		v["timestamp"], v["cwd"] = now.Format(time.RFC3339Nano), tree
		b, _ := json.Marshal(v)
		return string(b) + "\n"
	}
	sess := filepath.Join(dir, "sess.jsonl")
	appendFile(t, sess,
		write(map[string]any{"type": "assistant", "message": map[string]any{"id": "m1", "content": []map[string]any{
			{"type": "tool_use", "id": "t3", "name": "Bash", "input": map[string]any{"command": ".claude/skills/orchestrate/scripts/gates.sh p", "run_in_background": true}}}}}),
		write(map[string]any{"type": "user", "message": map[string]any{"content": []map[string]any{
			{"type": "tool_result", "tool_use_id": "t3", "content": "Command running in background with ID: bk1. Output is being written to: x"}}}}))
	assert.Equal(t, []string{"gates"}, l.Live(tree, now.Add(-time.Hour), now), "a backgrounded call is still running after its immediate result")

	appendFile(t, sess, write(map[string]any{"type": "user", "message": map[string]any{
		"content": "<task-notification>\n<task-id>bk1</task-id>\n<tool-use-id>t3</tool-use-id>\n<status>completed</status>\n</task-notification>"}}))
	assert.Empty(t, l.Live(tree, now.Add(-time.Hour), now), "its task-notification ends it")
}

func TestLiveIgnoresReplayedRequestBlobs(t *testing.T) {
	l, tree, dir := fixture(t)
	now := time.Now()
	use := map[string]any{"type": "tool_use", "id": "t9", "name": "Bash", "input": map[string]any{"command": "gates.sh p"}}
	msg, _ := json.Marshal(map[string]any{"type": "assistant", "timestamp": now.Format(time.RFC3339Nano), "cwd": tree,
		"message": map[string]any{"id": "m9", "content": []any{use}}})
	blob, _ := json.Marshal(map[string]any{"type": "api-request-blob", "message": map[string]any{"content": []any{use}}})
	appendFile(t, filepath.Join(dir, "sess.jsonl"), string(msg)+"\n", string(blob)+"\n")
	assert.Equal(t, []string{"gates"}, l.Live(tree, now.Add(-time.Hour), now), "the replayed copy must not erase the call's time")
}
