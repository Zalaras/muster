package gitdiff

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/gitutil"
)

// gitIn runs git in dir with a fixed identity; a failure fails the test.
func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	full := append([]string{"-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "commit.gpgsign=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false"}, args...)
	cmd := exec.Command("git", full...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, "git %s: %s", strings.Join(args, " "), out)
	return strings.TrimSpace(string(out))
}

func writeFile(t *testing.T, dir, rel, content string) {
	t.Helper()
	abs := filepath.Join(dir, rel)
	require.NoError(t, os.MkdirAll(filepath.Dir(abs), 0o755))
	require.NoError(t, os.WriteFile(abs, []byte(content), 0o644))
}

// initRepo makes an empty repo whose first branch is branch.
func initRepo(t *testing.T, branch string) string {
	t.Helper()
	dir := t.TempDir()
	gitIn(t, dir, "init", "-q", "-b", branch)
	return dir
}

// commitAll stages and commits everything in dir.
func commitAll(t *testing.T, dir, msg string) {
	t.Helper()
	gitIn(t, dir, "add", "-A")
	gitIn(t, dir, "commit", "-q", "-m", msg)
}

// newRepo makes a repo on main with one commit holding files.
func newRepo(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := initRepo(t, "main")
	for p, c := range files {
		writeFile(t, dir, p, c)
	}
	commitAll(t, dir, "base")
	return dir
}

func readScope(t *testing.T, dir string, scope Scope) Diff {
	t.Helper()
	d, err := NewReader().Read(context.Background(), dir, scope)
	require.NoError(t, err)
	return d
}

func byPath(d Diff) map[string]File {
	m := map[string]File{}
	for _, f := range d.Files {
		m[f.Path] = f
	}
	return m
}

// snapshotGit records every file under .git with its mtime so a read can be shown to write nothing.
func snapshotGit(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	require.NoError(t, filepath.Walk(filepath.Join(dir, ".git"), func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		b, rerr := os.ReadFile(p)
		require.NoError(t, rerr)
		out[p] = string(b) + info.ModTime().String()
		return nil
	}))
	return out
}

