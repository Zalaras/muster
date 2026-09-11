package triage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// TodoFile is the only file this package ever writes in the repository. Ticked entries
// leave it for HistoryFile, which is read alongside it (ReadTracked) and never written.
const TodoFile = "TODO.md"

// Decision pairs an issue with the section Damian chose for it. The section choice stays
// a human one: where an item ranks is a judgement, and the skill still asks.
type Decision struct {
	Number  int
	Section string
}

// Apply splices every decided entry into TODO.md and makes one commit.
//
// One commit, not one per issue: the existing pass produces a single
// "docs(triage): file #12 and #14 into the pre-v1 backlog", and a commit per issue would
// change a settled convention for no reason.
//
// The commit subject is built from integers and constants only, so an issue title cannot
// reach it — which is what makes it impossible for a triage commit to carry a closing
// keyword and close the very issues it just filed.
func Apply(ctx context.Context, run RunFunc, root, repo string, decisions []Decision, arts map[int]Artifact, props map[int]Proposal) (string, error) {
	if err := requireHooks(ctx, run, root); err != nil {
		return "", err
	}
	path := filepath.Join(root, TodoFile)

	// A dirty TODO.md would put someone else's edits in this commit. The skill's rule is
	// to hand the pass back rather than try to split the file.
	out, stderr, err := run(ctx, "git", "-C", root, "status", "--porcelain", "--", TodoFile)
	if err != nil {
		return "", fmt.Errorf("git status: %w: %s", err, strings.TrimSpace(string(stderr)))
	}
	if strings.TrimSpace(string(out)) != "" {
		return "", fmt.Errorf("%s already has uncommitted changes — commit or revert them first", TodoFile)
	}

	todo, tracked, err := ReadTracked(root)
	if err != nil {
		return "", err
	}

	sort.Slice(decisions, func(i, j int) bool { return decisions[i].Number < decisions[j].Number })
	var filed []int
	for _, d := range decisions {
		a, ok := arts[d.Number]
		if !ok {
			return "", fmt.Errorf("no artifact for issue %d", d.Number)
		}
		p, ok := props[d.Number]
		if !ok {
			return "", fmt.Errorf("no validated proposal for issue %d", d.Number)
		}
		if HasIssue(tracked, d.Number) {
			continue // already triaged (open in TODO.md or ticked in the history file); never write a second entry
		}
		next, serr := Splice(todo, d.Section, RenderEntry(a, p, repo))
		if serr != nil {
			return "", fmt.Errorf("issue %d: %w", d.Number, serr)
		}
		todo = next
		filed = append(filed, d.Number)
	}
	if len(filed) == 0 {
		return "", nil
	}

	if werr := os.WriteFile(path, []byte(todo), 0o644); werr != nil {
		return "", fmt.Errorf("writing %s: %w", TodoFile, werr)
	}
	if _, aerr, addErr := run(ctx, "git", "-C", root, "add", "--", TodoFile); addErr != nil {
		return "", fmt.Errorf("git add: %w: %s", addErr, strings.TrimSpace(string(aerr)))
	}
	// Verify what is actually staged rather than trusting that `git add` of one path
	// staged one path.
	staged, stderr, err := run(ctx, "git", "-C", root, "diff", "--cached", "--name-only")
	if err != nil {
		return "", fmt.Errorf("git diff --cached: %w: %s", err, strings.TrimSpace(string(stderr)))
	}
	if got := strings.Fields(string(staged)); len(got) != 1 || got[0] != TodoFile {
		return "", fmt.Errorf("refusing to commit: staged set is %v, want only %s", got, TodoFile)
	}

	subject := commitSubject(filed)
	if _, stderr, err := run(ctx, "git", "-C", root, "commit", "-m", subject); err != nil {
		return "", fmt.Errorf("git commit: %w: %s", err, strings.TrimSpace(string(stderr)))
	}
	return subject, nil
}

// commitSubject names the issues filed. Integers and constants only — see Apply.
func commitSubject(numbers []int) string {
	parts := make([]string, len(numbers))
	for i, n := range numbers {
		parts[i] = fmt.Sprintf("#%d", n)
	}
	var list string
	switch len(parts) {
	case 1:
		list = parts[0]
	case 2:
		list = parts[0] + " and " + parts[1]
	default:
		list = strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
	}
	return "docs(triage): file " + list + " into the backlog"
}

// requireHooks refuses to run in a clone that has not armed .githooks.
//
// The pre-commit template check is the only mechanical enforcer of "no model-authored
// entry reaches TODO.md" — everything else in this package is a program choosing not to
// do something, which a model holding Edit can simply do anyway. `make hooks` is
// per-clone and opt-in, so without this the guarantee quietly degrades to prose.
func requireHooks(ctx context.Context, run RunFunc, root string) error {
	out, _, err := run(ctx, "git", "-C", root, "config", "core.hooksPath")
	if err != nil || strings.TrimSpace(string(out)) != ".githooks" {
		return fmt.Errorf("core.hooksPath is not .githooks — run `make hooks` first " +
			"(the pre-commit entry-template check is what stops a forged entry landing)")
	}
	return nil
}
