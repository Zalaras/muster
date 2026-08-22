package claudecode

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testSettingsConfig() SettingsConfig {
	return SettingsConfig{
		HookURL:             "http://127.0.0.1:8765/ingest/tok/hook",
		StatusURL:           "http://127.0.0.1:8765/ingest/tok/status",
		SessionStartCommand: "/data/hook-sessionstart.sh",
		StatusLineCommand:   "/data/status-line.sh",
	}
}

// TestMergeSettings_FreshFileRegistersEveryHTTPHookEventAndSessionStartAsCommand covers
// REQ-4/D19: on an absent file, every plain-HTTP hook event Muster consumes gets a
// type:"http" entry pointing at the shared ingest URL with the 1-2s hook timeout, and
// SessionStart gets a type:"command" entry (spikes/FINDINGS.md §1: SessionStart is
// silently never delivered over HTTP).
func TestMergeSettings_FreshFileRegistersEveryHTTPHookEventAndSessionStartAsCommand(t *testing.T) {
	cfg := testSettingsConfig()

	out, err := MergeSettings(nil, cfg)
	require.NoError(t, err)

	var doc map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(out, &doc))

	var hooks map[string][]hookGroup
	require.NoError(t, json.Unmarshal(doc["hooks"], &hooks))

	for _, event := range httpHookEvents {
		require.Contains(t, hooks, event)
		require.Len(t, hooks[event], 1)
		require.Len(t, hooks[event][0].Hooks, 1)
		entry := hooks[event][0].Hooks[0]
		assert.Equal(t, "http", entry.Type)
		assert.Equal(t, cfg.HookURL, entry.URL)
		assert.Equal(t, hookTimeoutSeconds, entry.Timeout)
		assert.LessOrEqual(t, entry.Timeout, 2, "CLAUDE.md hard rule: hook timeouts are 1-2s, never 5")
	}

	require.Contains(t, hooks, "SessionStart")
	require.Len(t, hooks["SessionStart"], 1)
	require.Len(t, hooks["SessionStart"][0].Hooks, 1)
	sessionStart := hooks["SessionStart"][0].Hooks[0]
	assert.Equal(t, "command", sessionStart.Type)
	assert.Equal(t, cfg.SessionStartCommand, sessionStart.Command)

	var statusLine hookEntry
	require.NoError(t, json.Unmarshal(doc["statusLine"], &statusLine))
	assert.Equal(t, "command", statusLine.Type)
	assert.Equal(t, cfg.StatusLineCommand, statusLine.Command)

	var allowed []string
	require.NoError(t, json.Unmarshal(doc["allowedHttpHookUrls"], &allowed))
	assert.Contains(t, allowed, cfg.HookURL)
}

// TestMergeSettings_CalledTwiceProducesByteIdenticalOutput covers D7's "second launch
// produces identical content" — a repeated launch into the same directory must be a
// true no-op on disk.
func TestMergeSettings_CalledTwiceProducesByteIdenticalOutput(t *testing.T) {
	cfg := testSettingsConfig()

	first, err := MergeSettings(nil, cfg)
	require.NoError(t, err)

	second, err := MergeSettings(first, cfg)
	require.NoError(t, err)

	assert.Equal(t, string(first), string(second))
}

// TestMergeSettings_PreservesKeysMusterDoesNotOwn covers REQ-4/Edge Case 9: every key
// (and, within "hooks", every event) Muster does not own survives verbatim.
func TestMergeSettings_PreservesKeysMusterDoesNotOwn(t *testing.T) {
	existing := []byte(`{
		"permissions": {"allow": ["Bash(git *)"]},
		"hooks": {
			"UserThingUnrelatedToMuster": [{"hooks": [{"type": "command", "command": "echo hi"}]}]
		},
		"allowedHttpHookUrls": ["https://someone-elses-tool.example.com/hook"]
	}`)

	out, err := MergeSettings(existing, testSettingsConfig())
	require.NoError(t, err)

	var doc map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(out, &doc))

	var permissions map[string]any
	require.NoError(t, json.Unmarshal(doc["permissions"], &permissions))
	assert.Equal(t, map[string]any{"allow": []any{"Bash(git *)"}}, permissions)

	var hooks map[string][]hookGroup
	require.NoError(t, json.Unmarshal(doc["hooks"], &hooks))
	require.Contains(t, hooks, "UserThingUnrelatedToMuster", "a hook event Muster doesn't own must survive untouched")
	assert.Equal(t, "echo hi", hooks["UserThingUnrelatedToMuster"][0].Hooks[0].Command)

	var allowed []string
	require.NoError(t, json.Unmarshal(doc["allowedHttpHookUrls"], &allowed))
	assert.Contains(t, allowed, "https://someone-elses-tool.example.com/hook", "a pre-existing allowed URL must not be dropped")
	assert.Contains(t, allowed, testSettingsConfig().HookURL)
}

