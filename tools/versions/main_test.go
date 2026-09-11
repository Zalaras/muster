package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// defaultRecord is the real record's shape at the time this plan landed (D6): two rows,
// already sorted ascending.
const defaultRecord = "2.1.246 2026-08-29 m4-canary\n2.1.267 2026-09-10 canary-full-coverage\n"

func mustWriteFile(t *testing.T, path, content string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, []byte(content), 0o644))
}

func mustReadFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	require.NoError(t, err)
	return string(b)
}

// newFixtureRoot builds a temp tree with the record and the three fragment-bearing docs
// (README.md, docs/claude-code-versions.md), each carrying stale fragments of different
// kinds — README the inline range; the versions doc a floor/verified pair and the
// on-its-own-lines table — mirroring the real layout closely enough to exercise
// applyFragments' non-greedy, name-matched scanning across distinct fragment shapes.
func newFixtureRoot(t *testing.T, record string) string {
	t.Helper()
	root := t.TempDir()
	mustWriteFile(t, filepath.Join(root, recordPath), record)
	mustWriteFile(t, filepath.Join(root, "README.md"),
		"# README\n\n| Claude Code | <!-- versions:range -->STALE<!-- /versions:range --> |\n")
	mustWriteFile(t, filepath.Join(root, "docs/claude-code-versions.md"),
		"# Claude Code versions\n\nFloor <!-- versions:floor -->STALE<!-- /versions:floor -->, "+
			"verified <!-- versions:verified -->STALE<!-- /versions:verified -->.\n\n"+
			"<!-- versions:table -->\nSTALE TABLE\n<!-- /versions:table -->\n\nmore text\n")
	return root
}

// failingRunCmd fails the test immediately if the runFunc is ever invoked — used to prove
// a bump branch that must not touch git at all (offline, inside-range).
func failingRunCmd(t *testing.T) runFunc {
	return func(_ context.Context, _, name string, args ...string) ([]byte, error) {
		t.Helper()
		t.Fatalf("runCmd must not be called on this branch, got: %s %v", name, args)
		return nil, nil
	}
}

// writeClaudeVersionStub writes a fake `claude` script under t.TempDir() that answers
// --version with output and returns its absolute path — never the real binary (CLAUDE.md:
// no unit test launches real claude). cmdBump takes claudeBin as an injectable parameter
// (docs/conventions.md §Testing: an injectable seam on the type that owns the process
// boundary, never a $PATH shim), so the stub is passed straight through that parameter
// rather than placed on PATH, matching cmd/musterd/onexit_test.go's -claude-bin stub
// pattern.
func writeClaudeVersionStub(t *testing.T, output string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "claude")
	script := fmt.Sprintf("#!/bin/sh\necho %q\nexit 0\n", output)
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

// ---------------------------------------------------------------------------------------
// gen / check (D15)

func TestCmdGen_FillsEveryFragmentInEveryListedFile(t *testing.T) {
	root := newFixtureRoot(t, defaultRecord)

	var buf bytes.Buffer
	require.NoError(t, cmdGen(root, &buf))
	assert.Contains(t, buf.String(), "regenerated fragments")

	readme := mustReadFile(t, filepath.Join(root, "README.md"))
	assert.Contains(t, readme, "<!-- versions:range -->2.1.246–2.1.267<!-- /versions:range -->")

	doc := mustReadFile(t, filepath.Join(root, "docs/claude-code-versions.md"))
	assert.Contains(t, doc, "<!-- versions:floor -->2.1.246<!-- /versions:floor -->")
	assert.Contains(t, doc, "<!-- versions:verified -->2.1.267<!-- /versions:verified -->")
	assert.Contains(t, doc, "| 2.1.246 | 2026-08-29 | m4-canary |")
	assert.Contains(t, doc, "| 2.1.267 | 2026-09-10 | canary-full-coverage |")
	assert.Contains(t, doc, "more text", "content outside the fragment must survive untouched")
	assert.Less(t, strings.Index(doc, "| 2.1.246 |"), strings.Index(doc, "| 2.1.267 |"), "table must render ascending")

	// A file that is already fresh must now pass check too.
	buf.Reset()
	require.NoError(t, cmdCheck(root, &buf))
	assert.Contains(t, buf.String(), "all fragments fresh")
}

