package claudecode

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writePastTranscript is this file's own fixture writer: unlike claudecodetest's exported
// WriteTranscript (which every other package's tests must go through, D17), this package
// owns the transcript wire format outright, so its own tests spell the JSONL lines
// directly rather than round-tripping through the helper package they define.
func writePastTranscript(t *testing.T, folder, sessionID string, lines ...string) string {
	t.Helper()
	require.NoError(t, os.MkdirAll(folder, 0o700))
	path := filepath.Join(folder, sessionID+".jsonl")
	require.NoError(t, os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600))
	return path
}

func cwdLine(cwd string) string {
	return `{"cwd":` + `"` + cwd + `"}`
}

func customTitleLine(title string) string {
	return `{"type":"custom-title","customTitle":"` + title + `"}`
}

func aiTitleLine(title string) string {
	return `{"type":"ai-title","aiTitle":"` + title + `"}`
}

func lastPromptLine(text string) string {
	return `{"type":"last-prompt","lastPrompt":"` + text + `"}`
}

func permissionModeLine(mode string) string {
	return `{"type":"permission-mode","permissionMode":"` + mode + `"}`
}

func assistantModelLine(model string) string {
	return `{"type":"assistant","message":{"model":"` + model + `"}}`
}

func TestEncodeProjectsDirName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"plain path is untouched", "/Users/bob/proj", "-Users-bob-proj"},
		{"dot becomes dash", "/Users/bob/a.b", "-Users-bob-a-b"},
		{"space becomes dash", "/Users/bob/my project", "-Users-bob-my-project"},
		{"at sign becomes dash", "/Users/bob@work/proj", "-Users-bob-work-proj"},
		{"underscore and plus become dash", "/Users/bob/a_b+c", "-Users-bob-a-b-c"},
		{"existing dash is kept", "/Users/bob/a-b", "-Users-bob-a-b"},
		// bobé/ is two non-alnum runes in a row (é, then the separator /), so it's two
		// dashes, not one — the encoding replaces per matched rune, never collapses runs.
		{"non-ASCII letter becomes dash", "/Users/bobé/proj", "-Users-bob--proj"},
		{"digits are kept", "/Users/bob2/proj3", "-Users-bob2-proj3"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, encodeProjectsDirName(tt.in))
		})
	}
}

func TestCandidateFolders(t *testing.T) {
	t.Run("exact match under the threshold", func(t *testing.T) {
		root := t.TempDir()
		require.NoError(t, os.MkdirAll(filepath.Join(root, "-Users-bob-proj"), 0o700))

		got := candidateFolders(root, "-Users-bob-proj")

		require.Len(t, got, 1)
		assert.Equal(t, filepath.Join(root, "-Users-bob-proj"), got[0])
	})

	t.Run("no folder under the threshold yields nothing", func(t *testing.T) {
		root := t.TempDir()

		assert.Nil(t, candidateFolders(root, "-Users-bob-missing"))
	})

	t.Run("a file, not a directory, at the exact name is not a match", func(t *testing.T) {
		root := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(root, "-Users-bob-proj"), []byte("x"), 0o600))

		assert.Nil(t, candidateFolders(root, "-Users-bob-proj"))
	})

	t.Run("over the threshold matches by prefix (D4)", func(t *testing.T) {
		root := t.TempDir()
		encoded := "-Users-bob-" + strings.Repeat("x", maxEncodedDirNameLen)
		folderName := encoded[:maxEncodedDirNameLen] + "-a9ltme" // the unidentified hash suffix
		require.NoError(t, os.MkdirAll(filepath.Join(root, folderName), 0o700))
		// A sibling folder sharing no prefix must not be picked up.
		require.NoError(t, os.MkdirAll(filepath.Join(root, "-Users-someone-else"), 0o700))

		got := candidateFolders(root, encoded)

		require.Len(t, got, 1)
		assert.Equal(t, filepath.Join(root, folderName), got[0])
	})

	t.Run("an unreadable root matches nothing, never errors", func(t *testing.T) {
		root := filepath.Join(t.TempDir(), "does-not-exist")

		assert.Nil(t, candidateFolders(root, "-Users-bob-proj"))
	})
}

