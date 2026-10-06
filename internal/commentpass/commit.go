package commentpass

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// commitPathspec commits only the named files, whatever else the shared index holds
// (a peer's staged `git mv` is the normal case in a pipeline worktree), then checks the
// commit touched nothing but those files and did include the ledger.
func (p *Pass) commitPathspec(ctx context.Context, files []string, message string) error {
	sort.Strings(files)
	if _, err := p.git(ctx, append([]string{"add", "--"}, files...)...); err != nil {
		return err
	}
	if _, err := p.git(ctx, append([]string{"commit", "-q", "-m", message, "--"}, files...)...); err != nil {
		return err
	}
	committed, err := p.git(ctx, "show", "--name-only", "--format=", "HEAD")
	if err != nil {
		return err
	}
	want := map[string]bool{}
	for _, f := range files {
		want[f] = true
	}
	hasLedger := false
	for _, g := range strings.Fields(committed) {
		if !want[g] {
			return fmt.Errorf("commit %q touched %s, which is not part of the pass", message, g)
		}
		if g == p.ledgerPath() {
			hasLedger = true
		}
	}
	if !hasLedger {
		return fmt.Errorf("commit %q did not include %s", message, p.ledgerPath())
	}
	return nil
}

// trackedSet answers which of the files git already tracks; an untracked file is the
// agent's to add, never the pass's.
func (p *Pass) trackedSet(ctx context.Context, files []string) (map[string]bool, error) {
	out, err := p.git(ctx, append([]string{"ls-files", "--"}, files...)...)
	if err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for _, l := range strings.Fields(out) {
		set[l] = true
	}
	return set, nil
}
