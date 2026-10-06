package commentpass

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Ledger is plans/<plan>/comment-pass.json: every verdict the pass has recorded, in
// order, so verify can tell a kept comment from a new one without a mark in the code.
type Ledger struct {
	Plan   string  `json:"plan"`
	Cycles []Cycle `json:"cycles"`
}

// Cycle is one apply or drop run.
type Cycle struct {
	Cycle  int    `json:"cycle"`
	At     string `json:"at"`
	By     string `json:"by"`
	Counts Counts `json:"counts"`
	Keeps  []Keep `json:"keeps"`
	Drops  []Drop `json:"drops"`
}

type Counts struct {
	Candidates int `json:"candidates"`
	Keep       int `json:"keep"`
	Drop       int `json:"drop"`
}

type Keep struct {
	Key    string   `json:"key"`
	Path   string   `json:"path"`
	Anchor Anchor   `json:"anchor"`
	Lines  []string `json:"lines"`
	Reason string   `json:"reason"`
}

type Drop struct {
	Key    string   `json:"key"`
	Path   string   `json:"path"`
	Anchor Anchor   `json:"anchor"`
	Lines  []string `json:"lines"`
}

func (p *Pass) readLedger() (*Ledger, bool, error) {
	b, err := os.ReadFile(p.abs(p.ledgerPath()))
	if errors.Is(err, os.ErrNotExist) {
		return &Ledger{Plan: p.Plan}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var l Ledger
	if err := json.Unmarshal(b, &l); err != nil {
		return nil, true, fmt.Errorf("%s: %w", p.ledgerPath(), err)
	}
	return &l, true, nil
}

func (p *Pass) writeLedger(l *Ledger) error {
	b, err := json.MarshalIndent(l, "", "  ")
	if err != nil {
		return err
	}
	path := p.abs(p.ledgerPath())
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

// latestVerdicts maps each key to its most recent verdict, "keep" or "drop".
func (l *Ledger) latestVerdicts() map[string]string {
	out := map[string]string{}
	for _, c := range l.Cycles {
		for _, k := range c.Keeps {
			out[k.Key] = "keep"
		}
		for _, d := range c.Drops {
			out[d.Key] = "drop"
		}
	}
	return out
}

func (l *Ledger) droppedIn(key string) int {
	last := 0
	for _, c := range l.Cycles {
		for _, d := range c.Drops {
			if d.Key == key {
				last = c.Cycle
			}
		}
	}
	return last
}
