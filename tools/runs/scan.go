package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Steps is the pipeline order orch-state.py's STEPS uses.
var Steps = []string{"e2e-specs", "daemon-impl", "web-impl", "daemon-tests", "web-tests", "render-tests",
	"e2e-validate", "review", "doc-reconcile"}

// joinSteps run after both tracks; once one has started, any earlier step never started was skipped.
var joinSteps = map[string]bool{"e2e-validate": true, "review": true, "doc-reconcile": true}

// Tree is one git worktree: its path and the branch it has checked out ("" when detached).
type Tree struct {
	Path    string
	Branch  string
	Primary bool
}

// Attempt is one entry of step_attempts[<step>].
type Attempt struct {
	Start       string   `json:"start"`
	Finish      *string  `json:"finish"`
	UsageStart  *float64 `json:"usage_start,omitempty"`
	UsageFinish *float64 `json:"usage_finish,omitempty"`
}

type orchState struct {
	PlanName       string               `json:"plan_name"`
	Status         string               `json:"status"`
	CurrentStep    string               `json:"current_step"`
	RetryCounts    map[string]int       `json:"retry_counts"`
	CompletedSteps []string             `json:"completed_steps"`
	StepAttempts   map[string][]Attempt `json:"step_attempts"`
	StartedAt      string               `json:"started_at"`
	UpdatedAt      string               `json:"updated_at"`
}

type sweepBatch struct {
	N          int     `json:"n"`
	Name       string  `json:"name"`
	WorkType   string  `json:"work_type"`
	Status     string  `json:"status"`
	Worktree   string  `json:"worktree"`
	PID        int     `json:"pid"`
	StartedAt  *string `json:"started_at"`
	FinishedAt *string `json:"finished_at"`
	Subject    *string `json:"subject"`
	LandedSHA  *string `json:"landed_sha"`
	Error      *string `json:"error"`
	Question   *string `json:"question"`
}

type sweepState struct {
	Sweep     string       `json:"sweep"`
	Parallel  int          `json:"parallel"`
	StartedAt string       `json:"started_at"`
	UpdatedAt string       `json:"updated_at"`
	Batches   []sweepBatch `json:"batches"`
}

// Run is one row of the dashboard: an /orchestrate run or a /fix sweep.
type Run struct {
	Name        string               `json:"name"`
	Kind        string               `json:"kind"`  // "orchestrate" | "sweep"
	Group       string               `json:"group"` // "active" | "attn" | "done"
	Status      string               `json:"status"`
	Tree        string               `json:"tree"`
	Branch      string               `json:"branch"`
	StartedAt   string               `json:"startedAt"`
	UpdatedAt   string               `json:"updatedAt"`
	Activity    string               `json:"activity,omitempty"` // newest sign of work in the tree
	CurrentStep string               `json:"currentStep,omitempty"`
	Steps       map[string][]Attempt `json:"steps,omitempty"`
	Skipped     []string             `json:"skipped,omitempty"`
	Retries     map[string]int       `json:"retries,omitempty"`
	Batches     []Batch              `json:"batches,omitempty"`
	Parallel    int                  `json:"parallel,omitempty"`
	Alert       string               `json:"alert,omitempty"`
	Question    string               `json:"question,omitempty"`
	Outcome     string               `json:"outcome,omitempty"`
	Tokens      *Tokens              `json:"tokens,omitempty"`     // the run's whole spend
	StepTokens  map[string]Tokens    `json:"stepTokens,omitempty"` // by step, plus "orchestrator" and "other"
	Live        []string             `json:"live,omitempty"`       // running now, read from the sessions
}

// Batch is one batch of a sweep, with the step its own orchestration state is on.
type Batch struct {
	N          int      `json:"n"`
	Name       string   `json:"name"`
	WorkType   string   `json:"workType"`
	Status     string   `json:"status"`
	Alive      bool     `json:"alive"`
	Step       string   `json:"step,omitempty"`
	StepSince  string   `json:"stepSince,omitempty"`
	StartedAt  string   `json:"startedAt,omitempty"`
	FinishedAt string   `json:"finishedAt,omitempty"`
	Subject    string   `json:"subject,omitempty"`
	LandedSHA  string   `json:"landedSha,omitempty"`
	Error      string   `json:"error,omitempty"`
	Question   string   `json:"question,omitempty"`
	Tokens     *Tokens  `json:"tokens,omitempty"`
	Live       []string `json:"live,omitempty"` // running now, read from the batch's sessions
	// The batch's own pipeline, from the orchestration-state.json its fix-batch writes once planned.
	Steps      map[string][]Attempt `json:"steps,omitempty"`
	Skipped    []string             `json:"skipped,omitempty"`
	StepTokens map[string]Tokens    `json:"stepTokens,omitempty"`
	worktree   string
}

