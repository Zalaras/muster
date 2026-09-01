package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

// writeFakeTmux mirrors internal/tmux/preflight_test.go's helper of the same shape: an
// executable "tmux" in a fresh scratch directory that prints body's output for any
// arguments, including "-V". Tests point $PATH at the returned directory so
// runTmuxPreflight's call into internal/tmux.Preflight resolves to this stub instead of
// whatever real tmux the test host has — never a tmux server or socket, `tmux -V` never
// contacts one.
func writeFakeTmux(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "tmux")
	require.NoError(t, os.WriteFile(path, []byte("#!/bin/sh\n"+body+"\n"), 0o755))
	return dir
}

// TestRunTmuxPreflight_NotFoundReportsInstallRemedy covers D1: with tmux absent from
// $PATH, the returned error names the install remedy, and the report block is printed
// to stderr naming "not found in $PATH" (the UI spec's exact row).
func TestRunTmuxPreflight_NotFoundReportsInstallRemedy(t *testing.T) {
	t.Setenv("PATH", t.TempDir()) // empty: no tmux binary anywhere

	var stderr bytes.Buffer
	_, err := runTmuxPreflight(context.Background(), &stderr)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "brew install tmux")
	assert.Contains(t, stderr.String(), "musterd preflight")
	assert.Contains(t, stderr.String(), "not found in $PATH")
	assert.True(t, strings.HasSuffix(stderr.String(), "\n\n"),
		"the UI spec separates the report from main's \"musterd: ...\" verdict line with a blank line")
}

// TestRunTmuxPreflight_TooOldNamesDetectedAndMinimum covers D2: a tmux below MinVersion
// returns an error whose text names the upgrade remedy, and the report names both the
// detected version and the 3.2 minimum.
func TestRunTmuxPreflight_TooOldNamesDetectedAndMinimum(t *testing.T) {
	t.Setenv("PATH", writeFakeTmux(t, "echo 'tmux 3.1a'"))

	var stderr bytes.Buffer
	result, err := runTmuxPreflight(context.Background(), &stderr)

	require.Error(t, err)
	assert.Equal(t, tmux.StatusTooOld, result.Status)
	assert.Contains(t, err.Error(), "brew upgrade tmux")
	assert.Contains(t, stderr.String(), "3.1a", "the detected version must be named")
	assert.Contains(t, stderr.String(), tmux.MinVersion.String(), "the 3.2 minimum must be named")
	assert.True(t, strings.HasSuffix(stderr.String(), "\n\n"),
		"the UI spec separates the report from main's \"musterd: ...\" verdict line with a blank line")
}

// TestRunTmuxPreflight_UnrecognizedVersionIsNotFatal covers D3: an unparsing `tmux -V`
// output must not fail runTmuxPreflight — it prints a warning row and returns a nil
// error so startup proceeds.
func TestRunTmuxPreflight_UnrecognizedVersionIsNotFatal(t *testing.T) {
	t.Setenv("PATH", writeFakeTmux(t, "echo 'tmux master'"))

	var stderr bytes.Buffer
	result, err := runTmuxPreflight(context.Background(), &stderr)

	require.NoError(t, err)
	assert.Equal(t, tmux.StatusUnrecognized, result.Status)
	assert.Contains(t, stderr.String(), "musterd preflight")
	assert.Contains(t, stderr.String(), "? tmux")
	assert.Contains(t, stderr.String(), "unrecognised version")
	assert.False(t, strings.HasSuffix(stderr.String(), "\n\n"),
		"the warning path has no verdict line following it, so it gets no trailing blank line")
}

// TestRunTmuxPreflight_OKPrintsNothing covers REQ-13: an all-clear preflight must not
// print the report block at all — only failures and warnings get one.
func TestRunTmuxPreflight_OKPrintsNothing(t *testing.T) {
	t.Setenv("PATH", writeFakeTmux(t, "echo 'tmux 3.7b'"))

	var stderr bytes.Buffer
	result, err := runTmuxPreflight(context.Background(), &stderr)

	require.NoError(t, err)
	assert.Equal(t, tmux.StatusOK, result.Status)
	assert.Empty(t, stderr.String(), "an all-clear preflight must print nothing (REQ-13)")
}

// freeAddr returns an address that is momentarily bound then released, so a caller can
// pass it to run() and independently prove afterward that nothing is listening on it.
func freeAddr(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	addr := ln.Addr().String()
	require.NoError(t, ln.Close())
	return addr
}

// TestRun_FailedPreflightLeavesNoSideEffects covers D4: with tmux absent, run() must
// fail before creating the data dir or binding the listen address — both checked
// directly rather than trusting the code's ordering comment alone.
func TestRun_FailedPreflightLeavesNoSideEffects(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	dataDir := filepath.Join(t.TempDir(), "not-yet-created")
	addr := freeAddr(t)

	err := run([]string{
		"-addr", addr,
		"-data-dir", dataDir,
	}, nil, io.Discard, io.Discard)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "tmux is required")

	_, statErr := os.Stat(dataDir)
	assert.True(t, os.IsNotExist(statErr), "D4: the data dir must not be created when the preflight fails")

	ln, listenErr := net.Listen("tcp", addr)
	require.NoError(t, listenErr, "D4: the listen address must remain unbound after a failed preflight")
	_ = ln.Close()
}

// TestRun_VersionFlagSucceedsWithTmuxAbsent covers D5/REQ-5: -version's early return
// happens before the tmux preflight, so it must succeed even on a machine with no tmux
// at all.
func TestRun_VersionFlagSucceedsWithTmuxAbsent(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	var stdout bytes.Buffer
	err := run([]string{"-version"}, nil, &stdout, io.Discard)

	require.NoError(t, err)
	assert.Contains(t, stdout.String(), "musterd")
}

// TestReadmeTmuxRemedyMatchesPreflight covers D13/R1: README.md's Prerequisites section
// must quote the exact same remedy strings the preflight's fatal errors carry — both
// constants, not merely text that looks similar.
func TestReadmeTmuxRemedyMatchesPreflight(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "README.md"))
	require.NoError(t, err)
	readme := string(b)

	assert.Contains(t, readme, tmuxInstallRemedy, "README must quote the preflight's own remedy constant byte-for-byte")
	assert.Contains(t, readme, tmuxUpgradeRemedy, "README must quote the preflight's too-old remedy constant byte-for-byte")
}
