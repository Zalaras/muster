package claudecode

import (
	"bytes"
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

// MusterSessionEnvVar is the pane environment variable name every generated wrapper
// script reads to route a hook to its session (kb:anchor/ingest.envelope) — the one
// declaration internal/server's session launch (buildLaunchEnv, which sets it in the
// pane) and this package's generated script body (which reads it) both reference,
// rather than each spelling "MUSTER_SESSION" by hand.
const MusterSessionEnvVar = "MUSTER_SESSION"

// ingestPathPrefix, ingestHookSuffix and ingestStatusSuffix are the URL path shape of
// Muster's own ingest endpoints (kb:anchor/ingest.envelope) — IngestHookPath and
// IngestStatusPath below are the one place that shape is built, and
// internal/server's ingest feature registers its mux routes from the same two
// functions, so the route pattern and the URL embedded in a generated wrapper script
// can never drift apart.
const (
	ingestPathPrefix   = "/ingest/"
	ingestHookSuffix   = "/hook"
	ingestStatusSuffix = "/status"
)

// IngestHookPath and IngestStatusPath build the path (no scheme or host) for token's two
// ingest endpoints. internal/server uses them to register its mux routes; this package
// uses them to compose the full URL embedded in a generated wrapper script.
func IngestHookPath(token string) string   { return ingestPathPrefix + token + ingestHookSuffix }
func IngestStatusPath(token string) string { return ingestPathPrefix + token + ingestStatusSuffix }

// ProjectSettingsPath returns dir's project-scoped settings file
// (kb:adr/launch-settings-local-json-not-settings-json,
// kb:adr/launch-project-scoped-settings-not-config-dir): the one file MergeSettings'
// output is ever written to. internal/server's launch path asks for this rather than
// spelling ".claude/settings.local.json" itself, so where Claude Code reads project-local
// settings lives in exactly one place (CLAUDE.md hard rule: all Claude-Code-format
// knowledge lives in this package).
func ProjectSettingsPath(dir string) string {
	return filepath.Join(dir, ".claude", "settings.local.json")
}

// httpHookEvents was every event Claude Code delivered over plain HTTP before Muster
// moved every hook to a command wrapper (kb:adr/ingest-all-hooks-command-wrappers). It is
// kept as the ten non-SessionStart event names because allHookEvents below is built from
// it (plus SessionStart) and settings_test.go iterates it — not because legacy-http-entry
// stripping treats these ten differently from SessionStart: isMusterEntry strips a Muster
// http entry the same way on all eleven events; SessionStart's legacy entry was always a
// command hook, handled separately.
var httpHookEvents = []string{
	"UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification",
	"PermissionRequest", "Stop", "StopFailure", "PreCompact", "SubagentStop", "SessionEnd",
}

// allHookEvents is every event Muster's single command-hook wrapper is registered on:
// httpHookEvents plus SessionStart, eleven events total
// (kb:adr/ingest-all-hooks-command-wrappers). Every one of them gets the same
// type:"command" entry — there is no longer an event that needs different treatment.
var allHookEvents = append([]string{"SessionStart"}, httpHookEvents...)

// SettingsConfig is what MergeSettings needs to write Muster's entries into a
// directory's .claude/settings.local.json (kb:anchor/ingest.envelope). There is no URL
// and no token in this file at all — every event (including SessionStart) is a
// type:"command" entry pointing at a stable script path, and the ingest URL lives only
// inside that script (WriteWrapperScripts), per kb:adr/ingest-all-hooks-command-wrappers.
type SettingsConfig struct {
	// HookCommand is the absolute path to the generated hook wrapper script, registered
	// on every event in allHookEvents — raw, unquoted; MergeSettings quotes it
	// (shellQuote) at the write boundary.
	HookCommand string
	// StatusLineCommand is the absolute path to the generated status-line wrapper
	// script — raw, unquoted; MergeSettings quotes it (shellQuote) at the write boundary.
	StatusLineCommand string
	// LegacyCommands lists prior wrapper script paths (bare or quoted) isMusterEntry
	// must still recognise and drop from an already-instrumented directory — e.g. the
	// original SessionStart-only hook-sessionstart.sh.
	LegacyCommands []string
}

// shellQuote returns s as a single-quoted POSIX shell word, safe to place verbatim into
// a command string handed to `/bin/sh -c` (kb:anchor/ingest.envelope "Command fields are
// shell command lines"). A literal quote character inside s is escaped by closing the
// quoted word, emitting a backslash-escaped quote, and reopening — see the
// implementation below for the exact four-character replacement. No other character
// needs handling inside single quotes. Kept unexported here — a second user elsewhere
// would be a boundary smell (kb:adr/ingest-shell-quote-at-write-boundary: quoting is a
// write-time concern of internal/claudecode alone).
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
// shape (/ingest/<token>/hook or /ingest/<token>/status, built from the same
// ingestPathPrefix/ingestHookSuffix/ingestStatusSuffix IngestHookPath and
// IngestStatusPath use), independent of host, port or token — those all change across
// daemon instances/restarts, but the shape doesn't: a naive "matches the current entry's
// URL exactly" check would fail to recognize Muster's own stale entry once the
// port/token rotates, and the wholesale-replace guarantee depends on recognizing it
// anyway.
var musterIngestPath = regexp.MustCompile(`^` + regexp.QuoteMeta(ingestPathPrefix) + `[^/]+(` +
	regexp.QuoteMeta(ingestHookSuffix) + `|` + regexp.QuoteMeta(ingestStatusSuffix) + `)$`)

// isMusterEntry reports whether e is one of Muster's own generated hook entries (as
// opposed to a hook some other tool or the user registered on the same event) —
// "preserves all keys Muster does not own" applies within an owned event's hook array
// too, not just to whole top-level keys. A command entry matches the current
// HookCommand/StatusLineCommand or any LegacyCommands path, in either the quoted form
// MergeSettings writes or a bare form an earlier version wrote, so an already-instrumented
// directory's stale entry is dropped and replaced, never duplicated. Legacy commands are
// matched by exact path only — never by basename — so a foreign script sharing a legacy
// script's filename elsewhere is never mistaken for Muster's own.
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
// path, bare or single-quoted (shellQuote). Guard path != "": an empty configured path
// must never match a foreign entry with an empty command, since shellQuote("") would
// otherwise introduce a spurious match.
func isMusterCommand(command, path string) bool {
	return path != "" && (command == path || command == shellQuote(path))
}

// isMusterIngestURL reports whether u names one of Muster's own ingest endpoints, by URL
// path shape and loopback host — independent of host, port or token so a rotated
// daemon's stale allowedHttpHookUrls entry or legacy http hook entry is still recognized
// on the next merge.
func isMusterIngestURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return musterIngestPath.MatchString(u.Path) && isLoopbackHost(u.Hostname())
}

