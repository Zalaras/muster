// Package gitutil shells out to the `git` CLI (docs/conventions.md: "Git/GitHub: never
// go-git") to answer the small set of questions the daemon needs about a launch
// directory: is it a git checkout, where is its top level, what branch is it on, is it a
// linked worktree, and (for the reader) which files does git see there. Nothing here is Claude-Code-format
// knowledge; it stays out of internal/claudecode by design.
package gitutil

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Git holds the one subprocess seam every query in this file crosses (the
// constructor-default shape docs/conventions.md § Testing names —
// kb:adr/process-adapter-run-seam-constructor-default): the package-level functions build
// NewGit(Exec) per call, internal/gitdiff builds one with its own RunFunc, and
// same-package tests overwrite the field directly. The stdout-only shape
// (kb:adr/process-adapter-run-seam-constructor-default's "one signature per output
// need") is claudecode.execFunc/tmux's preflighter.run/locate.SpotlightFinder.run's own
// `func(ctx, name string, args ...string) ([]byte, error)`, with dir and env prepended —
// every git invocation needs a working directory, and a caller that points git at
// another index says so in env, where a fake runner sees it; name/args still carry the
// argv the same way, even though Exec's name is always "git" (mirroring tmux.Client.exec's
// own field, always called with "tmux").
type Git struct {
	run RunFunc
}

type RunFunc func(ctx context.Context, dir string, env []string, name string, args ...string) ([]byte, error)

var ErrNotRepo = errors.New("not a git repository")

const gitTimeout = 30 * time.Second

func NewGit(run RunFunc) *Git {
	return &Git{run: run}
}

func (g *Git) Run(ctx context.Context, dir string, env []string, args ...string) ([]byte, error) {
	return g.run(ctx, dir, env, "git", args...)
}

func (g *Git) Root(ctx context.Context, dir string) (string, error) {
	out, err := g.run(ctx, dir, nil, "git", "rev-parse", "--show-toplevel")
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && exit.ExitCode() == 128 {
			return "", ErrNotRepo
		}
		return "", err
	}
	top := strings.TrimSpace(string(out))
	if top == "" {
		return "", ErrNotRepo
	}
	return top, nil
}

func (g *Git) ListUntracked(ctx context.Context, dir string) ([]string, error) {
	return g.files(ctx, dir, "-o")
}

// IsRepo reports whether dir is inside a git working tree.
func IsRepo(ctx context.Context, dir string) bool {
	return NewGit(Exec).IsRepo(ctx, dir)
}

func (g *Git) IsRepo(ctx context.Context, dir string) bool {
	out, err := g.run(ctx, dir, nil, "git", "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(string(out)) == "true"
}

// Branch returns the current branch name, or nil when dir isn't a git checkout or is in
// a detached-HEAD state — the wire's own "null when not git" contract
// (docs/protocol.md's repo.branch).
func Branch(ctx context.Context, dir string) *string {
	return NewGit(Exec).Branch(ctx, dir)
}

func (g *Git) Branch(ctx context.Context, dir string) *string {
	out, err := g.run(ctx, dir, nil, "git", "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil
	}
	name := strings.TrimSpace(string(out))
	if name == "" || name == "HEAD" {
		return nil
	}
	return &name
}

// TopLevel returns the root of the checkout containing dir, or nil when dir isn't inside
// one. The daemon compares it to tell two directories of one checkout from two checkouts
// (internal/session.Elsewhere); a linked worktree has its own top level.
func TopLevel(ctx context.Context, dir string) *string {
	top, err := NewGit(Exec).Root(ctx, dir)
	if err != nil {
		return nil
	}
	return &top
}

// IsWorktree reports whether dir is a linked worktree: its git-dir and the repository's
// common-dir are different directories (kb:adr/launch-hybrid-mru-directory-memory's
// recognition rule). They are compared as resolved paths, never as git prints them: from a
// subdirectory of an ordinary checkout git spells one absolute and the other relative to dir.
func IsWorktree(ctx context.Context, dir string) bool {
	return NewGit(Exec).IsWorktree(ctx, dir)
}

func (g *Git) IsWorktree(ctx context.Context, dir string) bool {
	out, err := g.run(ctx, dir, nil, "git", "rev-parse", "--git-dir", "--git-common-dir")
	if err != nil {
		return false
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) != 2 {
		return false
	}
	return resolveFrom(dir, lines[0]) != resolveFrom(dir, lines[1])
}

func resolveFrom(dir, path string) string {
	path = strings.TrimSpace(path)
	if !filepath.IsAbs(path) {
		path = filepath.Join(dir, path)
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return filepath.Clean(path)
}

// ListFiles returns every path `git ls-files -co --exclude-standard` reports for dir (a
// checkout root) — tracked files plus untracked-but-not-ignored ones, one repo-relative,
// forward-slash path per entry, in git's own listing order. It answers only what git
// considers present; a caller that cares about a subset (internal/server's reader wants
// only the `.md` ones) filters the result itself, so this stays a plain listing rather
// than growing a second, caller-specific query — the one place that runs `git ls-files`
// at all, so a caller never carries its own git argv.
func ListFiles(ctx context.Context, dir string) ([]string, error) {
	return NewGit(Exec).ListFiles(ctx, dir)
}

func (g *Git) ListFiles(ctx context.Context, dir string) ([]string, error) {
	return g.files(ctx, dir, "-co")
}

func (g *Git) files(ctx context.Context, dir, which string) ([]string, error) {
	out, err := g.run(ctx, dir, nil, "git", "ls-files", which, "--exclude-standard", "-z")
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

func Exec(ctx context.Context, dir string, env []string, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, gitTimeout)
	defer cancel()
	full := append([]string{"--no-optional-locks", "-c", "core.quotepath=off"}, args...)
	cmd := exec.CommandContext(ctx, name, full...)
	cmd.Dir = dir
	cmd.Env = append(append(os.Environ(), "GIT_OPTIONAL_LOCKS=0"), env...)
	// WaitDelay bounds the wait for a descendant that inherited the stdout pipe
	// to close it. The timer starts when ctx is done or when Wait sees git
	// exit, whichever comes first — without it, Output's Wait can block on
	// that descendant forever even with ctx never firing (docs/conventions.md
	// §Go).
	cmd.WaitDelay = 2 * time.Second
	return cmd.Output()
}
