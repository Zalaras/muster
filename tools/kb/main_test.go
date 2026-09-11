package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func write(t *testing.T, root, rel, content string) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	require.NoError(t, os.MkdirAll(filepath.Dir(p), 0o755))
	require.NoError(t, os.WriteFile(p, []byte(content), 0o644))
}

// newRepo builds a minimal store: one feature, one decision, one plan, one code file.
func newRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	write(t, root, "go.mod", "module example.invalid/fixture\n")
	write(t, root, "internal/claudecode/observed_versions.txt", "2.1.246 2026-08-29 a\n2.1.267 2026-09-10 b\n")
	write(t, root, "docs/protocol.md", "# P\n\n<!-- kb:anchor sessions.pin -->\n### 3.10 Pin\n\nBody.\n")
	write(t, root, "docs/features/sessions/spec.md", "---\nid: sessions\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: Sessions.\nfeatures: [sessions]\ngo: [internal/sess/**]\nprotocol: [sessions.pin]\n---\nSpec body.\n")
	write(t, root, "internal/sess/sess.go", "package sess\n")
	write(t, root, "docs/adr/pin-order.md", "---\nid: pin-order\ntype: decision\nstatus: accepted\ndate: 2026-08-30\nsummary: Keep order.\nfeatures: [sessions]\n---\nBody.\n")
	write(t, root, "plans/p/plan.md", "# p\n\n**Features**: sessions\n")
	return root
}

func TestRun_UsageAndUnknownSubcommandErrors(t *testing.T) {
	root := newRepo(t)
	t.Chdir(root)
	var buf bytes.Buffer
	require.EqualError(t, run(nil, &buf), "usage: kb <gen|check|pack|for|why|show|cite|find|ls> [args]")
	require.EqualError(t, run([]string{"bogus"}, &buf), `unknown subcommand "bogus" (want gen, check, pack, for, why, show, cite, find or ls)`)
	require.EqualError(t, run([]string{"show"}, &buf), "usage: kb show <id>")
	require.EqualError(t, run([]string{"show", "nope"}, &buf), `no record with id "nope" (try: kb find nope)`)
}

func TestRun_GenThenCheckIsGreenFromASubdirectory(t *testing.T) {
	root := newRepo(t)
	t.Chdir(filepath.Join(root, "internal", "sess"))
	var buf bytes.Buffer
	require.NoError(t, run([]string{"gen"}, &buf))
	assert.True(t, strings.HasPrefix(buf.String(), "kb: regenerated 4 file(s): .claude/rules/sessions.md, docs/INDEX.md, docs/features/sessions/INDEX.md, docs/features/sessions/contract.md\n"), buf.String())

	buf.Reset()
	require.NoError(t, run([]string{"check"}, &buf))
	assert.Equal(t, "kb: 2 records, 1 features, 0 problem(s)\nkb: all checks pass\n", buf.String())

	buf.Reset()
	require.NoError(t, run([]string{"gen"}, &buf))
	assert.Equal(t, "kb: all generated files fresh\n", buf.String())

	buf.Reset()
	require.NoError(t, run([]string{"for", "sess.go"}, &buf))
	assert.Contains(t, buf.String(), "features:\n  sessions — Sessions.")
	buf.Reset()
	require.NoError(t, run([]string{"why", filepath.Join(root, "internal", "sess", "sess.go")}, &buf))
	assert.Contains(t, buf.String(), "the features covering it say")
	buf.Reset()
	require.NoError(t, run([]string{"cite", "pin-order"}, &buf))
	assert.Equal(t, "kb:adr/pin-order\ndocs/adr/pin-order.md\n", buf.String())
	buf.Reset()
	require.NoError(t, run([]string{"ls", "--type", "adr"}, &buf))
	assert.Contains(t, buf.String(), "kb:adr/pin-order")
	buf.Reset()
	require.NoError(t, run([]string{"find", "ORDER"}, &buf))
	assert.Contains(t, buf.String(), "kb:adr/pin-order")
}

func TestRun_CheckExitsNonZeroListingEveryFindingThenTheTail(t *testing.T) {
	root := newRepo(t)
	write(t, root, "internal/sess/bad.go", "package sess\n// kb:adr/nope\n")
	t.Chdir(root)
	var buf bytes.Buffer
	err := run([]string{"check"}, &buf)
	require.EqualError(t, err, "kb check: 5 problem(s)")
	assert.Equal(t, strings.Join([]string{
		".claude/rules/sessions.md: missing — regenerate with make gen-kb",
		"docs/INDEX.md: missing — regenerate with make gen-kb",
		"docs/features/sessions/INDEX.md: missing — regenerate with make gen-kb",
		"docs/features/sessions/contract.md: missing — regenerate with make gen-kb",
		"internal/sess/bad.go:2: citation kb:adr/nope resolves to no record",
		"kb: 2 records, 1 features, 5 problem(s)",
	}, "\n")+"\n", buf.String())
	assert.NotContains(t, buf.String(), "all checks pass")
}

func TestRun_GenRefusesToWriteWhileTheSourcesHaveProblems(t *testing.T) {
	root := newRepo(t)
	write(t, root, "docs/adr/broken.md", "no frontmatter\n")
	t.Chdir(root)
	var buf bytes.Buffer
	require.EqualError(t, run([]string{"gen"}, &buf), "kb gen: 1 problem(s) in the sources — fix them first")
	assert.Contains(t, buf.String(), "docs/adr/broken.md:1: no frontmatter")
	_, err := os.Stat(filepath.Join(root, "docs", "INDEX.md"))
	require.ErrorIs(t, err, os.ErrNotExist)
}

func TestRun_PackRequiresPlanAndRoleAndRejectsAnUnknownRole(t *testing.T) {
	root := newRepo(t)
	t.Chdir(root)
	var buf bytes.Buffer
	const usage = "usage: kb pack --plan NAME --role ROLE [--features a,b]"
	require.EqualError(t, run([]string{"pack"}, &buf), usage)
	require.EqualError(t, run([]string{"pack", "--plan", "p"}, &buf), usage)
	require.EqualError(t, run([]string{"pack", "--plan"}, &buf), "--plan needs a value")
	require.EqualError(t, run([]string{"pack", "--plan", "nope", "--role", "review"}, &buf), "plans/nope/plan.md does not exist")
	err := run([]string{"pack", "--plan", "p", "--role", "ceo"}, &buf)
	require.Error(t, err)
	assert.True(t, strings.HasPrefix(err.Error(), `unknown role "ceo" (want one of: e2e-specs, daemon-impl`), err.Error())

	write(t, root, "plans/q/plan.md", "# q\n\nno header\n")
	require.EqualError(t, run([]string{"pack", "--plan", "q", "--role", "review"}, &buf),
		"plans/q/plan.md: no **Features**: header (add one, or pass --features)")

	buf.Reset()
	require.NoError(t, run([]string{"pack", "--plan=q", "--role=review", "--features=sessions"}, &buf))
	assert.True(t, strings.HasPrefix(buf.String(), "<!-- kb:pack plan=q role=review features=sessions -->\n"), buf.String())
	assert.Contains(t, buf.String(), "# Decisions (proposed for this plan)")

	buf.Reset()
	require.NoError(t, run([]string{"pack", "--plan", "p", "--role", "daemon-impl"}, &buf))
	assert.Contains(t, buf.String(), "# Feature: sessions")
	assert.Contains(t, buf.String(), "## decision pin-order — Keep order.")
}