// TestMergeSettings_ForeignHookOnAMusterOwnedEventSurvives covers review Critical 2:
// REQ-4 requires the merge to "preserve all keys Muster does not own", and Edge Case 9
// requires that within an event Muster *does* own, only Muster's own recognizable
// entries are replaced — every foreign entry in that event's array must survive. Before
// the fix, MergeSettings replaced the whole hook array for each of the ten events
// Muster registers, silently destroying a user's own hook that happened to share one of
// those events (reproduced against the real function with an existing PostToolUse
// command hook pointing at a formatter script, which came back gone).
func TestMergeSettings_ForeignHookOnAMusterOwnedEventSurvives(t *testing.T) {
	existing := []byte(`{
		"hooks": {
			"PostToolUse": [{"hooks": [{"type": "command", "command": "/Users/x/bin/my-formatter.sh", "timeout": 10}]}]
		}
	}`)
	cfg := testSettingsConfig()

	out, err := MergeSettings(existing, cfg)
	require.NoError(t, err)

	var doc map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(out, &doc))
	var hooks map[string][]hookGroup
	require.NoError(t, json.Unmarshal(doc["hooks"], &hooks))

	require.Contains(t, hooks, "PostToolUse")
	var allCommands, allURLs []string
	for _, group := range hooks["PostToolUse"] {
		for _, entry := range group.Hooks {
			if entry.Command != "" {
				allCommands = append(allCommands, entry.Command)
			}
			if entry.URL != "" {
				allURLs = append(allURLs, entry.URL)
			}
		}
	}
	assert.Contains(t, allCommands, "/Users/x/bin/my-formatter.sh", "the user's own formatter hook must survive the merge")
	assert.Contains(t, allURLs, cfg.HookURL, "Muster's own entry must also be present")

	// Idempotency: re-merging with the same cfg must be a byte-identical no-op, and the
	// foreign entry must still be there afterwards (not duplicated, not dropped).
	second, err := MergeSettings(out, cfg)
	require.NoError(t, err)
	assert.Equal(t, string(out), string(second), "re-merging must be a true no-op on disk")

	var doc2 map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(second, &doc2))
	var hooks2 map[string][]hookGroup
	require.NoError(t, json.Unmarshal(doc2["hooks"], &hooks2))
	count := 0
	for _, group := range hooks2["PostToolUse"] {
		for _, entry := range group.Hooks {
			if entry.Command == "/Users/x/bin/my-formatter.sh" {
				count++
			}
		}
	}
	assert.Equal(t, 1, count, "the foreign entry must not be duplicated across repeated merges")
}

// TestMergeSettings_ForeignHookOnNonLoopbackHostWithMusterPathShapeSurvives covers
// review cycle 2 Major 2: isMusterEntry recognized any HTTP hook entry whose URL path
// matched Muster's /ingest/<token>/(hook|status) shape, regardless of host — so a
// foreign tool that happened to register a hook shaped that way on a remote host would
// be silently deleted on every launch. Muster only ever binds loopback, so an entry on a
// non-loopback host must survive the merge even though its path matches exactly.
func TestMergeSettings_ForeignHookOnNonLoopbackHostWithMusterPathShapeSurvives(t *testing.T) {
	existing := []byte(`{
		"hooks": {
			"PostToolUse": [{"hooks": [{"type": "http", "url": "https://example.com/ingest/othertok/hook", "timeout": 5}]}]
		}
	}`)
	cfg := testSettingsConfig()

	out, err := MergeSettings(existing, cfg)
	require.NoError(t, err)

	var doc map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(out, &doc))
	var hooks map[string][]hookGroup
	require.NoError(t, json.Unmarshal(doc["hooks"], &hooks))

	require.Contains(t, hooks, "PostToolUse")
	var allURLs []string
	for _, group := range hooks["PostToolUse"] {
		for _, entry := range group.Hooks {
			if entry.URL != "" {
				allURLs = append(allURLs, entry.URL)
			}
		}
	}
	assert.Contains(t, allURLs, "https://example.com/ingest/othertok/hook", "a foreign hook on a non-loopback host must survive even though its path shape matches Muster's own")
	assert.Contains(t, allURLs, cfg.HookURL, "Muster's own entry must also be present")
}

