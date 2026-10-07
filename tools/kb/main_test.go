package main

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
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

// git runs git in dir; a commit carries a scratch identity per command, never a repo-local
// config (CLAUDE.md § Hard rules).
func git(t *testing.T, dir string, args ...string) {
	t.Helper()
	if len(args) > 0 && args[0] == "commit" {
		args = append([]string{"-c", "user.name=kb", "-c", "user.email=kb@example.invalid"}, args...)
	}
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	require.NoErrorf(t, err, "git %v: %s", args, out)
}

// newRepo builds a minimal store: one feature, one decision, one plan, one code file, in a
// git checkout on main (check's refs pass reads the tracked files).
func newRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	write(t, root, "kb.yaml", "dirs:\n  rule: docs/rules\n  decision: docs/adr\n  spec: docs/features\n  diagram: docs/diagrams\n  fact: docs/facts\n  lesson: docs/lessons\n  runbook: docs/runbooks\n  reference: docs/references\npaths:\n  observed_versions: internal/claudecode/observed_versions.txt\nroles: [daemon-impl, review, planner]\ntags: [ux]\n")
	write(t, root, "go.mod", "module example.invalid/fixture\n")
	write(t, root, "internal/claudecode/observed_versions.txt", "2.1.246 2026-08-29 a\n2.1.267 2026-09-10 b\n")
	write(t, root, "docs/protocol.md", "# P\n\n<!-- kb:anchor sessions.pin -->\n### 3.10 Pin\n\nBody.\n")
	write(t, root, "docs/features/sessions/spec.md", "---\nid: sessions\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: Sessions.\nfeatures: [sessions]\ngo: [internal/sess/**]\nprotocol: [sessions.pin]\n---\nSpec body.\n")
	write(t, root, "internal/sess/sess.go", "package sess\n")
	write(t, root, "docs/adr/pin-order.md", "---\nid: pin-order\ntype: decision\nstatus: accepted\ndate: 2026-08-30\nsummary: Keep order.\nfeatures: [sessions]\n---\nBody.\n")
	write(t, root, "plans/p/plan.md", "# p\n\n**Features**: sessions\n")
	git(t, root, "init", "-q")
	git(t, root, "symbolic-ref", "HEAD", "refs/heads/main")
	git(t, root, "commit", "-q", "--allow-empty", "-m", "initial")
	git(t, root, "add", "-A")
	git(t, root, "commit", "-q", "-m", "fixture")
	return root
}

