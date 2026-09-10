package claudecode

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVersionRE(t *testing.T) {
	tests := []struct {
		name string
		out  string
		want string // "" means: expect no match
	}{
		{"native install format", "2.1.233 (Claude Code)", "2.1.233"},
		{"bare version", "2.1.233", "2.1.233"},
		{"multi-digit minor", "2.10.0 (Claude Code)", "2.10.0"},
		{"not a version", "command not found", ""},
		{"incomplete version", "2.1 (Claude Code)", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := versionRE.FindStringSubmatch(tt.out)
			if tt.want == "" {
				assert.Nil(t, m)
				return
			}
			require.NotNil(t, m)
			assert.Equal(t, tt.want, m[1])
		})
	}
}

// writeVersionLeakStub writes a real executable that prints the pinned --version output
// and then exits successfully while a *descendant* it forked keeps the inherited stdout
// pipe open for a long time. This is the exact shape that hung musterd's startup before
// its first log line at e0319f8 (REQ-2): the direct child (the one exec.CommandContext
// tracks) exits promptly, so a stub that merely slept *before* exiting would only prove
// the ordinary context-deadline/kill path, not this bug — os/exec's Wait blocks on the
// stdout pipe reaching EOF, and that requires every fd holder to close it, including a
// backgrounded grandchild the shell never waits for.
func writeVersionLeakStub(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "claude")
	script := "#!/bin/sh\n" +
		"echo '" + Verified() + " (Claude Code)'\n" +
		"sleep 60 &\n" +
		"exit 0\n"
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

// TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup covers D2/REQ-2 and Edge
// Cases 1-2: a claude binary that exits 0 promptly but leaves a descendant holding stdout
// must not stall InstalledVersion past the WaitDelay bound, since this runs on musterd's
// startup path before any log line. The call is run in a goroutine with the test's own
// bounded select so a regression (WaitDelay reverted/removed) fails this test with a clear
// diagnostic instead of hanging the whole `go test` run for the stub's full sleep.
func TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup(t *testing.T) {
	bin := writeVersionLeakStub(t)

	type result struct {
		version string
		err     error
	}
	done := make(chan result, 1)
	start := time.Now()
	go func() {
		v, err := InstalledVersion(context.Background(), bin)
		done <- result{v, err}
	}()

	select {
	case res := <-done:
		elapsed := time.Since(start)
		assert.Less(t, elapsed, 15*time.Second, "must return within the 2s WaitDelay bound plus slack, not wait out the descendant's own sleep")
		// The pipe is force-closed mid-read once WaitDelay elapses, which os/exec
		// reports as an error even though the direct process itself exited 0 — so the
		// version is unavailable this time, but the call still returned promptly
		// rather than hanging (the happy-path parse is covered by the existing
		// subprocess-free TestVersionRE table, D1/Edge Case 3).
		assert.Error(t, res.err)
		assert.ErrorIs(t, res.err, exec.ErrWaitDelay)
		assert.Empty(t, res.version)
	case <-time.After(15 * time.Second):
		t.Fatal("InstalledVersion did not return within 15s of a descendant holding stdout open — this is the startup hang REQ-2 fixes (revert cmd.WaitDelay in version.go to reproduce)")
	}
}

// ---------------------------------------------------------------------------------------
// ParseObservedVersions / RangeOf / Floor / Verified (REQ-1, D6, D7, INV-6)

func TestParseObservedVersions_ValidRowsCommentsAndBlankLines(t *testing.T) {
	r := strings.NewReader(strings.Join([]string{
		"# a leading comment",
		"",
		"2.1.246 2026-08-29 m4-canary",
		"   ", // whitespace-only line
		"# another comment",
		"2.1.267 2026-09-10 canary-full-coverage",
		"",
	}, "\n"))

	rows, err := ParseObservedVersions(r)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, ObservedVersion{Version: "2.1.246", Date: "2026-08-29", Note: "m4-canary"}, rows[0])
	assert.Equal(t, ObservedVersion{Version: "2.1.267", Date: "2026-09-10", Note: "canary-full-coverage"}, rows[1])
}

func TestParseObservedVersions_NoteMayContainSpaces(t *testing.T) {
	rows, err := ParseObservedVersions(strings.NewReader("2.1.246 2026-08-29 make canary, forced review run\n"))
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "make canary, forced review run", rows[0].Note)
}