// isLoopbackHost reports whether host (a URL's hostname, no port) is one Muster's own
// daemon could plausibly be bound to. Path shape alone is not enough to recognize an
// entry as Muster's own: a foreign HTTP hook that happens to use the same
// /ingest/<token>/(hook|status) path shape on a remote host would otherwise be silently
// deleted on every launch. Muster only ever binds loopback, so requiring the host to be
// loopback keeps the token/port-rotation heal intact while making a remote hook
// unrecognizable as Muster's.
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
// event Muster does own. Muster's own entries are replaced wholesale each call, so a
// token/port change heals itself (the entries reference stable script paths, not URLs —
// WriteWrapperScripts replaces the scripts at daemon start whenever their content, the
// URL or the token, changed); calling this twice with the same cfg produces byte-identical
// output. Every entry is a
// `/bin/sh -c` command line, not a path field (kb:anchor/ingest.envelope "Command fields
// are shell command lines"), so the configured script path is written through
// shellQuote — a bare space-bearing path (the default macOS data dir,
// `~/Library/Application Support/Muster`) would otherwise word-split and fail to execute
// (kb:fact/hook-commands-are-shell-lines). This writes no `type:"http"` entry on any
// event and no `allowedHttpHookUrls` key (kb:adr/ingest-all-hooks-command-wrappers): an
// already-instrumented directory's legacy http entries and Muster ingest URLs are
// stripped, never replaced with new ones.
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
// allowedHttpHookUrls array in place, preserving foreign entries and their relative
// order (sort.Strings keeps the result unchanged, and so idempotent, when foreign
// entries remain), and deletes the key entirely once nothing foreign is left: a file
// that had no key never gains one, and a file whose array becomes empty loses the key
// rather than keeping an empty array. Elements that don't parse as a URL are treated as
// foreign (kept) — MergeSettings has no business judging a value it doesn't understand.
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
// wrapper serving all eleven events and the status line — into dataDir, returning their
// absolute paths plus the original legacy SessionStart-only script path (for
// SettingsConfig.LegacyCommands) whose file this also best-effort removes. Each script
// reads stdin, wraps it in the kb:anchor/ingest.envelope envelope from
// $MUSTER_SESSION/$TMUX_PANE, and POSTs it with a 2s timeout, always exiting 0.
func WriteWrapperScripts(dataDir, baseURL, ingestToken string) (hookScript, statusLineScript, legacyScript string, err error) {
	hookURL := baseURL + IngestHookPath(ingestToken)
	statusURL := baseURL + IngestStatusPath(ingestToken)

	hookScript = filepath.Join(dataDir, "hook.sh")
	statusLineScript = filepath.Join(dataDir, "status-line.sh")
	legacyScript = filepath.Join(dataDir, "hook-sessionstart.sh")

	if err := writeEnvelopeScript(hookScript, hookURL); err != nil {
		return "", "", "", err
	}
	if err := writeEnvelopeScript(statusLineScript, statusURL); err != nil {
		return "", "", "", err
	}
	// Best-effort: the legacy script is no longer referenced by any settings entry
	// MergeSettings writes (isMusterEntry drops its command entry too), so a removal
	// failure here (permissions) must not fail the launch — the caller has a logger and
	// may note it, this package does not.
	_ = os.Remove(legacyScript)

	return hookScript, statusLineScript, legacyScript, nil
}