func TestRead_TrackedChangeShapes(t *testing.T) {
	dir := newRepo(t, map[string]string{
		"mod.txt":  "one\ntwo\nthree\n",
		"gone.txt": "bye\n",
		"old.txt":  "line a\nline b\nline c\nline d\nline e\n",
		"bin.dat":  "x\x00y",
		"crlf.txt": "a\r\nb\r\n",
	})
	writeFile(t, dir, "mod.txt", "one\nTWO\nthree\nfour\n")
	require.NoError(t, os.Remove(filepath.Join(dir, "gone.txt")))
	gitIn(t, dir, "mv", "old.txt", "new.txt")
	writeFile(t, dir, "bin.dat", "x\x00z")
	writeFile(t, dir, "crlf.txt", "a\r\nB\r\n")
	writeFile(t, dir, "fresh.txt", "hello\nworld\n")

	d := readScope(t, dir, ScopeUncommitted)
	files := byPath(d)

	assert.Equal(t, ScopeUncommitted, d.Scope)
	assert.Regexp(t, `^HEAD \([0-9a-f]+\)$`, d.Base)
	paths := make([]string, 0, len(d.Files))
	for _, f := range d.Files {
		paths = append(paths, f.Path)
	}
	assert.Equal(t, []string{"bin.dat", "crlf.txt", "fresh.txt", "gone.txt", "mod.txt", "new.txt"}, paths, "ordered by path")

	mod := files["mod.txt"]
	assert.Equal(t, "modified", mod.Status)
	assert.Equal(t, 2, mod.Additions)
	assert.Equal(t, 1, mod.Deletions)
	require.Len(t, mod.Hunks, 1)
	h := mod.Hunks[0]
	assert.Equal(t, 1, h.OldStart)
	assert.Equal(t, 3, h.OldLines)
	assert.Equal(t, 1, h.NewStart)
	assert.Equal(t, 4, h.NewLines)
	require.Len(t, h.Lines, 5)
	want := []struct {
		kind, text string
		old, new   int
	}{
		{"context", "one", 1, 1}, {"del", "two", 2, 0}, {"add", "TWO", 0, 2}, {"context", "three", 3, 3}, {"add", "four", 0, 4},
	}
	for i, w := range want {
		l := h.Lines[i]
		assert.Equal(t, w.kind, l.Kind, "line %d kind", i)
		assert.Equal(t, w.text, l.Text, "line %d text", i)
		if w.old == 0 {
			assert.Nil(t, l.Old, "line %d old is null exactly for add", i)
		} else if assert.NotNil(t, l.Old) {
			assert.Equal(t, w.old, *l.Old)
		}
		if w.new == 0 {
			assert.Nil(t, l.New, "line %d new is null exactly for del", i)
		} else if assert.NotNil(t, l.New) {
			assert.Equal(t, w.new, *l.New)
		}
	}

	assert.Equal(t, "deleted", files["gone.txt"].Status)
	assert.Equal(t, 1, files["gone.txt"].Deletions)

	renamed := files["new.txt"]
	assert.Equal(t, "renamed", renamed.Status)
	require.NotNil(t, renamed.OldPath)
	assert.Equal(t, "old.txt", *renamed.OldPath)
	assert.Nil(t, mod.OldPath, "oldPath is set only for a rename")

	bin := files["bin.dat"]
	assert.True(t, bin.Binary)
	assert.NotNil(t, bin.Hunks, "hunks is [] not null")
	assert.Empty(t, bin.Hunks)
	assert.Zero(t, bin.Additions)

	assert.Equal(t, "B", files["crlf.txt"].Hunks[0].Lines[2].Text, "no trailing carriage return on text")
	assert.Equal(t, "added", files["fresh.txt"].Status)
	assert.Equal(t, 2, files["fresh.txt"].Additions)
}

func TestRead_OddPathsAreExact(t *testing.T) {
	names := []string{"with space.txt", "tab\there.txt", "ünïcode.txt", "dir/sub dir/x.txt", "quote\"d.txt"}
	files := map[string]string{}
	for _, n := range names {
		files[n] = "a\n"
	}
	dir := newRepo(t, files)
	for _, n := range names {
		writeFile(t, dir, n, "b\n")
	}

	d := readScope(t, dir, ScopeUncommitted)

	got := map[string]bool{}
	for _, f := range d.Files {
		got[f.Path] = true
	}
	for _, n := range names {
		assert.True(t, got[n], "%q listed verbatim", n)
	}
	assert.Len(t, d.Files, len(names))
}

func TestRead_NonUTF8BecomesReplacementRune(t *testing.T) {
	dir := newRepo(t, map[string]string{"f.txt": "ok\n"})
	writeFile(t, dir, "f.txt", "ok\nbad \xff\xfe byte\n")

	d := readScope(t, dir, ScopeUncommitted)

	require.Len(t, d.Files, 1)
	lines := d.Files[0].Hunks[0].Lines
	assert.Equal(t, "bad � byte", lines[len(lines)-1].Text)
}

func TestRead_NoNewlineMarkerDropped(t *testing.T) {
	dir := newRepo(t, map[string]string{"f.txt": "a\nb"})
	writeFile(t, dir, "f.txt", "a\nc")

	d := readScope(t, dir, ScopeUncommitted)

	for _, l := range d.Files[0].Hunks[0].Lines {
		assert.NotContains(t, l.Text, "No newline")
	}
	assert.Equal(t, 1, d.Files[0].Additions)
	assert.Equal(t, 1, d.Files[0].Deletions)
}

