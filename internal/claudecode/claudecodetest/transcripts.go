package claudecodetest

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// nonTranscriptDirChar mirrors internal/claudecode's own unexported encoding regex
// (kb:fact/transcript-dir-encoding: "every character outside [A-Za-z0-9-]") — duplicated
// here, not imported, because a fixture writer needs to place a file exactly where the
// adapter will look for it and the two packages share no exported symbol for it; this is
// the one sanctioned place outside the adapter proper that does
// (kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest).
var nonTranscriptDirChar = regexp.MustCompile(`[^A-Za-z0-9-]`)

// WriteTranscript writes a fixture Claude Code transcript file under projectsRoot for
// cwd, resolving symlinks and encoding the folder name exactly as
// claudecode.PastSessions(projectsRoot, cwd) will when it looks for it — so a caller
// never has to know the encoding itself. lines are written one per line, in the given
// order (build them with the *Line helpers below, or a raw JSON string for a shape they
// don't cover). Returns the transcript file's path so a caller can control its mtime
// (os.Chtimes) for an ordering assertion — PastSessions reads a transcript's lastActiveAt
// from the file's own modification time.
func WriteTranscript(t testing.TB, projectsRoot, cwd, sessionID string, lines ...string) string {
	t.Helper()

	resolvedDir := cwd
	if resolved, err := filepath.EvalSymlinks(cwd); err == nil {
		resolvedDir = resolved
	}
	resolvedDir = filepath.Clean(resolvedDir)
	folder := filepath.Join(projectsRoot, nonTranscriptDirChar.ReplaceAllString(resolvedDir, "-"))

	if err := os.MkdirAll(folder, 0o700); err != nil {
		t.Fatalf("claudecodetest.WriteTranscript: mkdir %s: %v", folder, err)
	}
	path := filepath.Join(folder, sessionID+".jsonl")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatalf("claudecodetest.WriteTranscript: write %s: %v", path, err)
	}
	return path
}

// CwdLine returns one transcript JSONL line naming cwd — every transcript fixture needs
// at least one, since PastSessions treats a transcript with no recorded cwd at all as a
// stub and never lists it.
func CwdLine(cwd string) string {
	return marshal(map[string]any{"cwd": cwd})
}

// CustomTitleLine, AiTitleLine, LastPromptTranscriptLine, PermissionModeTranscriptLine and
// AssistantModelLine return the other transcript JSONL line shapes
// kb:fact/transcript-session-lines measured — a custom-title beats an ai-title as PastSessions'
// title, and the neutral last-prompt/permission-mode/model fields it also extracts.
func CustomTitleLine(title string) string {
	return marshal(map[string]any{"type": "custom-title", "customTitle": title})
}

func AiTitleLine(title string) string {
	return marshal(map[string]any{"type": "ai-title", "aiTitle": title})
}

func LastPromptTranscriptLine(text string) string {
	return marshal(map[string]any{"type": "last-prompt", "lastPrompt": text})
}

func PermissionModeTranscriptLine(mode string) string {
	return marshal(map[string]any{"type": "permission-mode", "permissionMode": mode})
}

func AssistantModelLine(model string) string {
	return marshal(map[string]any{"type": "assistant", "message": map[string]any{"model": model}})
}