func writeEnvelopeScript(path, url string) error {
	script := fmt.Sprintf(`#!/bin/sh
# Generated by musterd (internal/claudecode.WriteWrapperScripts). Every event this
# script is registered on (hook.sh) or the status-line post (status-line.sh) runs
# through here (kb:anchor/ingest.envelope). An unmanaged session (no $%[1]s) and a
# stopped daemon must both be silent and always exit 0 — hook delivery is best-effort,
# and a command hook's stdout is a decision to Claude Code and non-zero exit a block.
[ -z "$%[1]s" ] && exit 0
input=$(cat)
fields="\"musterSession\":$%[1]s,"
if [ -n "$TMUX_PANE" ]; then fields="$fields\"tmuxPane\":\"$TMUX_PANE\","; fi
body="{${fields}\"payload\":${input}}"
curl --max-time 2 --silent --output /dev/null -H 'Content-Type: application/json' --data-binary "$body" '%[2]s'
exit 0
`, MusterSessionEnvVar, url)
	return writeScriptAtomically(path, []byte(script))
}

// writeScriptAtomically is AtomicWriteFile at the wrapper scripts' own fixed mode: 0o700,
// not 0o755, because the script embeds the ingest token in cleartext and only the
// daemon's own user ever executes it — world-readable would publish the token to every
// other account on the machine. Named rather than inlined at its one call site so the
// mode lives in one place, next to the reason for it.
func writeScriptAtomically(path string, content []byte) error {
	return AtomicWriteFile(path, content, 0o700) //nolint:gosec // wrapper scripts must be executable
}

// AtomicWriteFile replaces path with content, at mode perm, by writing a temp file in
// path's own directory and renaming it over path
// (kb:adr/ingest-wrapper-scripts-replaced-atomically): a reader that already opened the
// old path keeps reading the complete old content, and a fresh open sees either the
// complete old file or the complete new one, never a truncated one — unlike a plain
// os.WriteFile, which truncates the target in place before writing the new bytes.
// Content already on disk that equals content is left untouched: no write, no rename,
// same inode and mtime — the common daemon-restart case, where rewriting unchanged
// content would otherwise still tax every reader with a torn-read window for nothing.
// The one implementation internal/server's writeSettings and this package's
// writeEnvelopeScript both call, rather than each keeping its own copy of the same
// temp-fsync-rename sequence.
func AtomicWriteFile(path string, content []byte, perm os.FileMode) error {
	existing, err := os.ReadFile(path)
	if err == nil && bytes.Equal(existing, content) {
		return nil
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("reading %q: %w", path, err)
	}

	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("creating temp file in %q: %w", dir, err)
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }() // no-op once the rename below succeeds

	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("setting permissions on %q: %w", tmpPath, err)
	}
	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("writing %q: %w", tmpPath, err)
	}
	// fsync before the rename, or a crash between them can still lose the write despite
	// the rename itself being atomic (durable, not just atomic).
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("syncing %q: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing %q: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("renaming %q to %q: %w", tmpPath, path, err)
	}
	return nil
}