// Snapshot is everything the page renders.
type Snapshot struct {
	Now        string `json:"now"`
	StaleAfter int    `json:"staleAfterMin"`
	Usage      *Usage `json:"usage,omitempty"`
	Trees      int    `json:"trees"`
	Runs       []Run  `json:"runs"`
	Stats      *Stats `json:"stats,omitempty"`
}

// Env is the scanner's view of the outside world, injectable for tests.
type Env struct {
	Now      time.Time
	Stale    time.Duration
	Done     int                         // how many finished runs to list
	Alive    func(pid int) bool          // is a sweep batch's process still running
	Activity func(tree string) time.Time // newest sign of work in a tree (zero = unknown)
	Usage    func() *Usage               // latest rate-limit sample, nil if unknown
	Tokens   TokenSource                 // transcript spend; nil leaves runs without it
}

// TokenSource reads what sessions in a worktree spent, from Claude Code's transcripts.
type TokenSource interface {
	RunTokens(tree string, from, to time.Time, steps map[string][]Attempt) (map[string]Tokens, Tokens)
	Live(tree string, now time.Time) []string
}

// Usage is the account's latest rate-limit sample. Account-wide: it is never one run's cost.
type Usage struct {
	FiveHour       float64 `json:"fiveHour"`
	FiveHourResets string  `json:"fiveHourResets"`
	Weekly         float64 `json:"weekly"`
}

type found[T any] struct {
	state T
	tree  Tree
	dir   string
}

// Scan reads every tree's plans/ and builds the snapshot.
func Scan(trees []Tree, env Env) Snapshot {
	orch, sweeps := collect(trees)
	branches := map[string]Tree{}
	for _, t := range trees {
		if t.Branch != "" {
			branches[t.Branch] = t
		}
	}
	runs := buildRuns(orch, sweeps, branches, env)
	var stats *Stats
	if env.Tokens != nil {
		addTokens(runs, trees, env) // every run, so the averages see all finished work
		s := computeStats(runs)
		stats = &s
	}
	runs = trimDone(runs, env.Done)
	sort.SliceStable(runs, func(i, j int) bool {
		gi, gj := groupRank(runs[i].Group), groupRank(runs[j].Group)
		if gi != gj {
			return gi < gj
		}
		if runs[i].Group == "done" {
			return runs[i].UpdatedAt > runs[j].UpdatedAt
		}
		return runs[i].StartedAt > runs[j].StartedAt
	})
	var usage *Usage
	if env.Usage != nil {
		usage = env.Usage()
	}
	return Snapshot{Now: stamp(env.Now), StaleAfter: int(env.Stale.Minutes()), Usage: usage, Trees: len(trees), Runs: runs, Stats: stats}
}

// buildRuns turns each sweep and each plan that is not one of a sweep's batches into a row.
func buildRuns(orch map[string]found[orchState], sweeps map[string]found[sweepState], branches map[string]Tree, env Env) []Run {
	var runs []Run
	batchNames := map[string]bool{}
	for _, f := range sweeps {
		for _, b := range f.state.Batches {
			batchNames[b.Name] = true
		}
		runs = append(runs, sweepRun(f, orch, env))
	}
	for name, f := range orch {
		if batchNames[name] {
			continue
		}
		if r, ok := orchRun(name, f, branches, env); ok {
			runs = append(runs, r)
		}
	}
	return runs
}

// collect reads every tree's plans/*/ state files, keeping the newest copy of each plan and sweep.
func collect(trees []Tree) (map[string]found[orchState], map[string]found[sweepState]) {
	orch := map[string]found[orchState]{}
	sweeps := map[string]found[sweepState]{}
	for _, t := range trees {
		dirs, _ := filepath.Glob(filepath.Join(t.Path, "plans", "*"))
		for _, d := range dirs {
			var o orchState
			if readJSON(filepath.Join(d, "orchestration-state.json"), &o) {
				name := filepath.Base(d)
				if cur, ok := orch[name]; !ok || newer(o.UpdatedAt, cur.state.UpdatedAt, t, cur.tree) {
					orch[name] = found[orchState]{o, t, d}
				}
			}
			var s sweepState
			if readJSON(filepath.Join(d, "sweep-state.json"), &s) {
				name := filepath.Base(d)
				if cur, ok := sweeps[name]; !ok || s.UpdatedAt > cur.state.UpdatedAt {
					sweeps[name] = found[sweepState]{s, t, d}
				}
			}
		}
	}
	return orch, sweeps
}

