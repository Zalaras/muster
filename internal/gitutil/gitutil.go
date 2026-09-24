// Package gitutil shells out to the `git` CLI (docs/conventions.md: "Git/GitHub: never
// go-git") to answer the small set of questions the daemon needs about a launch
// directory: is it a git checkout, what branch is it on, is it a linked worktree, and
// (for the reader) which files does git see there. Nothing here is Claude-Code-format
// knowledge; it stays out of internal/claudecode by design.
package gitutil

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// gitRunner holds the one subprocess seam every query in this file crosses (the
// constructor-default shape docs/conventions.md § Testing names —
// kb:adr/process-adapter-run-seam-constructor-default): production always runGit,
// same-package tests overwrite the field directly. Built fresh per call, the same as
// tmux.Preflight's newPreflighter(), since none of gitutil's functions carry any
// per-call config beyond ctx and dir. The stdout-only shape
// (kb:adr/process-adapter-run-seam-constructor-default's "one signature per output
// need") is claudecode.execFunc/tmux's preflighter.run/locate.SpotlightFinder.run's own
// `func(ctx, name string, args ...string) ([]byte, error)`, with dir prepended — every
// git invocation needs a working directory, and name/args still carry the argv the same
// way, even though runGit's own name is always "git" (mirroring tmux.Client.exec's own
// field, always called with "tmux").
type gitRunner struct {
	run func(ctx context.Context, dir, name string, args ...string) ([]byte, error)
}

func newGitRunner() *gitRunner {
	return &gitRunner{run: runGit}
}

// IsRepo reports whether dir is inside a git working tree.
func IsRepo(ctx context.Context, dir string) bool {
	return newGitRunner().isRepo(ctx, dir)
}

func (g *gitRunner) isRepo(ctx context.Context, dir string) bool {
	out, err := g.run(ctx, dir, "git", "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(string(out)) == "true"
}

// Branch returns the current branch name, or nil when dir isn't a git checkout or is in
// a detached-HEAD state — the wire's own "null when not git" contract
// (docs/protocol.md's repo.branch).
func Branch(ctx context.Context, dir string) *string {
	return newGitRunner().branch(ctx, dir)
}

func (g *gitRunner) branch(ctx context.Context, dir string) *string {
	out, err := g.run(ctx, dir, "git", "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil
	}
	name := strings.TrimSpace(string(out))
	if name == "" || name == "HEAD" {
		return nil
	}
	return &name
}

// IsWorktree reports whether dir is a linked worktree: its git-dir and the repository's
// common-dir differ (kb:adr/launch-hybrid-mru-directory-memory's recognition rule).
func IsWorktree(ctx context.Context, dir string) bool {
	return newGitRunner().isWorktree(ctx, dir)
}

func (g *gitRunner) isWorktree(ctx context.Context, dir string) bool {
	gitDir, err := g.run(ctx, dir, "git", "rev-parse", "--git-dir")
	if err != nil {
		return false
	}
	commonDir, err := g.run(ctx, dir, "git", "rev-parse", "--git-common-dir")
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(gitDir)) != strings.TrimSpace(string(commonDir))
}

// ListFiles returns every path `git ls-files -co --exclude-standard` reports for dir (a
// checkout root) — tracked files plus untracked-but-not-ignored ones, one repo-relative,
// forward-slash path per entry, in git's own listing order. It answers only what git
// considers present; a caller that cares about a subset (internal/server's reader wants
// only the `.md` ones) filters the result itself, so this stays a plain listing rather
// than growing a second, caller-specific query — the one place that runs `git ls-files`
// at all, so a caller never carries its own git argv.
func ListFiles(ctx context.Context, dir string) ([]string, error) {
	return newGitRunner().listFiles(ctx, dir)
}

func (g *gitRunner) listFiles(ctx context.Context, dir string) ([]string, error) {
	out, err := g.run(ctx, dir, "git", "ls-files", "-co", "--exclude-standard", "-z")
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimRight(string(out), "\x00")
	if trimmed == "" {
		return nil, nil
	}
	parts := strings.Split(trimmed, "\x00")
	paths := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			paths = append(paths, filepath.ToSlash(p))
		}
	}
	return paths, nil
}

func runGit(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	// WaitDelay bounds the wait for a descendant that inherited the stdout pipe
	// to close it. The timer starts when ctx is done or when Wait sees git
	// exit, whichever comes first — without it, Output's Wait can block on
	// that descendant forever even with ctx never firing (docs/conventions.md
	// §Go).
	cmd.WaitDelay = 2 * time.Second
	return cmd.Output()
}
