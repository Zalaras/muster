package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestComputeStats(t *testing.T) {
	att := func(s, f int) Attempt { return Attempt{Start: ts(s), Finish: sp(ts(f))} }
	tk := func(cost float64, out int64) Tokens { return Tokens{Cost: cost, Output: out, CacheRead: 10 * out} }
	feature := func(cost float64, reviews int) Run {
		rv := make([]Attempt, reviews)
		for i := range rv {
			rv[i] = att(20, 30)
		}
		total := tk(cost, 100)
		return Run{Kind: "orchestrate", Group: "done", StartedAt: ts(0), UpdatedAt: ts(60), Tokens: &total,
			Steps:      map[string][]Attempt{"web-impl": {att(0, 10), att(12, 20)}, "review": rv},
			StepTokens: map[string]Tokens{"web-impl": tk(cost/2, 50), "orchestrator": tk(cost/2, 50)}}
	}
	fix := Tokens{Cost: 3, Output: 30}
	batchTok := map[string]Tokens{"review": {Cost: 3}}
	runs := []Run{
		feature(10, 1), feature(30, 3),
		{Kind: "orchestrate", Group: "done", StartedAt: ts(0), UpdatedAt: ts(60)},                      // transcripts gone: left out
		{Kind: "orchestrate", Group: "active", StartedAt: ts(0), Tokens: &Tokens{Cost: 99, Output: 1}}, // not finished
		{Kind: "sweep", Group: "done", Batches: []Batch{
			{Status: "landed", StartedAt: ts(0), FinishedAt: ts(30), Tokens: &fix, StepTokens: batchTok,
				Steps: map[string][]Attempt{"review": {att(5, 15)}, "web-impl": {{Finish: sp(ts(4))}}}}, // finish-only attempt
			{Status: "failed", StartedAt: ts(0), FinishedAt: ts(30), Tokens: &fix},
		}},
	}
	s := computeStats(runs)

	assert.Equal(t, 2, s.Features.N)
	assert.InDelta(t, 20, s.Features.Cost, 1e-9)
	assert.InDelta(t, 60, s.Features.Minutes, 1e-9)
	assert.InDelta(t, 2, s.Features.Cycles, 1e-9)
	assert.InDelta(t, 1100, s.Features.Tokens, 1e-9)

	steps := map[string]StepAvg{}
	for _, r := range s.FeatureSteps {
		steps[r.Step] = r
	}
	assert.InDelta(t, 10, steps["web-impl"].Cost, 1e-9)
	assert.InDelta(t, 18, steps["web-impl"].Minutes, 1e-9, "both attempts' wall-clock")
	assert.InDelta(t, 2, steps["web-impl"].Attempts, 1e-9)
	assert.InDelta(t, 10, steps["orchestrator"].Cost, 1e-9)
	assert.Zero(t, steps["orchestrator"].Attempts, "a spend bucket is not a step")

	assert.Equal(t, 1, s.Fixes.N, "only landed batches")
	fixSteps := map[string]StepAvg{}
	for _, r := range s.FixSteps {
		fixSteps[r.Step] = r
	}
	assert.InDelta(t, 0, fixSteps["web-impl"].Minutes, 1e-9, "a finish-only attempt has no duration")
	assert.InDelta(t, 10, fixSteps["review"].Minutes, 1e-9)
}