// TestCmdGen_TableSortedAscendingRegardlessOfRecordOrder covers D7/D15/Edge Case 13: the
// on-disk record need not be sorted; the generated table always is.
func TestCmdGen_TableSortedAscendingRegardlessOfRecordOrder(t *testing.T) {
	unsorted := "2.1.267 2026-09-10 canary-full-coverage\n2.1.246 2026-08-29 m4-canary\n"
	root := newFixtureRoot(t, unsorted)

	require.NoError(t, cmdGen(root, io.Discard))

	doc := mustReadFile(t, filepath.Join(root, "docs/claude-code-versions.md"))
	assert.Less(t, strings.Index(doc, "| 2.1.246 |"), strings.Index(doc, "| 2.1.267 |"))
}

// TestCmdCheck_ExitsNonZeroNamingOnlyTheStaleFile covers D15/Edge Case 7: a hand-edit to a
// generated fragment (simulating someone editing the doc instead of the record) makes
// check fail, naming that file and not the others.
func TestCmdCheck_ExitsNonZeroNamingOnlyTheStaleFile(t *testing.T) {
	root := newFixtureRoot(t, defaultRecord)
	require.NoError(t, cmdGen(root, io.Discard)) // make everything fresh first

	fresh := mustReadFile(t, filepath.Join(root, "README.md"))
	stale := strings.Replace(fresh,
		"<!-- versions:range -->2.1.246–2.1.267<!-- /versions:range -->",
		"<!-- versions:range -->HAND-EDITED<!-- /versions:range -->", 1)
	require.NotEqual(t, fresh, stale, "the replace must actually have matched something")
	mustWriteFile(t, filepath.Join(root, "README.md"), stale)

	err := cmdCheck(root, io.Discard)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "README.md")
	assert.NotContains(t, err.Error(), "claude-code-versions.md", "must name only the stale file")
}

// TestCmdGenAndCheck_FailNamingAFileWithNoFragmentMarkerAtAll covers D15/Edge Case 20: a
// listed file whose markers were deleted entirely fails both gen and check, naming it.
func TestCmdGenAndCheck_FailNamingAFileWithNoFragmentMarkerAtAll(t *testing.T) {
	root := newFixtureRoot(t, defaultRecord)
	mustWriteFile(t, filepath.Join(root, "docs/claude-code-versions.md"), "# Claude Code versions\n\nno markers here at all.\n")

	genErr := cmdGen(root, io.Discard)
	require.Error(t, genErr)
	assert.Contains(t, genErr.Error(), "claude-code-versions.md")
	assert.Contains(t, genErr.Error(), "carries no versions fragment marker")

	checkErr := cmdCheck(root, io.Discard)
	require.Error(t, checkErr)
	assert.Contains(t, checkErr.Error(), "claude-code-versions.md")
}

// ---------------------------------------------------------------------------------------
// bump (D16)

func TestCmdBump_OfflineEditsNothing(t *testing.T) {
	t.Setenv(offlineEnv, "1")
	root := newFixtureRoot(t, defaultRecord)
	before := mustReadFile(t, filepath.Join(root, recordPath))

	var buf bytes.Buffer
	err := cmdBump(context.Background(), root, &buf, failingRunCmd(t), "unused-placeholder-claude-bin")
	require.NoError(t, err)
	assert.Contains(t, buf.String(), offlineEnv)

	after := mustReadFile(t, filepath.Join(root, recordPath))
	assert.Equal(t, before, after, "offline must edit nothing (INV-4)")
}

