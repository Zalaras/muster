package tmux

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestParseVersion covers REQ-2/REQ-3 and Edge Cases 3-5: the first (major, minor) pair
// is extracted from raw `tmux -V` output, trailing letters/suffixes and anything before
// the digits are ignored, and a version with no numeric match at all reports ok=false
// (the warning path, not an error).
func TestParseVersion(t *testing.T) {
	tests := []struct {
		name      string
		raw       string
		wantMajor int
		wantMinor int
		wantOK    bool
	}{
		{"plain version", "tmux 3.2", 3, 2, true},
		{"already-trimmed display string", "3.1a", 3, 1, true},
		{"double-digit minor, Edge Case 3", "tmux 3.10", 3, 10, true},
		{"trailing suffix ignored, Edge Case 4", "tmux 3.3a-openbsd", 3, 3, true},
		{"leading text before digits ignored, Edge Case 4", "tmux next-3.4", 3, 4, true},
		{"no numeric version at all, Edge Case 5", "tmux master", 0, 0, false},
		{"empty string", "", 0, 0, false},
		{"digits with no dot never match", "tmux 3", 0, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ParseVersion(tt.raw)

			require.Equal(t, tt.wantOK, ok)
			if tt.wantOK {
				assert.Equal(t, tt.wantMajor, got.Major)
				assert.Equal(t, tt.wantMinor, got.Minor)
			}
		})
	}
}

// TestParsedVersion_Less is D7 and Edge Case 3: comparison is numeric on (major, minor),
// never lexical — a string compare would put "3.10" below "3.2".
func TestParsedVersion_Less(t *testing.T) {
	tests := []struct {
		name string
		a, b ParsedVersion
		want bool
	}{
		{"3.2 is less than 3.10 (D7)", ParsedVersion{Major: 3, Minor: 2}, ParsedVersion{Major: 3, Minor: 10}, true},
		{"3.10 is NOT less than 3.2 (D7 — the lexical-compare bug this guards)", ParsedVersion{Major: 3, Minor: 10}, ParsedVersion{Major: 3, Minor: 2}, false},
		{"equal versions are never less than each other", ParsedVersion{Major: 3, Minor: 2}, ParsedVersion{Major: 3, Minor: 2}, false},
		{"lower major beats a much higher minor", ParsedVersion{Major: 2, Minor: 99}, ParsedVersion{Major: 3, Minor: 0}, true},
		{"higher major is never less regardless of minor", ParsedVersion{Major: 3, Minor: 0}, ParsedVersion{Major: 2, Minor: 99}, false},
		{"minor difference within the same major", ParsedVersion{Major: 3, Minor: 1}, ParsedVersion{Major: 3, Minor: 2}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.a.Less(tt.b))
		})
	}
}

func TestParsedVersion_String(t *testing.T) {
	assert.Equal(t, "3.2", ParsedVersion{Major: 3, Minor: 2}.String())
	assert.Equal(t, "3.10", ParsedVersion{Major: 3, Minor: 10}.String())
}

// TestMinVersion pins REQ-2's stated minimum so a future accidental edit is caught here
// rather than only surfacing as a changed error message elsewhere.
func TestMinVersion(t *testing.T) {
	assert.Equal(t, ParsedVersion{Major: 3, Minor: 2}, MinVersion)
}

// writeFakeTmux writes an executable "tmux" into a fresh scratch directory that prints
// script's stdout when run with any arguments (including "-V") and returns that
// directory plus the binary's resolved path. Tests point $PATH at the returned directory
// (via t.Setenv, auto-restored) so internal/tmux.Preflight's own exec.LookPath("tmux")
// resolves to this stub rather than whatever real tmux the test host has installed —
// this never touches a tmux server or socket, `tmux -V` never contacts one.
func writeFakeTmux(t *testing.T, body string) (dir, path string) {
	t.Helper()
	dir = t.TempDir()
	path = filepath.Join(dir, "tmux")
	require.NoError(t, os.WriteFile(path, []byte("#!/bin/sh\n"+body+"\n"), 0o755))
	return dir, path
}

// TestPreflight_NotFoundOnPath covers D1's underlying unit and Edge Case 1's "absent"
// shape: no tmux anywhere on $PATH resolves to StatusNotFound with Found=false and no
// path to report.
func TestPreflight_NotFoundOnPath(t *testing.T) {
	t.Setenv("PATH", t.TempDir()) // an empty directory: no tmux binary at all

	got := Preflight(context.Background())

	assert.Equal(t, StatusNotFound, got.Status)
	assert.False(t, got.Found)
	assert.Empty(t, got.Path)
	assert.Empty(t, got.Version)
}

// TestPreflight_FoundButFailsToRun covers Edge Case 2 (present but not executable, or
// any other reason `tmux -V` exits non-zero): the report must still distinguish this
// from "not found" by setting Found=true and Path (REQ-14), even though both land on the
// same fatal StatusNotFound classification (daemon-implementation.md's Decisions).
func TestPreflight_FoundButFailsToRun(t *testing.T) {
	dir, path := writeFakeTmux(t, "exit 1")
	t.Setenv("PATH", dir)

	got := Preflight(context.Background())

	assert.Equal(t, StatusNotFound, got.Status)
	assert.True(t, got.Found, "a binary that resolved but failed to run must still report Found=true")
	assert.Equal(t, path, got.Path)
}

