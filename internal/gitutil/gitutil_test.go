package gitutil

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// runGitFixture shells out to git directly (not through the package under test) to set
// up a fixture repository for the tests below.
func runGitFixture(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	require.NoErrorf(t, err, "git %v failed: %s", args, out)
}

// initRepoWithOneCommit creates a git repo on branch "main" with a single commit, so
// HEAD is a born ref (an empty repo's HEAD is unborn and rev-parse fails on it).
func initRepoWithOneCommit(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runGitFixture(t, dir, "init", "-q", "-b", "main")
	runGitFixture(t, dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "--allow-empty", "-q", "-m", "initial")
	return dir
}

func TestIsRepo_TrueInsideAGitWorkingTree(t *testing.T) {
	dir := initRepoWithOneCommit(t)

	assert.True(t, IsRepo(context.Background(), dir))
}

func TestIsRepo_FalseForAPlainDirectory(t *testing.T) {
	dir := t.TempDir()

	assert.False(t, IsRepo(context.Background(), dir))
}

func TestIsRepo_FalseForANonExistentDirectory(t *testing.T) {
	assert.False(t, IsRepo(context.Background(), "/nonexistent/path/does/not/exist"))
}

func TestBranch_ReturnsTheCurrentBranchName(t *testing.T) {
	dir := initRepoWithOneCommit(t)

	branch := Branch(context.Background(), dir)

	require.NotNil(t, branch)
	assert.Equal(t, "main", *branch)
}

func TestBranch_NilForAPlainNonGitDirectory(t *testing.T) {
	dir := t.TempDir()

	assert.Nil(t, Branch(context.Background(), dir))
}

func TestBranch_NilInDetachedHEADState(t *testing.T) {
	dir := initRepoWithOneCommit(t)
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	require.NoError(t, err)
	sha := strings.TrimSpace(string(out))
	runGitFixture(t, dir, "checkout", "-q", "--detach", sha)

	assert.Nil(t, Branch(context.Background(), dir), "session.branch is null when not on a named branch (Schema Changes note)")
}

func TestIsWorktree_FalseForAnOrdinaryRepo(t *testing.T) {
	dir := initRepoWithOneCommit(t)

	assert.False(t, IsWorktree(context.Background(), dir))
}

func TestIsWorktree_FalseForAPlainNonGitDirectory(t *testing.T) {
	dir := t.TempDir()

	assert.False(t, IsWorktree(context.Background(), dir))
}

func TestIsWorktree_TrueForALinkedWorktreeFalseForItsMainCheckout(t *testing.T) {
	mainDir := initRepoWithOneCommit(t)
	worktreeDir := filepath.Join(t.TempDir(), "linked")
	runGitFixture(t, mainDir, "worktree", "add", "-q", "-b", "feature/x", worktreeDir)

	assert.True(t, IsWorktree(context.Background(), worktreeDir), "ux-flows §2's recognition rule: git-dir != common-dir for a linked worktree")
	assert.False(t, IsWorktree(context.Background(), mainDir), "the original checkout is not itself a linked worktree")
}

// TestIsWorktree_FromASubdirectory: the flag is a property of the checkout, not of where git
// ran. From a subdirectory git spells --git-dir absolute and --git-common-dir relative to the
// directory, so a spelling comparison called an ordinary checkout's subdirectory a worktree.
func TestIsWorktree_FromASubdirectory(t *testing.T) {
	mainDir := initRepoWithOneCommit(t)
	linkedDir := filepath.Join(t.TempDir(), "linked")
	runGitFixture(t, mainDir, "worktree", "add", "-q", "-b", "feature/x", linkedDir)
	mkdir := func(root string, parts ...string) string {
		dir := filepath.Join(append([]string{root}, parts...)...)
		require.NoError(t, os.MkdirAll(dir, 0o755))
		return dir
	}

	cases := []struct {
		name string
		dir  string
		want bool
	}{
		{"ordinary checkout root", mainDir, false},
		{"ordinary checkout, one level down", mkdir(mainDir, "pkg"), false},
		{"ordinary checkout, two levels down", mkdir(mainDir, "pkg", "deep"), false},
		{"linked worktree root", linkedDir, true},
		{"linked worktree, one level down", mkdir(linkedDir, "pkg"), true},
		{"linked worktree, two levels down", mkdir(linkedDir, "pkg", "deep"), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, IsWorktree(context.Background(), tc.dir))
		})
	}
}