func TestRead_UntrackedRules(t *testing.T) {
	dir := newRepo(t, map[string]string{".gitignore": "ignored.txt\n", "keep.txt": "k\n"})
	writeFile(t, dir, "ignored.txt", "nope\n")
	writeFile(t, dir, "empty.txt", "")
	writeFile(t, dir, "nul.txt", "a\x00b")
	writeFile(t, dir, "big.txt", strings.Repeat("x", maxUntrackedBytes+1))
	writeFile(t, dir, "exact.txt", strings.Repeat("y", maxUntrackedBytes))
	writeFile(t, dir, "nl.txt", "one\n\ntwo\n")
	writeFile(t, dir, "sub/deep.txt", "d\n")
	require.NoError(t, os.Symlink("keep.txt", filepath.Join(dir, "link")))

	files := byPath(readScope(t, dir, ScopeUncommitted))

	assert.NotContains(t, files, "ignored.txt")
	assert.Contains(t, files, "sub/deep.txt")
	assert.Equal(t, "added", files["empty.txt"].Status)
	assert.Empty(t, files["empty.txt"].Hunks)
	assert.True(t, files["nul.txt"].Binary, "a NUL byte reads as binary")
	assert.True(t, files["big.txt"].Binary, "over 256 KiB reads as binary")
	assert.False(t, files["exact.txt"].Binary, "exactly 256 KiB is still text")
	assert.Equal(t, 1, files["exact.txt"].Additions)

	nl := files["nl.txt"]
	assert.Equal(t, 3, nl.Additions)
	require.Len(t, nl.Hunks, 1)
	assert.Equal(t, "@@ -0,0 +1,3 @@", nl.Hunks[0].Header)
	assert.Empty(t, nl.Hunks[0].Lines[1].Text)
	assert.Nil(t, nl.Hunks[0].Lines[0].Old)

	link := files["link"]
	assert.Equal(t, "added", link.Status)
	require.Len(t, link.Hunks, 1)
	assert.Equal(t, "keep.txt", link.Hunks[0].Lines[0].Text, "a symlink reads as its target text, not followed")
}

func TestRead_NoCommitsEveryFileIsAdded(t *testing.T) {
	dir := initRepo(t, "main")
	writeFile(t, dir, "a.txt", "a\n")
	writeFile(t, dir, "b.txt", "b\n")
	gitIn(t, dir, "add", "a.txt")

	for _, scope := range []Scope{ScopeUncommitted, ScopeBranch} {
		d := readScope(t, dir, scope)
		assert.Equal(t, "empty repository", d.Base, string(scope))
		require.Len(t, d.Files, 2, string(scope))
		for _, f := range d.Files {
			assert.Equal(t, "added", f.Status)
		}
	}
}

