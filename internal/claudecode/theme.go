package claudecode

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// claudeConfigFileName is Claude Code's own global config file: a single JSON file
// directly in the user's home directory (measured 2026-09-02 against the pinned
// installed binary, version 2.1.258 — its top-level settings-key list includes "theme"
// alongside "installMethod"/"autoUpdates"/etc, and Damian's own file has every one of
// those keys but no "theme" entry, matching the "key absent" edge case below). Never
// referenced outside this file (CLAUDE.md hard rule).
const claudeConfigFileName = ".claude.json"

// DefaultConfigPath returns the default location of Claude Code's global config file:
// the user's home directory joined with its name.
func DefaultConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home directory: %w", err)
	}
	return filepath.Join(home, claudeConfigFileName), nil
}

// ThemeFamily is Claude Code's theme family, as read from its global config (REQ-13) —
// the daemon only ever cares which pair (light or dark) the TUI is drawing, never the
// specific named theme.
type ThemeFamily string

const (
	ThemeLight   ThemeFamily = "light"
	ThemeDark    ThemeFamily = "dark"
	ThemeUnknown ThemeFamily = "unknown"
)

// claudeConfig decodes only the one field Muster reads from Claude Code's global config
// file — every other key (there are dozens: installMethod, autoUpdates, machineID, …)
// is structurally ignored by encoding/json's default unmarshal behaviour (D8).
type claudeConfig struct {
	Theme *string `json:"theme"`
}

// ReadThemeFamily reads path — Claude Code's global config file — and maps its "theme"
// key to a family. Measured 2026-09-02 against the installed binary (2.1.258): the
// key's own value enum is ["dark","light","light-daltonized","dark-daltonized",
// "light-ansi","dark-ansi"], and the binary's own family test is a "light" prefix match
// (its ISt() helper — `r.startsWith("light")`), which the switch below mirrors:
//
//   - file missing, unreadable, not JSON, or the value not a string -> ThemeUnknown.
//   - key absent -> ThemeDark (Claude Code's own default, confirmed by the binary's
//     `resolveSetting("theme","dark")`/`vo("theme","dark")` call sites).
//   - value prefixed "light" -> ThemeLight; prefixed "dark" -> ThemeDark; anything else
//     (e.g. a future "solarized") -> ThemeUnknown.
//
// Read-only: this function never opens path for writing (INV-6).
func ReadThemeFamily(path string) ThemeFamily {
	data, err := os.ReadFile(path)
	if err != nil {
		return ThemeUnknown
	}
	var cfg claudeConfig
	// A non-string "theme" value (number, object, array, bool) fails Unmarshal outright
	// — encoding/json's default type-mismatch behavior — so the "value not a string"
	// edge case is covered by this same err check, not by a separate type assertion.
	if err := json.Unmarshal(data, &cfg); err != nil {
		return ThemeUnknown
	}
	if cfg.Theme == nil {
		return ThemeDark
	}
	switch {
	case strings.HasPrefix(*cfg.Theme, "light"):
		return ThemeLight
	case strings.HasPrefix(*cfg.Theme, "dark"):
		return ThemeDark
	default:
		return ThemeUnknown
	}
}
