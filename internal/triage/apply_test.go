package triage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// gitStub answers the git commands Apply issues, and records them.
type gitStub struct {
	hooksPath string
	status    string
	staged    string
	calls     []string
	failOn    string
}

func (g *gitStub) run(_ context.Context, name string, args ...string) ([]byte, []byte, error) {
	cmd := name + " " + strings.Join(args, " ")
	g.calls = append(g.calls, cmd)
	if g.failOn != "" && strings.Contains(cmd, g.failOn) {
		return nil, []byte("boom"), errors.New("exit status 1")
	}
	switch {
	case strings.Contains(cmd, "config core.hooksPath"):
		return []byte(g.hooksPath + "\n"), nil, nil
	case strings.Contains(cmd, "status --porcelain"):
		return []byte(g.status), nil, nil
	case strings.Contains(cmd, "diff --cached"):
		return []byte(g.staged), nil, nil
	}
	return nil, nil, nil
}

func (g *gitStub) ran(substr string) bool {
	for _, c := range g.calls {
		if strings.Contains(c, substr) {
			return true
		}
	}
	return false
}

func applyFixture(t *testing.T) (root string, arts map[int]Artifact, props map[int]Proposal) {
	t.Helper()
	root = t.TempDir()
	if err := os.WriteFile(filepath.Join(root, TodoFile), []byte(todoFixture), 0o644); err != nil {
		t.Fatal(err)
	}
	arts = map[int]Artifact{
		77: {Number: 77, Nonce: "n77", Body: "context deadline exceeded"},
		78: {Number: 78, Nonce: "n78", Body: "boom"},
	}
	props = map[int]Proposal{
		77: {Number: 77, Component: "daemon", Symptom: "hang", ErrorString: "context deadline exceeded"},
		78: {Number: 78, Component: "tmux", Symptom: "crash", ErrorString: "boom"},
	}
	return root, arts, props
}

func TestApply(t *testing.T) {
	root, arts, props := applyFixture(t)
	g := &gitStub{hooksPath: ".githooks", staged: "TODO.md\n"}
	decisions := []Decision{
		{Number: 78, Section: "M5+ (v1.x, re-rank when reached)"},
		{Number: 77, Section: "Reported issues (pre-v1 release)"},
	}
	subject, err := Apply(context.Background(), g.run, root, "Zalaras/muster", decisions, arts, props)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if subject != "docs(triage): file #77 and #78 into the backlog" {
		t.Errorf("subject = %q", subject)
	}
	if !g.ran("commit -m docs(triage)") {
		t.Errorf("no commit was made: %v", g.calls)
	}
	// Only TODO.md is ever staged; never `git add -A`, never a stash.
	if !g.ran("add -- TODO.md") || g.ran("add -A") || g.ran("stash") {
		t.Errorf("unexpected staging behaviour: %v", g.calls)
	}

	b, err := os.ReadFile(filepath.Join(root, TodoFile))
	if err != nil {
		t.Fatal(err)
	}
	got := string(b)
	for _, n := range []int{77, 78} {
		if !HasIssue(got, n) {
			t.Errorf("issue %d did not land in the file", n)
		}
	}
}

func TestApplyRefuses(t *testing.T) {
	decisions := []Decision{{Number: 77, Section: "Reported issues (pre-v1 release)"}}

	cases := []struct {
		name string
		git  *gitStub
		want string
	}{
		// The pre-commit template check is the only mechanical enforcer of "no forged
		// entry"; without it armed, that guarantee is only prose.
		{"hooks not armed", &gitStub{hooksPath: "", staged: "TODO.md\n"}, "core.hooksPath"},
		{"hooks point elsewhere", &gitStub{hooksPath: ".git/hooks", staged: "TODO.md\n"}, "core.hooksPath"},
		// A dirty TODO.md would sweep someone else's edits into this commit.
		{"todo already dirty", &gitStub{hooksPath: ".githooks", status: " M TODO.md\n"}, "uncommitted changes"},
		// Verify what is staged rather than trusting that adding one path staged one path.
		{"extra file staged", &gitStub{hooksPath: ".githooks", staged: "TODO.md\ninternal/server/issue.go\n"}, "staged set is"},
		{"wrong file staged", &gitStub{hooksPath: ".githooks", staged: "go.mod\n"}, "staged set is"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root, arts, props := applyFixture(t)
			_, err := Apply(context.Background(), tc.git.run, root, "Zalaras/muster", decisions, arts, props)
			if err == nil {
				t.Fatal("want a refusal, got nil")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %q, want it to mention %q", err, tc.want)
			}
			if tc.git.ran("commit") {
				t.Error("committed despite refusing")
			}
		})
	}
}

func TestApplySkipsAlreadyTriaged(t *testing.T) {
	root, arts, props := applyFixture(t)
	arts[4] = Artifact{Number: 4, Body: "x"}
	props[4] = Proposal{Number: 4, Component: "docs", Symptom: "install"}

	g := &gitStub{hooksPath: ".githooks", staged: "TODO.md\n"}
	// Issue 4 already has an entry in the fixture.
	subject, err := Apply(context.Background(), g.run, root, "Zalaras/muster",
		[]Decision{{Number: 4, Section: "Reported issues (pre-v1 release)"}}, arts, props)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if subject != "" || g.ran("commit") {
		t.Errorf("re-triaging an existing entry must write nothing, got subject %q", subject)
	}
	b, _ := os.ReadFile(filepath.Join(root, TodoFile))
	if strings.Count(string(b), "issues/4)") != 1 {
		t.Error("a second entry was written for an already-triaged issue")
	}
}

// The subject is assembled from integers and constants, so no issue title can reach it —
// which is what makes it impossible for a triage commit to carry a closing keyword and
// close the issues it just filed.
func TestCommitSubject(t *testing.T) {
	cases := []struct {
		in   []int
		want string
	}{
		{[]int{12}, "docs(triage): file #12 into the backlog"},
		{[]int{12, 14}, "docs(triage): file #12 and #14 into the backlog"},
		{[]int{1, 2, 3}, "docs(triage): file #1, #2 and #3 into the backlog"},
	}
	for _, tc := range cases {
		if got := commitSubject(tc.in); got != tc.want {
			t.Errorf("commitSubject(%v) = %q, want %q", tc.in, got, tc.want)
		}
		if strings.Contains(strings.ToLower(commitSubject(tc.in)), "closes") {
			t.Error("a triage subject must never carry a closing keyword")
		}
	}
}
