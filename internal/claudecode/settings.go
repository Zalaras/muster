package claudecode

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// hookTimeoutSeconds is the timeout Muster registers on every hook it owns — never 5
// (CLAUDE.md hard rule: a slow hook taxes every turn by its timeout, additively).
const hookTimeoutSeconds = 2

// httpHookEvents is every event Muster's ingest/state machine consumes that Claude
// Code will actually deliver over plain HTTP (spikes/canary-fields.md "Transport" —
// SessionStart is the one exception, wired as a command hook below).
var httpHookEvents = []string{
	"UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification",
	"PermissionRequest", "Stop", "StopFailure", "PreCompact", "SubagentStop", "SessionEnd",
}

// SettingsConfig is what MergeSettings needs to write Muster's entries into a
// directory's .claude/settings.local.json (docs/protocol.md §4.2).
type SettingsConfig struct {
	HookURL             string // single ingest URL for every plain-HTTP hook event
	StatusURL           string // ingest URL for the status-line post
	SessionStartCommand string // absolute path to the generated SessionStart wrapper script — raw, unquoted; MergeSettings quotes it (shellQuote) at the write boundary
	StatusLineCommand   string // absolute path to the generated status-line wrapper script — raw, unquoted; MergeSettings quotes it (shellQuote) at the write boundary
}

// shellQuote returns s as a single-quoted POSIX shell word, safe to place verbatim into
// a command string handed to `/bin/sh -c` (docs/protocol.md §4.2 "Command fields are
// shell command lines"). A literal quote character inside s is escaped by closing the
// quoted word, emitting a backslash-escaped quote, and reopening — see the
// implementation below for the exact four-character replacement. No other character
// needs handling inside single quotes. Kept unexported here — a second user elsewhere
// would be a boundary smell (D7: quoting is a write-time concern of internal/claudecode
// alone).
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

type hookEntry struct {
	Type    string `json:"type"`
	URL     string `json:"url,omitempty"`
	Command string `json:"command,omitempty"`
	Timeout int    `json:"timeout,omitempty"`
}

type hookGroup struct {
	Hooks []hookEntry `json:"hooks"`
}

// musterIngestPath recognizes any Muster-authored HTTP hook entry by its URL's path
// shape (/ingest/<token>/hook or /ingest/<token>/status), independent of host, port or
// token — those all change across daemon instances/restarts, but the shape doesn't
// (review Critical 2: a naive "matches cfg.HookURL exactly" check would fail to
// recognize Muster's own stale entry once the port/token rotates, and the wholesale-
// replace guarantee depends on recognizing it anyway).
var musterIngestPath = regexp.MustCompile(`^/ingest/[^/]+/(hook|status)$`)

// isMusterEntry reports whether e is one of Muster's own generated hook entries (as
// opposed to a hook some other tool or the user registered on the same event) — REQ-4's
// "preserves all keys Muster does not own" applies within an owned event's hook array
// too (Edge Case 9), not just to whole top-level keys. A command entry matches on either
// the quoted form MergeSettings now writes or the legacy bare form earlier versions
// wrote (REQ-3), so an already-instrumented directory's stale bare entry is dropped and
// replaced by the quoted one, not duplicated alongside it (plan Edge Case 1).
func isMusterEntry(e hookEntry, cfg SettingsConfig) bool {
	if e.Type == "http" {
		if u, err := url.Parse(e.URL); err == nil && musterIngestPath.MatchString(u.Path) && isLoopbackHost(u.Hostname()) {
			return true
		}
	}
	if e.Type == "command" {
		for _, p := range [...]string{cfg.SessionStartCommand, cfg.StatusLineCommand} {
			// Guard p != "" (m4-hook-quoting Implementation Notes): an empty configured
			// path must never match a foreign entry with an empty command — the existing
			// code had the same latent issue before quoting made it worth fixing in
			// passing, since shellQuote("") would otherwise introduce a new spurious "''"
			// match.
			if p != "" && (e.Command == p || e.Command == shellQuote(p)) {
				return true
			}
		}
	}
	return false
}

// isLoopbackHost reports whether host (a URL's hostname, no port) is one Muster's own
// daemon could plausibly be bound to. Path shape alone is not enough to recognize an
// entry as Muster's own (review cycle 2 Major 2): a foreign HTTP hook that happens to
// use the same /ingest/<token>/(hook|status) path shape on a remote host would
// otherwise be silently deleted on every launch. Muster only ever binds loopback, so
// requiring the host to be loopback keeps the token/port-rotation heal intact while
// making a remote hook unrecognizable as Muster's.
func isLoopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

// foreignHookGroups parses raw (one event's existing hook-group array, possibly absent)
// and returns only the entries that are not Muster's own, preserving grouping. A group
// left with zero entries after filtering is dropped entirely.
func foreignHookGroups(raw json.RawMessage, cfg SettingsConfig) ([]hookGroup, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var groups []hookGroup
	if err := json.Unmarshal(raw, &groups); err != nil {
		return nil, err
	}
	var kept []hookGroup
	for _, group := range groups {
		var foreign []hookEntry
		for _, e := range group.Hooks {
			if !isMusterEntry(e, cfg) {
				foreign = append(foreign, e)
			}
		}
		if len(foreign) > 0 {
			kept = append(kept, hookGroup{Hooks: foreign})
		}
	}
	return kept, nil
}