func TestParseObservedVersions_RejectsDuplicateVersion(t *testing.T) {
	_, err := ParseObservedVersions(strings.NewReader(
		"2.1.246 2026-08-29 first\n2.1.246 2026-09-01 second\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "duplicate")
	assert.Contains(t, err.Error(), "2.1.246")
}

func TestParseObservedVersions_RejectsMalformedRow(t *testing.T) {
	tests := []struct {
		name string
		line string
	}{
		{"non-semver version", "not-a-version 2026-08-29 note\n"},
		{"missing date", "2.1.246 note-without-a-date\n"},
		{"missing note", "2.1.246 2026-08-29\n"},
		{"bad date shape", "2.1.246 08-29-2026 note\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseObservedVersions(strings.NewReader(tt.line))
			require.Error(t, err)
			assert.Contains(t, err.Error(), "malformed row")
		})
	}
}

func TestParseObservedVersions_EmptyRecordErrors(t *testing.T) {
	_, err := ParseObservedVersions(strings.NewReader("# only comments\n\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no version rows")
}

func TestRangeOf_MinMaxIndependentOfRowOrder(t *testing.T) {
	ascending := []ObservedVersion{{Version: "2.1.246"}, {Version: "2.1.250"}, {Version: "2.1.267"}}
	descending := []ObservedVersion{{Version: "2.1.267"}, {Version: "2.1.250"}, {Version: "2.1.246"}}
	shuffled := []ObservedVersion{{Version: "2.1.250"}, {Version: "2.1.267"}, {Version: "2.1.246"}}

	for name, rows := range map[string][]ObservedVersion{"ascending": ascending, "descending": descending, "shuffled": shuffled} {
		t.Run(name, func(t *testing.T) {
			floor, verified := RangeOf(rows)
			assert.Equal(t, "2.1.246", floor)
			assert.Equal(t, "2.1.267", verified)
		})
	}
}

func TestRangeOf_SingleRow_FloorEqualsVerified(t *testing.T) {
	floor, verified := RangeOf([]ObservedVersion{{Version: "2.1.246"}})
	assert.Equal(t, "2.1.246", floor)
	assert.Equal(t, floor, verified)
}

func TestRangeOf_EmptyRowsYieldsEmptyStrings(t *testing.T) {
	floor, verified := RangeOf(nil)
	assert.Empty(t, floor)
	assert.Empty(t, verified)
}

func TestRangeOf_ComparesNumericallyNotLexically(t *testing.T) {
	// A lexical compare would put "2.1.9" after "2.1.267" wrongly; the numeric compare
	// must not.
	floor, verified := RangeOf([]ObservedVersion{{Version: "2.1.9"}, {Version: "2.1.267"}})
	assert.Equal(t, "2.1.9", floor)
	assert.Equal(t, "2.1.267", verified)
}

// TestFloorAndVerified_MatchEmbeddedRecord covers D6/INV-6 against the real, embedded
// observed_versions.txt shipped with this plan (two rows: 2.1.246, 2.1.267).
func TestFloorAndVerified_MatchEmbeddedRecord(t *testing.T) {
	assert.Equal(t, "2.1.246", Floor())
	assert.Equal(t, "2.1.267", Verified())
}

func TestObservedVersions_EmbeddedFileParsesWithoutPanicking(t *testing.T) {
	require.NotPanics(t, func() {
		rows := ObservedVersions()
		assert.Len(t, rows, 2, "D6: the embedded record must contain exactly two rows")
	})
}

// ---------------------------------------------------------------------------------------
// FormatRange (D27)

func TestFormatRange(t *testing.T) {
	tests := []struct {
		name            string
		floor, verified string
		want            string
	}{
		{"distinct versions render an en-dash range", "2.1.246", "2.1.267", "2.1.246–2.1.267"},
		{"equal versions render just the one version", "2.1.267", "2.1.267", "2.1.267"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, FormatRange(tt.floor, tt.verified))
		})
	}
}

// ---------------------------------------------------------------------------------------
// ClassifyAgainst / Classify (D8) — synthetic rows so the table is independent of
// whatever the embedded record happens to contain.

func TestClassifyAgainst(t *testing.T) {
	rows := []ObservedVersion{{Version: "2.1.267"}, {Version: "2.1.246"}} // deliberately unsorted

	tests := []struct {
		name      string
		installed string
		want      VersionStatus
	}{
		{"empty string is unknown", "", StatusUnknown},
		{"garbage is unknown", "not-a-version", StatusUnknown},
		{"one below floor", "2.1.245", StatusBelow},
		{"far below floor", "1.0.0", StatusBelow},
		{"equal to floor is verified", "2.1.246", StatusVerified},
		{"equal to ceiling is verified", "2.1.267", StatusVerified},
		{"intermediate never-run version is verified (inferred)", "2.1.250", StatusVerified},
		{"suffixed version compares on the leading semver only", "2.1.250-e2e-stub", StatusVerified},
		{"suffixed version below floor", "2.0.0-e2e-stub", StatusBelow},
		{"one above ceiling", "2.1.268", StatusAbove},
		{"far above ceiling", "3.0.0", StatusAbove},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, ClassifyAgainst(tt.installed, rows))
		})
	}
}