// TestCmdBump_InsideRangeEditsNothing covers Edge Case 5 (a rollback still inside the
// range): no append, no git call at all.
func TestCmdBump_InsideRangeEditsNothing(t *testing.T) {
	claudeBin := writeClaudeVersionStub(t, "2.1.250 (Claude Code)") // strictly inside 2.1.246-2.1.267
	root := newFixtureRoot(t, defaultRecord)
	before := mustReadFile(t, filepath.Join(root, recordPath))

	var buf bytes.Buffer
	err := cmdBump(context.Background(), root, &buf, failingRunCmd(t), claudeBin)
	require.NoError(t, err)
	assert.Contains(t, buf.String(), "inside the verified range")
	assert.Contains(t, buf.String(), "2.1.250")

	after := mustReadFile(t, filepath.Join(root, recordPath))
	assert.Equal(t, before, after, "an inside-range install must edit nothing")
}

// TestCmdBump_AboveAppendsAndRegenerates covers the green-outside-the-range path (above).
func TestCmdBump_AboveAppendsAndRegenerates(t *testing.T) {
	claudeBin := writeClaudeVersionStub(t, "2.1.270 (Claude Code)")
	root := newFixtureRoot(t, defaultRecord)

	var gitCalls []string
	runCmd := func(_ context.Context, dir, name string, args ...string) ([]byte, error) {
		gitCalls = append(gitCalls, name+" "+strings.Join(args, " "))
		assert.Equal(t, root, dir, "git must run with the record's repo root as its working directory")
		switch {
		case len(args) > 0 && args[0] == "status":
			return []byte(""), nil // clean
		case len(args) > 0 && args[0] == "diff":
			return []byte(" README.md | 2 +-\n"), nil
		}
		return nil, fmt.Errorf("unexpected git args %v", args)
	}

	var buf bytes.Buffer
	err := cmdBump(context.Background(), root, &buf, runCmd, claudeBin)
	require.NoError(t, err)

	require.Equal(t, []string{"git status --porcelain -- " + recordPath, "git diff --stat"}, gitCalls)

	after := mustReadFile(t, filepath.Join(root, recordPath))
	wantLine := fmt.Sprintf("2.1.270 %s make canary", time.Now().Format("2006-01-02"))
	assert.Contains(t, after, wantLine)
	assert.True(t, strings.HasSuffix(after, "\n"), "the appended row must be newline-terminated")

	out := buf.String()
	assert.Contains(t, out, "recorded 2.1.270")
	assert.Contains(t, out, "git commit -am \"fix(versions): record Claude Code 2.1.270 as verified by make canary\"")
	assert.Contains(t, out, "README.md | 2 +-", "git diff --stat output must be printed")

	// gen ran as part of bump: the range fragment now reflects the new ceiling.
	readme := mustReadFile(t, filepath.Join(root, "README.md"))
	assert.Contains(t, readme, "2.1.246–2.1.270")
}

// TestCmdBump_BelowAppendsAndRegenerates is the symmetric case (Edge Case 6): green below
// the floor moves the floor down, not just the ceiling up.
func TestCmdBump_BelowAppendsAndRegenerates(t *testing.T) {
	claudeBin := writeClaudeVersionStub(t, "2.0.0 (Claude Code)")
	root := newFixtureRoot(t, defaultRecord)

	runCmd := func(_ context.Context, _, _ string, args ...string) ([]byte, error) {
		switch {
		case len(args) > 0 && args[0] == "status":
			return []byte(""), nil
		case len(args) > 0 && args[0] == "diff":
			return []byte(""), nil
		}
		return nil, fmt.Errorf("unexpected git args %v", args)
	}

	var buf bytes.Buffer
	err := cmdBump(context.Background(), root, &buf, runCmd, claudeBin)
	require.NoError(t, err)

	after := mustReadFile(t, filepath.Join(root, recordPath))
	wantLine := fmt.Sprintf("2.0.0 %s make canary", time.Now().Format("2006-01-02"))
	assert.Contains(t, after, wantLine)

	readme := mustReadFile(t, filepath.Join(root, "README.md"))
	assert.Contains(t, readme, "2.0.0–2.1.267", "the new floor must be 2.0.0, the ceiling unchanged")
}