// TestPreflight_HangingTmuxIsBoundedAndFatal covers Edge Case 1: `tmux -V` never
// contacts a server and is instant, so a hang past preflightTimeout (2s) is a failure to
// run tmux at all, not a slow tmux — Preflight must return well before the stub's own
// sleep, and classify it as StatusNotFound like any other failure to run.
func TestPreflight_HangingTmuxIsBoundedAndFatal(t *testing.T) {
	// "exec /bin/sleep 5", not "sleep 5" or "/bin/sleep 5" run as an ordinary command:
	// an ordinary command forks a child that outlives a killed /bin/sh, orphaning it —
	// exec.CommandContext then only kills the shell, and the orphaned sleep keeps the
	// Output() pipe open until it exits on its own at 5s, which would make this test
	// pass for the wrong reason (measuring the sleep's own duration, not the preflight
	// timeout). The `exec` builtin replaces the shell process in place (verified via
	// `ps`: same PID becomes /bin/sleep), so killing the single process actually closes
	// the pipe at the 2s bound. Absolute path because $PATH below is deliberately
	// restricted to this stub's own directory.
	dir, path := writeFakeTmux(t, "exec /bin/sleep 5")
	t.Setenv("PATH", dir)

	start := time.Now()
	got := Preflight(context.Background())
	elapsed := time.Since(start)

	assert.Equal(t, StatusNotFound, got.Status)
	assert.True(t, got.Found)
	assert.Equal(t, path, got.Path)
	assert.Less(t, elapsed, 4*time.Second, "a hung tmux -V must be bounded near the 2s preflight timeout, not the stub's 5s sleep")
}

// TestPreflight_TooOld covers D2/REQ-2: a tmux below MinVersion classifies as
// StatusTooOld and its detected version is reported (not just the pass/fail verdict).
func TestPreflight_TooOld(t *testing.T) {
	dir, path := writeFakeTmux(t, "echo 'tmux 3.1a'")
	t.Setenv("PATH", dir)

	got := Preflight(context.Background())

	assert.Equal(t, StatusTooOld, got.Status)
	assert.True(t, got.Found)
	assert.Equal(t, path, got.Path)
	assert.Equal(t, "3.1a", got.Version, "the leading \"tmux\" program name must be trimmed from the stored Version")
}

// TestPreflight_ExactlyMinVersionIsOK covers the MinVersion boundary itself: 3.2 is
// accepted, not rejected — Less must be strict, not <=.
func TestPreflight_ExactlyMinVersionIsOK(t *testing.T) {
	dir, _ := writeFakeTmux(t, "echo 'tmux 3.2'")
	t.Setenv("PATH", dir)

	got := Preflight(context.Background())

	assert.Equal(t, StatusOK, got.Status)
	assert.Equal(t, "3.2", got.Version)
}

// TestPreflight_NewerDoubleDigitMinorIsOK is D6/D7 exercised through Preflight's own
// exported surface end to end: 3.10 must be treated as newer than the 3.2 minimum, not
// older by a lexical compare.
func TestPreflight_NewerDoubleDigitMinorIsOK(t *testing.T) {
	dir, _ := writeFakeTmux(t, "echo 'tmux 3.10'")
	t.Setenv("PATH", dir)

	got := Preflight(context.Background())

	assert.Equal(t, StatusOK, got.Status, "3.10 must not be rejected as older than 3.2")
}

// TestPreflight_UnrecognizedVersionIsNotFatal covers D3/REQ-3/Edge Case 5: tmux ran
// successfully but its output doesn't parse as a version — StatusUnrecognized, not
// StatusNotFound and not StatusTooOld. Muster cannot prove an unrecognized build is too
// old.
func TestPreflight_UnrecognizedVersionIsNotFatal(t *testing.T) {
	dir, path := writeFakeTmux(t, "echo 'tmux master'")
	t.Setenv("PATH", dir)

	got := Preflight(context.Background())

	assert.Equal(t, StatusUnrecognized, got.Status)
	assert.True(t, got.Found)
	assert.Equal(t, path, got.Path)
	assert.Equal(t, "master", got.Version)
}

// TestPreflight_UppercaseProgramNamePrefixIsNotTrimmed documents a real implementation
// decision (daemon-implementation.md's Decisions: the "tmux" prefix trim is case
// sensitive) rather than a plan requirement — every real tmux binary emits a lowercase
// "tmux" prefix, but ParseVersion's digit matching must still succeed regardless of
// prefix casing, only the display trimming is affected.
func TestPreflight_UppercaseProgramNamePrefixIsNotTrimmed(t *testing.T) {
	dir, _ := writeFakeTmux(t, "echo 'TMUX 3.5'")
	t.Setenv("PATH", dir)

	got := Preflight(context.Background())

	assert.Equal(t, StatusOK, got.Status, "version parsing must not depend on the program-name prefix's casing")
	assert.Equal(t, "TMUX 3.5", got.Version)
}
