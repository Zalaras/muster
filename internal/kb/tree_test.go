package kb

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWalkTree_SkipsGitNodeModulesDistAndBinAndReturnsSlashPaths(t *testing.T) {
	root := t.TempDir()
	for _, rel := range []string{
		"go.mod", "internal/a/a.go", ".git/HEAD", "web/node_modules/x/index.js", "web/dist/app.js",
		"dist/musterd", "bin/tool", "internal/webui/assets/app.js", ".claude/rules/x.md",
		".hidden/secret.md", ".github/workflows/ci.yml", ".gitignore",
	} {
		mustWriteFile(t, root, rel, "x")
	}
	got, err := WalkTree(root)
	require.NoError(t, err)
	assert.Equal(t, []string{".claude/rules/x.md", ".github/workflows/ci.yml", ".gitignore", "go.mod", "internal/a/a.go"}, got)
}

func TestCommentLines_UsesTheDeadRefsRuleSetPerFileType(t *testing.T) {
	md := "prose kb:adr/a\n```\nfenced kb:adr/b\n```\nafter\n~~~\nalso fenced\n~~~\ntail\n"
	var mdTexts []string
	for _, ln := range CommentLines("docs/x.md", md) {
		mdTexts = append(mdTexts, ln.Text)
	}
	assert.Equal(t, []string{"prose kb:adr/a", "after", "tail", ""}, mdTexts)

	goSrc := "package x\n\n// line comment\nfunc f() { s := \"kb:adr/in-code\" }\n/* block\n * inner\n */\n"
	var goLines []int
	for _, ln := range CommentLines("internal/x.go", goSrc) {
		goLines = append(goLines, ln.N)
	}
	assert.Equal(t, []int{3, 5, 6, 7}, goLines)

	ts := "const a = 1; // trailing is not a comment line\n  // indented comment\n"
	tsLines := CommentLines("web/src/x.ts", ts)
	require.Len(t, tsLines, 1)
	assert.Equal(t, 2, tsLines[0].N)

	assert.Empty(t, CommentLines("scripts/x.sh", "# kb:adr/a\n"), "other file types carry no citations")
}
