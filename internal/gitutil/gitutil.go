// Package gitutil shells out to the `git` CLI (docs/conventions.md: "Git/GitHub: never
// go-git") to answer the small set of questions m1-sessions needs about a launch
// directory: is it a git checkout, what branch is it on, and is it a linked worktree.
// Nothing here is Claude-Code-format knowledge; it stays out of internal/claudecode by
// design.
package gitutil

import (
	"context"
	"os/exec"
	"strings"
)

// IsRepo reports whether dir is inside a git working tree.
func IsRepo(ctx context.Context, dir string) bool {
	out, err := runGit(ctx, dir, "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(out) == "true"
}

// Branch returns the current branch name, or nil when dir isn't a git checkout or is
// in a detached-HEAD state (session.branch is "null when not git" — Schema Changes).
func Branch(ctx context.Context, dir string) *string {
	out, err := runGit(ctx, dir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil
	}
	name := strings.TrimSpace(out)
	if name == "" || name == "HEAD" {
		return nil
	}
	return &name
}

// IsWorktree reports whether dir is a linked worktree: its git-dir and the repository's
// common-dir differ (ux-flows §2's recognition rule).
func IsWorktree(ctx context.Context, dir string) bool {
	gitDir, err := runGit(ctx, dir, "rev-parse", "--git-dir")
	if err != nil {
		return false
	}
	commonDir, err := runGit(ctx, dir, "rev-parse", "--git-common-dir")
	if err != nil {
		return false
	}
	return strings.TrimSpace(gitDir) != strings.TrimSpace(commonDir)
}

func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	return string(out), err
}
