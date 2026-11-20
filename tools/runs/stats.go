package main

import (
	"strings"
	"time"
)

// Avg is the mean of one kind of finished work, over the N runs that still have transcripts.
type Avg struct {
	N       int     `json:"n"`
	Cost    float64 `json:"cost"`
	Tokens  float64 `json:"tokens"`
	Output  float64 `json:"output"`
	Minutes float64 `json:"minutes"`
	Cycles  float64 `json:"cycles,omitempty"` // review attempts, features only
}

// StepAvg is one pipeline step (or spend bucket) averaged over the runs that ran it.
type StepAvg struct {
	Step     string  `json:"step"`
	N        int     `json:"n"`
	Cost     float64 `json:"cost"`
	Tokens   float64 `json:"tokens"`
	Minutes  float64 `json:"minutes,omitempty"`  // agent wall-clock, summed over attempts
	Attempts float64 `json:"attempts,omitempty"` // 0 for a bucket that is not a step
	Parent   string  `json:"parent,omitempty"`   // set on a part of a step (a reviewer of "review")
}

// Stats are averages over every finished run with transcripts: /orchestrate runs (features)
// and landed /fix batches (fixes), whole and by step.
type Stats struct {
	Features     Avg       `json:"features"`
	Fixes        Avg       `json:"fixes"`
	FeatureSteps []StepAvg `json:"featureSteps"`
	FixSteps     []StepAvg `json:"fixSteps"`
	Since        string    `json:"since,omitempty"` // oldest run counted
}

// unit is one finished piece of work, feature or fix, as the averages see it.
type unit struct {
	start, end time.Time
	steps      map[string][]Attempt
	by         map[string]Tokens
	total      Tokens
}

func allTokens(t Tokens) float64 {
	return float64(t.Input + t.Output + t.CacheRead + t.CacheWrite5m + t.CacheWrite1h)
}

// buckets are the spend rows after the pipeline steps.
var buckets = []string{"orchestrator", "comment pass", "decisions", "other"}

// computeStats averages the finished runs. A run without transcript spend (older than Claude
// Code keeps transcripts) is left out of every average, time included, so the rows agree.
func computeStats(runs []Run) Stats {
	var features, fixes []unit
	for _, r := range runs {
		if r.Group != "done" {
			continue
		}
		if r.Kind == "orchestrate" && r.Tokens != nil && r.Tokens.Cost > 0 {
			features = append(features, unit{parse(r.StartedAt), parse(r.UpdatedAt), r.Steps, r.StepTokens, *r.Tokens})
		}
		if r.Kind == "sweep" {
			for _, b := range r.Batches {
				if b.Status == "landed" && b.Tokens != nil && b.Tokens.Cost > 0 {
					fixes = append(fixes, unit{parse(b.StartedAt), parse(b.FinishedAt), b.Steps, b.StepTokens, *b.Tokens})
				}
			}
		}
	}
	s := Stats{Features: average(features), Fixes: average(fixes),
		FeatureSteps: stepAverages(features), FixSteps: stepAverages(fixes)}
	var oldest time.Time
	for _, u := range append(append([]unit{}, features...), fixes...) {
		if oldest.IsZero() || u.start.Before(oldest) {
			oldest = u.start
		}
	}
	s.Since = stamp(oldest)
	return s
}

func average(us []unit) Avg {
	a := Avg{N: len(us)}
	if a.N == 0 {
		return a
	}
	for _, u := range us {
		a.Cost += u.total.Cost
		a.Tokens += allTokens(u.total)
		a.Output += float64(u.total.Output)
		a.Minutes += u.end.Sub(u.start).Minutes()
		a.Cycles += float64(len(u.steps["review"]))
	}
	n := float64(a.N)
	a.Cost, a.Tokens, a.Output, a.Minutes, a.Cycles = a.Cost/n, a.Tokens/n, a.Output/n, a.Minutes/n, a.Cycles/n
	return a
}

// stepAverages averages each step over the runs that ran it, then each spend bucket over the
// runs that spent in it.
func stepAverages(us []unit) []StepAvg {
	var out []StepAvg
	for _, step := range Steps {
		var s StepAvg
		s.Step = step
		for _, u := range us {
			at := u.steps[step]
			if len(at) == 0 {
				continue
			}
			s.N++
			s.Attempts += float64(len(at))
			for _, a := range at {
				if a.Finish != nil && a.Start != "" { // older states logged finish-only attempts
					s.Minutes += parse(*a.Finish).Sub(parse(a.Start)).Minutes()
				}
			}
			s.Cost += u.by[step].Cost
			s.Tokens += allTokens(u.by[step])
		}
		if s.N > 0 {
			n := float64(s.N)
			s.Attempts, s.Minutes, s.Cost, s.Tokens = s.Attempts/n, s.Minutes/n, s.Cost/n, s.Tokens/n
			out = append(out, s)
			if step == "review" {
				out = append(out, reviewerAverages(us)...)
			}
		}
	}
	for _, b := range buckets {
		s := StepAvg{Step: b}
		for _, u := range us {
			if t, ok := u.by[b]; ok && t.Cost > 0 {
				s.N++
				s.Cost += t.Cost
				s.Tokens += allTokens(t)
			}
		}
		if s.N > 0 {
			s.Cost, s.Tokens = s.Cost/float64(s.N), s.Tokens/float64(s.N)
			out = append(out, s)
		}
	}
	return out
}

// reviewerAverages splits the review step into its parts: per reviewer, averaged over the runs
// it reviewed, with Attempts counting how many times it was spawned and Minutes its agents' time.
func reviewerAverages(us []unit) []StepAvg {
	names := append([]string{}, Reviewers...)
	seen := map[string]bool{}
	for _, n := range names {
		seen[n] = true
	}
	for _, u := range us {
		for k := range u.by {
			if n, ok := strings.CutPrefix(k, ReviewPrefix); ok && !seen[n] {
				seen[n] = true
				names = append(names, n)
			}
		}
	}
	var out []StepAvg
	for _, name := range names {
		s := StepAvg{Step: ReviewPrefix + name, Parent: "review"}
		for _, u := range us {
			t, ok := u.by[s.Step]
			if !ok || t.Agents == 0 {
				continue
			}
			s.N++
			s.Cost += t.Cost
			s.Tokens += allTokens(t)
			s.Minutes += t.Minutes
			s.Attempts += float64(t.Agents)
		}
		if s.N > 0 {
			n := float64(s.N)
			s.Cost, s.Tokens, s.Minutes, s.Attempts = s.Cost/n, s.Tokens/n, s.Minutes/n, s.Attempts/n
			out = append(out, s)
		}
	}
	return out
}
