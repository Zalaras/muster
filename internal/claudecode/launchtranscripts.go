package claudecode

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ProjectsDir returns the default location of Claude Code's transcript store,
// ~/.claude/projects (kb:fact/transcript-dir-encoding) — never under CLAUDE_CONFIG_DIR
// (kb:fact/config-dir-breaks-oauth applies to settings; this is a separate, read-only
// concern, but the same "never CLAUDE_CONFIG_DIR" rule holds). cmd/musterd's
// -claude-projects-dir flag overrides this default; every E2E daemon passes its own
// scratch directory.
func ProjectsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home directory: %w", err)
	}
	return filepath.Join(home, ".claude", "projects"), nil
}

// maxEncodedDirNameLen is the folder-name encoding's cutoff
// (kb:fact/transcript-dir-encoding): a longer name is truncated to this many characters
// plus a hash suffix whose algorithm was not identified, so a long directory's folder is
// found by this prefix rather than computed.
const maxEncodedDirNameLen = 200

// transcriptTailBytes is how much of a transcript's tail (and, on a miss, its head) is
// read for the fields that name it (kb:fact/transcript-session-lines: the last title line
// sat at most ~34 KB from the end across ~210 real files) — generous over that measured
// bound without reading a whole multi-megabyte file for the common case.
const transcriptTailBytes = 64 * 1024

// nonTranscriptDirChar matches every character the encoding replaces with '-'
// (kb:fact/transcript-dir-encoding: "every character outside [A-Za-z0-9-]").
var nonTranscriptDirChar = regexp.MustCompile(`[^A-Za-z0-9-]`)

// encodeProjectsDirName applies Claude Code's own transcript-folder-name encoding to a
// resolved directory path.
func encodeProjectsDirName(resolvedDir string) string {
	return nonTranscriptDirChar.ReplaceAllString(resolvedDir, "-")
}

// resolveTranscriptDir resolves dir's symlinks (falling back to dir itself when it cannot
// be resolved) and cleans it — the form Claude Code encodes into a transcript folder name.
func resolveTranscriptDir(dir string) string {
	resolved := dir
	if r, err := filepath.EvalSymlinks(dir); err == nil {
		resolved = r
	}
	return filepath.Clean(resolved)
}

// TranscriptPath returns root/<encoded dir>/<claudeSessionID>.jsonl for the transcript of a
// session run in dir, dir being symlink-resolved first. For a directory whose encoded name
// exceeds maxEncodedDirNameLen the real folder carries an unidentified hash suffix, so the
// path returned is the unsuffixed candidate and will not exist; callers wanting an existing
// file for such a directory should use PastSessions. The error is reserved for an empty
// claudeSessionID.
func TranscriptPath(root, dir, claudeSessionID string) (string, error) {
	if claudeSessionID == "" {
		return "", fmt.Errorf("transcript path for %q: empty Claude session id", dir)
	}
	return filepath.Join(root, encodeProjectsDirName(resolveTranscriptDir(dir)), claudeSessionID+".jsonl"), nil
}

// PastSession is one Claude Code session found in the projects directory for a
// directory (kb:anchor/pastsessions.list) — internal/claudecode never writes under the
// projects directory, only reads it. Model is not part of the GET /api/past-sessions wire
// shape; it seeds a resumed-from-list session's response Model instead.
type PastSession struct {
	ClaudeSessionID string
	Title           *string // last custom-title, else last ai-title, else nil
	LastPrompt      *string // the raw last last-prompt line, untruncated
	LastActiveAt    time.Time
	PermissionMode  *string // the last permission-mode line, verbatim; nil when none recorded
	Model           *string // the last assistant line's model; nil when none recorded
}

// PastSessions returns every Claude Code session recorded for dir (resolved for symlinks,
// then matched against each transcript line's own recorded cwd — kb:fact/transcript-dir-encoding's
// shared-folder case). root is Claude Code's projects directory (ProjectsDir's default, or
// -claude-projects-dir). An absent or unreadable root yields an empty list, not an error —
// a fresh machine's Claude Code may never have created one.
func PastSessions(root, dir string) ([]PastSession, error) {
	resolvedDir := resolveTranscriptDir(dir)

	folders := candidateFolders(root, encodeProjectsDirName(resolvedDir))

	var out []PastSession
	for _, folder := range folders {
		entries, err := os.ReadDir(folder)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
				continue // memory/ and <id>/subagents/ are directories, never matched here
			}
			path := filepath.Join(folder, entry.Name())
			scan := scanTranscript(path)
			if scan.cwd == "" || filepath.Clean(scan.cwd) != resolvedDir {
				continue // a stub with no cwd line, or another directory sharing this folder
			}
			info, err := entry.Info()
			if err != nil {
				continue
			}
			out = append(out, scan.toPastSession(strings.TrimSuffix(entry.Name(), ".jsonl"), info.ModTime()))
		}
	}
	return out, nil
}