// newer prefers the later updated_at; on a tie, the copy in the tree on the plan's own branch.
func newer(a, b string, ta, tb Tree) bool {
	if a != b {
		return a > b
	}
	return !ta.Primary && tb.Primary
}

func orchRun(name string, f found[orchState], branches map[string]Tree, env Env) (Run, bool) {
	s := f.state
	r := Run{
		Name: name, Kind: "orchestrate", Status: s.Status, Tree: f.tree.Path, Branch: f.tree.Branch,
		StartedAt: s.StartedAt, UpdatedAt: s.UpdatedAt, CurrentStep: s.CurrentStep,
		Steps: s.StepAttempts, Retries: s.RetryCounts,
	}
	r.Skipped = skipped(f.dir, s)
	switch s.Status {
	case "completed":
		r.Group = "done"
		r.Outcome = "completed"
		if n := len(s.StepAttempts["review"]); n > 1 {
			r.Outcome += " · " + itoa(n) + " review cycles"
		}
		return r, true
	case "in-progress", "blocked":
		// A live run sits in a tree on plan/<name>; a leftover in-progress state without one is history.
		t, ok := branches["plan/"+name]
		if !ok {
			return r, false
		}
		if t.Path != f.tree.Path {
			r.Tree, r.Branch = t.Path, t.Branch
		}
		if s.Status == "blocked" {
			r.Group, r.Alert = "attn", "Blocked: the orchestrator stopped and is waiting on you."
			return r, true
		}
		last := parse(s.UpdatedAt)
		if env.Activity != nil {
			if a := env.Activity(r.Tree); a.After(last) {
				last = a
			}
		}
		r.Activity = stamp(last)
		r.Group = "active"
		if !last.IsZero() && env.Stale > 0 && env.Now.Sub(last) > env.Stale {
			r.Group = "attn"
			r.Alert = "No state write or file change in the tree for " + mins(env.Now.Sub(last)) + ". The session may be waiting on you."
		}
		return r, true
	}
	return r, false
}

func sweepRun(f found[sweepState], orch map[string]found[orchState], env Env) Run {
	s := f.state
	r := Run{
		Name: s.Sweep, Kind: "sweep", Tree: f.tree.Path, Branch: "parallel " + itoa(max(s.Parallel, 1)),
		StartedAt: s.StartedAt, UpdatedAt: s.UpdatedAt, Parallel: s.Parallel,
	}
	if r.Name == "" {
		r.Name = filepath.Base(f.dir)
	}
	var running, pending, landed, failed, dead int
	for _, b := range s.Batches {
		x := toBatch(b, orch)
		switch b.Status {
		case "running":
			x.Alive = env.Alive == nil || env.Alive(b.PID)
			if x.Alive {
				running++
			} else {
				dead++
			}
		case "pending":
			pending++
		case "landed":
			landed++
		default: // failed, or completed without landing
			failed++
			if r.Question == "" {
				r.Question = x.Question
			}
		}
		r.Batches = append(r.Batches, x)
	}
	r.Status = itoa(landed) + "/" + itoa(len(s.Batches)) + " landed"
	switch {
	case failed > 0 || dead > 0:
		r.Group = "attn"
		if dead > 0 {
			r.Alert = "A batch is marked running but its process has exited. Run scripts/sweep.py resume " + r.Name + "."
		} else {
			r.Alert = "A batch did not land. Answer its question or read its error, then scripts/sweep.py resume " + r.Name + "."
		}
	case running > 0 || pending > 0:
		r.Group = "active"
	default:
		r.Group = "done"
		r.Outcome = r.Status
	}
	return r
}

// addTokens fills each run's spend from the transcripts of the sessions that ran in its tree.
func addTokens(runs []Run, trees []Tree, env Env) {
	primary := ""
	if len(trees) > 0 {
		primary = trees[0].Path
	}
	for i := range runs {
		r := &runs[i]
		end := env.Now
		if r.Group == "done" {
			end = parse(r.UpdatedAt)
		}
		if r.Kind == "sweep" {
			var total Tokens
			for j := range r.Batches {
				b := &r.Batches[j]
				if b.worktree == "" || b.StartedAt == "" {
					continue
				}
				bEnd := end
				if b.FinishedAt != "" {
					bEnd = parse(b.FinishedAt)
				}
				by, t := env.Tokens.RunTokens(b.worktree, parse(b.StartedAt), bEnd, b.Steps)
				b.Tokens, b.StepTokens = &t, by
				if b.Status == "running" {
					b.Live = env.Tokens.Live(b.worktree, env.Now)
				}
				total.add(t)
			}
			r.Tokens = &total
			continue
		}
		if r.Group == "done" && primary != "" {
			// A finished run's state is copied into every tree; its sessions ran in its own
			// worktree, gone once landed but still the path its transcripts are filed under.
			r.Tree = filepath.Join(filepath.Dir(primary), filepath.Base(primary)+"-"+r.Name)
			r.Branch = "plan/" + r.Name
		}
		by, total := env.Tokens.RunTokens(r.Tree, parse(r.StartedAt), end, r.Steps)
		r.StepTokens, r.Tokens = by, &total
		if r.Group != "done" {
			r.Live = env.Tokens.Live(r.Tree, env.Now)
		}
	}
}

