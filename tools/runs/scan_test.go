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

var t0 = time.Date(2026, 11, 19, 19, 0, 0, 0, time.UTC)

func ts(m int) string     { return t0.Add(time.Duration(m) * time.Minute).Format(time.RFC3339) }
func sp(s string) *string { return &s }

// write puts plans/<plan>/<file> into tree, JSON-encoding v unless it is a string.
func write(t *testing.T, tree, plan, file string, v any) {
	t.Helper()
	dir := filepath.Join(tree, "plans", plan)
	require.NoError(t, os.MkdirAll(dir, 0o755))
	b, ok := v.(string)
	if !ok {
		raw, err := json.Marshal(v)
		require.NoError(t, err)
		b = string(raw)
	}
	require.NoError(t, os.WriteFile(filepath.Join(dir, file), []byte(b), 0o644))
}

func state(status string, updated int, steps map[string][]Attempt) orchState {
	return orchState{Status: status, CurrentStep: "review", StartedAt: ts(0), UpdatedAt: ts(updated), StepAttempts: steps}
}

func env(now int) Env {
	return Env{Now: t0.Add(time.Duration(now) * time.Minute), Stale: 30 * time.Minute, Done: 6}
}

func byName(s Snapshot) map[string]Run {
	m := map[string]Run{}
	for _, r := range s.Runs {
		m[r.Name] = r
	}
	return m
}

func TestParseWorktrees(t *testing.T) {
	out := "worktree /r/muster\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/muster-x\nHEAD def\nbranch refs/heads/plan/x\n\nworktree /r/muster-d\nHEAD 123\ndetached\n"
	assert.Equal(t, []Tree{
		{Path: "/r/muster", Branch: "main", Primary: true},
		{Path: "/r/muster-x", Branch: "plan/x"},
		{Path: "/r/muster-d"},
	}, parseWorktrees([]byte(out)))
}

func TestScanGroupsOrchestrateRuns(t *testing.T) {
	running := map[string][]Attempt{"e2e-specs": {{Start: ts(0), Finish: sp(ts(10))}}, "daemon-impl": {{Start: ts(10)}}}
	cases := []struct {
		name      string
		status    string
		updated   int
		inTree    bool // the plan's own plan/<name> worktree exists
		activity  int  // minutes; -1 = none
		now       int
		wantGroup string // "" = not listed
	}{
		{"completed is done", "completed", 50, false, -1, 60, "done"},
		{"fresh in-progress is active", "in-progress", 50, true, -1, 60, "active"},
		{"untouched in-progress needs attention", "in-progress", 10, true, -1, 60, "attn"},
		{"file activity keeps a quiet run active", "in-progress", 10, true, 55, 60, "active"},
		{"blocked needs attention", "blocked", 55, true, -1, 60, "attn"},
		{"leftover in-progress without its worktree is history", "in-progress", 50, false, -1, 60, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			primary, wt := t.TempDir(), t.TempDir()
			trees := []Tree{{Path: primary, Branch: "main", Primary: true}}
			at := primary
			if c.inTree {
				trees = append(trees, Tree{Path: wt, Branch: "plan/p"})
				at = wt
			}
			write(t, at, "p", "orchestration-state.json", state(c.status, c.updated, running))
			e := env(c.now)
			e.Activity = func(string) time.Time {
				if c.activity < 0 {
					return time.Time{}
				}
				return t0.Add(time.Duration(c.activity) * time.Minute)
			}
			r, ok := byName(Scan(trees, e))["p"]
			if c.wantGroup == "" {
				assert.False(t, ok, "listed as %+v", r)
				return
			}
			require.True(t, ok)
			assert.Equal(t, c.wantGroup, r.Group)
			if c.wantGroup == "attn" {
				assert.NotEmpty(t, r.Alert)
			}
		})
	}
}

func TestScanPrefersNewestCopyOfAPlan(t *testing.T) {
	primary, wt := t.TempDir(), t.TempDir()
	write(t, primary, "p", "orchestration-state.json", state("in-progress", 5, nil))
	write(t, wt, "p", "orchestration-state.json", state("in-progress", 50, nil))
	s := Scan([]Tree{{Path: primary, Branch: "main", Primary: true}, {Path: wt, Branch: "plan/p"}}, env(55))
	r := byName(s)["p"]
	assert.Equal(t, ts(50), r.UpdatedAt)
	assert.Equal(t, wt, r.Tree)
}