// TestPastSessions_SharedFolderFiltersByCwd covers D3: two directories that share one
// transcript folder ("a.b" and "a-b" both encode to "-a-b") are told apart by each
// session's own recorded cwd, never by the folder they happen to share.
func TestPastSessions_SharedFolderFiltersByCwd(t *testing.T) {
	root := t.TempDir()
	dirDot := "/home/bob/a.b"
	dirDash := "/home/bob/a-b"
	folder := filepath.Join(root, encodeProjectsDirName(dirDot))
	require.Equal(t, encodeProjectsDirName(dirDot), encodeProjectsDirName(dirDash), "the fixture only proves D3 if both directories really do share one folder")

	writePastTranscript(t, folder, "session-dot", cwdLine(dirDot), customTitleLine("Session Dot"))
	writePastTranscript(t, folder, "session-dash", cwdLine(dirDash), customTitleLine("Session Dash"))

	gotDot, err := PastSessions(root, dirDot)
	require.NoError(t, err)
	require.Len(t, gotDot, 1)
	assert.Equal(t, "session-dot", gotDot[0].ClaudeSessionID)
	require.NotNil(t, gotDot[0].Title)
	assert.Equal(t, "Session Dot", *gotDot[0].Title)

	gotDash, err := PastSessions(root, dirDash)
	require.NoError(t, err)
	require.Len(t, gotDash, 1)
	assert.Equal(t, "session-dash", gotDash[0].ClaudeSessionID)
}

// TestPastSessions_LongDirectoryFoundByPrefix covers D4: a directory whose encoded name
// exceeds 200 characters is found by its folder's 200-char prefix, and the real content
// is still filtered by cwd exactly like any other directory.
func TestPastSessions_LongDirectoryFoundByPrefix(t *testing.T) {
	root := t.TempDir()
	dir := "/home/bob/" + strings.Repeat("x", 250)
	require.Greater(t, len(encodeProjectsDirName(dir)), maxEncodedDirNameLen)

	encoded := encodeProjectsDirName(dir)
	folder := filepath.Join(root, encoded[:maxEncodedDirNameLen]+"-a9ltme")
	writePastTranscript(t, folder, "session-long", cwdLine(dir))
	// A session recorded under a different (short) cwd inside that same long-directory
	// folder must not leak into the long directory's own listing.
	writePastTranscript(t, folder, "session-other", cwdLine("/home/bob/unrelated"))

	got, err := PastSessions(root, dir)

	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "session-long", got[0].ClaudeSessionID)
}

// TestPastSessions_TitlePrecedence covers D5: last custom-title wins over ai-title, an
// empty later value never overwrites an earlier non-empty one, and a transcript with
// neither line yields a nil title.
func TestPastSessions_TitlePrecedence(t *testing.T) {
	root := t.TempDir()
	dir := "/home/bob/proj"
	folder := filepath.Join(root, encodeProjectsDirName(dir))

	t.Run("custom-title beats ai-title", func(t *testing.T) {
		writePastTranscript(t, folder, "s-both", cwdLine(dir), aiTitleLine("AI Title"), customTitleLine("Custom Title"))

		got, err := PastSessions(root, dir)
		require.NoError(t, err)
		s := mustFind(t, got, "s-both")
		require.NotNil(t, s.Title)
		assert.Equal(t, "Custom Title", *s.Title)
	})

	t.Run("ai-title alone is used", func(t *testing.T) {
		writePastTranscript(t, folder, "s-ai-only", cwdLine(dir), aiTitleLine("AI Only"))

		got, err := PastSessions(root, dir)
		require.NoError(t, err)
		s := mustFind(t, got, "s-ai-only")
		require.NotNil(t, s.Title)
		assert.Equal(t, "AI Only", *s.Title)
	})

	t.Run("neither line present yields nil", func(t *testing.T) {
		writePastTranscript(t, folder, "s-neither", cwdLine(dir))

		got, err := PastSessions(root, dir)
		require.NoError(t, err)
		s := mustFind(t, got, "s-neither")
		assert.Nil(t, s.Title)
	})

	t.Run("the last of two custom-title lines wins", func(t *testing.T) {
		writePastTranscript(t, folder, "s-rewritten", cwdLine(dir), customTitleLine("First"), customTitleLine("Second"))

		got, err := PastSessions(root, dir)
		require.NoError(t, err)
		s := mustFind(t, got, "s-rewritten")
		require.NotNil(t, s.Title)
		assert.Equal(t, "Second", *s.Title)
	})

	t.Run("a later empty custom-title never overwrites an earlier non-empty one", func(t *testing.T) {
		writePastTranscript(t, folder, "s-empty-later", cwdLine(dir), customTitleLine("Keep Me"), `{"type":"custom-title","customTitle":""}`)

		got, err := PastSessions(root, dir)
		require.NoError(t, err)
		s := mustFind(t, got, "s-empty-later")
		require.NotNil(t, s.Title)
		assert.Equal(t, "Keep Me", *s.Title)
	})
}

