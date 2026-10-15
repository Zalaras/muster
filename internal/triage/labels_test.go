package triage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The Go lists and docs/conventions.md § Issue labels must name the same labels: the doc is
// what the developer edits, the lists are what reaches gh. Every Go name has to appear as a
// backticked token in that section, and no resolution label (duplicate, invalid, wontfix —
// the closes triage never makes) may be in a list.
func TestLabelNamesAppearInConventions(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "docs", "conventions.md"))
	if err != nil {
		t.Skipf("conventions.md not present: %v", err)
	}
	_, after, found := strings.Cut(string(raw), "\n## Issue labels")
	if !found {
		t.Fatal("docs/conventions.md has no § Issue labels")
	}
	section, _, _ := strings.Cut(after, "\n## ")

	for _, list := range [][]string{LabelKinds, LabelAreas, LabelModifiers} {
		for _, name := range list {
			if !strings.Contains(section, "`"+name+"`") {
				t.Errorf("label %q is not in docs/conventions.md § Issue labels", name)
			}
			for _, res := range []string{"duplicate", "invalid", "wontfix"} {
				if name == res {
					t.Errorf("resolution label %q must not be in a list the proposer picks from", name)
				}
			}
		}
	}
}

func TestProposalLabelsOrder(t *testing.T) {
	p := Proposal{Kind: "bug", Area: []string{"rail", "focus"}, Modifiers: []string{"ux", "regression"}}
	if got := strings.Join(p.Labels(), ","); got != "bug,rail,focus,ux,regression" {
		t.Errorf("Labels = %q", got)
	}
	if got := strings.Join(Proposal{Kind: "chore", Area: []string{"process"}}.Labels(), ","); got != "chore,process" {
		t.Errorf("Labels = %q", got)
	}
}