func TestRead_BranchScopeBases(t *testing.T) {
	t.Run("feature branch compares with the merge base of main", func(t *testing.T) {
		dir := newRepo(t, map[string]string{"a.txt": "a\n"})
		mergeBase := gitIn(t, dir, "rev-parse", "--short", "HEAD")
		gitIn(t, dir, "checkout", "-q", "-b", "feature")
		writeFile(t, dir, "b.txt", "b\n")
		commitAll(t, dir, "feature work")
		writeFile(t, dir, "c.txt", "c\n")

		branch := readScope(t, dir, ScopeBranch)
		unc := readScope(t, dir, ScopeUncommitted)

		assert.Equal(t, "main @ "+mergeBase, branch.Base)
		assert.Len(t, branch.Files, 2, "the committed change and the untracked file")
		assert.Len(t, unc.Files, 1, "uncommitted lists only the untracked file")
		assert.NotEqual(t, branch.Fingerprint, unc.Fingerprint)
	})

	t.Run("on the default branch it reads as HEAD and says so", func(t *testing.T) {
		dir := newRepo(t, map[string]string{"a.txt": "a\n"})
		writeFile(t, dir, "a.txt", "b\n")

		branch := readScope(t, dir, ScopeBranch)
		unc := readScope(t, dir, ScopeUncommitted)

		assert.Regexp(t, `^HEAD \([0-9a-f]+\) — already on main$`, branch.Base)
		assert.Equal(t, unc.Files, branch.Files)
	})

	t.Run("master is the fallback default", func(t *testing.T) {
		dir := initRepo(t, "master")
		writeFile(t, dir, "a.txt", "a\n")
		commitAll(t, dir, "base")

		assert.Regexp(t, `— already on master$`, readScope(t, dir, ScopeBranch).Base)
	})

	t.Run("no default branch found compares with HEAD", func(t *testing.T) {
		dir := initRepo(t, "trunk")
		writeFile(t, dir, "a.txt", "a\n")
		commitAll(t, dir, "base")

		assert.Regexp(t, `^HEAD \([0-9a-f]+\) — no default branch found$`, readScope(t, dir, ScopeBranch).Base)
	})

	t.Run("unrelated history has no merge base", func(t *testing.T) {
		dir := newRepo(t, map[string]string{"a.txt": "a\n"})
		gitIn(t, dir, "checkout", "-q", "--orphan", "other")
		gitIn(t, dir, "commit", "-q", "--allow-empty", "-m", "orphan root")

		assert.Regexp(t, `— no default branch found$`, readScope(t, dir, ScopeBranch).Base)
	})

	t.Run("origin/HEAD target wins over main", func(t *testing.T) {
		dir := newRepo(t, map[string]string{"a.txt": "a\n"})
		gitIn(t, dir, "checkout", "-q", "-b", "develop")
		writeFile(t, dir, "d.txt", "d\n")
		commitAll(t, dir, "develop work")
		gitIn(t, dir, "update-ref", "refs/remotes/origin/develop", gitIn(t, dir, "rev-parse", "HEAD"))
		gitIn(t, dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop")
		gitIn(t, dir, "checkout", "-q", "-b", "topic")
		writeFile(t, dir, "t.txt", "t\n")

		branch := readScope(t, dir, ScopeBranch)

		assert.Regexp(t, `^develop @ [0-9a-f]+$`, branch.Base)
		require.Len(t, branch.Files, 1)
		assert.Equal(t, "t.txt", branch.Files[0].Path)
	})
}

func TestFingerprint_DependsOnContentOnly(t *testing.T) {
	one := newRepo(t, map[string]string{"a.txt": "a\n"})
	two := filepath.Join(t.TempDir(), "clone")
	gitIn(t, one, "clone", "-q", one, two)
	for _, dir := range []string{one, two} {
		writeFile(t, dir, "a.txt", "b\n")
		writeFile(t, dir, "n.txt", "new\n")
	}

	a := readScope(t, one, ScopeUncommitted)
	b := readScope(t, two, ScopeUncommitted)
	again := readScope(t, one, ScopeUncommitted)

	assert.Len(t, a.Fingerprint, 16)
	assert.Equal(t, a.Fingerprint, again.Fingerprint, "stable across calls")
	assert.Equal(t, a.Fingerprint, b.Fingerprint, "independent of the absolute directory")

	writeFile(t, one, "a.txt", "c\n")
	assert.NotEqual(t, a.Fingerprint, readScope(t, one, ScopeUncommitted).Fingerprint, "a content change moves it")
}

func TestSummary(t *testing.T) {
	t.Run("equals the diff's own counts and fingerprints", func(t *testing.T) {
		dir := newRepo(t, map[string]string{"a.txt": "a\nb\n"})
		gitIn(t, dir, "checkout", "-q", "-b", "feature")
		writeFile(t, dir, "c.txt", "c\nd\n")
		commitAll(t, dir, "x")
		writeFile(t, dir, "a.txt", "a\nZ\ny\n")
		writeFile(t, dir, "u.txt", "u\n")

		s, err := NewReader().Summary(context.Background(), dir)
		require.NoError(t, err)

		assert.True(t, s.Repo)
		for scope, got := range map[Scope]Counts{ScopeUncommitted: s.Uncommitted, ScopeBranch: s.Branch} {
			d := readScope(t, dir, scope)
			assert.Equal(t, d.counts(), got, string(scope))
			assert.Equal(t, d.Fingerprint, got.Fingerprint, string(scope))
		}
		assert.Equal(t, 2, s.Uncommitted.Files)
		assert.Equal(t, 3, s.Uncommitted.Additions)
		assert.Equal(t, 1, s.Uncommitted.Deletions)
	})

	t.Run("outside a checkout is repo false with zero counts", func(t *testing.T) {
		s, err := NewReader().Summary(context.Background(), t.TempDir())
		require.NoError(t, err)
		assert.Equal(t, Summary{}, s)
	})

	t.Run("a clean checkout has zero counts and a fingerprint", func(t *testing.T) {
		dir := newRepo(t, map[string]string{"a.txt": "a\n"})
		s, err := NewReader().Summary(context.Background(), dir)
		require.NoError(t, err)
		assert.True(t, s.Repo)
		assert.Zero(t, s.Uncommitted.Files)
		assert.NotEmpty(t, s.Uncommitted.Fingerprint)
	})

	t.Run("from a subdirectory reads the whole checkout", func(t *testing.T) {
		dir := newRepo(t, map[string]string{"sub/a.txt": "a\n"})
		writeFile(t, dir, "top.txt", "t\n")
		s, err := NewReader().Summary(context.Background(), filepath.Join(dir, "sub"))
		require.NoError(t, err)
		assert.Equal(t, 1, s.Uncommitted.Files)
	})
}

func TestRead_OutsideACheckoutIsErrNotRepo(t *testing.T) {
	_, err := NewReader().Read(context.Background(), t.TempDir(), ScopeUncommitted)
	require.ErrorIs(t, err, ErrNotRepo)
}

func TestRead_NeverWritesTheRepository(t *testing.T) {
	index := func(dir string) string { return filepath.Join(dir, ".git", "index") }
	// Each row leaves tracked files whose stat data disagrees with the index, so a git that
	// refreshes its index would rewrite it. The mtimes are set explicitly, clearly apart from
	// the index's, so this never depends on the second a run happens to land in.
	cases := []struct {
		name  string
		touch func(t *testing.T, dir string)
	}{
		{"same bytes rewritten two seconds later", func(t *testing.T, dir string) {
			writeFile(t, dir, "a.txt", "a\n")
			later := time.Now().Add(2 * time.Second)
			require.NoError(t, os.Chtimes(filepath.Join(dir, "a.txt"), later, later))
		}},
		{"same bytes with an older mtime", func(t *testing.T, dir string) {
			earlier := time.Now().Add(-time.Hour)
			require.NoError(t, os.Chtimes(filepath.Join(dir, "a.txt"), earlier, earlier))
		}},
		{"stat-dirty file beside a real change and an untracked file", func(t *testing.T, dir string) {
			later := time.Now().Add(3 * time.Second)
			require.NoError(t, os.Chtimes(filepath.Join(dir, "a.txt"), later, later))
			writeFile(t, dir, "b.txt", "changed\n")
			writeFile(t, dir, "u.txt", "u\n")
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := newRepo(t, map[string]string{"a.txt": "a\n", "b.txt": "b\n"})
			// Age the index so the file mtimes above are unambiguously different from it.
			old := time.Now().Add(-10 * time.Second)
			require.NoError(t, os.Chtimes(index(dir), old, old))
			tc.touch(t, dir)
			before := snapshotGit(t, dir)

			r := NewReader()
			_, err := r.Summary(context.Background(), dir)
			require.NoError(t, err)
			_, err = r.Read(context.Background(), dir, ScopeUncommitted)
			require.NoError(t, err)
			_, err = r.Read(context.Background(), dir, ScopeBranch)
			require.NoError(t, err)

			after := snapshotGit(t, dir)
			for path, was := range before {
				assert.Equal(t, was, after[path], "%s changed", filepath.Base(path))
			}
			assert.Len(t, after, len(before), "no file appeared or vanished")
		})
	}
}

// D7: a tracked file's changed lines are listed whole, however many; only untracked files cap.
func TestRead_TrackedFileOverThreeThousandLinesIsListedWhole(t *testing.T) {
	const lines = 3500
	var base, edited strings.Builder
	for i := range lines {
		fmt.Fprintf(&base, "old %d\n", i)
		fmt.Fprintf(&edited, "new %d\n", i)
	}
	dir := newRepo(t, map[string]string{"big.txt": base.String()})
	writeFile(t, dir, "big.txt", edited.String())

	f := byPath(readScope(t, dir, ScopeUncommitted))["big.txt"]

	assert.False(t, f.Binary)
	assert.Equal(t, lines, f.Additions)
	assert.Equal(t, lines, f.Deletions)
	total := 0
	for _, h := range f.Hunks {
		total += len(h.Lines)
	}
	assert.Equal(t, 2*lines, total, "every changed line is in the hunks, none dropped")
}

func TestReader_RunSeam(t *testing.T) {
	t.Run("diff commands disable external diff and textconv and end options with --", func(t *testing.T) {
		var diffs [][]string
		r := &Reader{git: gitutil.NewGit(func(_ context.Context, _ string, _ []string, _ string, args ...string) ([]byte, error) {
			switch {
			case args[0] == "rev-parse" && args[1] == "--show-toplevel":
				return []byte(t.TempDir() + "\n"), nil
			case args[0] == "rev-parse":
				return []byte("abc1234\n"), nil
			case args[0] == "diff":
				diffs = append(diffs, args)
			}
			return nil, nil
		})}
		_, err := r.Read(context.Background(), "/x", ScopeUncommitted)
		require.NoError(t, err)
		require.Len(t, diffs, 2)
		for _, a := range diffs {
			assert.Equal(t, "--", a[len(a)-1])
			assert.Contains(t, a, "--no-ext-diff")
			assert.Contains(t, a, "--no-textconv")
		}
	})

	t.Run("only the two tracked diffs carry env: a scratch GIT_INDEX_FILE outside the git dir", func(t *testing.T) {
		repo := newRepo(t, map[string]string{"a.txt": "one\n"})
		writeFile(t, repo, "a.txt", "two\n")
		writeFile(t, repo, "new.txt", "x\n")
		gitDir, err := filepath.EvalSymlinks(filepath.Join(repo, ".git"))
		require.NoError(t, err)

		type call struct {
			args         []string
			env          []string
			indexExisted bool
		}
		var calls []call
		r := &Reader{git: gitutil.NewGit(func(ctx context.Context, dir string, env []string, name string, args ...string) ([]byte, error) {
			c := call{args: args, env: env}
			if args[0] == "diff" && len(env) == 1 {
				_, statErr := os.Stat(strings.TrimPrefix(env[0], "GIT_INDEX_FILE="))
				c.indexExisted = statErr == nil
			}
			calls = append(calls, c)
			return gitutil.Exec(ctx, dir, env, name, args...)
		})}
		_, err = r.Read(context.Background(), repo, ScopeUncommitted)
		require.NoError(t, err)

		diffs := 0
		for _, c := range calls {
			if c.args[0] != "diff" {
				assert.Empty(t, c.env, "git %v must carry no env", c.args)
				continue
			}
			diffs++
			require.Len(t, c.env, 1, "git %v", c.args)
			idx, ok := strings.CutPrefix(c.env[0], "GIT_INDEX_FILE=")
			require.True(t, ok, "env %q", c.env[0])
			assert.True(t, filepath.IsAbs(idx))
			assert.True(t, c.indexExisted, "scratch index %q exists while git runs", idx)
			assert.False(t, strings.HasPrefix(idx, gitDir+string(filepath.Separator)), "scratch index %q is inside the git dir %q", idx, gitDir)
			assert.False(t, strings.HasPrefix(idx, repo+string(filepath.Separator)), "scratch index %q is inside the repo", idx)
		}
		assert.Equal(t, 2, diffs, "both git diff calls")
	})

	t.Run("exit 128 from rev-parse is not a repo, another failure is an error", func(t *testing.T) {
		exit128 := exec.Command("sh", "-c", "exit 128").Run()
		var ee *exec.ExitError
		require.ErrorAs(t, exit128, &ee)
		r := &Reader{git: gitutil.NewGit(func(context.Context, string, []string, string, ...string) ([]byte, error) { return nil, exit128 })}
		_, err := r.Read(context.Background(), "/x", ScopeUncommitted)
		require.ErrorIs(t, err, ErrNotRepo)

		boom := errors.New("boom")
		r = &Reader{git: gitutil.NewGit(func(context.Context, string, []string, string, ...string) ([]byte, error) { return nil, boom })}
		_, err = r.Read(context.Background(), "/x", ScopeUncommitted)
		require.ErrorIs(t, err, boom)
		require.NotErrorIs(t, err, ErrNotRepo)
		_, err = r.Summary(context.Background(), "/x")
		require.ErrorIs(t, err, boom)
	})

	t.Run("a patch that disagrees with the raw list is an error, never a guess", func(t *testing.T) {
		r := &Reader{git: gitutil.NewGit(func(_ context.Context, _ string, _ []string, _ string, args ...string) ([]byte, error) {
			switch {
			case args[0] == "rev-parse" && args[1] == "--show-toplevel":
				return []byte(t.TempDir()), nil
			case args[0] == "rev-parse":
				return []byte("abc1234"), nil
			case args[0] == "diff" && slices.Contains(args, "--raw"):
				return []byte(":100644 100644 a b M\x00f.txt\x00"), nil
			}
			return nil, nil
		})}
		_, err := r.Read(context.Background(), "/x", ScopeUncommitted)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "patch blocks")
	})
}

