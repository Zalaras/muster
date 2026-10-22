package triage

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The zero value must be the strict path. Asserted on the constant itself rather than through
// a fixture: a fixture that happens to render the right shape proves nothing about which path
// an unset Route names, and that is the property every Artifact literal in this package leans
// on.
func TestZeroPathIsRestricted(t *testing.T) {
	var p Path
	assert.Equal(t, PathRestricted, p, "the zero Path must be restricted, never normal")
	assert.Equal(t, "restricted", p.String())

	var a Artifact
	assert.Equal(t, PathRestricted, a.Route, "an Artifact with no Route set must render restricted")
}

func TestPathString(t *testing.T) {
	assert.Equal(t, "restricted", PathRestricted.String())
	assert.Equal(t, "normal", PathNormal.String())
	assert.Equal(t, "held", PathHeld.String())
	assert.Equal(t, "restricted", Path(99).String(), "an unknown ordinal must degrade to the strict path")
}

// Readable needs both halves. A restricted owner issue and a clean MEMBER issue are both
// shut; neither may be opened in the main session
// (kb:adr/triage-owner-filed-artifacts-readable-in-session).
func TestReadable(t *testing.T) {
	assert.True(t, Readable("OWNER", PathNormal))
	assert.False(t, Readable("MEMBER", PathNormal), "MEMBER is not the owner")
	assert.False(t, Readable("OWNER", PathRestricted))
	assert.False(t, Readable("OWNER", PathHeld))
	assert.False(t, Readable("CONTRIBUTOR", PathNormal))
	assert.False(t, Readable("", PathNormal))
}

func TestHeaderSafe(t *testing.T) {
	for _, tc := range []struct {
		name, in, want string
	}{
		{"plain", "No scrollbar on the shell", "No scrollbar on the shell"},
		{"asterisks go", "a **bold** title", "a bold title"},
		{"pipe becomes slash", "either | or", "either / or"},
		{"backtick becomes apostrophe", "the `shell` tab", "the 'shell' tab"},
		{"link syntax is broken up", "see [docs](http)", "see [docs) (http)"},
		{"newline collapses", "first\nsecond", "first second"},
		{"truncation marker collapses", "title" + TruncationMarker, "title [truncated]"},
		{"tabs and runs collapse", "a\t\t b  \n c", "a b c"},
		{"empty becomes a placeholder", "", "untitled"},
		{"whitespace only becomes a placeholder", "  \n\t ", "untitled"},
		{"asterisks only becomes a placeholder", "***", "untitled"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, HeaderSafe(tc.in))
		})
	}
}

func TestHeaderSafeTruncatesOnRunes(t *testing.T) {
	got := HeaderSafe(strings.Repeat("é", maxHeaderTitle*2))
	assert.Len(t, []rune(got), maxHeaderTitle+1, "cut on runes, then one ellipsis")
	assert.True(t, strings.HasSuffix(got, "…"))
}

// reHookHeader is the pre-commit hook's own header pattern, translated from BRE to RE2.
// The hook is the wall (docs/features/triage/spec.md); CheckEntryShape is laxer and passing
// it proves nothing about whether the commit will be accepted.
var reHookHeader = regexp.MustCompile(
	`^- \[[ xX]\] \*\*[^*]{1,}\*\* \(\[#(\d{1,})\]\(https://github\.com/[A-Za-z0-9_.-]{1,}/[A-Za-z0-9_.-]{1,}/issues/(\d{1,})\)\)`)

// A hostile title must still produce a header the hook accepts. Every character below arrives
// intact: Sanitize preserves markdown by design (doc.go § What survives), so HeaderSafe is the
// only thing between an author's title and a commit the hook refuses.
func TestRenderNormalSurvivesHostileTitles(t *testing.T) {
	for _, title := range []string{
		"a **bold** claim",
		"pipe | table | forge",
		"back`tick` span",
		"link [text](http://x) syntax",
		"newline\nsplit",
		"over-long " + strings.Repeat("word ", 60),
		"title" + TruncationMarker,
		"",
		"***",
		"&lt;script&gt; escaped already",
	} {
		t.Run(title[:min(len(title), 24)], func(t *testing.T) {
			e := RenderEntry(
				Artifact{Number: 45, Route: PathNormal, Title: title, AuthorAssociation: OwnerAssociation},
				sampleProposal(),
				"Zalaras/muster",
			)
			require.NoError(t, CheckEntryShape(e))

			header := strings.SplitN(e, "\n", 2)[0]
			m := reHookHeader.FindStringSubmatch(header)
			require.NotNil(t, m, "header does not match the pre-commit template:\n%s", header)
			assert.Equal(t, m[1], m[2], "the #N and the URL's N must agree")
			assert.NotContains(t, e, "<")
			assert.NotContains(t, e, ">")
		})
	}
}

