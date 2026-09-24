package reader

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestConfine covers D11/INV-2 from every listed entry point: a plain file under the
// directory, `..` traversal, a symlink inside the directory targeting outside, a
// symlinked directory, the plan path (allowed even though it sits outside the
// directory), and a non-`.md` file.
func TestConfine(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.md"), []byte("# A"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "sub"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "sub", "b.md"), []byte("# B"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x"), 0o644))

	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "secret.md")
	require.NoError(t, os.WriteFile(outsideFile, []byte("secret"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(outside, "outdir"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(outside, "outdir", "x.md"), []byte("x"), 0o644))

	// A symlink inside dir pointing at a file outside it.
	require.NoError(t, os.Symlink(outsideFile, filepath.Join(dir, "link.md")))
	// A symlinked directory inside dir pointing at a directory outside it.
	require.NoError(t, os.Symlink(filepath.Join(outside, "outdir"), filepath.Join(dir, "linkdir")))

	planDir := t.TempDir()
	planPath := filepath.Join(planDir, "plan.md")
	require.NoError(t, os.WriteFile(planPath, []byte("# Plan"), 0o644))
	// The plan's -agent- and .workshop.md siblings, sitting next to the real plan but
	// outside the session directory — neither is the plan path itself, so neither may
	// be served.
	agentSibling := filepath.Join(planDir, "plan-agent-helper.md")
	require.NoError(t, os.WriteFile(agentSibling, []byte("x"), 0o644))
	workshopSibling := filepath.Join(planDir, "plan.workshop.md")
	require.NoError(t, os.WriteFile(workshopSibling, []byte("x"), 0o644))

	tests := []struct {
		name      string
		requested string
		wantOK    bool
	}{
		{"a plain file under dir", filepath.Join(dir, "a.md"), true},
		{"a nested file under dir", filepath.Join(dir, "sub", "b.md"), true},
		{"the plan path, outside dir", planPath, true},
		{"a non-.md file under dir", filepath.Join(dir, "notes.txt"), false},
		{"`..` traversal to outside dir", filepath.Join(dir, "..", filepath.Base(outside), "secret.md"), false},
		{"a symlink inside dir targeting an outside file", filepath.Join(dir, "link.md"), false},
		{"a symlinked directory inside dir, reached through it", filepath.Join(dir, "linkdir", "x.md"), false},
		{"the plan's -agent- sibling, outside dir", agentSibling, false},
		{"the plan's .workshop.md sibling, outside dir", workshopSibling, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolved, ok := Scope{Dir: dir, PlanPath: planPath}.Confine(tt.requested)
			assert.Equal(t, tt.wantOK, ok)
			if tt.wantOK {
				want, err := filepath.EvalSymlinks(tt.requested)
				require.NoError(t, err)
				assert.Equal(t, want, resolved)
			}
		})
	}

	t.Run("confine works with no plan path at all", func(t *testing.T) {
		_, ok := Scope{Dir: dir}.Confine(planPath)
		assert.False(t, ok, "an empty planPath must never itself become an allowed match")
	})
}

// TestReaderPathQualifies covers REQ-18's docChanged scope test: lexical confinement
// (no symlink resolution), a `.md` suffix under dir, or an exact match on planPath.
func TestReaderPathQualifies(t *testing.T) {
	const dir = "/tmp/proj"
	const planPath = "/Users/d/.claude/plans/happy-otter.md"

	tests := []struct {
		name string
		path string
		want bool
	}{
		{"exactly the plan path", planPath, true},
		{"a .md file under dir", "/tmp/proj/TODO.md", true},
		{"a nested .md file under dir, case-insensitive extension", "/tmp/proj/sub/x.MD", true},
		{"a non-.md file under dir", "/tmp/proj/notes.txt", false},
		{"a .md file outside dir and not the plan", "/tmp/other/x.md", false},
		{"dir itself is not a qualifying file", "/tmp/proj", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, Scope{Dir: dir, PlanPath: planPath}.PathQualifies(tt.path))
		})
	}

	t.Run("no plan path configured never matches on path alone", func(t *testing.T) {
		assert.False(t, Scope{Dir: dir}.PathQualifies("/tmp/proj/notes.txt"))
	})
}

// TestWalkMarkdown covers D8/REQ-10/REQ-25: every `.md` file (case-insensitive) is
// listed relative to dir, dot-directories are skipped entirely, and results are sorted.
func TestWalkMarkdown(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "TODO.md"), []byte("x"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "docs"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "docs", "guide.MD"), []byte("x"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(dir, ".git"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".git", "ignored.md"), []byte("x"), 0o644))

	paths, listing, truncated := WalkMarkdown(dir)

	assert.Equal(t, "walk", listing)
	assert.False(t, truncated)
	assert.Equal(t, []string{"TODO.md", "docs/guide.MD"}, paths)
}

// TestWalkMarkdown_CapsAt20000AndReportsTruncated covers REQ-25: the walk stops at
// 20,000 files and reports truncated:true.
func TestWalkMarkdown_CapsAt20000AndReportsTruncated(t *testing.T) {
	dir := t.TempDir()
	const total = maxWalkFiles + 5
	for i := range total {
		require.NoError(t, os.WriteFile(filepath.Join(dir, fmt.Sprintf("f%05d.md", i)), nil, 0o644))
	}

	paths, listing, truncated := WalkMarkdown(dir)

	assert.Equal(t, "walk", listing)
	assert.True(t, truncated)
	assert.Len(t, paths, maxWalkFiles)
}