// TestCmdBump_RefusesOnDirtyRecord covers Edge Case 8: a status --porcelain that reports
// the record file itself as modified refuses, edits nothing, names the reason.
func TestCmdBump_RefusesOnDirtyRecord(t *testing.T) {
	claudeBin := writeClaudeVersionStub(t, "2.1.270 (Claude Code)")
	root := newFixtureRoot(t, defaultRecord)
	before := mustReadFile(t, filepath.Join(root, recordPath))

	runCmd := func(_ context.Context, _ string, name string, args ...string) ([]byte, error) {
		require.Equal(t, "git", name)
		require.Equal(t, "status", args[0])
		return []byte(" M " + recordPath + "\n"), nil
	}

	err := cmdBump(context.Background(), root, io.Discard, runCmd, claudeBin)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "uncommitted changes")
	assert.Contains(t, err.Error(), recordPath)

	after := mustReadFile(t, filepath.Join(root, recordPath))
	assert.Equal(t, before, after, "a refused bump must edit nothing")
}

// TestCmdBump_RefusesWhenGitFails covers Edge Case 19: git itself failing (missing binary,
// not a repo) refuses with a non-zero exit and edits nothing.
func TestCmdBump_RefusesWhenGitFails(t *testing.T) {
	claudeBin := writeClaudeVersionStub(t, "2.1.270 (Claude Code)")
	root := newFixtureRoot(t, defaultRecord)
	before := mustReadFile(t, filepath.Join(root, recordPath))

	runCmd := func(_ context.Context, _ string, _ string, _ ...string) ([]byte, error) {
		return []byte("git: command not found"), errors.New("exec: \"git\": executable file not found in $PATH")
	}

	err := cmdBump(context.Background(), root, io.Discard, runCmd, claudeBin)
	require.Error(t, err)

	after := mustReadFile(t, filepath.Join(root, recordPath))
	assert.Equal(t, before, after, "a git failure must edit nothing")
}

// TestCmdBump_RefusesWhenGitDiffFails covers the second git call failing after the
// record has already been appended in memory-adjacent state — the append itself has
// already happened on disk by this point (gen already ran too), so this pins that the
// error still surfaces rather than being swallowed; it does not re-assert INV-5 (that is
// about a red `go test` never reaching bump at all, guarded by the Makefile chain).
func TestCmdBump_RefusesWhenGitDiffFails(t *testing.T) {
	claudeBin := writeClaudeVersionStub(t, "2.1.270 (Claude Code)")
	root := newFixtureRoot(t, defaultRecord)

	runCmd := func(_ context.Context, _ string, _ string, args ...string) ([]byte, error) {
		if len(args) > 0 && args[0] == "status" {
			return []byte(""), nil
		}
		return []byte("fatal: not a git repository"), errors.New("exit status 128")
	}

	err := cmdBump(context.Background(), root, io.Discard, runCmd, claudeBin)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "git diff")
}

// ---------------------------------------------------------------------------------------
// run() dispatch and repoRoot (thin CLI-plumbing coverage)

func TestRun_WrongArgCountErrorsBeforeTouchingTheFilesystem(t *testing.T) {
	err := run(nil, io.Discard, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "usage")

	err = run([]string{"gen", "extra"}, io.Discard, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "usage")
}

func TestRun_NoGoModErrorsNamingTheRemedy(t *testing.T) {
	root := t.TempDir() // deliberately no go.mod
	t.Chdir(root)

	err := run([]string{"gen"}, io.Discard, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "go.mod")
}

func TestRun_UnknownSubcommandErrors(t *testing.T) {
	root := t.TempDir()
	mustWriteFile(t, filepath.Join(root, "go.mod"), "module fixture\n\ngo 1.26\n")
	t.Chdir(root)

	err := run([]string{"bogus"}, io.Discard, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown subcommand")
	assert.Contains(t, err.Error(), "bogus")
}