func TestClassifyAgainst_SingleRowRange_EqualIsVerifiedNeighboursAreNot(t *testing.T) {
	rows := []ObservedVersion{{Version: "2.1.246"}}
	assert.Equal(t, StatusVerified, ClassifyAgainst("2.1.246", rows))
	assert.Equal(t, StatusBelow, ClassifyAgainst("2.1.245", rows))
	assert.Equal(t, StatusAbove, ClassifyAgainst("2.1.247", rows))
}

// TestClassify_UsesEmbeddedRecord is a thin integration check that Classify wires
// ClassifyAgainst to the real embedded ObservedVersions() (the table above already covers
// the classification logic exhaustively against synthetic rows).
func TestClassify_UsesEmbeddedRecord(t *testing.T) {
	assert.Equal(t, StatusUnknown, Classify(""))
	assert.Equal(t, StatusVerified, Classify(Floor()))
	assert.Equal(t, StatusVerified, Classify(Verified()))
}

// ---------------------------------------------------------------------------------------
// CheckVersion (D9): INV-1 (Installed nil iff Status unknown) and INV-2 (Floor/Verified
// always populated, Floor <= Verified) across every outcome. Every stub is a real
// executable passed by path — never a $PATH shim (docs/conventions.md §Testing).

// writeVersionStub writes a real executable that, unless empty, echoes output to stdout
// and exits with code.
func writeVersionStub(t *testing.T, output string, code int) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "claude")
	script := "#!/bin/sh\n"
	if output != "" {
		script += fmt.Sprintf("echo %q\n", output)
	}
	script += fmt.Sprintf("exit %d\n", code)
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

func assertVersionReportInvariants(t *testing.T, report VersionReport) {
	t.Helper()
	// INV-1
	if report.Status == StatusUnknown {
		assert.Nil(t, report.Installed, "Installed must be nil when Status is unknown")
	} else {
		require.NotNil(t, report.Installed, "Installed must be non-nil when Status is %q", report.Status)
	}
	// INV-2
	assert.NotEmpty(t, report.Floor, "Floor must always be populated")
	assert.NotEmpty(t, report.Verified, "Verified must always be populated")
	assert.Equal(t, Floor(), report.Floor)
	assert.Equal(t, Verified(), report.Verified)
}

func TestCheckVersion(t *testing.T) {
	tests := []struct {
		name          string
		bin           func(t *testing.T) string
		wantStatus    VersionStatus
		wantInstalled string // "" means Installed must be nil
		wantErr       bool
	}{
		{
			name:       "missing binary is unknown",
			bin:        func(t *testing.T) string { return filepath.Join(t.TempDir(), "no-such-claude") },
			wantStatus: StatusUnknown,
			wantErr:    true,
		},
		{
			name:       "non-zero exit is unknown",
			bin:        func(t *testing.T) string { return writeVersionStub(t, "", 1) },
			wantStatus: StatusUnknown,
			wantErr:    true,
		},
		{
			name:       "unparseable output is unknown",
			bin:        func(t *testing.T) string { return writeVersionStub(t, "not a version string", 0) },
			wantStatus: StatusUnknown,
			wantErr:    true,
		},
		{
			name:          "below the floor",
			bin:           func(t *testing.T) string { return writeVersionStub(t, "1.0.0 (Claude Code)", 0) },
			wantStatus:    StatusBelow,
			wantInstalled: "1.0.0",
		},
		{
			name:          "equal to the floor is verified",
			bin:           func(t *testing.T) string { return writeVersionStub(t, Floor()+" (Claude Code)", 0) },
			wantStatus:    StatusVerified,
			wantInstalled: Floor(),
		},
		{
			name:          "equal to the ceiling is verified",
			bin:           func(t *testing.T) string { return writeVersionStub(t, Verified()+" (Claude Code)", 0) },
			wantStatus:    StatusVerified,
			wantInstalled: Verified(),
		},
		{
			name:          "above the ceiling",
			bin:           func(t *testing.T) string { return writeVersionStub(t, "99.0.0 (Claude Code)", 0) },
			wantStatus:    StatusAbove,
			wantInstalled: "99.0.0",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bin := tt.bin(t)
			report := CheckVersion(context.Background(), bin)

			assertVersionReportInvariants(t, report)
			assert.Equal(t, tt.wantStatus, report.Status)
			if tt.wantInstalled == "" {
				assert.Nil(t, report.Installed)
			} else if assert.NotNil(t, report.Installed) {
				assert.Equal(t, tt.wantInstalled, *report.Installed)
			}
			if tt.wantErr {
				assert.Error(t, report.Err)
			} else {
				assert.NoError(t, report.Err)
			}
		})
	}
}
