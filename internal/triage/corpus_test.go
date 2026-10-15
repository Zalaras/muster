package triage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// corpus reads testdata/<kind>/*.md: the first line is the issue title, the rest the body.
// Every file is built as an OWNER-filed issue, the most permissive association, so the
// adversarial set proves the owner rule cannot be used to smuggle a payload onto the normal
// path and the benign set proves the developer's own idioms are never held.
func corpus(t *testing.T, kind string) map[string]Artifact {
	t.Helper()
	files, err := filepath.Glob(filepath.Join("testdata", kind, "*.md"))
	if err != nil || len(files) == 0 {
		t.Fatalf("no %s corpus: %v", kind, err)
	}
	out := map[string]Artifact{}
	for _, f := range files {
		raw, rerr := os.ReadFile(f)
		if rerr != nil {
			t.Fatal(rerr)
		}
		title, body, _ := strings.Cut(string(raw), "\n")
		a, berr := Build(Issue{Number: 1, Title: title, Body: body, AuthorAssociation: OwnerAssociation, UserLogin: "owner"}, DefaultLimits())
		if berr != nil {
			t.Fatalf("%s: Build: %v", f, berr)
		}
		out[strings.TrimSuffix(filepath.Base(f), ".md")] = a
	}
	return out
}

// Each adversarial file named after a rule family must be held by that family; the rest
// (hidden text, a zero-width split, a shadowed snapshot) must at least leave the normal
// path. This test must pass unchanged once the owner rule is enabled.
func TestCorpusAdversarialNeverNormal(t *testing.T) {
	families := map[string]bool{}
	for _, fam := range RuleFamilies {
		families[fam.Name] = true
	}
	for name, a := range corpus(t, "adversarial") {
		t.Run(name, func(t *testing.T) {
			if a.Route == PathNormal {
				t.Fatalf("routed normal with flags %v", a.Flags.Strings())
			}
			if families[name] && (a.Route != PathHeld || a.Flags.Tripwire != name) {
				t.Errorf("Route = %v, tripwire = %q; want held by %s", a.Route, a.Flags.Tripwire, name)
			}
		})
	}
	all := corpus(t, "adversarial")
	if all["double_snapshot"].SnapshotTable != "" {
		t.Error("two snapshot blocks must discard the snapshot, never pick one")
	}
	if all["zero_width"].Flags.ZeroWidth == 0 || all["zero_width"].Route != PathRestricted {
		t.Errorf("zero width: %+v", all["zero_width"].Flags.Strings())
	}
}

// The developer's own vocabulary: repro steps, pasted logs, screenshots, permission modes,
// transcripts, links. None of it is a signal, so none of it may hold an issue.
func TestCorpusBenignNeverHeld(t *testing.T) {
	for name, a := range corpus(t, "benign") {
		t.Run(name, func(t *testing.T) {
			if a.Route == PathHeld {
				t.Errorf("held with flags %v", a.Flags.Strings())
			}
			if a.Flags.Tripwire != "" {
				t.Errorf("tripwire %q fired", a.Flags.Tripwire)
			}
			if danger(a.Flags) {
				t.Errorf("a danger signal fired: %v", a.Flags.Strings())
			}
		})
	}
	if got := corpus(t, "benign")["screenshot"].Flags.Images; got != 1 {
		t.Errorf("Images = %d, want 1 for a pasted <img>", got)
	}
}
