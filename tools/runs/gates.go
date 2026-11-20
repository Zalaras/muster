package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// GateRun is one run of .claude/skills/orchestrate/scripts/gates.sh, read from the session that
// ran it: its span and the PASS / FAIL / WARN lines it has printed so far.
type GateRun struct {
	Start  string   `json:"start"`
	End    string   `json:"end,omitempty"` // empty while it runs
	Pass   int      `json:"pass"`
	Fail   int      `json:"fail"`
	Warn   int      `json:"warn"`
	Failed []string `json:"failed,omitempty"` // gate ids that failed
	Last   string   `json:"last,omitempty"`   // the latest gate to finish
	Now    string   `json:"now,omitempty"`    // the gate running now, from the newest log it opened
	Done   bool     `json:"done"`             // the summary line was printed
}

// parseGates reads gates.sh output. A gate line is "PASS|FAIL|WARN  <id>  <command>"; the summary
// repeats each failure tab-indented, and a failing check may print a bare "FAIL", neither of
// which counts again.
func parseGates(out string) GateRun {
	var g GateRun
	for _, ln := range strings.Split(out, "\n") {
		if strings.HasPrefix(ln, "== summary:") {
			g.Done = true
			continue
		}
		f := strings.Fields(ln)
		if len(f) < 2 || strings.HasPrefix(ln, " ") || strings.HasPrefix(ln, "\t") {
			continue
		}
		switch f[0] {
		case "PASS":
			g.Pass++
		case "FAIL":
			g.Fail++
			g.Failed = append(g.Failed, f[1])
		case "WARN":
			g.Warn++
		default:
			continue
		}
		g.Last = f[1]
	}
	return g
}

// Gates lists every gates run sessions made in tree between from and to, oldest first, with the
// one still running last. A backgrounded run is read from its output file as it grows.
func (l *Ledger) Gates(tree string, from, to, now time.Time) []GateRun {
	l.mu.Lock()
	defer l.mu.Unlock()
	var runs []GateRun
	for _, dir := range l.dirsFor(tree) {
		sessions, _ := filepath.Glob(filepath.Join(dir, "*.jsonl"))
		for _, s := range sessions {
			if fi, err := os.Stat(s); err != nil || fi.ModTime().Before(from) {
				continue
			}
			t := l.read(s)
			if t == nil {
				continue
			}
			for _, c := range t.calls {
				if inTree(c.Cwd, tree) && !c.At.Before(from) && !c.At.After(to) {
					runs = append(runs, gateRun(c))
				}
			}
			for _, o := range t.open {
				if o.Label == "gates" && inTree(o.Cwd, tree) && !o.At.Before(from) && now.Sub(o.At) < callsFor {
					runs = append(runs, gateRun(o))
				}
			}
		}
	}
	sort.Slice(runs, func(i, j int) bool { return runs[i].Start < runs[j].Start })
	return runs
}

// currentGate names the gate gates.sh is running: it opens NN-<id>.log as each gate starts.
func currentGate(dir string) string {
	logs, _ := filepath.Glob(filepath.Join(dir, "*.log"))
	var newest string
	var at time.Time
	for _, f := range logs {
		if fi, err := os.Stat(f); err == nil && fi.ModTime().After(at) {
			newest, at = f, fi.ModTime()
		}
	}
	if newest == "" {
		return ""
	}
	name := strings.TrimSuffix(filepath.Base(newest), ".log")
	if i := strings.IndexByte(name, '-'); i >= 0 {
		name = name[i+1:]
	}
	return name
}

func gateRun(c openTool) GateRun {
	out := c.Output
	if c.OutFile != "" {
		if b, err := os.ReadFile(c.OutFile); err == nil { // small, rewritten as each gate ends
			out = string(b)
		}
	}
	g := parseGates(out)
	if !g.Done && c.End.IsZero() && c.LogDir != "" {
		g.Now = currentGate(c.LogDir)
	}
	g.Start = stamp(c.At)
	if !c.End.IsZero() {
		g.End = stamp(c.End)
	}
	return g
}
