package main

// Token accounting from Claude Code's own transcripts (kb:fact/subagent-token-usage-attribution,
// kb:fact/transcript-dir-encoding): a session's transcript sits in ~/.claude/projects/<encoded
// cwd>/<session>.jsonl (it follows the session into a worktree), each subagent's in
// <session>/subagents/agent-<id>.jsonl beside an agent-<id>.meta.json naming its agentType.
// Assistant lines carry message.usage; each message repeats, so it is counted once per id.

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Tokens is a usage total with its list-price cost estimate in USD.
type Tokens struct {
	Input        int64   `json:"input"`
	Output       int64   `json:"output"`
	CacheRead    int64   `json:"cacheRead"`
	CacheWrite5m int64   `json:"cacheWrite5m"`
	CacheWrite1h int64   `json:"cacheWrite1h"`
	Cost         float64 `json:"cost"`
}

func (t *Tokens) add(o Tokens) {
	t.Input += o.Input
	t.Output += o.Output
	t.CacheRead += o.CacheRead
	t.CacheWrite5m += o.CacheWrite5m
	t.CacheWrite1h += o.CacheWrite1h
	t.Cost += o.Cost
}

// price is USD per million tokens. Cache writes are 1.25× input (5 m) and 2× input (1 h).
type price struct{ in, out, read float64 }

// prices by model-id prefix, longest prefix wins (claude-api skill table, cached 2026-11-03).
var prices = map[string]price{
	"claude-fable-5-2":  {8, 40, 0.20},
	"claude-mythos-5-2": {8, 40, 0.20},
	"claude-fable-5":    {10, 50, 1.00},
	"claude-mythos-5":   {10, 50, 1.00},
	"claude-opus-5-5":   {4, 20, 0.20},
	"claude-opus-5":     {5, 25, 0.50},
	"claude-opus-4":     {5, 25, 0.50},
	"claude-sonnet-5-5": {2, 10, 0.10},
	"claude-sonnet-5":   {2, 10, 0.20},
	"claude-sonnet-4":   {3, 15, 0.30},
	"claude-haiku-5-5":  {0.10, 0.50, 0.01},
	"claude-haiku-4":    {1, 5, 0.10},
}

// unknownModel prices a model the table does not know at the default model's rate.
var unknownModel = prices["claude-opus-5-5"]

func priceFor(model string) price {
	best, bestLen := unknownModel, 0
	for p, v := range prices {
		if strings.HasPrefix(model, p) && len(p) > bestLen {
			best, bestLen = v, len(p)
		}
	}
	return best
}

func (r usageRec) tokens() Tokens {
	p := priceFor(r.Model)
	t := Tokens{Input: r.In, Output: r.Out, CacheRead: r.Read, CacheWrite5m: r.W5, CacheWrite1h: r.W1}
	t.Cost = (float64(t.Input)*p.in + float64(t.Output)*p.out + float64(t.CacheRead)*p.read +
		float64(t.CacheWrite5m)*p.in*1.25 + float64(t.CacheWrite1h)*p.in*2) / 1e6
	return t
}

// usageRec is one assistant message's usage.
type usageRec struct {
	At                time.Time
	Cwd, Model        string
	In, Out, Read, W5 int64
	W1                int64
}

type line struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	Cwd       string `json:"cwd"`
	Message   struct {
		ID    string `json:"id"`
		Model string `json:"model"`
		Usage *struct {
			Input         int64 `json:"input_tokens"`
			Output        int64 `json:"output_tokens"`
			CacheRead     int64 `json:"cache_read_input_tokens"`
			CacheCreation int64 `json:"cache_creation_input_tokens"`
			Split         *struct {
				W5 int64 `json:"ephemeral_5m_input_tokens"`
				W1 int64 `json:"ephemeral_1h_input_tokens"`
			} `json:"cache_creation"`
		} `json:"usage"`
	} `json:"message"`
}

// transcript is one file read so far; only appended bytes are read on the next pass.
type transcript struct {
	offset  int64
	size    int64
	first   time.Time // first timestamped line
	cwd     string    // first line's cwd
	msgs    map[string]usageRec
	ordered []string // message ids in first-seen order
}

// Ledger caches every transcript it has read, so a poll costs only the bytes appended since.
type Ledger struct {
	root string   // ~/.claude/projects
	also []string // directories whose folders every run also searches (the primary checkout)
	mu   sync.Mutex
	tx   map[string]*transcript
	done map[string]memoRun // finished windows' answers
}

