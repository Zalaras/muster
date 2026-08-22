package gitutil

import (
	"context"
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