func TestScanSweeps(t *testing.T) {
	batch := func(n int, status string, pid int) sweepBatch {
		return sweepBatch{N: n, Name: "sw-" + string(rune('0'+n)), Status: status, PID: pid, Question: nil}
	}
	cases := []struct {
		name      string
		batches   []sweepBatch
		wantGroup string
	}{
		{"all landed is done", []sweepBatch{batch(1, "landed", 0), batch(2, "landed", 0)}, "done"},
		{"a live running batch is active", []sweepBatch{batch(1, "landed", 0), batch(2, "running", 7)}, "active"},
		{"pending only is active", []sweepBatch{batch(1, "pending", 0)}, "active"},
		{"a failed batch needs attention", []sweepBatch{batch(1, "failed", 0), batch(2, "pending", 0)}, "attn"},
		{"a running batch whose process exited needs attention", []sweepBatch{batch(1, "running", 99)}, "attn"},
		{"completed without landing needs attention", []sweepBatch{batch(1, "completed", 0)}, "attn"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			primary := t.TempDir()
			write(t, primary, "sw", "sweep-state.json", sweepState{Sweep: "sw", StartedAt: ts(0), UpdatedAt: ts(5), Batches: c.batches})
			e := env(10)
			e.Alive = func(pid int) bool { return pid == 7 }
			r := byName(Scan([]Tree{{Path: primary, Branch: "main", Primary: true}}, e))["sw"]
			assert.Equal(t, "sweep", r.Kind)
			assert.Equal(t, c.wantGroup, r.Group)
		})
	}
}

func TestScanFoldsBatchIntoItsSweep(t *testing.T) {
	primary, wt := t.TempDir(), t.TempDir()
	write(t, primary, "sw", "sweep-state.json", sweepState{Sweep: "sw", StartedAt: ts(0), UpdatedAt: ts(5),
		Batches: []sweepBatch{{N: 1, Name: "sw-1", Status: "running", PID: 7, Question: sp("keep the colour?")}}})
	write(t, wt, "sw-1", "orchestration-state.json", orchState{Status: "in-progress", CurrentStep: "web-impl",
		StartedAt: ts(1), UpdatedAt: ts(4), StepAttempts: map[string][]Attempt{"web-impl": {{Start: ts(2)}}}})
	e := env(10)
	e.Alive = func(int) bool { return true }
	s := Scan([]Tree{{Path: primary, Branch: "main", Primary: true}, {Path: wt, Branch: "plan/sw-1"}}, e)
	runs := byName(s)
	_, listed := runs["sw-1"]
	assert.False(t, listed, "a batch is shown inside its sweep, not as its own run")
	b := runs["sw"].Batches[0]
	assert.Equal(t, "web-impl", b.Step)
	assert.Equal(t, ts(2), b.StepSince)
	assert.True(t, b.Alive)
}

func TestSkipped(t *testing.T) {
	started := func(steps ...string) map[string][]Attempt {
		m := map[string][]Attempt{}
		for _, s := range steps {
			m[s] = []Attempt{{Start: ts(0)}}
		}
		return m
	}
	cases := []struct {
		name  string
		plan  string
		steps map[string][]Attempt
		want  []string
	}{
		{"full-stack before the join skips nothing", "**Work Type**: full-stack\n", started("e2e-specs", "daemon-impl"), nil},
		{"web plan skips the daemon track", "**Work Type**: web\n", started("web-impl"), []string{"daemon-impl", "daemon-tests"}},
		{"daemon plan skips the web track", "**Work Type**: daemon\n", nil, []string{"web-impl", "web-tests", "render-tests"}},
		{"E2E scope none skips both E2E steps", "**Work Type**: full-stack\n**E2E Scope**: `none`\n", nil, []string{"e2e-specs", "e2e-validate"}},
		{"a step never started once review began was skipped", "", started("e2e-specs", "daemon-impl", "web-impl", "daemon-tests", "web-tests", "e2e-validate", "review"), []string{"render-tests"}},
		{"a step that ran is never skipped, whatever the plan says", "**Work Type**: web\n", started("daemon-impl"), []string{"daemon-tests"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			if c.plan != "" {
				require.NoError(t, os.WriteFile(filepath.Join(dir, "plan.md"), []byte(c.plan), 0o644))
			}
			assert.Equal(t, c.want, skipped(dir, orchState{StepAttempts: c.steps}))
		})
	}
}

func TestScanKeepsOnlyTheNewestFinishedRuns(t *testing.T) {
	primary := t.TempDir()
	for i, p := range []string{"a", "b", "c"} {
		write(t, primary, p, "orchestration-state.json", state("completed", i, nil))
	}
	e := env(10)
	e.Done = 2
	var names []string
	for _, r := range Scan([]Tree{{Path: primary, Branch: "main", Primary: true}}, e).Runs {
		names = append(names, r.Name)
	}
	assert.Equal(t, []string{"c", "b"}, names)
}

func TestHubPushesOnlyRealChanges(t *testing.T) {
	h := newHub()
	c, cancel := h.subscribe()
	defer cancel()
	snap := Snapshot{Now: ts(0), Runs: []Run{{Name: "p", Group: "active"}}}
	assert.True(t, h.publish(snap))
	<-c
	snap.Now = ts(1)
	assert.False(t, h.publish(snap), "a clock tick alone is not a change")
	snap.Runs[0].Group = "attn"
	assert.True(t, h.publish(snap))
	<-c
}

func TestParseUsage(t *testing.T) {
	assert.Equal(t, &Usage{FiveHour: 29, FiveHourResets: "2026-11-20T00:40:00Z", Weekly: 23},
		parseUsage("29.0|2026-11-20T00:40:00Z|23.0\n"))
	assert.Nil(t, parseUsage(""), "no sample yet")
	assert.Nil(t, parseUsage("x|y|z"))
}
