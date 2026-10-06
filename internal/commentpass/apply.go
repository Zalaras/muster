package commentpass

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Apply reconstructs every stripped file from its snapshot minus the dropped spans,
// records the cycle in the ledger and commits by pathspec. It refuses, before writing,
// a verdict set that does not account for every candidate exactly once and a tree that
// moved since strip.
func (p *Pass) Apply(ctx context.Context, verdictsPath, candidatesPath string, cycle int, message string) error {
	if err := p.requireBranch(ctx); err != nil {
		return err
	}
	m, drop, reasons, err := p.loadApplyInputs(verdictsPath, candidatesPath)
	if err != nil {
		return err
	}
	if uerr := p.checkUnmoved(m); uerr != nil {
		return uerr
	}
	ledger, _, err := p.readLedger()
	if err != nil {
		return err
	}
	entry := Cycle{Cycle: cycle, At: p.Now().UTC().Format(time.RFC3339), By: "judge"}
	var touched, tsRels, dirty []string
	for _, f := range m.Files {
		if rerr := p.reconstructFile(f, drop, reasons, &entry); rerr != nil {
			return rerr
		}
		touched = append(touched, f.Path)
		if !isGo(f.Path) {
			tsRels = append(tsRels, f.Path)
		}
		if f.Dirty {
			dirty = append(dirty, f.Path)
		}
	}
	if len(dirty) > 0 {
		p.printf("warning: committing pre-existing uncommitted changes in %s\n", strings.Join(dirty, ", "))
	}
	if ferr := p.finishCycle(ctx, ledger, entry, touched, tsRels, message); ferr != nil {
		return ferr
	}
	p.printf("apply: cycle %d — %d candidates, %d kept, %d dropped; ledger %s\n", cycle, entry.Counts.Candidates, entry.Counts.Keep, entry.Counts.Drop, p.ledgerPath())
	return nil
}

func (p *Pass) loadApplyInputs(verdictsPath, candidatesPath string) (*Manifest, map[string]bool, map[string]string, error) {
	if candidatesPath == "" {
		candidatesPath = filepath.Join(filepath.Dir(verdictsPath), "candidates.json")
	}
	mb, err := os.ReadFile(candidatesPath)
	if err != nil {
		return nil, nil, nil, err
	}
	var m Manifest
	if uerr := json.Unmarshal(mb, &m); uerr != nil {
		return nil, nil, nil, fmt.Errorf("%s: %w", candidatesPath, uerr)
	}
	if m.Plan != p.Plan {
		return nil, nil, nil, fmt.Errorf("%s was written for plan %s, not %s", candidatesPath, m.Plan, p.Plan)
	}
	v, err := readVerdicts(verdictsPath)
	if err != nil {
		return nil, nil, nil, err
	}
	reasons, err := v.validate(&m)
	if err != nil {
		return nil, nil, nil, err
	}
	drop := map[string]bool{}
	for _, id := range v.Drop {
		drop[id] = true
	}
	return &m, drop, reasons, nil
}

func (p *Pass) checkUnmoved(m *Manifest) error {
	var moved []string
	for _, f := range m.Files {
		live, err := p.readFile(f.Path)
		if err != nil {
			return err
		}
		if sha(live) != f.StrippedSHA {
			moved = append(moved, f.Path)
		}
	}
	if len(moved) > 0 {
		return fmt.Errorf("%w: changed since strip, re-run strip: %s", ErrRefused, strings.Join(moved, ", "))
	}
	return nil
}

// reconstructFile writes the original minus the dropped spans and records each verdict
// in the cycle entry.
func (p *Pass) reconstructFile(f FileEntry, drop map[string]bool, reasons map[string]string, entry *Cycle) error {
	var spans []Span
	for _, c := range f.Candidates {
		entry.Counts.Candidates++
		if drop[c.ID] {
			spans = append(spans, c.Span)
			entry.Counts.Drop++
			entry.Drops = append(entry.Drops, Drop{Key: c.Key, Path: c.Path, Anchor: c.Anchor, Lines: c.Lines})
			continue
		}
		entry.Counts.Keep++
		entry.Keeps = append(entry.Keeps, Keep{Key: c.Key, Path: c.Path, Anchor: c.Anchor, Lines: c.Lines, Reason: reasons[c.ID]})
	}
	out := removeSpans([]byte(f.Original), spans)
	if isGo(f.Path) {
		formatted, err := formatGo(out)
		if err != nil {
			return fmt.Errorf("reconstructed %s does not parse: %w", f.Path, err)
		}
		out = formatted
	}
	return p.writeFile(f.Path, out)
}

// finishCycle formats the TS files, appends the cycle to the ledger and commits the
// tracked touched files with it. An untracked file is the agent's to add.
func (p *Pass) finishCycle(ctx context.Context, ledger *Ledger, entry Cycle, touched, tsRels []string, message string) error {
	if err := p.FormatTS(ctx, p.Root, tsRels); err != nil {
		return err
	}
	ledger.Plan = p.Plan
	ledger.Cycles = append(ledger.Cycles, entry)
	if err := p.writeLedger(ledger); err != nil {
		return err
	}
	tracked, err := p.trackedSet(ctx, touched)
	if err != nil {
		return err
	}
	files := []string{p.ledgerPath()}
	for _, t := range touched {
		if tracked[t] {
			files = append(files, t)
		}
	}
	return p.commitPathspec(ctx, files, message)
}
