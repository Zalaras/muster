package tmux

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestShellSessionName_IsMusterDashIDDashShell covers the one definition of the
// "muster-<id>-shell" naming convention (plan plain-terminal-session, Affected Files).
func TestShellSessionName_IsMusterDashIDDashShell(t *testing.T) {
	assert.Equal(t, "muster-7-shell", ShellSessionName(7))
	assert.Equal(t, "muster-0-shell", ShellSessionName(0))
}

// TestIsShellSessionName_Table exhaustively covers the naming convention's inverse,
// including names that must NOT parse as a shell session: a plain Claude session name,
// a name with the suffix but a non-numeric id, and a name whose "middle" after stripping
// prefix/suffix is itself not a bare integer (e.g. it still contains "-shell").
func TestIsShellSessionName_Table(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		wantID int64
		wantOK bool
	}{
		{"ordinary shell name", "muster-7-shell", 7, true},
		{"zero id", "muster-0-shell", 0, true},
		{"large id", "muster-123456789-shell", 123456789, true},
		{"claude session name has no suffix", "muster-7", 0, false},
		{"bare shell suffix with no prefix", "shell", 0, false},
		{"non-numeric middle", "muster-abc-shell", 0, false},
		{"empty middle", "muster--shell", 0, false},
		{"double shell suffix leaves non-numeric middle", "muster-7-shell-shell", 0, false},
		{"not muster-prefixed at all", "some-other-session", 0, false},
		{"suffix without the dash", "muster-7shell", 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, ok := IsShellSessionName(tt.input)
			assert.Equal(t, tt.wantOK, ok)
			if tt.wantOK {
				assert.Equal(t, tt.wantID, id)
			}
		})
	}
}

// TestShellSessionName_IsShellSessionName_RoundTrip covers the two functions as inverses
// of each other across a handful of ids — the property the naming convention actually
// promises callers (Reconcile builds a name with one and parses it back with the other).
func TestShellSessionName_IsShellSessionName_RoundTrip(t *testing.T) {
	for _, id := range []int64{0, 1, 7, 42, 999999} {
		name := ShellSessionName(id)
		got, ok := IsShellSessionName(name)
		require.True(t, ok, "name %q must parse back", name)
		assert.Equal(t, id, got)
	}
}

// TestNewNamedSession_CreatesASessionWithTheExactRequestedName covers the seam
// NewSession now delegates through: an arbitrary name (not the "muster-<id>" convention)
// is honored verbatim, including the shell naming convention itself.
func TestNewNamedSession_CreatesASessionWithTheExactRequestedName(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	name := ShellSessionName(nextID(t))

	target, pane, err := c.NewNamedSession(context.Background(), name, dir, nil, sleepCommand())
	require.NoError(t, err)

	assert.True(t, strings.HasPrefix(target, name+":"), "target %q must start with the exact requested name", target)
	assert.Regexp(t, `^%\d+$`, pane)

	names, err := c.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Equal(t, []string{name}, names)
}

// TestNewNamedSession_SetsExtraEnvironmentInThePane covers that NewNamedSession's env
// parameter still works exactly as NewSession's does — it is the same code path,
// verified here on the arbitrary-name entry point specifically (shells.go passes nil,
// but the seam itself must still honor a non-nil map for any other caller).
func TestNewNamedSession_SetsExtraEnvironmentInThePane(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	outFile := filepath.Join(dir, "env-output.txt")
	name := ShellSessionName(nextID(t))

	_, _, err := c.NewNamedSession(context.Background(), name, dir, map[string]string{
		"MUSTER_TEST_VAR": "named-session-hello",
	}, []string{"/bin/sh", "-c", "echo $MUSTER_TEST_VAR > " + outFile + "; sleep 60"})
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		b, readErr := os.ReadFile(outFile)
		return readErr == nil && len(b) > 0
	}, 5*time.Second, 50*time.Millisecond)
	got, err := os.ReadFile(outFile)
	require.NoError(t, err)
	assert.Equal(t, "named-session-hello\n", string(got))
}

