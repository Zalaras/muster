package gitdiff

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/Zalaras/muster/internal/gitutil"
)

type Scope string

const (
	ScopeUncommitted Scope = "uncommitted"
	ScopeBranch      Scope = "branch"
)

const (
	maxUntrackedBytes  = 256 << 10
	untrackedHunkStart = "@@ -0,0 +1,%d @@"
)

var ErrNotRepo = gitutil.ErrNotRepo

type Line struct {
	Kind string `json:"kind"`
	Old  *int   `json:"old"`
	New  *int   `json:"new"`
	Text string `json:"text"`
}

type Hunk struct {
	Header   string `json:"header"`
	OldStart int    `json:"oldStart"`
	OldLines int    `json:"oldLines"`
	NewStart int    `json:"newStart"`
	NewLines int    `json:"newLines"`
	Lines    []Line `json:"lines"`
}

type File struct {
	Path      string  `json:"path"`
	OldPath   *string `json:"oldPath"`
	Status    string  `json:"status"`
	Binary    bool    `json:"binary"`
	Additions int     `json:"additions"`
	Deletions int     `json:"deletions"`
	Hunks     []Hunk  `json:"hunks"`
}

type Diff struct {
	Scope       Scope  `json:"scope"`
	Base        string `json:"base"`
	Fingerprint string `json:"fingerprint"`
	Files       []File `json:"files"`
}

type Counts struct {
	Files       int    `json:"files"`
	Additions   int    `json:"additions"`
	Deletions   int    `json:"deletions"`
	Fingerprint string `json:"fingerprint"`
}

type Summary struct {
	Repo        bool   `json:"repo"`
	Uncommitted Counts `json:"uncommitted"`
	Branch      Counts `json:"branch"`
}

type Reader struct {
	git *gitutil.Git
}

func NewReader() *Reader {
	return &Reader{git: gitutil.NewGit(gitutil.Exec)}
}

func (r *Reader) output(ctx context.Context, dir string, env []string, args ...string) (string, error) {
	out, err := r.git.Run(ctx, dir, env, args...)
	if err != nil {
		return "", fmt.Errorf("git %s: %w", args[0], err)
	}
	return string(out), nil
}

func (r *Reader) checkout(ctx context.Context, dir string) (string, error) {
	top, err := r.git.Root(ctx, dir)
	if err != nil && !errors.Is(err, ErrNotRepo) {
		return "", fmt.Errorf("git rev-parse: %w", err)
	}
	return top, err
}

func (r *Reader) Summary(ctx context.Context, dir string) (Summary, error) {
	top, err := r.checkout(ctx, dir)
	if errors.Is(err, ErrNotRepo) {
		return Summary{}, nil
	}
	if err != nil {
		return Summary{}, err
	}
	out := Summary{Repo: true}
	for scope, counts := range map[Scope]*Counts{ScopeUncommitted: &out.Uncommitted, ScopeBranch: &out.Branch} {
		d, err := r.readAt(ctx, top, scope)
		if err != nil {
			return Summary{}, err
		}
		*counts = d.counts()
	}
	return out, nil
}

func (r *Reader) Read(ctx context.Context, dir string, scope Scope) (Diff, error) {
	top, err := r.checkout(ctx, dir)
	if err != nil {
		return Diff{}, err
	}
	return r.readAt(ctx, top, scope)
}

func (d Diff) counts() Counts {
	c := Counts{Files: len(d.Files), Fingerprint: d.Fingerprint}
	for _, f := range d.Files {
		c.Additions += f.Additions
		c.Deletions += f.Deletions
	}
	return c
}

func (r *Reader) readAt(ctx context.Context, top string, scope Scope) (Diff, error) {
	base, ref, err := r.resolveBase(ctx, top, scope)
	if err != nil {
		return Diff{}, err
	}

	var files []File
	if ref == "" {
		files, err = r.allFilesAdded(ctx, top)
	} else {
		files, err = r.trackedFiles(ctx, top, ref)
	}
	if err != nil {
		return Diff{}, err
	}
	if ref != "" {
		untracked, err := r.untrackedFiles(ctx, top)
		if err != nil {
			return Diff{}, err
		}
		files = append(files, untracked...)
	}
	sort.SliceStable(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	if files == nil {
		files = []File{}
	}

	d := Diff{Scope: scope, Base: base, Files: files}
	d.Fingerprint = fingerprint(d)
	return d, nil
}

func fingerprint(d Diff) string {
	h := sha256.New()
	write := func(parts ...string) {
		for _, p := range parts {
			fmt.Fprintf(h, "%d:%s|", len(p), p)
		}
	}
	write(string(d.Scope), d.Base)
	for _, f := range d.Files {
		old := ""
		if f.OldPath != nil {
			old = *f.OldPath
		}
		write(f.Path, old, f.Status, fmt.Sprint(f.Binary))
		for _, hunk := range f.Hunks {
			write(hunk.Header)
			for _, l := range hunk.Lines {
				write(l.Kind, l.Text)
			}
		}
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

func (r *Reader) resolveBase(ctx context.Context, top string, scope Scope) (display, ref string, err error) {
	head, ok := r.try(ctx, top, "rev-parse", "--verify", "-q", "--short", "HEAD")
	if !ok {
		return "empty repository", "", nil
	}
	headBase := fmt.Sprintf("HEAD (%s)", head)
	if scope == ScopeUncommitted {
		return headBase, "HEAD", nil
	}

	name, ok := r.defaultBranch(ctx, top)
	if !ok {
		return headBase + " — no default branch found", "HEAD", nil
	}
	short := strings.TrimPrefix(name, "origin/")
	if current, _ := r.try(ctx, top, "symbolic-ref", "-q", "--short", "HEAD"); current == short {
		return fmt.Sprintf("%s — already on %s", headBase, short), "HEAD", nil
	}
	merge, ok := r.try(ctx, top, "merge-base", "HEAD", name)
	if !ok {
		return headBase + " — no default branch found", "HEAD", nil
	}
	mergeShort, err := r.output(ctx, top, nil, "rev-parse", "--short", merge)
	if err != nil {
		return "", "", err
	}
	return fmt.Sprintf("%s @ %s", short, strings.TrimSpace(mergeShort)), merge, nil
}

func (r *Reader) try(ctx context.Context, top string, args ...string) (string, bool) {
	out, err := r.output(ctx, top, nil, args...)
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(out), true
}

func (r *Reader) defaultBranch(ctx context.Context, top string) (string, bool) {
	candidates := []string{"main", "master"}
	if out, err := r.output(ctx, top, nil, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD"); err == nil {
		if target := strings.TrimSpace(out); target != "" {
			candidates = append([]string{target}, candidates...)
		}
	}
	for _, name := range candidates {
		if _, err := r.output(ctx, top, nil, "rev-parse", "--verify", "-q", name+"^{commit}"); err == nil {
			return name, true
		}
	}
	return "", false
}
