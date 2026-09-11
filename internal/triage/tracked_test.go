package triage

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

const historyFixture = `# Muster backlog — done items

## Reported issues (pre-v1 release)

- [x] **archived and fixed** ([#55](https://github.com/Zalaras/muster/issues/55))
  — moved here when it was ticked.
`

func writeHistory(t *testing.T, root string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, filepath.Dir(HistoryFile)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, HistoryFile), []byte(historyFixture), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestReadTracked(t *testing.T) {
	t.Run("no history file", func(t *testing.T) {
		root, _, _ := applyFixture(t)
		todo, tracked, err := ReadTracked(root)
		if err != nil {
			t.Fatal(err)
		}
		if todo != todoFixture || tracked != todoFixture {
			t.Error("without a history file, tracked must equal TODO.md")
		}
	})
	t.Run("with history file", func(t *testing.T) {
		root, _, _ := applyFixture(t)
		writeHistory(t, root)
		todo, tracked, err := ReadTracked(root)
		if err != nil {
			t.Fatal(err)
		}
		if todo != todoFixture {
			t.Error("todo must stay TODO.md alone — it is the write path")
		}
		issues := []Issue{{Number: 55, State: "open"}, {Number: 56, State: "open"}, {Number: 4, State: "open"}}
		got := Untriaged(tracked, issues)
		if len(got) != 1 || got[0].Number != 56 {
			t.Errorf("Untriaged(tracked) = %v, want only #56 (55 is archived, 4 is open in TODO.md)", got)
		}
		// The audit's `dropped` verdict reads the checkbox of the archived entry.
		if checked, found := EntryState(tracked, 55); !found || !checked {
			t.Errorf("EntryState(tracked, 55) = (%v, %v), want ticked and found", checked, found)
		}
		if checked, found := EntryState(tracked, 4); !found || checked {
			t.Errorf("EntryState(tracked, 4) = (%v, %v), want open and found", checked, found)
		}
	})
}

func TestApplySkipsArchivedIssue(t *testing.T) {
	root, arts, props := applyFixture(t)
	writeHistory(t, root)
	arts[55] = Artifact{Number: 55, Nonce: "n55", Body: "again"}
	props[55] = Proposal{Number: 55, Component: "daemon", Symptom: "hang", ErrorString: "again"}

	g := &gitStub{hooksPath: ".githooks", staged: "TODO.md\n"}
	decisions := []Decision{
		{Number: 55, Section: "Reported issues (pre-v1 release)"},
		{Number: 77, Section: "Reported issues (pre-v1 release)"},
	}
	subject, err := Apply(context.Background(), g.run, root, "Zalaras/muster", decisions, arts, props)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if subject != "docs(triage): file #77 into the backlog" {
		t.Errorf("subject = %q — #55 is archived and must not be re-filed", subject)
	}
	b, err := os.ReadFile(filepath.Join(root, TodoFile))
	if err != nil {
		t.Fatal(err)
	}
	if HasIssue(string(b), 55) {
		t.Error("archived issue #55 was written into TODO.md again")
	}
	if g.ran("add -- "+HistoryFile) || g.ran("add -- docs") {
		t.Errorf("the history file must never be staged: %v", g.calls)
	}
}