// TestNewNamedSession_DistinctNamesCreateDistinctTmuxSessions covers the shell/Claude
// coexistence the plan depends on: two different names for the same underlying id
// produce two independent tmux sessions, not one shared window.
func TestNewNamedSession_DistinctNamesCreateDistinctTmuxSessions(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	id := nextID(t)
	claudeName := "muster-" + strconv.FormatInt(id, 10)
	shellName := ShellSessionName(id)

	_, _, err := c.NewNamedSession(context.Background(), claudeName, dir, nil, sleepCommand())
	require.NoError(t, err)
	_, _, err = c.NewNamedSession(context.Background(), shellName, dir, nil, sleepCommand())
	require.NoError(t, err)

	names, err := c.ListSessions(context.Background())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{claudeName, shellName}, names)
}

// TestTerminalSessionName_ParseTerminalName_Table is D1: the tmux name <-> (id, n) mapping,
// both directions, with the names that must not parse as terminals.
func TestTerminalSessionName_ParseTerminalName_Table(t *testing.T) {
	valid := []struct {
		name   string
		input  string
		wantID int64
		wantN  int
	}{
		{"terminal 1 has no suffix", "muster-7-shell", 7, 1},
		{"terminal 2", "muster-7-shell-2", 7, 2},
		{"two digit n", "muster-7-shell-10", 7, 10},
		{"large n", "muster-7-shell-123456", 7, 123456},
		{"id zero", "muster-0-shell-3", 0, 3},
		{"large id", "muster-123456789-shell-2", 123456789, 2},
	}
	for _, tt := range valid {
		t.Run(tt.name, func(t *testing.T) {
			id, n, ok := ParseTerminalName(tt.input)
			require.True(t, ok)
			assert.Equal(t, tt.wantID, id)
			assert.Equal(t, tt.wantN, n)
			assert.Equal(t, tt.input, TerminalSessionName(tt.wantID, tt.wantN), "round-trips")
			sid, isShell := IsShellSessionName(tt.input)
			assert.True(t, isShell, "IsShellSessionName accepts every terminal")
			assert.Equal(t, tt.wantID, sid)
			_, isClaude := ParseSessionName(tt.input)
			assert.False(t, isClaude, "a terminal name is never a Claude session name")
		})
	}

	invalid := []struct{ name, input string }{
		{"claude session name", "muster-7"},
		{"explicit -1 is not a spelling of terminal 1", "muster-7-shell-1"},
		{"zero", "muster-7-shell-0"},
		{"negative", "muster-7-shell--2"},
		{"leading zero", "muster-7-shell-02"},
		{"plus sign", "muster-7-shell-+2"},
		{"trailing junk", "muster-7-shell-2x"},
		{"empty n", "muster-7-shell-"},
		{"non numeric n", "muster-7-shell-x"},
		{"double suffix", "muster-7-shell-shell"},
		{"no dash before n", "muster-7-shell2"},
		{"non numeric id", "muster-abc-shell-2"},
		{"empty id", "muster--shell"},
		{"no prefix", "other-7-shell-2"},
		{"empty", ""},
		{"overflowing n", "muster-7-shell-99999999999999999999"},
	}
	for _, tt := range invalid {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			_, _, ok := ParseTerminalName(tt.input)
			assert.False(t, ok)
			_, isShell := IsShellSessionName(tt.input)
			assert.False(t, isShell)
		})
	}
}

// TestTerminalSessionName_RoundTripAcrossIDsAndNumbers crosses ids against n.
func TestTerminalSessionName_RoundTripAcrossIDsAndNumbers(t *testing.T) {
	for _, id := range []int64{0, 1, 42, 999999} {
		for _, n := range []int{1, 2, 3, 9, 10, 11, 100} {
			gotID, gotN, ok := ParseTerminalName(TerminalSessionName(id, n))
			require.True(t, ok, "id %d n %d", id, n)
			assert.Equal(t, id, gotID)
			assert.Equal(t, n, gotN)
		}
	}
	assert.Equal(t, ShellSessionName(5), TerminalSessionName(5, 1))
}
