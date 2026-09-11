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

// httpHookEvents was every event Claude Code delivered over plain HTTP before this plan
// (docs/history/spikes/canary-fields.md "Transport"). It is kept as the ten non-SessionStart event
// names because allHookEvents below is built from it (plus SessionStart) and
// settings_test.go iterates it — not because legacy-http-entry stripping treats these
// ten differently from SessionStart: isMusterEntry strips a Muster http entry the same
// way on all eleven events (REQ-2/REQ-3); SessionStart's legacy entry was always a
// command hook, handled separately.
var httpHookEvents = []string{
	"UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification",
	"PermissionRequest", "Stop", "StopFailure", "PreCompact", "SubagentStop", "SessionEnd",
}

// allHookEvents is every event Muster's single command-hook wrapper is registered on
// (REQ-1: httpHookEvents plus SessionStart, eleven events total). Since m4-hook-lifetime
// every one of them gets the same type:"command" entry — there is no longer an event
// that needs different treatment.
var allHookEvents = append([]string{"SessionStart"}, httpHookEvents...)

// SettingsConfig is what MergeSettings needs to write Muster's entries into a
// directory's .claude/settings.local.json (kb:anchor/ingest.envelope). Since
// m4-hook-lifetime there is no URL and no token in this file at all — every event
// (including SessionStart) is a type:"command" entry pointing at a stable script path,
// and the ingest URL lives only inside that script (WriteWrapperScripts).
type SettingsConfig struct {
	// HookCommand is the absolute path to the generated hook wrapper script, registered
	// on every event in allHookEvents — raw, unquoted; MergeSettings quotes it
	// (shellQuote) at the write boundary.
	HookCommand string
	// StatusLineCommand is the absolute path to the generated status-line wrapper
	// script — raw, unquoted; MergeSettings quotes it (shellQuote) at the write boundary.
	StatusLineCommand string
	// LegacyCommands lists prior wrapper script paths (bare or quoted) isMusterEntry
	// must still recognise and drop from an already-instrumented directory (REQ-3/REQ-4)
	// — e.g. the pre-plan SessionStart-only hook-sessionstart.sh.
	LegacyCommands []string
}

// shellQuote returns s as a single-quoted POSIX shell word, safe to place verbatim into
// a command string handed to `/bin/sh -c` (kb:anchor/ingest.envelope "Command fields are
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
// too (Edge Case 9), not just to whole top-level keys. A command entry matches the
// current HookCommand/StatusLineCommand or any LegacyCommands path, in either the
// quoted form MergeSettings writes or a bare form an earlier version wrote (REQ-3), so
// an already-instrumented directory's stale entry is dropped and replaced, never
// duplicated (plan Edge Case 1). Legacy commands are matched by exact path only — never
// by basename — so a foreign script sharing a legacy script's filename elsewhere is
// never mistaken for Muster's own (Implementation Notes).
func isMusterEntry(e hookEntry, cfg SettingsConfig) bool {
	if e.Type == "http" {
		return isMusterIngestURL(e.URL)
	}
	if e.Type == "command" {
		if isMusterCommand(e.Command, cfg.HookCommand) || isMusterCommand(e.Command, cfg.StatusLineCommand) {
			return true
		}
		for _, p := range cfg.LegacyCommands {
			if isMusterCommand(e.Command, p) {
				return true
			}
		}
	}
	return false
}

// isMusterCommand reports whether command (a hook entry's raw command field) equals
// path, bare or single-quoted (shellQuote). Guard path != "" (m4-hook-quoting
// Implementation Notes): an empty configured path must never match a foreign entry with
// an empty command, since shellQuote("") would otherwise introduce a spurious match.
func isMusterCommand(command, path string) bool {
	return path != "" && (command == path || command == shellQuote(path))
}

// isMusterIngestURL reports whether u names one of Muster's own ingest endpoints, by URL
// path shape and loopback host — independent of host, port or token so a rotated
// daemon's stale allowedHttpHookUrls entry or legacy http hook entry is still recognized
// on the next merge (REQ-2/REQ-3, review Critical 2 on the original http-only version of
// this check).
func isMusterIngestURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return musterIngestPath.MatchString(u.Path) && isLoopbackHost(u.Hostname())
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

