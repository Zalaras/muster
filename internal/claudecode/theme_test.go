package claudecode

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writeThemeFixture writes content to a fresh file inside t.TempDir() and returns its
// path — every path in this file comes from t.TempDir(), never the real config file
// (INV-5, D4): ReadThemeFamily is the only exported seam these tests use.
func writeThemeFixture(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "claude-config.json")
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	return path
}

// TestReadThemeFamily_UnknownCases covers D5: a missing file, an unreadable path, a
// non-JSON body and a non-string "theme" value must all map to ThemeUnknown.
func TestReadThemeFamily_UnknownCases(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T) string
	}{
		{
			name:  "missing file",
			setup: func(t *testing.T) string { return filepath.Join(t.TempDir(), "does-not-exist.json") },
		},
		{
			// A directory can never be read as a file's contents — os.ReadFile fails on
			// it the same way it would on a permission-denied file, without depending on
			// a chmod that a root/sandboxed test runner could silently ignore.
			name:  "unreadable path (a directory, not a file)",
			setup: func(t *testing.T) string { return t.TempDir() },
		},
		{
			name:  "not JSON",
			setup: func(t *testing.T) string { return writeThemeFixture(t, "this is not json at all") },
		},
		{
			name:  "empty file",
			setup: func(t *testing.T) string { return writeThemeFixture(t, "") },
		},
		{
			name:  "theme value is a number",
			setup: func(t *testing.T) string { return writeThemeFixture(t, `{"theme":123}`) },
		},
		{
			name:  "theme value is a bool",
			setup: func(t *testing.T) string { return writeThemeFixture(t, `{"theme":true}`) },
		},
		{
			name:  "theme value is an object",
			setup: func(t *testing.T) string { return writeThemeFixture(t, `{"theme":{"nested":true}}`) },
		},
		{
			name:  "theme value is an array",
			setup: func(t *testing.T) string { return writeThemeFixture(t, `{"theme":["dark"]}`) },
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := tt.setup(t)
			assert.Equal(t, ThemeUnknown, ReadThemeFamily(path))
		})
	}
}

// TestReadThemeFamily_KeyAbsentIsDark covers D6: valid JSON with no "theme" key at all
// (Claude Code's own default) maps to ThemeDark, distinguishable from ThemeUnknown.
func TestReadThemeFamily_KeyAbsentIsDark(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{"empty object", `{}`},
		{"other keys present, no theme key", `{"installMethod":"brew","autoUpdates":true}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := writeThemeFixture(t, tt.content)
			assert.Equal(t, ThemeDark, ReadThemeFamily(path))
		})
	}
}

// TestReadThemeFamily_PrefixMapping covers D7: every value in the binary's own enum
// prefix-maps to its family, and an unrecognised value maps to ThemeUnknown.
func TestReadThemeFamily_PrefixMapping(t *testing.T) {
	tests := []struct {
		value string
		want  ThemeFamily
	}{
		{"light", ThemeLight},
		{"light-daltonized", ThemeLight},
		{"light-ansi", ThemeLight},
		{"dark", ThemeDark},
		{"dark-daltonized", ThemeDark},
		{"dark-ansi", ThemeDark},
		{"solarized", ThemeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.value, func(t *testing.T) {
			path := writeThemeFixture(t, `{"theme":"`+tt.value+`"}`)
			assert.Equal(t, tt.want, ReadThemeFamily(path))
		})
	}
}

// TestReadThemeFamily_IgnoresEveryOtherTopLevelKey covers D8: a fixture with several
// other top-level keys, including nested objects and arrays, still decodes the "theme"
// key correctly — proving claudeConfig's single-field decode struct structurally
// ignores everything else rather than erroring on the extra shape.
func TestReadThemeFamily_IgnoresEveryOtherTopLevelKey(t *testing.T) {
	path := writeThemeFixture(t, `{
		"installMethod": "brew",
		"autoUpdates": true,
		"machineID": "abc123",
		"nested": {"a": {"b": [1, 2, 3]}},
		"apiKeyHelper": null,
		"theme": "dark-ansi"
	}`)

	assert.Equal(t, ThemeDark, ReadThemeFamily(path))
}

// TestReadThemeFamily_NeverWritesThePath is a direct check on INV-6/R1 at the function
// level: a read must never modify the file's bytes or mtime, regardless of the value
// found.
func TestReadThemeFamily_NeverWritesThePath(t *testing.T) {
	path := writeThemeFixture(t, `{"theme":"light"}`)
	before, err := os.ReadFile(path)
	require.NoError(t, err)
	statBefore, err := os.Stat(path)
	require.NoError(t, err)

	for i := 0; i < 3; i++ {
		assert.Equal(t, ThemeLight, ReadThemeFamily(path))
	}

	after, err := os.ReadFile(path)
	require.NoError(t, err)
	statAfter, err := os.Stat(path)
	require.NoError(t, err)
	assert.Equal(t, before, after, "ReadThemeFamily must never modify the file's contents")
	assert.Equal(t, statBefore.ModTime(), statAfter.ModTime(), "ReadThemeFamily must never modify the file's mtime")
}

// TestDefaultConfigPath_JoinsHomeAndFileName is a light sanity check that
// DefaultConfigPath resolves against the real home directory without erroring in a
// normal test environment — it does not open or read the path.
func TestDefaultConfigPath_JoinsHomeAndFileName(t *testing.T) {
	path, err := DefaultConfigPath()
	require.NoError(t, err)
	home, err := os.UserHomeDir()
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(home, ".claude.json"), path)
}
