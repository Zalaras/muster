package main

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// output runs a command with a timeout so a wedged git never stalls the poll loop.
func output(name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Output()
}

// worktrees lists every worktree of the repository at root, primary first.
func worktrees(root string) ([]Tree, error) {
	out, err := output("git", "-C", root, "worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}
	return parseWorktrees(out), nil
}

// parseWorktrees reads `git worktree list --porcelain`; the first entry is the primary checkout.
func parseWorktrees(out []byte) []Tree {
	var trees []Tree
	for _, block := range bytes.Split(bytes.TrimSpace(out), []byte("\n\n")) {
		var t Tree
		for _, line := range strings.Split(string(block), "\n") {
			switch {
			case strings.HasPrefix(line, "worktree "):
				t.Path = strings.TrimPrefix(line, "worktree ")
			case strings.HasPrefix(line, "branch "):
				t.Branch = strings.TrimPrefix(strings.TrimPrefix(line, "branch "), "refs/heads/")
			}
		}
		if t.Path != "" {
			t.Primary = len(trees) == 0
			trees = append(trees, t)
		}
	}
	return trees
}

// treeActivity is the newest of the tree's last commit and the mtime of every changed or
// untracked file — agents write files long before the orchestrator stamps the state file.
func treeActivity(tree string) time.Time {
	var newest time.Time
	if out, err := output("git", "-C", tree, "log", "-1", "--format=%ct"); err == nil {
		if s, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64); err == nil {
			newest = time.Unix(s, 0)
		}
	}
	out, err := output("git", "-C", tree, "status", "--porcelain", "-z", "--untracked-files=all")
	if err != nil {
		return newest
	}
	for _, rec := range bytes.Split(out, []byte{0}) {
		if len(rec) < 4 {
			continue // rename sources come through as bare paths; their target carries the change
		}
		if fi, err := os.Stat(filepath.Join(tree, string(rec[3:]))); err == nil && fi.ModTime().After(newest) {
			newest = fi.ModTime()
		}
	}
	return newest
}

// pidAlive reports whether a process exists (signal 0 delivers nothing).
func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, 0)
	return err == nil || err == syscall.EPERM
}

// latestUsage is the rate-limit sample musterd last ingested, read the way orch-state.py
// reads it; nil when the database or the sqlite3 CLI is missing.
func latestUsage() *Usage {
	db := os.Getenv("MUSTER_DB")
	if db == "" {
		home, _ := os.UserHomeDir()
		db = filepath.Join(home, "Library", "Application Support", "Muster", "muster.db")
	}
	if _, err := os.Stat(db); err != nil {
		return nil
	}
	out, err := output("sqlite3", "-readonly", db,
		"select five_hour_pct, five_hour_resets_at, seven_day_pct from usage_sample order by at desc limit 1")
	if err != nil {
		return nil
	}
	return parseUsage(string(out))
}

// parseUsage reads one sqlite3 row "five_hour_pct|five_hour_resets_at|seven_day_pct".
func parseUsage(row string) *Usage {
	f := strings.Split(strings.TrimSpace(row), "|")
	if len(f) != 3 {
		return nil
	}
	five, err1 := strconv.ParseFloat(f[0], 64)
	week, err2 := strconv.ParseFloat(f[2], 64)
	if err1 != nil || err2 != nil {
		return nil
	}
	return &Usage{FiveHour: five, FiveHourResets: f[1], Weekly: week}
}
