package main

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/selfupdate"
	"github.com/Zalaras/muster/internal/tmux"
)

// startupLogLine is the fields logStartup's "musterd starting" record carries that this
// test cares about — a subset of the real line, decoded loosely so unrelated fields
// (port, tmux, dashboard_url, …) don't need restating here.
type startupLogLine struct {
	Message string `json:"message"`
	Exe     string `json:"exe"`
	Install string `json:"install"`
}

// decodeFirstLine parses buf's first JSON log line into a startupLogLine.
func decodeFirstLine(t *testing.T, buf *bytes.Buffer) startupLogLine {
	t.Helper()
	line, _, found := bytes.Cut(buf.Bytes(), []byte("\n"))
	require.True(t, found, "logStartup must write at least one complete log line")
	var got startupLogLine
	require.NoError(t, json.Unmarshal(line, &got))
	return got
}

// TestLogStartup_CarriesExePathAsExe covers D13/REQ-12: the "musterd starting" line
// names the resolved executable path as exe — the one thing an unmanaged/installer
// classification is computed from, and otherwise recoverable from nowhere once a startup
// has passed (the plan's own #53 Overview: "the cause at that moment can't be recovered").
func TestLogStartup_CarriesExePathAsExe(t *testing.T) {
	var buf bytes.Buffer
	log := zerolog.New(&buf)
	f := &cliFlags{dataDir: "/data/dir"}
	serving := &servingEnv{port: 4321, dashboardURL: "http://127.0.0.1:4321/auth?token=x"}
	install := selfupdate.Install{Kind: selfupdate.KindInstaller}

	logStartup(log, f, serving, tmux.PreflightResult{Version: "3.4"}, install, "/usr/local/bin/musterd")

	got := decodeFirstLine(t, &buf)
	assert.Equal(t, "musterd starting", got.Message)
	assert.Equal(t, "/usr/local/bin/musterd", got.Exe)
	assert.Equal(t, "installer", got.Install)
}

// TestLogStartup_RemedyLineFollowsWhenPresent covers the REQ-1/REQ-2 remedy log line
// (kb:adr/update-install-kinds-decide-who-may-apply): present only when install carries a
// remedy, and carrying the exact REQ-1/REQ-2 text as REQ-12's own follow-on requires.
func TestLogStartup_RemedyLineFollowsWhenPresent(t *testing.T) {
	t.Run("a remedy-bearing install logs a second line with the remedy text", func(t *testing.T) {
		var buf bytes.Buffer
		log := zerolog.New(&buf)
		f := &cliFlags{dataDir: "/data/dir"}
		serving := &servingEnv{port: 4321, dashboardURL: "http://127.0.0.1:4321/auth?token=x"}
		install := selfupdate.Install{Kind: selfupdate.KindUnmanaged, Remedy: "can't update /usr/local/bin/musterd: /usr/local/bin is not writable (permission denied) — install with: curl -fsSL https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh | sh"}

		logStartup(log, f, serving, tmux.PreflightResult{}, install, "/usr/local/bin/musterd")

		lines := bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n"))
		require.Len(t, lines, 2, "a remedy-bearing install must log exactly two lines: musterd starting, then the remedy")
		var remedyLine struct {
			Message string `json:"message"`
			Install string `json:"install"`
		}
		require.NoError(t, json.Unmarshal(lines[1], &remedyLine))
		assert.Equal(t, install.Remedy, remedyLine.Message)
		assert.Equal(t, "unmanaged", remedyLine.Install)
	})

	t.Run("an installer install (no remedy) logs only the one starting line", func(t *testing.T) {
		var buf bytes.Buffer
		log := zerolog.New(&buf)
		f := &cliFlags{dataDir: "/data/dir"}
		serving := &servingEnv{port: 4321, dashboardURL: "http://127.0.0.1:4321/auth?token=x"}
		install := selfupdate.Install{Kind: selfupdate.KindInstaller}

		logStartup(log, f, serving, tmux.PreflightResult{}, install, "/usr/local/bin/musterd")

		lines := bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n"))
		assert.Len(t, lines, 1, "no remedy line must follow when the install carries none")
	})
}
