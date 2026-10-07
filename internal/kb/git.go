package kb

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// gitOut runs git in root, feeding stdin when non-empty, and returns stdout. A non-zero exit
// is an error carrying stderr, except the exit codes okExit lists, which return stdout as is
// (git check-ignore exits 1 when nothing was ignored).
func gitOut(root, stdin string, okExit []int, args ...string) (string, error) {
	cmd := exec.CommandContext(context.Background(), "git", args...)
	cmd.Dir = root
	cmd.WaitDelay = 5 * time.Second
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		for _, code := range okExit {
			if exit.ExitCode() == code {
				return out.String(), nil
			}
		}
	}
	if err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(errb.String()))
	}
	return out.String(), nil
}

// gitLines runs git and splits stdout into non-empty lines.
func gitLines(root string, args ...string) ([]string, error) {
	out, err := gitOut(root, "", nil, args...)
	if err != nil {
		return nil, err
	}
	var lines []string
	for _, l := range strings.Split(out, "\n") {
		if l != "" {
			lines = append(lines, l)
		}
	}
	return lines, nil
}

// diffRange is the commit range a changed-files query reads: the last commit on main, the
// branch's whole divergence from main anywhere else.
func diffRange(root string) (string, error) {
	branch, err := gitOut(root, "", nil, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(branch) == "main" {
		return "HEAD~1", nil
	}
	return "main...HEAD", nil
}
