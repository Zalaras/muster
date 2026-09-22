package queue

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// gitErr carries the combined output of a failed git command.
type gitErr struct {
	args []string
	out  string
	err  error
}

func (e *gitErr) Error() string {
	return fmt.Sprintf("git %s: %v\n%s", strings.Join(e.args, " "), e.err, strings.TrimSpace(e.out))
}

// git runs a git command in dir and returns trimmed stdout. Non-zero exit is an error.
func git(dir string, args ...string) (string, error) {
	out, _, err := gitFull(dir, args...)
	return out, err
}

// gitFull returns stdout, stderr and the error separately (needed to parse rerere's
// stderr chatter and rebase's conflict reports).
func gitFull(dir string, args ...string) (string, string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_EDITOR=true", // rebase --continue must never open an editor
		"GIT_AUTHOR_NAME=muster-queue", "GIT_AUTHOR_EMAIL=queue@muster.local",
		"GIT_COMMITTER_NAME=muster-queue", "GIT_COMMITTER_EMAIL=queue@muster.local",
	)
	var so, se bytes.Buffer
	cmd.Stdout, cmd.Stderr = &so, &se
	err := cmd.Run()
	if err != nil {
		return strings.TrimSpace(so.String()), se.String(), &gitErr{args, so.String() + se.String(), err}
	}
	return strings.TrimSpace(so.String()), se.String(), nil
}

func gitLines(dir string, args ...string) ([]string, error) {
	out, err := git(dir, args...)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return strings.Split(out, "\n"), nil
}

func revParse(dir, rev string) (string, error) { return git(dir, "rev-parse", "--verify", "-q", rev) }

// rebaseInProgress reports whether the worktree at dir has a rebase state directory.
func rebaseInProgress(dir string) bool {
	for _, p := range []string{"rebase-merge", "rebase-apply"} {
		gp, err := git(dir, "rev-parse", "--git-path", p)
		if err != nil {
			continue
		}
		if !filepath.IsAbs(gp) {
			gp = filepath.Join(dir, gp)
		}
		if st, err := os.Stat(gp); err == nil && st.IsDir() {
			return true
		}
	}
	return false
}

// resetWorktree forces the integration worktree back to a clean detached state:
// abort any rebase, drop all tracked changes, remove untracked files.
func resetWorktree(dir string) error {
	if rebaseInProgress(dir) {
		if _, err := git(dir, "rebase", "--abort"); err != nil {
			return err
		}
	}
	// A crash could also leave a squash merge staged (MERGE_HEAD is not used by --squash,
	// but the index may be dirty); reset --hard covers it.
	if _, err := git(dir, "reset", "-q", "--hard"); err != nil {
		return err
	}
	_, err := git(dir, "clean", "-fdq")
	return err
}

// isClean is the test oracle for "worktree left clean": empty porcelain status and no
// rebase in progress.
func isClean(dir string) (bool, string) {
	out, err := git(dir, "status", "--porcelain")
	if err != nil {
		return false, err.Error()
	}
	if out != "" {
		return false, "dirty: " + out
	}
	if rebaseInProgress(dir) {
		return false, "rebase in progress"
	}
	return true, ""
}

// worktreeHolding returns the path of the worktree that has refs/heads/<branch> checked
// out, or "" if none does.
func worktreeHolding(repo, branch string) (string, error) {
	lines, err := gitLines(repo, "worktree", "list", "--porcelain")
	if err != nil {
		return "", err
	}
	var cur string
	for _, l := range lines {
		switch {
		case strings.HasPrefix(l, "worktree "):
			cur = strings.TrimPrefix(l, "worktree ")
		case l == "branch refs/heads/"+branch:
			return cur, nil
		}
	}
	return "", nil
}

// fastForward moves refs/heads/<branch> from old to new. If a worktree has the branch
// checked out, the move happens there with --ff-only so its index and files follow;
// otherwise it is a compare-and-swap ref update.
func fastForward(repo, branch, old, new string) error {
	wt, err := worktreeHolding(repo, branch)
	if err != nil {
		return err
	}
	if wt != "" {
		cur, err := revParse(wt, "HEAD")
		if err != nil {
			return err
		}
		if cur != old {
			return fmt.Errorf("%s moved: expected %s, found %s", branch, old, cur)
		}
		_, err = git(wt, "merge", "-q", "--ff-only", new)
		return err
	}
	_, err = git(repo, "update-ref", "refs/heads/"+branch, new, old)
	return err
}

// runVerify executes the verify command via sh -c in dir, capturing combined output to
// logPath. It returns the exit code (or -1 on timeout/exec failure).
func runVerify(dir, command, logPath string, timeout time.Duration) (int, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = dir
	var buf bytes.Buffer
	cmd.Stdout, cmd.Stderr = &buf, &buf
	runErr := cmd.Run()
	if err := os.WriteFile(logPath, buf.Bytes(), 0o600); err != nil {
		return -1, "", err
	}
	if runErr == nil {
		return 0, buf.String(), nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return -1, buf.String(), fmt.Errorf("verify timed out after %s", timeout)
	}
	var ee *exec.ExitError
	if errors.As(runErr, &ee) {
		return ee.ExitCode(), buf.String(), nil
	}
	return -1, buf.String(), runErr
}