func sampleProposal() Proposal {
	return Proposal{
		Kind: "bug", Area: []string{"shell"}, Modifiers: []string{"ux"},
		Symptom:  "The shell tab shows no scrollbar, so older output cannot be reached",
		Expected: "A scrollbar like the Focus terminal's.",
	}
}

func sampleArtifact(route Path) Artifact {
	return Artifact{
		Number: 45, Route: route, Title: "No scrollbar on the shell", AuthorAssociation: OwnerAssociation,
		CreatedAt: "2026-09-21T14:53:10Z",
		SnapshotFields: []KV{
			{Path: "musterd.version", Value: "0.21.1"},
			{Path: "claudeCode.installed", Value: "2.1.300"},
			{Path: "dashboard.view", Value: "focus"},
			{Path: "session.state", Value: "idle"},
		},
		Flags: Flags{Counts: Counts{Images: 1}},
	}
}

// One template, every path. Pinned byte for byte so a later edit cannot quietly reshape it.
func TestRenderEntryNormal(t *testing.T) {
	p := sampleProposal()
	p.ErrorString = "no scrollbar"
	e := RenderEntry(sampleArtifact(PathNormal), p, "Zalaras/muster")
	want := "- [ ] **No scrollbar on the shell** ([#45](https://github.com/Zalaras/muster/issues/45)) — The shell\n" +
		"  tab shows no scrollbar, so older output cannot be reached. Expected: A scrollbar like the Focus\n" +
		"  terminal's.\n" +
		"  Reported error: \"no scrollbar\".\n" +
		"  Filed 2026-09-21 from musterd 0.21.1 / Claude Code 2.1.300, focus view, session idle; 1 image attached.\n" +
		"  Labels: bug, shell, ux.\n"
	assert.Equal(t, want, e)
	assert.NoError(t, CheckEntryShape(e))
}

// A restricted entry is the same shape with the summary marked as unverified, so a later
// reader knows the sentences describe an outside report nobody checked.
func TestRenderEntryRestricted(t *testing.T) {
	a := sampleArtifact(PathRestricted)
	a.AuthorAssociation = "NONE"
	a.Flags.Images = 0
	e := RenderEntry(a, sampleProposal(), "Zalaras/muster")
	want := "- [ ] **No scrollbar on the shell** ([#45](https://github.com/Zalaras/muster/issues/45)) — Summary\n" +
		"  of an unverified report: The shell tab shows no scrollbar, so older output cannot be reached.\n" +
		"  Expected: A scrollbar like the Focus terminal's.\n" +
		"  Filed 2026-09-21 from musterd 0.21.1 / Claude Code 2.1.300, focus view, session idle.\n" +
		"  Labels: bug, shell, ux.\n"
	assert.Equal(t, want, e)
	assert.NotContains(t, e, "Reported error", "no quote, no line")
}

// The fact line is assembled from whatever validated; nothing invents a clause.
func TestFactLine(t *testing.T) {
	for _, tc := range []struct {
		name string
		a    Artifact
		want string
	}{
		{"nothing known", Artifact{}, ""},
		{"bad date is omitted", Artifact{CreatedAt: "yesterday"}, ""},
		{"date alone", Artifact{CreatedAt: "2026-10-15T07:35:54Z"}, "Filed 2026-10-15."},
		{"versions without a date", Artifact{SnapshotFields: []KV{{Path: "musterd.version", Value: "0.2.1"}}}, "From musterd 0.2.1."},
		{"retired schema has no installed version", Artifact{CreatedAt: "2026-09-01T11:56:43Z", SnapshotFields: []KV{{Path: "musterd.version", Value: "0.2.1"}, {Path: "claudeCode.pinned", Value: "2.0.1"}}}, "Filed 2026-09-01 from musterd 0.2.1."},
		{"images alone, plural", Artifact{Flags: Flags{Counts: Counts{Images: 3}}}, "3 images attached."},
		{"everything", sampleArtifact(PathNormal), "Filed 2026-09-21 from musterd 0.21.1 / Claude Code 2.1.300, focus view, session idle; 1 image attached."},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, factLine(tc.a))
		})
	}
}