// candidateFolders lists root's transcript folder(s) matching encoded: the one exact
// folder for an encoded name at or under maxEncodedDirNameLen, or every folder whose name
// has encoded's first maxEncodedDirNameLen characters as a prefix once encoded is longer
// (kb:fact/transcript-dir-encoding's unidentified hash suffix) — never an error; a
// root that cannot be listed simply matches nothing.
func candidateFolders(root, encoded string) []string {
	if len(encoded) <= maxEncodedDirNameLen {
		folder := filepath.Join(root, encoded)
		if info, err := os.Stat(folder); err == nil && info.IsDir() {
			return []string{folder}
		}
		return nil
	}

	prefix := encoded[:maxEncodedDirNameLen]
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var folders []string
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), prefix) {
			folders = append(folders, filepath.Join(root, entry.Name()))
		}
	}
	return folders
}

// transcriptScan accumulates the session-naming lines kb:fact/transcript-session-lines
// measured, across one or two read chunks (scanTranscript's tail-then-head fallback) —
// later lines in file order overwrite earlier ones, since each type is rewritten as it
// changes.
type transcriptScan struct {
	customTitle    string
	aiTitle        string
	lastPrompt     string
	permissionMode string
	model          string
	cwd            string
}

// transcriptLine is the subset of kb:fact/transcript-session-lines' line shapes this
// package reads — every field any of the six line types can carry, decoded once per line
// and dispatched by Type. A line of an unrecognised type or that fails to parse is simply
// ignored: transcripts hold many other line kinds this feature has no use for.
type transcriptLine struct {
	Type           string `json:"type"`
	Cwd            string `json:"cwd"`
	CustomTitle    string `json:"customTitle"`
	AiTitle        string `json:"aiTitle"`
	LastPrompt     string `json:"lastPrompt"`
	PermissionMode string `json:"permissionMode"`
	Message        struct {
		Model string `json:"model"`
	} `json:"message"`
}

func (s *transcriptScan) apply(rawLine []byte) {
	var line transcriptLine
	if err := json.Unmarshal(rawLine, &line); err != nil {
		return
	}
	if line.Cwd != "" {
		s.cwd = line.Cwd
	}
	switch line.Type {
	case "custom-title":
		if line.CustomTitle != "" {
			s.customTitle = line.CustomTitle
		}
	case "ai-title":
		if line.AiTitle != "" {
			s.aiTitle = line.AiTitle
		}
	case "last-prompt":
		if line.LastPrompt != "" {
			s.lastPrompt = line.LastPrompt
		}
	case "permission-mode":
		if line.PermissionMode != "" {
			s.permissionMode = line.PermissionMode
		}
	case "assistant":
		if line.Message.Model != "" {
			s.model = line.Message.Model
		}
	}
}

// scanChunk applies every well-formed JSONL line in chunk, in order — including a chunk
// that starts mid-line (a tail read's first, truncated line), which simply fails to parse
// and is skipped.
func (s *transcriptScan) scanChunk(chunk []byte) {
	scanner := bufio.NewScanner(bytes.NewReader(chunk))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		s.apply(line)
	}
}

// title returns Claude Code's own title precedence: last custom-title, else last ai-title, else nil.
func (s *transcriptScan) title() *string {
	if s.customTitle != "" {
		return &s.customTitle
	}
	if s.aiTitle != "" {
		return &s.aiTitle
	}
	return nil
}

func (s *transcriptScan) toPastSession(claudeSessionID string, lastActiveAt time.Time) PastSession {
	p := PastSession{
		ClaudeSessionID: claudeSessionID,
		Title:           s.title(),
		LastActiveAt:    lastActiveAt,
	}
	if s.lastPrompt != "" {
		p.LastPrompt = &s.lastPrompt
	}
	if s.permissionMode != "" {
		p.PermissionMode = &s.permissionMode
	}
	if s.model != "" {
		p.Model = &s.model
	}
	return p
}

// scanTranscript reads path's tail (kb:fact/transcript-session-lines: every title/prompt/
// mode/model line measured within the last ~34 KB), falling back to its head only when
// that tail carried no cwd line at all — cwd is written early in a session and, on a
// transcript large enough for its tail to miss it, is only findable near the start. The
// head, when read, is applied to the accumulator *before* the tail (chronologically
// earlier in the file), so the tail's own lines still win last-line-wins for every field
// they carry — the head fallback only ever adds a field the tail never mentioned at all.
func scanTranscript(path string) transcriptScan {
	tail, tailErr := readTail(path, transcriptTailBytes)

	var probe transcriptScan
	if tailErr == nil {
		probe.scanChunk(tail)
	}
	if probe.cwd != "" {
		return probe
	}

	var s transcriptScan
	if head, err := readHead(path, transcriptTailBytes); err == nil {
		s.scanChunk(head)
	}
	if tailErr == nil {
		s.scanChunk(tail)
	}
	return s
}

// readTail returns path's last n bytes, or the whole file when it is smaller than n.
func readTail(path string, n int) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	offset := int64(0)
	if info.Size() > int64(n) {
		offset = info.Size() - int64(n)
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return nil, err
	}
	return io.ReadAll(f)
}

// readHead returns path's first n bytes.
func readHead(path string, n int) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, int64(n)))
}