// TestPastSessions_LastPromptPermissionModeAndModelTakeTheLastLine covers the other
// three neutral fields PastSessions extracts: each is rewritten by a later line of its
// own type, exactly like title.
func TestPastSessions_LastPromptPermissionModeAndModelTakeTheLastLine(t *testing.T) {
	root := t.TempDir()
	dir := "/home/bob/proj"
	folder := filepath.Join(root, encodeProjectsDirName(dir))

	writePastTranscript(t, folder, "s1", cwdLine(dir),
		lastPromptLine("first prompt"), lastPromptLine("second prompt"),
		permissionModeLine("default"), permissionModeLine("plan"),
		assistantModelLine("claude-sonnet"), assistantModelLine("claude-opus"),
	)

	got, err := PastSessions(root, dir)
	require.NoError(t, err)
	s := mustFind(t, got, "s1")

	require.NotNil(t, s.LastPrompt)
	assert.Equal(t, "second prompt", *s.LastPrompt)
	require.NotNil(t, s.PermissionMode)
	assert.Equal(t, "plan", *s.PermissionMode)
	require.NotNil(t, s.Model)
	assert.Equal(t, "claude-opus", *s.Model)
}

// TestPastSessions_StubsAndNestedTreesAreNotListed covers D6: a transcript with no cwd
// line at all is a stub and never listed, and neither memory/ nor a subagent tree
// nested a level down under the transcript folder is ever read as a session — both are
// directories os.ReadDir(folder) reports without descending into.
func TestPastSessions_StubsAndNestedTreesAreNotListed(t *testing.T) {
	root := t.TempDir()
	dir := "/home/bob/proj"
	folder := filepath.Join(root, encodeProjectsDirName(dir))

	// A genuine session, so the listing isn't accidentally empty for an unrelated reason.
	writePastTranscript(t, folder, "real-session", cwdLine(dir))

	// A stub with no cwd-bearing line at all.
	writePastTranscript(t, folder, "stub", customTitleLine("Orphan Title"))

	// memory/ — a directory, not a *.jsonl file.
	require.NoError(t, os.MkdirAll(filepath.Join(folder, "memory"), 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(folder, "memory", "notes.jsonl"), []byte(cwdLine(dir)+"\n"), 0o600))

	// <id>/subagents/agent-1.jsonl — never reached because ReadDir(folder) never
	// descends into the "some-id" directory entry in the first place.
	subagentDir := filepath.Join(folder, "some-id", "subagents")
	require.NoError(t, os.MkdirAll(subagentDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(subagentDir, "agent-1.jsonl"), []byte(cwdLine(dir)+"\n"), 0o600))

	got, err := PastSessions(root, dir)

	require.NoError(t, err)
	require.Len(t, got, 1, "only the one real session must be listed")
	assert.Equal(t, "real-session", got[0].ClaudeSessionID)
}

// TestPastSessions_LargeTranscriptTailMissingCwdFallsBackToHead covers D7: a transcript
// over transcriptTailBytes whose tail alone carries no cwd line is resolved from its
// head instead — the shape a session recorded early (cwd, near the start) and then grew
// well past the tail-read window without another cwd line ever being written.
func TestPastSessions_LargeTranscriptTailMissingCwdFallsBackToHead(t *testing.T) {
	root := t.TempDir()
	dir := "/home/bob/proj"
	folder := filepath.Join(root, encodeProjectsDirName(dir))
	require.NoError(t, os.MkdirAll(folder, 0o700))

	// The head: one real line carrying cwd, well inside the first transcriptTailBytes.
	head := cwdLine(dir) + "\n"
	// Filler bytes that are not valid JSON (so scanning them applies nothing) and push
	// the file well past 2*transcriptTailBytes, guaranteeing the tail read never
	// overlaps the head's cwd line.
	fillerLine := "not valid json filler line\n"
	filler := strings.Repeat(fillerLine, 2*transcriptTailBytes/len(fillerLine)+10)
	content := head + filler

	path := filepath.Join(folder, "big-session.jsonl")
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	require.Greater(t, len(content), 2*transcriptTailBytes, "the fixture must actually exceed the tail-then-head bound it's proving")

	got, err := PastSessions(root, dir)

	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "big-session", got[0].ClaudeSessionID)
}

// TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue is an implementation-bug
// finding, not a passing acceptance test: scanTranscript's head fallback (triggered by a
// missing cwd in the tail, D7) re-scans the *whole* head chunk into the same
// transcriptScan the tail already populated, so an earlier, stale line of a type the
// tail already found a later value for (permission-mode here) unconditionally
// overwrites it — apply() only checks "is the new value non-empty", never "which chunk,
// and which file position, is this". kb:fact/transcript-session-lines documents these
// fields as "rewritten as it changes", i.e. last-in-file wins; this reverses that for
// any field whose true last value sits in the tail while an earlier value of the same
// type also sits within the head window. A long resumed-from-list session that changed
// permission mode once early and again later (well within the measured ~34 KB "always
// last" bound, kb:fact/transcript-session-lines) can have D9's resume seed the mode from
// the wrong, earlier line whenever the file is also large enough to push cwd out of the
// tail. Left failing (red) rather than adjusted to match the actual output: see this
// plan's daemon-tests report for the reproduction. Not fixed here — the constraints bar
// a test agent from editing implementation code.
func TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue(t *testing.T) {
	root := t.TempDir()
	dir := "/home/bob/proj"
	folder := filepath.Join(root, encodeProjectsDirName(dir))
	require.NoError(t, os.MkdirAll(folder, 0o700))

	// Head: an early, stale permission-mode line, plus the one cwd line (so the head
	// fallback triggers per D7 — the tail below carries no cwd at all).
	head := permissionModeLine("default") + "\n" + cwdLine(dir) + "\n"
	fillerLine := "not valid json filler line\n"
	filler := strings.Repeat(fillerLine, 2*transcriptTailBytes/len(fillerLine)+10)
	// Tail: the real, later permission-mode line, placed at the very end so it is
	// unambiguously within the tail-read window.
	tail := permissionModeLine("bypassPermissions") + "\n"
	content := head + filler + tail

	path := filepath.Join(folder, "big-session.jsonl")
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	require.Greater(t, len(content), 2*transcriptTailBytes)

	got, err := PastSessions(root, dir)

	require.NoError(t, err)
	require.Len(t, got, 1)
	require.NotNil(t, got[0].PermissionMode)
	assert.Equal(t, "bypassPermissions", *got[0].PermissionMode,
		"the transcript's actual last permission-mode line is in the tail; the head fallback must not let an earlier line win")
}

// TestPastSessions_AbsentOrUnreadableProjectsDirYieldsEmptyListNotError covers D8: a
// projects directory that does not exist (a fresh machine's Claude Code may never have
// created one) degrades to an empty list rather than failing the request.
func TestPastSessions_AbsentOrUnreadableProjectsDirYieldsEmptyListNotError(t *testing.T) {
	root := filepath.Join(t.TempDir(), "does-not-exist")

	got, err := PastSessions(root, "/home/bob/proj")

	require.NoError(t, err)
	assert.Empty(t, got)
}

// TestPastSessions_ANeverSeenDirectoryYieldsEmptyListNotError is the Protocol Contract's
// "A directory Claude Code has never run in yields {sessions: [], truncated: false}" —
// the projects dir itself exists and holds other directories' folders, just never one
// for this directory.
func TestPastSessions_ANeverSeenDirectoryYieldsEmptyListNotError(t *testing.T) {
	root := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(root, encodeProjectsDirName("/home/bob/other")), 0o700))

	got, err := PastSessions(root, "/home/bob/never-run-here")

	require.NoError(t, err)
	assert.Empty(t, got)
}

// TestPastSessions_LastActiveAtIsTheFilesModTime covers the neutral LastActiveAt field's
// source: the transcript file's own modification time, not any line inside it.
func TestPastSessions_LastActiveAtIsTheFilesModTime(t *testing.T) {
	root := t.TempDir()
	dir := "/home/bob/proj"
	folder := filepath.Join(root, encodeProjectsDirName(dir))
	path := writePastTranscript(t, folder, "s1", cwdLine(dir))

	want := time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)
	require.NoError(t, os.Chtimes(path, want, want))

	got, err := PastSessions(root, dir)

	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.True(t, want.Equal(got[0].LastActiveAt), "want %v, got %v", want, got[0].LastActiveAt)
}

// mustFind returns the PastSession with the given ClaudeSessionID, failing the test if
// it isn't present — this file's own helper for the title-precedence subtests, each of
// which writes one more session into a folder shared across the whole test.
func mustFind(t *testing.T, sessions []PastSession, claudeSessionID string) PastSession {
	t.Helper()
	for _, s := range sessions {
		if s.ClaudeSessionID == claudeSessionID {
			return s
		}
	}
	t.Fatalf("no session with claudeSessionId %q among %d sessions", claudeSessionID, len(sessions))
	return PastSession{}
}
