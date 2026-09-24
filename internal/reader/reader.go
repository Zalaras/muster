// Package reader holds the reader feature's filesystem scope and confinement rules —
// which paths a session's reader may list and serve — independent of HTTP handling
// (kb:spec/reader). Pure filesystem logic, like internal/locate: it imports nothing from
// internal/server, internal/session or internal/claudecode. Features: reader.
package reader

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Scope is one session's reader domain: the directory whose markdown may be listed and
// served, and the plan path served alongside it even though it usually sits outside Dir
// (kb:spec/reader). An empty PlanPath means no plan is bound yet.
type Scope struct {
	Dir      string
	PlanPath string
}

// PathQualifies is the change-signal's scope test
// (kb:adr/reader-change-signal-is-the-write-hook): after filepath.Clean, path sits
// lexically under s.Dir and ends in `.md` (case-insensitive), or equals s.PlanPath — no
// symlink resolution (that confinement belongs to serving, in Confine, not to the change
// signal).
func (s Scope) PathQualifies(path string) bool {
	if s.PlanPath != "" && path == s.PlanPath {
		return true
	}
	if !strings.EqualFold(filepath.Ext(path), ".md") {
		return false
	}
	rel, err := filepath.Rel(s.Dir, path)
	if err != nil {
		return false
	}
	return filepath.IsLocal(rel)
}

// Confine reports whether requested may be served from this scope, and its
// symlink-resolved form when so (kb:spec/reader's confinement rule): after
// filepath.EvalSymlinks of both s.Dir and requested, requested must sit under s.Dir and
// end in `.md` (case-insensitive), or equal the resolved s.PlanPath. Existence/directory-
// ness beyond symlink resolution is the caller's job (a Stat after Confine, distinguishing
// 404 from 413).
func (s Scope) Confine(requested string) (string, bool) {
	resolvedDir, err := filepath.EvalSymlinks(filepath.Clean(s.Dir))
	if err != nil {
		return "", false
	}
	resolvedRequested, err := filepath.EvalSymlinks(filepath.Clean(requested))
	if err != nil {
		return "", false
	}

	if s.PlanPath != "" {
		if resolvedPlan, err := filepath.EvalSymlinks(filepath.Clean(s.PlanPath)); err == nil && resolvedRequested == resolvedPlan {
			return resolvedRequested, true
		}
	}

	if !strings.HasPrefix(resolvedRequested, resolvedDir+string(os.PathSeparator)) {
		return "", false
	}
	if !strings.EqualFold(filepath.Ext(resolvedRequested), ".md") {
		return "", false
	}
	return resolvedRequested, true
}

// maxWalkFiles is the non-git listing's walk cap.
const maxWalkFiles = 20000

// ListFilesFunc lists the files git sees under dir — ListMarkdown's consumer-side seam
// over gitutil.ListFiles (docs/conventions.md § Testing): production is
// gitutil.ListFiles, callers fake a neutral file list at this seam rather than git's own
// byte stream, since git's argv is gitutil's concern, not this package's.
type ListFilesFunc func(ctx context.Context, dir string) ([]string, error)

// ListMarkdown lists every `.md` (case-insensitive) file under dir: gitFiles's (typically
// gitutil.ListFiles) `git ls-files -co --exclude-standard` listing when dir is a git
// checkout, filtered to `.md`, or a bounded dot-directory-skipping walk otherwise
// (kb:spec/reader). A git failure (not a checkout, or a real error) is not itself fatal —
// ListMarkdown falls back to the walk and returns the git error as gitErr solely so the
// caller can log it; the walk's own result is never an error.
func ListMarkdown(ctx context.Context, dir string, gitFiles ListFilesFunc) (paths []string, listing string, truncated bool, gitErr error) {
	files, err := gitFiles(ctx, dir)
	if err != nil {
		paths, listing, truncated = WalkMarkdown(dir)
		return paths, listing, truncated, err
	}

	var md []string
	for _, rel := range files {
		if strings.EqualFold(filepath.Ext(rel), ".md") {
			md = append(md, rel)
		}
	}
	sort.Strings(md)
	return md, "git", false, nil
}

// errWalkCap stops WalkMarkdown's WalkDir early once maxWalkFiles is reached; never
// surfaced past this function.
var errWalkCap = errors.New("reader: walk file cap reached")

// WalkMarkdown lists every `.md` (case-insensitive) file under dir by walking it directly
// — ListMarkdown's fallback when dir isn't a git checkout, or the git query failed.
func WalkMarkdown(dir string) (paths []string, listing string, truncated bool) {
	var md []string
	// The walk's own top-level error (beyond the cap sentinel, handled inline below) is
	// never inspected: WalkMarkdown has no logger (kept intentionally pure — the caller
	// already logs the git-fallback path via ListMarkdown's returned gitErr), and it means
	// a root that vanished mid-walk — rare enough that the partial md collected so far is
	// an adequate answer.
	_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil //nolint:nilerr // deliberately continue past one unreadable entry rather than failing the whole listing
		}
		if path == dir {
			return nil
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.EqualFold(filepath.Ext(d.Name()), ".md") {
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return nil //nolint:nilerr // an unrelatable path is skipped, not fatal to the listing
		}
		md = append(md, filepath.ToSlash(rel))
		if len(md) >= maxWalkFiles {
			return errWalkCap
		}
		return nil
	})
	truncated = len(md) >= maxWalkFiles
	sort.Strings(md)
	return md, "walk", truncated
}