func newLedger(root string, also ...string) *Ledger {
	return &Ledger{root: root, also: also, tx: map[string]*transcript{}, done: map[string]memoRun{}}
}

var nonWord = regexp.MustCompile(`[^A-Za-z0-9-]`)

// projectDir is where Claude Code files the sessions run in dir: the resolved path with every
// character outside [A-Za-z0-9-] made '-' (names over 200 characters are hashed; not matched).
func (l *Ledger) projectDir(dir string) string {
	if r, err := filepath.EvalSymlinks(dir); err == nil {
		dir = r
	}
	return filepath.Join(l.root, nonWord.ReplaceAllString(dir, "-"))
}

// dirsFor is where a run's sessions can be filed. A transcript lives under the session's current
// directory and moves with it, so a session that left its worktree (ExitWorktree) took its whole
// history to the primary checkout's folder. Messages are filtered by their own cwd, so reading a
// shared folder never counts another tree's work.
func (l *Ledger) dirsFor(tree string) []string {
	dirs := []string{l.projectDir(tree)}
	for _, a := range l.also {
		if d := l.projectDir(a); d != dirs[0] {
			dirs = append(dirs, d)
		}
	}
	return dirs
}

// read brings one transcript up to date and returns it (nil if unreadable).
func (l *Ledger) read(path string) *transcript {
	fi, err := os.Stat(path)
	if err != nil {
		return nil
	}
	t := l.tx[path]
	if t == nil || fi.Size() < t.size {
		t = &transcript{msgs: map[string]usageRec{}}
		l.tx[path] = t
	}
	if fi.Size() == t.offset {
		return t
	}
	f, err := os.Open(path)
	if err != nil {
		return t
	}
	defer f.Close()
	if _, err := f.Seek(t.offset, io.SeekStart); err != nil {
		return t
	}
	r := bufio.NewReaderSize(f, 1<<20)
	for {
		b, err := r.ReadBytes('\n')
		if err != nil {
			break // a partial last line is re-read next pass
		}
		t.offset += int64(len(b))
		t.ingest(b)
	}
	t.size = fi.Size()
	return t
}

var assistantMark = []byte(`"assistant"`)

func (t *transcript) ingest(b []byte) {
	firstPending := t.first.IsZero()
	if !firstPending && !bytes.Contains(b, assistantMark) {
		return
	}
	var ln line
	if json.Unmarshal(b, &ln) != nil {
		return
	}
	at, _ := time.Parse(time.RFC3339Nano, ln.Timestamp)
	if firstPending && !at.IsZero() {
		t.first, t.cwd = at, ln.Cwd
	}
	u := ln.Message.Usage
	if ln.Type != "assistant" || ln.Message.ID == "" || u == nil {
		return
	}
	rec := usageRec{At: at, Cwd: ln.Cwd, Model: ln.Message.Model, In: u.Input, Out: u.Output, Read: u.CacheRead, W5: u.CacheCreation}
	if u.Split != nil && u.Split.W5+u.Split.W1 > 0 {
		rec.W5, rec.W1 = u.Split.W5, u.Split.W1
	}
	if _, seen := t.msgs[ln.Message.ID]; !seen {
		t.ordered = append(t.ordered, ln.Message.ID)
	} else if prev := t.msgs[ln.Message.ID]; !prev.At.IsZero() {
		rec.At = prev.At // the message's time is its first appearance
	}
	t.msgs[ln.Message.ID] = rec
}

// sum totals the messages sent from inside tree between from and to.
func (t *transcript) sum(tree string, from, to time.Time) Tokens {
	var tot Tokens
	for _, id := range t.ordered {
		m := t.msgs[id]
		if m.At.Before(from) || m.At.After(to) || !inTree(m.Cwd, tree) {
			continue
		}
		tot.add(m.tokens())
	}
	return tot
}

func inTree(cwd, tree string) bool {
	return cwd == "" || cwd == tree || strings.HasPrefix(cwd, tree+string(filepath.Separator))
}

type agentMeta struct {
	AgentType   string `json:"agentType"`
	Description string `json:"description"`
}

// agentUse is one subagent's run inside a window.
type agentUse struct {
	Type, Description string
	Start             time.Time
	Tokens            Tokens
}

