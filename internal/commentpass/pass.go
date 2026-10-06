// Package commentpass strips every comment a plan branch added to production code,
// hands them to a judge as text, and reconstructs each file from its snapshot minus the
// drops. Nothing here holds a model; the judge reads one file and writes one JSON.
package commentpass

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// RunFunc is the injectable subprocess seam (docs/conventions.md §Testing).
type RunFunc func(ctx context.Context, dir, name string, args ...string) (stdout, stderr []byte, err error)

// FormatTSFunc formats the given repo-relative TypeScript files in place.
type FormatTSFunc func(ctx context.Context, root string, rels []string) error

// Pass is one invocation's configuration. Zero seams are replaced by New.
type Pass struct {
	Root     string
	Plan     string
	Run      RunFunc
	FormatTS FormatTSFunc
	Now      func() time.Time
	Stdout   io.Writer
}

// New returns a Pass wired to the real git, Biome and clock.
func New(root, plan string, stdout io.Writer) *Pass {
	return &Pass{Root: root, Plan: plan, Run: realRun, FormatTS: npxBiome, Now: time.Now, Stdout: stdout}
}

func realRun(ctx context.Context, dir, name string, args ...string) ([]byte, []byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.WaitDelay = 5 * time.Second
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	return out.Bytes(), errb.Bytes(), err
}

func (p *Pass) git(ctx context.Context, args ...string) (string, error) {
	out, stderr, err := p.Run(ctx, p.Root, "git", args...)
	if err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(stderr)))
	}
	return string(out), nil
}

func (p *Pass) requireBranch(ctx context.Context) error {
	out, err := p.git(ctx, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return err
	}
	if got, want := strings.TrimSpace(out), "plan/"+p.Plan; got != want {
		return fmt.Errorf("on branch %s, want %s", got, want)
	}
	return nil
}

func (p *Pass) mergeBase(ctx context.Context) (string, error) {
	out, err := p.git(ctx, "merge-base", "main", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (p *Pass) ledgerPath() string {
	return filepath.Join("plans", p.Plan, "comment-pass.json")
}

func (p *Pass) abs(rel string) string { return filepath.Join(p.Root, filepath.FromSlash(rel)) }

func (p *Pass) readFile(rel string) ([]byte, error) {
	b, err := os.ReadFile(p.abs(rel))
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", rel, err)
	}
	return b, nil
}

func (p *Pass) writeFile(rel string, b []byte) error {
	if err := os.WriteFile(p.abs(rel), b, 0o644); err != nil {
		return fmt.Errorf("writing %s: %w", rel, err)
	}
	return nil
}

func (p *Pass) printf(format string, args ...any) {
	if p.Stdout != nil {
		fmt.Fprintf(p.Stdout, format, args...)
	}
}

// ErrRefused marks a refusal that wrote nothing.
var ErrRefused = errors.New("refused")
