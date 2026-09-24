package claudecode

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// PlanFile is where a session's plan-mode plan lives, derived from its transcript.
//
// Claude Code (2.1.270, read out of the installed bundle) names the plan
// `<plansDir>/<slug>.md`, where plansDir is `settings.plansDirectory` resolved under the
// project root, else `~/.claude/plans`, and slug is a per-session value minted when plan
// mode is first entered. The transcript records both: every line written after the slug
// exists carries a top-level `slug`, and each plan-mode system reminder is an
// `{"type":"attachment","attachment":{"type":"plan_mode","planFilePath":…,"planExists":…}}`
// line (and a matching `plan_mode_exit`/`plan_mode_reentry` line) whose planFilePath is
// the resolved absolute path. planFilePath is authoritative (it honours plansDirectory);
// the slug is the fallback for a transcript that has the slug but no reminder line yet
// (kb:fact/plan-file-path-in-transcript).
type PlanFile struct {
	Path string // absolute; "" when the session has never entered plan mode
	// Source is "planFilePath" or "slug" — which transcript field produced Path.
	Source string
}

// scanPlanFile scans a transcript for the most recent plan-file evidence. Only lines
// that contain one of the two marker keys are JSON-decoded; everything else is skipped
// on the raw bytes, so a multi-megabyte transcript costs one pass and a handful of
// decodes (kb:fact/plan-file-path-in-transcript's "268 ms for 281 transcripts" measurement).
func scanPlanFile(r io.Reader, home string) (PlanFile, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 64*1024*1024) // transcript lines can run to MBs
	planKey := []byte(`"planFilePath"`)
	slugKey := []byte(`"slug"`)
	var lastPath, lastSlug string
	for sc.Scan() {
		line := sc.Bytes()
		hasPlan := bytes.Contains(line, planKey)
		hasSlug := bytes.Contains(line, slugKey)
		if !hasPlan && !hasSlug {
			continue
		}
		var rec struct {
			Slug       string `json:"slug"`
			Attachment struct {
				Type         string `json:"type"`
				PlanFilePath string `json:"planFilePath"`
			} `json:"attachment"`
		}
		if json.Unmarshal(line, &rec) != nil {
			continue
		}
		// Observed carriers: attachment.type "plan_mode" (the reminder on entering plan
		// mode), "plan_mode_exit" (on leaving it) and "plan_mode_reentry"; all three hold
		// the same resolved path.
		if rec.Attachment.PlanFilePath != "" {
			lastPath = rec.Attachment.PlanFilePath
		}
		if rec.Slug != "" {
			lastSlug = rec.Slug
		}
	}
	if err := sc.Err(); err != nil {
		return PlanFile{}, err
	}
	switch {
	case lastPath != "":
		return PlanFile{Path: lastPath, Source: "planFilePath"}, nil
	case lastSlug != "":
		return PlanFile{Path: filepath.Join(home, ".claude", "plans", lastSlug+".md"), Source: "slug"}, nil
	}
	return PlanFile{}, nil
}

// LocatePlanFile derives a session's plan file from the transcript_path every hook
// carries. A missing transcript is not an error: it is the "no plan" answer. home is the
// resolved user home directory the slug fallback joins against — an explicit parameter
// rather than os.UserHomeDir() read internally, so a caller's test controls it without
// mutating the process-wide $HOME (docs/conventions.md § Go: tests never mutate state
// shared with other tests in the package).
func LocatePlanFile(transcriptPath, home string) (PlanFile, error) {
	f, err := os.Open(transcriptPath)
	if errors.Is(err, os.ErrNotExist) {
		return PlanFile{}, nil
	}
	if err != nil {
		return PlanFile{}, err
	}
	defer f.Close()
	return scanPlanFile(f, home)
}

// DefaultPlansDir returns "<home>/.claude/plans" — Claude Code's plan directory absent a
// settings.plansDirectory override (kb:fact/plan-file-path-in-transcript).
func DefaultPlansDir(home string) string {
	return filepath.Join(home, ".claude", "plans")
}

// IsUnderDefaultPlansDir reports whether path sits under the current user's default
// plans directory — the reader's third scan trigger (kb:spec/reader): "a Write/Edit whose
// path sits under the default plans directory". Unlike LocatePlanFile this resolves the home directory
// itself: InterpretFiles' signature is fixed by the ingest path and has no home to
// thread through, so a test needing a different answer sets $HOME.
func IsUnderDefaultPlansDir(path string) bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	dir := DefaultPlansDir(home)
	rel, err := filepath.Rel(dir, filepath.Clean(path))
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