// Usage of every session and subagent that ran in tree between from and to.
func (l *Ledger) window(tree string, from, to time.Time) (main Tokens, agents []agentUse) {
	l.mu.Lock()
	defer l.mu.Unlock()
	var sessions, files []string
	for _, dir := range l.dirsFor(tree) {
		s, _ := filepath.Glob(filepath.Join(dir, "*.jsonl"))
		f, _ := filepath.Glob(filepath.Join(dir, "*", "subagents", "agent-*.jsonl"))
		sessions, files = append(sessions, s...), append(files, f...)
	}
	for _, s := range sessions {
		if fi, err := os.Stat(s); err != nil || fi.ModTime().Before(from) {
			continue // untouched since before the run: cannot hold its messages
		}
		if t := l.read(s); t != nil {
			main.add(t.sum(tree, from, to))
		}
	}
	for _, f := range files {
		if fi, err := os.Stat(f); err != nil || fi.ModTime().Before(from) {
			continue
		}
		t := l.read(f)
		if t == nil || t.first.IsZero() || t.first.Before(from.Add(-time.Minute)) || t.first.After(to) || !inTree(t.cwd, tree) {
			continue
		}
		var m agentMeta
		readJSON(strings.TrimSuffix(f, ".jsonl")+".meta.json", &m)
		agents = append(agents, agentUse{Type: m.AgentType, Description: m.Description, Start: t.first,
			Tokens: t.sum(tree, time.Time{}, to.Add(time.Hour))})
	}
	sort.Slice(agents, func(i, j int) bool { return agents[i].Start.Before(agents[j].Start) })
	return main, agents
}

// stepCandidates are the pipeline steps an agent type can run. Types have carried suffixes
// over time (e2e-specs-author, comment-judge-c1), so they match by prefix.
func stepCandidates(agentType string) []string {
	switch {
	case agentType == "e2e-specs":
		return []string{"e2e-specs", "e2e-validate"} // authoring, then validation mode
	case strings.HasPrefix(agentType, "e2e-validate"):
		return []string{"e2e-validate"}
	case strings.HasPrefix(agentType, "review-"):
		return []string{"review"}
	}
	for _, s := range Steps {
		if strings.HasPrefix(agentType, s) {
			return []string{s}
		}
	}
	return nil
}

// bucketFor names where an agent that runs no pipeline step is counted.
func bucketFor(agentType string) string {
	switch {
	case strings.HasPrefix(agentType, "comment-judge"):
		return "comment pass"
	case strings.HasPrefix(agentType, "advocate"), strings.HasPrefix(agentType, "debater"),
		agentType == "judge":
		return "decisions"
	}
	return "other"
}

// stepFor picks the step an agent belongs to: the candidate whose attempt window holds its start.
func stepFor(a agentUse, steps map[string][]Attempt, end time.Time) string {
	cands := stepCandidates(a.Type)
	if len(cands) == 0 {
		return bucketFor(a.Type)
	}
	best, bestStart := cands[0], time.Time{}
	for _, c := range cands {
		for _, at := range steps[c] {
			s := parse(at.Start).Add(-2 * time.Minute)
			f := end
			if at.Finish != nil {
				f = parse(*at.Finish).Add(time.Minute)
			}
			if !a.Start.Before(s) && !a.Start.After(f) {
				return c
			}
			if !a.Start.Before(s) && s.After(bestStart) { // else the latest attempt begun before it
				best, bestStart = c, s
			}
		}
	}
	return best
}

// RunTokens is a run's spend split by pipeline step, plus the orchestrating session itself
// ("orchestrator") and agents no step names ("comment pass", "decisions", "other").
func (l *Ledger) RunTokens(tree string, from, to time.Time, steps map[string][]Attempt) (map[string]Tokens, Tokens) {
	// A window that closed a while ago cannot change, so its answer is kept for later polls.
	key := tree + "|" + from.String() + "|" + to.String()
	if hit, ok := l.memo(key); ok {
		return hit.by, hit.total
	}
	by, total := l.runTokens(tree, from, to, steps)
	if time.Since(to) > 10*time.Minute {
		l.mu.Lock()
		l.done[key] = memoRun{by, total}
		l.mu.Unlock()
	}
	return by, total
}

type memoRun struct {
	by    map[string]Tokens
	total Tokens
}

func (l *Ledger) memo(key string) (memoRun, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	m, ok := l.done[key]
	return m, ok
}

func (l *Ledger) runTokens(tree string, from, to time.Time, steps map[string][]Attempt) (map[string]Tokens, Tokens) {
	main, agents := l.window(tree, from, to)
	by := map[string]Tokens{}
	var total Tokens
	if main.Cost > 0 || main.Output > 0 {
		by["orchestrator"] = main
		total.add(main)
	}
	for _, a := range agents {
		k := stepFor(a, steps, to)
		t := by[k]
		t.add(a.Tokens)
		by[k] = t
		total.add(a.Tokens)
	}
	return by, total
}