// TestIsWorktree_ComparesResolvedPaths feeds the runner the spellings git was measured to
// print, so the comparison is pinned without a git binary: a relative path is taken relative
// to the directory git ran in, and a symlinked spelling of one directory is the same directory.
func TestIsWorktree_ComparesResolvedPaths(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)
	repo := filepath.Join(root, "repo")
	require.NoError(t, os.MkdirAll(filepath.Join(repo, ".git"), 0o755))
	sub := filepath.Join(repo, "pkg")
	require.NoError(t, os.MkdirAll(sub, 0o755))
	link := filepath.Join(root, "link")
	require.NoError(t, os.Symlink(repo, link))
	other := filepath.Join(root, "main-repo", ".git")
	require.NoError(t, os.MkdirAll(other, 0o755))

	cases := []struct {
		name string
		dir  string
		out  string
		want bool
	}{
		{"root, both relative and equal", repo, ".git\n.git\n", false},
		{"subdirectory, absolute git-dir and relative common-dir", sub, repo + "/.git\n../.git\n", false},
		{"subdirectory, relative common-dir climbing out", sub, "../.git\n" + repo + "/.git\n", false},
		{"symlinked spelling of the same git-dir", repo, link + "/.git\n.git\n", false},
		{"linked worktree, common-dir elsewhere", repo, repo + "/.git\n" + other + "\n", true},
		{"a missing path is cleaned, dot-dot folded", repo, "gone/../.git\n.git\n", false},
		{"one line is not an answer", repo, ".git\n", false},
		{"three lines is not an answer", repo, ".git\n.git\n.git\n", false},
		{"empty output is not an answer", repo, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := &gitRunner{run: func(_ context.Context, dir, _ string, args ...string) ([]byte, error) {
				assert.Equal(t, tc.dir, dir)
				assert.Equal(t, []string{"rev-parse", "--git-dir", "--git-common-dir"}, args)
				return []byte(tc.out), nil
			}}

			assert.Equal(t, tc.want, g.isWorktree(context.Background(), tc.dir))
		})
	}

	t.Run("a failing git is not a worktree", func(t *testing.T) {
		g := &gitRunner{run: func(context.Context, string, string, ...string) ([]byte, error) {
			return []byte("a\nb\n"), errors.New("exit status 128")
		}}

		assert.False(t, g.isWorktree(context.Background(), repo))
	})
}

// ListFiles: the gitRunner-level table covers the NUL-parsing logic directly (no
// subprocess needed for that), and the two ListFiles-level tests below confirm the real
// `git ls-files -co --exclude-standard -z` argv actually produces the tracked/untracked/
// not-ignored split the reader depends on.

func TestGitRunner_ListFiles_ParsesNulSeparatedOutput(t *testing.T) {
	g := &gitRunner{run: func(context.Context, string, string, ...string) ([]byte, error) {
		return []byte("zeta.md\x00notes.txt\x00docs/alpha.md\x00"), nil
	}}

	paths, err := g.listFiles(context.Background(), "/some/dir")

	require.NoError(t, err)
	assert.Equal(t, []string{"zeta.md", "notes.txt", "docs/alpha.md"}, paths)
}

func TestGitRunner_ListFiles_EmptyOutputIsNilNotEmptySlice(t *testing.T) {
	g := &gitRunner{run: func(context.Context, string, string, ...string) ([]byte, error) {
		return nil, nil
	}}

	paths, err := g.listFiles(context.Background(), "/some/dir")

	require.NoError(t, err)
	assert.Nil(t, paths)
}