func TestParseRaw(t *testing.T) {
	old := "old.txt"
	tests := []struct {
		name string
		raw  string
		want []rawEntry
	}{
		{"modify", ":100644 100644 a b M\x00f.txt\x00", []rawEntry{{status: "M", path: "f.txt"}}},
		{"rename carries both paths", ":100644 100644 a b R100\x00old.txt\x00new.txt\x00", []rawEntry{{status: "R", path: "new.txt", oldPath: &old}}},
		{"two entries", ":100644 000000 a 0 D\x00x\x00:000000 100644 0 b A\x00y\x00", []rawEntry{{status: "D", path: "x"}, {status: "A", path: "y"}}},
		{"empty", "", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, parseRaw(tt.raw))
		})
	}
}

func TestParseRange(t *testing.T) {
	tests := []struct {
		in         string
		start, cnt int
		ok         bool
	}{
		{"10,7", 10, 7, true}, {"5", 5, 1, true}, {"0,0", 0, 0, true}, {"x", 0, 0, false}, {"3,y", 0, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			s, c, ok := parseRange(tt.in)
			assert.Equal(t, tt.ok, ok)
			if ok {
				assert.Equal(t, tt.start, s)
				assert.Equal(t, tt.cnt, c)
			}
		})
	}
}

func TestParseHunkHeader_KeepsTrailingContext(t *testing.T) {
	h, ok := parseHunkHeader("@@ -10,7 +10,9 @@ func foo() {")
	require.True(t, ok)
	assert.Equal(t, "@@ -10,7 +10,9 @@ func foo() {", h.Header)
	assert.Equal(t, 10, h.OldStart)
	assert.Equal(t, 7, h.OldLines)
	assert.Equal(t, 10, h.NewStart)
	assert.Equal(t, 9, h.NewLines)
	_, ok = parseHunkHeader("@@ garbage")
	assert.False(t, ok)
}
