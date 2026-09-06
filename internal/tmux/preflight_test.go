package tmux

import (
	"context"
	"errors"
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

// fakePreflighter builds a preflighter whose two process boundaries are canned: lookPath
// resolves "tmux" to fakeTmuxPath and run returns stdout/err without forking anything.
// internal/tmux.Preflight's own logic (trim, parse, compare, classify) runs unchanged
// through preflight(); only the exec seams are replaced (docs/conventions.md §Testing).
// The pre-seam version of these tests wrote a /bin/sh shim onto $PATH — a real fork per
// test that hit the 2 s timeout under `go test`'s default package parallelism.
const fakeTmuxPath = "/fake/bin/tmux"

func fakePreflighter(stdout string, runErr error) *preflighter {
	return &preflighter{
		lookPath: func(string) (string, error) { return fakeTmuxPath, nil },
		run: func(context.Context, string, ...string) ([]byte, error) {
			return []byte(stdout + "\n"), runErr
		},
		timeout: time.Second,
	}
}

// TestPreflight_NotFoundOnPath covers D1's underlying unit and Edge Case 1's "absent"
// shape: no tmux anywhere on $PATH resolves to StatusNotFound with Found=false and no
// path to report. lookPath fails exactly as exec.LookPath does for an empty $PATH.
func TestPreflight_NotFoundOnPath(t *testing.T) {
	p := fakePreflighter("", nil)
	p.lookPath = func(string) (string, error) { return "", errors.New("executable file not found in $PATH") }

	got := p.preflight(context.Background())

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
	p := fakePreflighter("", errors.New("exit status 1"))

	got := p.preflight(context.Background())

	assert.Equal(t, StatusNotFound, got.Status)
	assert.True(t, got.Found, "a binary that resolved but failed to run must still report Found=true")
	assert.Equal(t, fakeTmuxPath, got.Path)
}

// TestPreflight_HangingTmuxIsBoundedAndFatal covers Edge Case 1: `tmux -V` never
// contacts a server and is instant, so a hang past the preflight timeout is a failure to
// run tmux at all, not a slow tmux — preflight must return at its own timeout, not the
// binary's, and classify it as StatusNotFound like any other failure to run. The run
// seam blocks until the bounded context expires, exactly as exec.CommandContext's
// Output() does once it has killed the process; the timeout is injected small so the
// assertion is about the bound being applied, not about waiting 2 s.
func TestPreflight_HangingTmuxIsBoundedAndFatal(t *testing.T) {
	p := fakePreflighter("", nil)
	p.timeout = 50 * time.Millisecond
	p.run = func(ctx context.Context, _ string, _ ...string) ([]byte, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}

	start := time.Now()
	got := p.preflight(context.Background())
	elapsed := time.Since(start)

	assert.Equal(t, StatusNotFound, got.Status)
	assert.True(t, got.Found)
	assert.Equal(t, fakeTmuxPath, got.Path)
	assert.GreaterOrEqual(t, elapsed, 50*time.Millisecond, "the run must have been given the full preflight timeout")
	assert.Less(t, elapsed, time.Second, "a hung tmux -V must be bounded by the preflight timeout, not the binary's own lifetime")
}

// TestPreflight_TooOld covers D2/REQ-2: a tmux below MinVersion classifies as
// StatusTooOld and its detected version is reported (not just the pass/fail verdict).
func TestPreflight_TooOld(t *testing.T) {
	got := fakePreflighter("tmux 3.1a", nil).preflight(context.Background())

	assert.Equal(t, StatusTooOld, got.Status)
	assert.True(t, got.Found)
	assert.Equal(t, fakeTmuxPath, got.Path)
	assert.Equal(t, "3.1a", got.Version, "the leading \"tmux\" program name must be trimmed from the stored Version")
}

// TestPreflight_ExactlyMinVersionIsOK covers the MinVersion boundary itself: 3.2 is
// accepted, not rejected — Less must be strict, not <=.
func TestPreflight_ExactlyMinVersionIsOK(t *testing.T) {
	got := fakePreflighter("tmux 3.2", nil).preflight(context.Background())

	assert.Equal(t, StatusOK, got.Status)
	assert.Equal(t, "3.2", got.Version)
}

// TestPreflight_NewerDoubleDigitMinorIsOK is D6/D7 exercised through preflight's own
// classification end to end: 3.10 must be treated as newer than the 3.2 minimum, not
// older by a lexical compare.
func TestPreflight_NewerDoubleDigitMinorIsOK(t *testing.T) {
	got := fakePreflighter("tmux 3.10", nil).preflight(context.Background())

	assert.Equal(t, StatusOK, got.Status, "3.10 must not be rejected as older than 3.2")
}

// TestPreflight_UnrecognizedVersionIsNotFatal covers D3/REQ-3/Edge Case 5: tmux ran
// successfully but its output doesn't parse as a version — StatusUnrecognized, not
// StatusNotFound and not StatusTooOld. Muster cannot prove an unrecognized build is too
// old.
func TestPreflight_UnrecognizedVersionIsNotFatal(t *testing.T) {
	got := fakePreflighter("tmux master", nil).preflight(context.Background())

	assert.Equal(t, StatusUnrecognized, got.Status)
	assert.True(t, got.Found)
	assert.Equal(t, fakeTmuxPath, got.Path)
	assert.Equal(t, "master", got.Version)
}

// TestPreflight_UppercaseProgramNamePrefixIsNotTrimmed documents a real implementation
// decision (daemon-implementation.md's Decisions: the "tmux" prefix trim is case
// sensitive) rather than a plan requirement — every real tmux binary emits a lowercase
// "tmux" prefix, but ParseVersion's digit matching must still succeed regardless of
// prefix casing, only the display trimming is affected.
func TestPreflight_UppercaseProgramNamePrefixIsNotTrimmed(t *testing.T) {
	got := fakePreflighter("TMUX 3.5", nil).preflight(context.Background())

	assert.Equal(t, StatusOK, got.Status, "version parsing must not depend on the program-name prefix's casing")
	assert.Equal(t, "TMUX 3.5", got.Version)
}

// TestPreflight_ProductionSeamsAreTheExecPackage pins that the exported Preflight is
// wired to real process boundaries — the fake-seam tests above prove the logic, this
// proves the default construction points at exec (and at the 2 s bound REQ-1 names)
// without running anything.
func TestPreflight_ProductionSeamsAreTheExecPackage(t *testing.T) {
	p := newPreflighter()

	assert.NotNil(t, p.lookPath)
	assert.NotNil(t, p.run)
	assert.Equal(t, 2*time.Second, p.timeout)
}