func TestGitRunner_ListFiles_RunErrorPropagates(t *testing.T) {
	wantErr := errors.New("exit status 128: not a git repository")
	g := &gitRunner{run: func(context.Context, string, string, ...string) ([]byte, error) {
		return nil, wantErr
	}}

	_, err := g.listFiles(context.Background(), "/some/dir")

	assert.ErrorIs(t, err, wantErr)
}

func TestListFiles_ReturnsTrackedUntrackedButNotGitignoredFiles(t *testing.T) {
	dir := initRepoWithOneCommit(t)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "tracked.md"), []byte("x"), 0o644))
	runGitFixture(t, dir, "add", "tracked.md")
	runGitFixture(t, dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-q", "-m", "add tracked")
	require.NoError(t, os.WriteFile(filepath.Join(dir, "untracked.txt"), []byte("y"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("ignored.md\n"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "ignored.md"), []byte("z"), 0o644))

	paths, err := ListFiles(context.Background(), dir)

	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"tracked.md", "untracked.txt", ".gitignore"}, paths, "ignored.md must be excluded by --exclude-standard")
}

func TestListFiles_ErrorForANonGitDirectory(t *testing.T) {
	dir := t.TempDir()

	_, err := ListFiles(context.Background(), dir)

	assert.Error(t, err)
}

// TopLevel is the root `git rev-parse --show-toplevel` names: the daemon compares it to tell
// two directories of one checkout from two checkouts (internal/session.Elsewhere).

func TestGitRunner_TopLevel(t *testing.T) {
	cases := []struct {
		name string
		out  string
		err  error
		want *string
	}{
		{name: "trims the trailing newline", out: "/repo\n", want: strPtr("/repo")},
		{name: "empty output is not a checkout", out: "\n", want: nil},
		{name: "a git error is not a checkout", err: errors.New("exit status 128: not a git repository"), want: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotArgs []string
			g := &gitRunner{run: func(_ context.Context, _, _ string, args ...string) ([]byte, error) {
				gotArgs = args
				return []byte(tc.out), tc.err
			}}

			assert.Equal(t, tc.want, g.topLevel(context.Background(), "/repo/sub"))
			assert.Equal(t, []string{"rev-parse", "--show-toplevel"}, gotArgs)
		})
	}
}

func TestTopLevel_RealGit(t *testing.T) {
	repo := initRepoWithOneCommit(t)
	require.NoError(t, os.Mkdir(filepath.Join(repo, "sub"), 0o755))
	worktree := filepath.Join(t.TempDir(), "linked")
	runGitFixture(t, repo, "worktree", "add", "-q", "-b", "feature/x", worktree)
	// macOS spells a temp dir /var/... while git reports /private/var/...; compare resolved.
	resolve := func(p string) string {
		r, err := filepath.EvalSymlinks(p)
		require.NoError(t, err)
		return r
	}

	t.Run("the checkout root for the root itself and a subdirectory", func(t *testing.T) {
		for _, dir := range []string{repo, filepath.Join(repo, "sub")} {
			got := TopLevel(context.Background(), dir)
			require.NotNil(t, got, dir)
			assert.Equal(t, resolve(repo), resolve(*got))
		}
	})

	t.Run("a linked worktree has its own top level", func(t *testing.T) {
		got := TopLevel(context.Background(), worktree)
		require.NotNil(t, got)
		assert.Equal(t, resolve(worktree), resolve(*got))
		assert.NotEqual(t, resolve(repo), resolve(*got))
	})

	t.Run("nil for a plain directory and a missing one", func(t *testing.T) {
		assert.Nil(t, TopLevel(context.Background(), t.TempDir()))
		assert.Nil(t, TopLevel(context.Background(), filepath.Join(t.TempDir(), "missing")))
	})
}

func strPtr(s string) *string { return &s }