// TestMergeSettings_ReplacesMustersOwnEntriesWholesale covers Edge Case 9: Muster's own
// hooks/statusLine entries are replaced wholesale on every launch, so a port/token
// change (a new daemon instance) heals itself rather than leaving two conflicting URLs
// registered for the same event.
func TestMergeSettings_ReplacesMustersOwnEntriesWholesale(t *testing.T) {
	oldCfg := testSettingsConfig()
	first, err := MergeSettings(nil, oldCfg)
	require.NoError(t, err)

	newCfg := testSettingsConfig()
	newCfg.HookURL = "http://127.0.0.1:9999/ingest/newtok/hook"
	newCfg.StatusURL = "http://127.0.0.1:9999/ingest/newtok/status"

	out, err := MergeSettings(first, newCfg)
	require.NoError(t, err)

	var doc map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(out, &doc))
	var hooks map[string][]hookGroup
	require.NoError(t, json.Unmarshal(doc["hooks"], &hooks))

	for _, event := range httpHookEvents {
		require.Len(t, hooks[event][0].Hooks, 1, "the stale URL entry must be replaced, not appended alongside the new one")
		assert.Equal(t, newCfg.HookURL, hooks[event][0].Hooks[0].URL)
	}

	var allowed []string
	require.NoError(t, json.Unmarshal(doc["allowedHttpHookUrls"], &allowed))
	assert.Contains(t, allowed, newCfg.HookURL)
}

func TestMergeSettings_AllowedURLsAreDeduplicatedAndSorted(t *testing.T) {
	cfg := testSettingsConfig()
	first, err := MergeSettings(nil, cfg)
	require.NoError(t, err)

	// Re-merging with the same cfg must not append a duplicate of the same URL.
	second, err := MergeSettings(first, cfg)
	require.NoError(t, err)

	var doc map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(second, &doc))
	var allowed []string
	require.NoError(t, json.Unmarshal(doc["allowedHttpHookUrls"], &allowed))

	count := 0
	for _, u := range allowed {
		if u == cfg.HookURL {
			count++
		}
	}
	assert.Equal(t, 1, count)
}

// TestMergeSettings_RejectsInvalidJSON covers D7/Edge Case 9's other half: an existing
// file that isn't valid JSON must refuse rather than guess, so the caller can surface
// the plan's 500 launch_failed naming the file.
func TestMergeSettings_RejectsInvalidJSON(t *testing.T) {
	_, err := MergeSettings([]byte(`{not valid json`), testSettingsConfig())

	assert.Error(t, err)
}

func TestMergeSettings_RejectsInvalidHooksShape(t *testing.T) {
	_, err := MergeSettings([]byte(`{"hooks": "not an object"}`), testSettingsConfig())

	assert.Error(t, err)
}

func TestMergeSettings_RejectsInvalidAllowedHttpHookUrlsShape(t *testing.T) {
	_, err := MergeSettings([]byte(`{"allowedHttpHookUrls": "not an array"}`), testSettingsConfig())

	assert.Error(t, err)
}

func TestMergeSettings_EmptyExistingBehavesLikeNilExisting(t *testing.T) {
	fromNil, err := MergeSettings(nil, testSettingsConfig())
	require.NoError(t, err)

	fromEmpty, err := MergeSettings([]byte{}, testSettingsConfig())
	require.NoError(t, err)

	assert.Equal(t, string(fromNil), string(fromEmpty))
}

// TestWriteWrapperScripts covers the generated command-hook wrapper scripts: correct
// paths, executable mode, a 2s curl timeout (never 5, CLAUDE.md hard rule), always exit
// 0 (hook delivery is best-effort — Claude Code must never be made to retry), and the
// envelope fields built from the pane environment.
func TestWriteWrapperScripts(t *testing.T) {
	dir := t.TempDir()

	sessionStartPath, statusLinePath, err := WriteWrapperScripts(dir, "http://127.0.0.1:8765", "tok123")
	require.NoError(t, err)

	assert.Equal(t, filepath.Join(dir, "hook-sessionstart.sh"), sessionStartPath)
	assert.Equal(t, filepath.Join(dir, "status-line.sh"), statusLinePath)

	for _, path := range []string{sessionStartPath, statusLinePath} {
		info, statErr := os.Stat(path)
		require.NoError(t, statErr)
		// 0o700, not 0o755 (review Major 9): the script embeds the ingest token in
		// cleartext, and only the daemon's own user ever needs to execute it.
		assert.Equal(t, os.FileMode(0o700), info.Mode().Perm())
	}

	sessionStartScript, err := os.ReadFile(sessionStartPath)
	require.NoError(t, err)
	assert.Contains(t, string(sessionStartScript), "http://127.0.0.1:8765/ingest/tok123/hook")
	assert.Contains(t, string(sessionStartScript), "--max-time 2")
	assert.Contains(t, string(sessionStartScript), "exit 0")
	assert.Contains(t, string(sessionStartScript), "MUSTER_SESSION")
	assert.Contains(t, string(sessionStartScript), "TMUX_PANE")
	assert.NotContains(t, string(sessionStartScript), "--max-time 5")

	statusLineScript, err := os.ReadFile(statusLinePath)
	require.NoError(t, err)
	assert.Contains(t, string(statusLineScript), "http://127.0.0.1:8765/ingest/tok123/status")
}