// MergeSettings deterministically merges Muster's hooks/statusLine entries into existing
// (the current file content, nil/empty if the file didn't exist yet), preserving every
// key and every hook event Muster doesn't own, and every foreign hook entry *within* an
// event Muster does own (REQ-4, D7, Edge Case 9). Muster's own entries are replaced
// wholesale each call, so a token/port change heals itself (the entries reference stable
// script paths, not URLs — WriteWrapperScripts rewrites the scripts themselves at every
// daemon start); calling this twice with the same cfg produces byte-identical output.
// Every entry is a `/bin/sh -c` command line, not a path field (kb:anchor/ingest.envelope
// "Command fields are shell command lines"), so the configured script path is written
// through shellQuote — a bare space-bearing path (the default macOS data dir,
// `~/Library/Application Support/Muster`) would otherwise word-split and fail to execute
// (REQ-1). Since m4-hook-lifetime this writes no `type:"http"` entry on any event and no
// `allowedHttpHookUrls` key (REQ-2): an already-instrumented directory's legacy http
// entries and Muster ingest URLs are stripped, never replaced with new ones.
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
	for _, event := range allHookEvents {
		foreign, err := foreignHookGroups(hooks[event], cfg)
		if err != nil {
			return nil, fmt.Errorf("parsing existing settings.local.json hooks[%q]: %w", event, err)
		}
		hooks[event] = mustMarshal(append(foreign, hookGroup{Hooks: []hookEntry{
			{Type: "command", Command: shellQuote(cfg.HookCommand), Timeout: hookTimeoutSeconds},
		}}))
	}
	doc["hooks"] = mustMarshal(hooks)

	doc["statusLine"] = mustMarshal(hookEntry{Type: "command", Command: shellQuote(cfg.StatusLineCommand)})

	if err := stripMusterAllowedURLs(doc); err != nil {
		return nil, err
	}

	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encoding settings.local.json: %w", err)
	}
	return append(out, '\n'), nil
}

// stripMusterAllowedURLs removes every Muster-owned entry from doc's existing
// allowedHttpHookUrls array in place (REQ-2), preserving foreign entries and their
// relative order (D7 idempotency via sort.Strings, unchanged when foreign entries
// remain), and deletes the key entirely once nothing foreign is left (D5's converse: a
// file that had no key never gains one, and a file whose array becomes empty loses the
// key rather than keeping an empty array). Elements that don't parse as a URL are
// treated as foreign (kept) — MergeSettings has no business judging a value it doesn't
// understand.
func stripMusterAllowedURLs(doc map[string]json.RawMessage) error {
	raw, ok := doc["allowedHttpHookUrls"]
	if !ok {
		return nil
	}
	var allowed []string
	if err := json.Unmarshal(raw, &allowed); err != nil {
		return fmt.Errorf("parsing existing settings.local.json allowedHttpHookUrls: %w", err)
	}
	var kept []string
	for _, u := range allowed {
		if !isMusterIngestURL(u) {
			kept = append(kept, u)
		}
	}
	if len(kept) == 0 {
		delete(doc, "allowedHttpHookUrls")
		return nil
	}
	sort.Strings(kept)
	doc["allowedHttpHookUrls"] = mustMarshal(kept)
	return nil
}

func mustMarshal(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // unreachable: every value here is a plain struct/slice/string
	}
	return b
}

// WriteWrapperScripts generates the two command-hook wrapper scripts — the single hook
// wrapper serving all eleven events (REQ-15) and the status line — into dataDir,
// returning their absolute paths plus the pre-plan legacy SessionStart-only script path
// (for SettingsConfig.LegacyCommands) whose file this also best-effort removes (REQ-5).
// Each script reads stdin, wraps it in the kb:anchor/ingest.envelope envelope from $MUSTER_SESSION/
// $TMUX_PANE, and POSTs it with a 2s timeout, always exiting 0.
func WriteWrapperScripts(dataDir, baseURL, ingestToken string) (hookScript, statusLineScript, legacyScript string, err error) {
	hookURL := baseURL + "/ingest/" + ingestToken + "/hook"
	statusURL := baseURL + "/ingest/" + ingestToken + "/status"

	hookScript = filepath.Join(dataDir, "hook.sh")
	statusLineScript = filepath.Join(dataDir, "status-line.sh")
	legacyScript = filepath.Join(dataDir, "hook-sessionstart.sh")

	if err := writeEnvelopeScript(hookScript, hookURL); err != nil {
		return "", "", "", err
	}
	if err := writeEnvelopeScript(statusLineScript, statusURL); err != nil {
		return "", "", "", err
	}
	// Best-effort (Edge Case 14): the legacy script is no longer referenced by any
	// settings entry MergeSettings writes (REQ-3 drops its command entry too), so a
	// removal failure here (permissions) must not fail the launch — the caller has a
	// logger and may note it, this package does not.
	_ = os.Remove(legacyScript)

	return hookScript, statusLineScript, legacyScript, nil
}

func writeEnvelopeScript(path, url string) error {
	script := fmt.Sprintf(`#!/bin/sh
# Generated by musterd (internal/claudecode.WriteWrapperScripts). Every event this
# script is registered on (hook.sh) or the status-line post (status-line.sh) runs
# through here (kb:anchor/ingest.envelope). An unmanaged session (no $MUSTER_SESSION) and a
# stopped daemon must both be silent and always exit 0 — hook delivery is best-effort,
# and a command hook's stdout is a decision to Claude Code and non-zero exit a block.
[ -z "$MUSTER_SESSION" ] && exit 0
input=$(cat)
fields="\"musterSession\":$MUSTER_SESSION,"
if [ -n "$TMUX_PANE" ]; then fields="$fields\"tmuxPane\":\"$TMUX_PANE\","; fi
body="{${fields}\"payload\":${input}}"
curl --max-time 2 --silent --output /dev/null -H 'Content-Type: application/json' --data-binary "$body" '%s'
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