func TestRun_UsageAndUnknownSubcommandErrors(t *testing.T) {
	root := newRepo(t)
	t.Chdir(root)
	var buf bytes.Buffer
	require.EqualError(t, run(nil, &buf), "usage: kb <gen|check|pack|for|why|show|cite|find|ls|fences|refs|scope|owners> [args]")
	require.EqualError(t, run([]string{"bogus"}, &buf), `unknown subcommand "bogus" (want gen, check, pack, for, why, show, cite, find, ls, fences, refs, scope or owners)`)
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
	const usage = "usage: kb pack --plan NAME --role ROLE [--features a,b] [--touches c,d]"
	require.EqualError(t, run([]string{"pack"}, &buf), usage)
	require.EqualError(t, run([]string{"pack", "--plan", "p"}, &buf), usage)
	require.EqualError(t, run([]string{"pack", "--plan"}, &buf), "--plan needs a value")
	require.EqualError(t, run([]string{"pack", "--plan", "nope", "--role", "review"}, &buf), "plans/nope/plan.md does not exist")
	err := run([]string{"pack", "--plan", "p", "--role", "ceo"}, &buf)
	require.Error(t, err)
	assert.Equal(t, `unknown role "ceo" (want one of: daemon-impl, review, planner)`, err.Error(), "the role list is kb.yaml's, not the code's")

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

func TestRun_FencesChecksArbitraryFilesWithoutAnIndex(t *testing.T) {
	root := t.TempDir()
	write(t, root, "plans/p/plan.md", "# p\n\n```mermaid\nstateDiagram-v2\n  a --> b\n```\n")
	write(t, root, "bad.md", "```mermaid\nmindmap\n```\n")
	t.Chdir(root)
	var buf bytes.Buffer
	require.NoError(t, run([]string{"fences", "plans/p/plan.md"}, &buf))
	assert.Equal(t, "kb: 1 file(s), every mermaid fence opens with an allowed keyword\n", buf.String())

	buf.Reset()
	require.EqualError(t, run([]string{"fences", "plans/p/plan.md", "bad.md"}, &buf), "kb fences: 1 problem(s)")
	assert.Equal(t, "bad.md:1: mermaid fence opens with \"mindmap\" (want one of: C4Component, C4Container, C4Context, classDiagram, erDiagram, flowchart, sequenceDiagram, stateDiagram-v2)\n", buf.String())
	require.EqualError(t, run([]string{"fences"}, &buf), "usage: kb fences <file> [file ...]")
}

func TestRun_PackReadsTouchesFromThePlanAndTheFlag(t *testing.T) {
	root := newRepo(t)
	t.Chdir(root)
	write(t, root, "docs/features/other/spec.md", "---\nid: other\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: Other.\nfeatures: [other]\n---\nOther spec body.\n")
	write(t, root, "docs/features/third/spec.md", "---\nid: third\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: Third.\nfeatures: [third]\n---\nThird spec body.\n")
	write(t, root, "plans/t/plan.md", "# t\n\n**Features**: sessions\n**Touches**: other\n")

	var buf bytes.Buffer
	require.NoError(t, run([]string{"pack", "--plan", "t", "--role", "daemon-impl"}, &buf))
	assert.True(t, strings.HasPrefix(buf.String(), "<!-- kb:pack plan=t role=daemon-impl features=sessions touches=other -->\n"), buf.String())
	assert.Contains(t, buf.String(), "# Touched: other")

	buf.Reset()
	require.NoError(t, run([]string{"pack", "--plan", "t", "--role", "daemon-impl", "--touches", "third"}, &buf))
	assert.True(t, strings.HasPrefix(buf.String(), "<!-- kb:pack plan=t role=daemon-impl features=sessions touches=other,third -->\n"), buf.String())

	buf.Reset()
	require.NoError(t, run([]string{"pack", "--plan", "t", "--role", "daemon-impl", "--features", "sessions", "--touches", "third"}, &buf))
	assert.True(t, strings.HasPrefix(buf.String(), "<!-- kb:pack plan=t role=daemon-impl features=sessions touches=third -->\n"),
		"--features overrides both headers; --touches then adds: "+buf.String())
}

func TestRun_RefsReportsNothingToScanThenOneMissingReference(t *testing.T) {
	root := newRepo(t)
	t.Chdir(root)
	var buf bytes.Buffer
	require.NoError(t, run([]string{"refs", "--all"}, &buf))
	assert.Equal(t, "dead-refs: 0 references checked (nothing to scan in 4 file(s))\n", buf.String())

	write(t, root, "docs/dead.md", "`docs/nope.md`\n")
	buf.Reset()
	require.EqualError(t, run([]string{"refs", "docs/dead.md"}, &buf), "kb refs: 1 missing")
	assert.Equal(t, "docs/dead.md:1  docs/nope.md  missing (path)\ndead-refs: 1 references checked, 1 missing\n", buf.String())

	err := run([]string{"refs", "--all", "docs/dead.md"}, &buf)
	require.EqualError(t, err, "usage: kb refs [--all | --changed | FILE...]")
	assert.Equal(t, 2, exitCode(err))

	buf.Reset()
	git(t, root, "add", "docs/dead.md")
	require.EqualError(t, run([]string{"check"}, &buf), "kb check: 5 problem(s)", "check folds the dead reference in beside the generated-file findings (tracked files only)")
	assert.Contains(t, buf.String(), "docs/dead.md:1: reference `docs/nope.md` missing (path)\n")
}

func TestRun_ScopeAndOwners(t *testing.T) {
	root := newRepo(t)
	t.Chdir(root)
	var buf bytes.Buffer
	err := run([]string{"scope"}, &buf)
	require.EqualError(t, err, "usage: kb scope --plan NAME [--touch]")
	assert.Equal(t, 2, exitCode(err))
	assert.Equal(t, 1, exitCode(errors.New("anything else")))

	require.NoError(t, run([]string{"scope", "--plan", "p"}, &buf))
	assert.Equal(t, "features-scope: no changed source files\n", buf.String())

	buf.Reset()
	require.NoError(t, run([]string{"owners", "internal/sess/sess.go", "docs/x.md"}, &buf))
	assert.Equal(t, "internal/sess/sess.go\tsessions\ndocs/x.md\t-\n", buf.String())
	require.EqualError(t, run([]string{"owners"}, &buf), "usage: kb owners <path> [<path> ...]")
}
