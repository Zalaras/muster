package claudecode

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// writeTranscript writes lines (already-marshalled JSONL) to a fresh file under dir and
// returns its path.
func writeTranscript(t *testing.T, dir string, lines ...string) string {
	t.Helper()
	path := filepath.Join(dir, "transcript.jsonl")
	require.NoError(t, os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644))
	return path
}

// TestLocatePlanFile is kb:fact/plan-file-path-in-transcript's guard (D5): every
// attachment type that carries planFilePath must resolve it, the slug-only fallback
// must resolve under home, and both "nothing to find" cases (no marker line, no
// transcript at all) must be the empty answer, never an error.
func TestLocatePlanFile(t *testing.T) {
	home := "/home/damian"

	t.Run("plan_mode attachment line resolves planFilePath", func(t *testing.T) {
		dir := t.TempDir()
		path := writeTranscript(t, dir, claudecodetest.PlanAttachmentLine("plan_mode", "/plans/say-hi.md", false))

		pf, err := LocatePlanFile(path, home)

		require.NoError(t, err)
		assert.Equal(t, PlanFile{Path: "/plans/say-hi.md", Source: "planFilePath"}, pf)
	})

	t.Run("plan_mode_exit only (no plan_mode line) still resolves planFilePath", func(t *testing.T) {
		dir := t.TempDir()
		path := writeTranscript(t, dir, claudecodetest.PlanAttachmentLine("plan_mode_exit", "/plans/say-hi.md", true))

		pf, err := LocatePlanFile(path, home)

		require.NoError(t, err)
		assert.Equal(t, PlanFile{Path: "/plans/say-hi.md", Source: "planFilePath"}, pf)
	})

	t.Run("plan_mode_reentry only still resolves planFilePath", func(t *testing.T) {
		dir := t.TempDir()
		path := writeTranscript(t, dir, claudecodetest.PlanAttachmentLine("plan_mode_reentry", "/plans/say-hi.md", true))

		pf, err := LocatePlanFile(path, home)

		require.NoError(t, err)
		assert.Equal(t, PlanFile{Path: "/plans/say-hi.md", Source: "planFilePath"}, pf)
	})

	t.Run("slug-only transcript falls back to the default plans directory", func(t *testing.T) {
		dir := t.TempDir()
		path := writeTranscript(t, dir, claudecodetest.SlugLine("happy-otter"))

		pf, err := LocatePlanFile(path, home)

		require.NoError(t, err)
		assert.Equal(t, PlanFile{Path: "/home/damian/.claude/plans/happy-otter.md", Source: "slug"}, pf)
	})

	t.Run("planFilePath is authoritative even when a slug line is also present", func(t *testing.T) {
		dir := t.TempDir()
		path := writeTranscript(t, dir,
			claudecodetest.SlugLine("happy-otter"),
			claudecodetest.PlanAttachmentLine("plan_mode", "/plans/say-hi.md", true),
		)

		pf, err := LocatePlanFile(path, home)

		require.NoError(t, err)
		assert.Equal(t, PlanFile{Path: "/plans/say-hi.md", Source: "planFilePath"}, pf, "planFilePath must win over the slug fallback")
	})

	t.Run("the most recently written planFilePath line wins", func(t *testing.T) {
		dir := t.TempDir()
		path := writeTranscript(t, dir,
			claudecodetest.PlanAttachmentLine("plan_mode", "/plans/first.md", false),
			claudecodetest.PlanAttachmentLine("plan_mode_exit", "/plans/second.md", true),
		)

		pf, err := LocatePlanFile(path, home)

		require.NoError(t, err)
		assert.Equal(t, "/plans/second.md", pf.Path)
	})

	t.Run("a transcript with neither marker resolves to the empty answer, not an error", func(t *testing.T) {
		dir := t.TempDir()
		path := writeTranscript(t, dir, `{"type":"user","text":"hello"}`, `{"type":"mode","mode":"default"}`)

		pf, err := LocatePlanFile(path, home)

		require.NoError(t, err)
		assert.Equal(t, PlanFile{}, pf)
	})

	t.Run("a missing transcript is the no-plan answer, never an error", func(t *testing.T) {
		pf, err := LocatePlanFile(filepath.Join(t.TempDir(), "never-written.jsonl"), home)

		require.NoError(t, err)
		assert.Equal(t, PlanFile{}, pf)
	})
}

func TestDefaultPlansDir(t *testing.T) {
	assert.Equal(t, filepath.Join("/home/damian", ".claude", "plans"), DefaultPlansDir("/home/damian"))
}

// TestIsUnderDefaultPlansDir exercises REQ-16's third scan trigger, including the trap a
// naive strings.HasPrefix on the raw string (rather than filepath.Rel) would fall into:
// a sibling directory whose name merely starts with "plans" must not count as "under".
func TestIsUnderDefaultPlansDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	assert.True(t, IsUnderDefaultPlansDir(filepath.Join(home, ".claude", "plans", "foo.md")))
	assert.False(t, IsUnderDefaultPlansDir("/somewhere/else/foo.md"))
	assert.False(t, IsUnderDefaultPlansDir(filepath.Join(home, ".claude", "plans-other", "foo.md")),
		"a sibling directory sharing the 'plans' prefix must not count as under the plans directory")
}