// toBatch copies a sweep batch, adding the step its own orchestration state is on while it runs.
func toBatch(b sweepBatch, orch map[string]found[orchState]) Batch {
	x := Batch{N: b.N, Name: b.Name, WorkType: b.WorkType, Status: b.Status, worktree: b.Worktree,
		StartedAt: deref(b.StartedAt), FinishedAt: deref(b.FinishedAt), Subject: deref(b.Subject),
		LandedSHA: deref(b.LandedSHA), Error: deref(b.Error), Question: deref(b.Question)}
	o, ok := orch[b.Name]
	if !ok {
		return x // not planned yet: no state file until the batch has written its plan
	}
	x.Steps, x.Skipped = o.state.StepAttempts, skipped(o.dir, o.state)
	if b.Status == "running" {
		x.Step = o.state.CurrentStep
		if at := o.state.StepAttempts[x.Step]; len(at) > 0 {
			x.StepSince = at[len(at)-1].Start
		}
	}
	return x
}

var workTypeRe = regexp.MustCompile(`(?m)^\*\*Work Type\*\*:\s*(\S+)`)
var e2eScopeRe = regexp.MustCompile(`(?m)^\*\*E2E Scope\*\*:\s*(\S+)`)

// planSkips is what plan.md's Work Type and E2E Scope say the run will never do.
func planSkips(dir string) map[string]bool {
	skip := map[string]bool{}
	b, err := os.ReadFile(filepath.Join(dir, "plan.md"))
	if err != nil {
		return skip
	}
	if m := workTypeRe.FindSubmatch(b); m != nil {
		switch string(m[1]) {
		case "daemon":
			skip["web-impl"], skip["web-tests"], skip["render-tests"] = true, true, true
		case "web":
			skip["daemon-impl"], skip["daemon-tests"] = true, true
		}
	}
	if m := e2eScopeRe.FindSubmatch(b); m != nil && strings.Trim(string(m[1]), "`") == "none" {
		skip["e2e-specs"], skip["e2e-validate"] = true, true
	}
	return skip
}

// skipped lists the steps this run will never run: what plan.md says, plus any step never
// started once a join step after both tracks has begun.
func skipped(dir string, s orchState) []string {
	skip := planSkips(dir)
	joined := false
	for _, st := range Steps {
		if joinSteps[st] && len(s.StepAttempts[st]) > 0 {
			joined = true
		}
	}
	for _, st := range Steps {
		if len(s.StepAttempts[st]) > 0 {
			delete(skip, st) // it ran, whatever the plan said
			continue
		}
		if joined && !joinSteps[st] {
			skip[st] = true
		}
	}
	var out []string
	for _, st := range Steps {
		if skip[st] {
			out = append(out, st)
		}
	}
	return out
}

func trimDone(runs []Run, keep int) []Run {
	var done, rest []Run
	for _, r := range runs {
		if r.Group == "done" {
			done = append(done, r)
		} else {
			rest = append(rest, r)
		}
	}
	sort.Slice(done, func(i, j int) bool { return done[i].UpdatedAt > done[j].UpdatedAt })
	if len(done) > keep {
		done = done[:keep]
	}
	return append(rest, done...)
}

func groupRank(g string) int {
	switch g {
	case "active":
		return 0
	case "attn":
		return 1
	}
	return 2
}

func readJSON(path string, v any) bool {
	b, err := os.ReadFile(path)
	return err == nil && json.Unmarshal(b, v) == nil
}

func parse(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}

func stamp(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func itoa(n int) string { return strconv.Itoa(n) }

func mins(d time.Duration) string {
	m := int(d.Minutes())
	if m >= 60 {
		return itoa(m/60) + "h " + itoa(m%60) + "m"
	}
	return itoa(m) + "m"
}