// Long summaries wrap at the house width with every continuation indented, and the header
// — title and link — stays on one line however long the title, because that is the line
// the pre-commit hook matches.
func TestRenderEntryWraps(t *testing.T) {
	p := sampleProposal()
	p.Symptom = strings.Repeat("word ", 47) + "end"
	p.Expected = strings.Repeat("more ", 47) + "end"
	a := sampleArtifact(PathRestricted)
	a.Title = strings.Repeat("long title ", 12)
	e := RenderEntry(a, p, "Zalaras/muster")
	require.NoError(t, CheckEntryShape(e))
	lines := strings.Split(strings.TrimRight(e, "\n"), "\n")
	assert.NotNil(t, reHookHeader.FindStringSubmatch(lines[0]), "header split across lines:\n%s", lines[0])
	for i, ln := range lines[1:] {
		if strings.HasPrefix(ln, "  Filed ") || strings.HasPrefix(ln, "  Labels:") {
			continue
		}
		assert.LessOrEqual(t, len([]rune(ln)), wrapWidth, "line %d is over the wrap width: %q", i+2, ln)
	}
	assert.Equal(t, 1, strings.Count(e, "Expected:"))
}

// The hook itself, not a translation of it. TestRenderNormalSurvivesHostileTitles asserts
// against reHookHeader, which is a copy — this asserts the copy is honest by running the real
// script over a staged file in a scratch repo.
func TestPreCommitHookAcceptsARenderedNormalEntry(t *testing.T) {
	hook, err := filepath.Abs(filepath.Join("..", "..", ".githooks", "pre-commit"))
	require.NoError(t, err)
	if _, serr := os.Stat(hook); serr != nil {
		t.Skipf("hook not present: %v", serr)
	}

	a := sampleArtifact(PathNormal)
	a.Title = "pipe | star * tick ` link ](x)"
	p := sampleProposal()
	p.ErrorString = "no scrollbar"
	entry := RenderEntry(a, p, "Zalaras/muster")

	repo := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		// -c rather than `git config user.*`: a worktree shares .git/config with the real
		// repo, and the hook this test runs refuses a repo-local identity for that reason.
		cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
		out, cerr := cmd.CombinedOutput()
		require.NoError(t, cerr, "git %v: %s", args, out)
	}
	git("init", "-q")
	require.NoError(t, os.WriteFile(filepath.Join(repo, "TODO.md"), []byte("## Bugs\n\n"+entry), 0o644))
	git("add", "--", "TODO.md")

	cmd := exec.Command(hook)
	cmd.Dir = repo
	out, herr := cmd.CombinedOutput()
	assert.NoError(t, herr, "the hook refused a rendered normal entry:\n%s\n%s", entry, out)
}

// A dispatch row is what the main session reads, so a title may appear in one only when the
// artifact is readable: owner-filed and unflagged. Anything else keeps its enums alone, which
// is what stops a stranger's title reaching the session that holds Bash and Edit.
func TestWriteDispatchCarriesTitleOnlyWhenReadable(t *testing.T) {
	dir := t.TempDir()
	arts := []Artifact{
		{Number: 1, Nonce: "n1", Route: PathNormal, AuthorAssociation: "OWNER", Title: "owner filed this"},
		{Number: 2, Nonce: "n2", Route: PathNormal, AuthorAssociation: "MEMBER", Title: "member filed this"},
		{Number: 3, Nonce: "n3", Route: PathRestricted, AuthorAssociation: "OWNER", Title: "flagged body"},
		{Number: 4, Nonce: "n4", Route: PathRestricted, AuthorAssociation: "NONE", Title: "stranger filed this"},
		{Number: 5, Nonce: "n5", Route: PathHeld, AuthorAssociation: "OWNER", Title: "tripwire hit"},
	}
	require.NoError(t, WriteDispatch(dir, arts))

	raw, err := os.ReadFile(filepath.Join(dir, DispatchFile))
	require.NoError(t, err)
	var rows []Dispatch
	require.NoError(t, json.Unmarshal(raw, &rows))

	byNum := map[int]Dispatch{}
	for _, r := range rows {
		byNum[r.Number] = r
	}
	require.Len(t, rows, 4, "a held issue never reaches dispatch at all")
	assert.NotContains(t, byNum, 5)

	assert.True(t, byNum[1].Readable)
	assert.Equal(t, "owner filed this", byNum[1].Title)

	for _, n := range []int{2, 3, 4} {
		assert.False(t, byNum[n].Readable, "issue %d must not be readable", n)
		assert.Empty(t, byNum[n].Title, "issue %d must carry no title", n)
	}
	assert.NotContains(t, string(raw), "member filed this")
	assert.NotContains(t, string(raw), "stranger filed this")
	assert.NotContains(t, string(raw), "tripwire hit")
}