// MergeSettings deterministically merges Muster's hooks/statusLine/allowedHttpHookUrls
// entries into existing (the current file content, nil/empty if the file didn't exist
// yet), preserving every key and every hook event Muster doesn't own, and every foreign
// hook entry *within* an event Muster does own (REQ-4, D7, Edge Case 9). Muster's own
// entries are replaced wholesale each call, so a token/port change heals itself;
// calling this twice with the same cfg produces byte-identical output. The two
// type:"command" entries (SessionStart, statusLine) are `/bin/sh -c` command lines, not
// path fields (docs/protocol.md §4.2 "Command fields are shell command lines"), so the
// configured script path is written through shellQuote — a bare space-bearing path
// (the default macOS data dir, `~/Library/Application Support/Muster`) would otherwise
// word-split and fail to execute (REQ-1).
func MergeSettings(existing []byte, cfg SettingsConfig) ([]byte, error) {
	doc := map[string]json.RawMessage{}
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &doc); err != nil {
			return nil, fmt.Errorf("parsing existing settings.local.json: %w", err)
		}
	}

	hooks := map[string]json.RawMessage{}
	if raw, ok := doc["hooks"]; ok {
		if err := json.Unmarshal(raw, &hooks); err != nil {
			return nil, fmt.Errorf("parsing existing settings.local.json hooks: %w", err)
		}
	}
	for _, event := range httpHookEvents {
		foreign, err := foreignHookGroups(hooks[event], cfg)
		if err != nil {
			return nil, fmt.Errorf("parsing existing settings.local.json hooks[%q]: %w", event, err)
		}
		hooks[event] = mustMarshal(append(foreign, hookGroup{Hooks: []hookEntry{
			{Type: "http", URL: cfg.HookURL, Timeout: hookTimeoutSeconds},
		}}))
	}
	// SessionStart is silently never delivered over type:"http" (spikes/FINDINGS.md §1);
	// it must be a command hook wrapping the ingest URL. Same foreign-preservation rule
	// applies: only Muster's own prior command entry is dropped.
	foreignSessionStart, err := foreignHookGroups(hooks["SessionStart"], cfg)
	if err != nil {
		return nil, fmt.Errorf("parsing existing settings.local.json hooks[%q]: %w", "SessionStart", err)
	}
	hooks["SessionStart"] = mustMarshal(append(foreignSessionStart, hookGroup{Hooks: []hookEntry{
		{Type: "command", Command: shellQuote(cfg.SessionStartCommand), Timeout: hookTimeoutSeconds},
	}}))
	doc["hooks"] = mustMarshal(hooks)

	doc["statusLine"] = mustMarshal(hookEntry{Type: "command", Command: shellQuote(cfg.StatusLineCommand)})

	var allowed []string
	if raw, ok := doc["allowedHttpHookUrls"]; ok {
		if unmarshalErr := json.Unmarshal(raw, &allowed); unmarshalErr != nil {
			return nil, fmt.Errorf("parsing existing settings.local.json allowedHttpHookUrls: %w", unmarshalErr)
		}
	}
	if !containsString(allowed, cfg.HookURL) {
		allowed = append(allowed, cfg.HookURL)
	}
	sort.Strings(allowed)
	doc["allowedHttpHookUrls"] = mustMarshal(allowed)

	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encoding settings.local.json: %w", err)
	}
	return append(out, '\n'), nil
}

func containsString(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

func mustMarshal(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // unreachable: every value here is a plain struct/slice/string
	}
	return b
}

// WriteWrapperScripts generates the two command-hook wrapper scripts (SessionStart and
// the status line — plan Implementation Notes) into dataDir, returning their absolute
// paths. Each script reads stdin, wraps it in the §4.2 envelope from
// $MUSTER_SESSION/$TMUX_PANE (omitting absent vars), and POSTs it with a 2s timeout,
// always exiting 0.
func WriteWrapperScripts(dataDir, baseURL, ingestToken string) (sessionStartScript, statusLineScript string, err error) {
	hookURL := baseURL + "/ingest/" + ingestToken + "/hook"
	statusURL := baseURL + "/ingest/" + ingestToken + "/status"

	sessionStartScript = filepath.Join(dataDir, "hook-sessionstart.sh")
	statusLineScript = filepath.Join(dataDir, "status-line.sh")

	if err := writeEnvelopeScript(sessionStartScript, hookURL); err != nil {
		return "", "", err
	}
	if err := writeEnvelopeScript(statusLineScript, statusURL); err != nil {
		return "", "", err
	}
	return sessionStartScript, statusLineScript, nil
}

func writeEnvelopeScript(path, url string) error {
	script := fmt.Sprintf(`#!/bin/sh
# Generated by musterd (internal/claudecode.WriteWrapperScripts). Wraps stdin in the
# docs/protocol.md §4.2 envelope from the pane environment and posts it. Always exits
# 0 — hook delivery is best-effort and Claude Code must never be made to retry.
input=$(cat)
fields=""
if [ -n "$MUSTER_SESSION" ]; then fields="\"musterSession\":$MUSTER_SESSION,"; fi
if [ -n "$TMUX_PANE" ]; then fields="$fields\"tmuxPane\":\"$TMUX_PANE\","; fi
body="{${fields}\"payload\":${input}}"
curl --max-time 2 --silent --output /dev/null -H 'Content-Type: application/json' --data-binary "$body" "%s"
exit 0
`, url)
	// 0o700, not 0o755 (review Major 9): the script embeds the ingest token in
	// cleartext, and only the daemon's own user ever executes it — world-readable would
	// publish the token to every other account on the machine.
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil { //nolint:gosec // wrapper scripts must be executable
		return fmt.Errorf("writing wrapper script %q: %w", path, err)
	}
	return nil
}
