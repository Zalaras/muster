package triage

import (
	"strings"
	"testing"
)

const todoFixture = `# Muster backlog

## Pre-v1 Cleanup

- [ ] **something** ([#1](https://github.com/Zalaras/muster/issues/1))
  — a thing.

## Reported issues (pre-v1 release)

- [x] **tmux dependency** ([#2](https://github.com/Zalaras/muster/issues/2))
  — fixed.

- [ ] **install docs** ([#4](https://github.com/Zalaras/muster/issues/4))
  — pending.

## M5+ (v1.x, re-rank when reached)

- [ ] **later** ([#40](https://github.com/Zalaras/muster/issues/40))
  — someday.
`

func testEntry(n int) string {
	return RenderEntry(
		Artifact{Number: n},
		Proposal{Component: "daemon", Symptom: "hang", ErrorString: "context deadline exceeded"},
		"Zalaras/muster",
	)
}

func TestSpliceIntoEachSection(t *testing.T) {
	for _, section := range Sections {
		t.Run(section, func(t *testing.T) {
			got, err := Splice(todoFixture, section, testEntry(99))
			if err != nil {
				t.Fatalf("Splice: %v", err)
			}
			if !HasIssue(got, 99) {
				t.Error("entry did not land")
			}
			// It must land inside its own section, before the next heading.
			idx := strings.Index(got, "issues/99")
			head := strings.Index(got, "## "+section)
			if idx < head {
				t.Error("entry landed above its section heading")
			}
			rest := got[head+1:]
			if next := strings.Index(rest, "\n## "); next >= 0 && idx > head+1+next {
				t.Error("entry landed in a later section")
			}
		})
	}
}

// A pure insertion: the original file survives byte for byte with one block added.
func TestSpliceIsPureInsertion(t *testing.T) {
	entry := testEntry(99)
	got, err := Splice(todoFixture, "Reported issues (pre-v1 release)", entry)
	if err != nil {
		t.Fatalf("Splice: %v", err)
	}
	// Splice inserts exactly "\n\n" + entry at one point. Removing that exact string has
	// to restore the original byte for byte.
	inserted := "\n\n" + strings.TrimRight(entry, "\n")
	i := strings.Index(got, inserted)
	if i < 0 {
		t.Fatalf("inserted block not found in the result:\n%q", got)
	}
	rebuilt := got[:i] + got[i+len(inserted):]
	if rebuilt != todoFixture {
		t.Errorf("Splice changed more than it inserted:\n got %q\nwant %q", rebuilt, todoFixture)
	}
}

func TestSpliceAppendsAfterTheLastEntry(t *testing.T) {
	got, err := Splice(todoFixture, "Reported issues (pre-v1 release)", testEntry(99))
	if err != nil {
		t.Fatalf("Splice: %v", err)
	}
	// Priority order is Damian's, recorded in the file's own preamble; new entries go at
	// the end of the section, never sorted in.
	if strings.Index(got, "issues/99") < strings.Index(got, "issues/4") {
		t.Error("entry was inserted before an existing one instead of appended")
	}
}

func TestSpliceErrors(t *testing.T) {
	t.Run("missing section", func(t *testing.T) {
		if _, err := Splice(todoFixture, "No Such Section", testEntry(99)); err == nil {
			t.Fatal("want an error")
		}
	})
	t.Run("duplicate section", func(t *testing.T) {
		dup := todoFixture + "\n## Pre-v1 Cleanup\n\n"
		if _, err := Splice(dup, "Pre-v1 Cleanup", testEntry(99)); err == nil {
			t.Fatal("want an error")
		}
	})
	t.Run("entry that forges structure is refused", func(t *testing.T) {
		bad := "- [ ] **a: b** ([#9](https://github.com/Zalaras/muster/issues/9))\n## Reported issues (pre-v1 release)\n"
		if _, err := Splice(todoFixture, "Pre-v1 Cleanup", bad); err == nil {
			t.Fatal("want an error")
		}
	})
}

// A "## " line inside a fence is text, not a heading. TODO.md carries no fences today,
// but an entry is the one thing that could introduce one.
func TestSectionNamesIgnoresFencedHeadings(t *testing.T) {
	withFence := todoFixture + "\n```\n## Not A Section\n```\n"
	for _, name := range SectionNames(withFence) {
		if name == "Not A Section" {
			t.Error("a fenced heading was read as a section")
		}
	}
	if _, err := Splice(withFence, "Not A Section", testEntry(99)); err == nil {
		t.Error("spliced into a section that only exists inside a fence")
	}
}

func TestHasIssueMatchesOnURLNotBareHash(t *testing.T) {
	cases := []struct {
		name string
		todo string
		n    int
		want bool
	}{
		{"owning entry", todoFixture, 4, true},
		{"absent", todoFixture, 77, false},
		// The two measured false positives a bare #N grep produces.
		{"hex colour is not issue 343", "a design note about #343a4a", 343, false},
		{"cross-reference does not triage", "  — same seam as #4.", 4, false},
		// A boundary check, or issues/4 matches inside issues/42.
		{"prefix does not match", "issues/42", 4, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := HasIssue(tc.todo, tc.n); got != tc.want {
				t.Errorf("HasIssue = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestUntriaged(t *testing.T) {
	got := Untriaged(todoFixture, []Issue{{Number: 2}, {Number: 4}, {Number: 77}})
	if len(got) != 1 || got[0].Number != 77 {
		t.Errorf("got %+v, want only issue 77", got)
	}
}

func TestCheckEntryShape(t *testing.T) {
	cases := []struct {
		name  string
		entry string
		ok    bool
	}{
		{"rendered entry", testEntry(9), true},
		{"heading at column 0", "- [ ] **a: b** ([#9](u))\n## forged\n", false},
		{"fence at column 0", "- [ ] **a: b** ([#9](u))\n```\n", false},
		{"list item at column 0", "- [ ] **a: b** ([#9](u))\n- forged\n", false},
		{"table row at column 0", "- [ ] **a: b** ([#9](u))\n| a | b |\n", false},
		{"blank line ends the entry", "- [ ] **a: b** ([#9](u))\n\n  — x\n", false},
		{"wrong opener", "* [ ] **a: b**\n", false},
		{"unindented continuation", "- [ ] **a: b** ([#9](u))\ntext\n", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := CheckEntryShape(tc.entry)
			if (err == nil) != tc.ok {
				t.Errorf("err = %v, want ok = %v", err, tc.ok)
			}
		})
	}
}

// The rendered entry is built from enums, a validated integer and one checked quote, so
// no attacker-derived byte can reach column 0 of a continuation line.
func TestRenderEntryShapeHolds(t *testing.T) {
	for _, quote := range []string{"", "context deadline exceeded", strings.Repeat("x", maxErrorString)} {
		e := RenderEntry(Artifact{Number: 7}, Proposal{Component: "tmux", Symptom: "crash", ErrorString: quote}, "Zalaras/muster")
		if err := CheckEntryShape(e); err != nil {
			t.Errorf("quote %q: %v\n%s", quote, err, e)
		}
		if !strings.Contains(e, "https://github.com/Zalaras/muster/issues/7") {
			t.Errorf("entry is missing its issue link:\n%s", e)
		}
	}
}
