package kb

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const fixtureOtherSpec = `---
id: other
type: spec
status: active
date: 2026-08-30
summary: The other feature.
features: [other]
go: [internal/other/**]
---
Other body.
`

// scopeRoot is the kb fixture plus a second feature and a plan naming only sessions, on a
// plan branch that added a file of the other feature, with the working tree dirty too.
func scopeRoot(t *testing.T) string {
	t.Helper()
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/features/other/spec.md", fixtureOtherSpec)
	mustWriteFile(t, root, "internal/other/keep.go", "package other\n")
	mustWriteFile(t, root, "plans/p/plan.md", "# Plan\n\n**Status**: approved\n**Features**: sessions\n\nBody.\n")
	newGitRepo(t, root)
	gitFx(t, root, "checkout", "-q", "-b", "plan/p")
	mustWriteFile(t, root, "internal/other/x.go", "package other\n")
	mustWriteFile(t, root, "web/src/protocol.ts", "export {}\n")
	gitFx(t, root, "add", "-A")
	gitFx(t, root, "commit", "-q", "-m", "branch work")
	mustWriteFile(t, root, "internal/sess/new.go", "package sess\n")
	mustWriteFile(t, root, "internal/sess/CLAUDE.md", "# sess\n\nEdited.\n")
	mustRemove(t, root, "web/e2e/sess.spec.ts")
	return root
}

func runScope(t *testing.T, root string, touch bool) (string, int) {
	t.Helper()
	ix, _ := loadFixture(t, root)
	var buf bytes.Buffer
	n, err := Scope(ix, ScopeOptions{Plan: "p", Touch: touch}, &buf)
	require.NoError(t, err)
	return buf.String(), n
}

func TestScope_ReportsAChangedFileWhoseOwnerIsInNeitherHeader(t *testing.T) {
	root := scopeRoot(t)
	out, n := runScope(t, root, false)
	assert.Equal(t, 1, n)
	assert.Equal(t, "internal/other/x.go → feature 'other', in neither **Features** (sessions) nor **Touches** ()\n"+
		"Run with --touch to add each missing owner to **Touches** (packs spec and contract only, no stop).\n", out)
	assert.Equal(t, "# Plan\n\n**Status**: approved\n**Features**: sessions\n\nBody.\n", mustReadFile(t, root, "plans/p/plan.md"), "without --touch the plan is untouched")
}

func TestScope_TouchWidensTheTouchesHeaderWithoutDuplicates(t *testing.T) {
	root := scopeRoot(t)
	out, n := runScope(t, root, true)
	assert.Equal(t, 0, n)
	assert.Equal(t, "features-scope: touched other for internal/other/x.go (plan.md edited — commit it as docs(p): touch other)\n"+
		"features-scope: every changed source file's feature is in **Features** (sessions) or **Touches** (other)\n", out)
	assert.Equal(t, "# Plan\n\n**Status**: approved\n**Features**: sessions\n**Touches**: other\n\nBody.\n", mustReadFile(t, root, "plans/p/plan.md"))

	mustWriteFile(t, root, "docs/features/third/spec.md", "---\nid: third\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: Third.\nfeatures: [third]\ngo: [internal/third/**]\n---\nBody.\n")
	mustWriteFile(t, root, "internal/third/t.go", "package third\n")
	out, n = runScope(t, root, true)
	assert.Equal(t, 0, n)
	assert.Contains(t, out, "features-scope: touched third for internal/third/t.go")
	assert.Equal(t, "# Plan\n\n**Status**: approved\n**Features**: sessions\n**Touches**: other, third\n\nBody.\n", mustReadFile(t, root, "plans/p/plan.md"))
	_, n = runScope(t, root, true)
	assert.Equal(t, 0, n)
	assert.Equal(t, "# Plan\n\n**Status**: approved\n**Features**: sessions\n**Touches**: other, third\n\nBody.\n", mustReadFile(t, root, "plans/p/plan.md"), "a third run appends nothing")
}

func TestScope_PassesWhenNothingChangedAndFailsOnAMissingPlan(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "plans/p/plan.md", "# Plan\n\n**Features**: sessions\n")
	newGitRepo(t, root)
	out, n := runScope(t, root, false)
	assert.Equal(t, 0, n)
	assert.Equal(t, "features-scope: no changed source files\n", out)

	ix, _ := loadFixture(t, root)
	_, err := Scope(ix, ScopeOptions{Plan: "nope"}, &bytes.Buffer{})
	require.ErrorIs(t, err, ErrUsage)
	require.EqualError(t, err, "usage: kb scope --plan NAME [--touch] (plans/nope/plan.md must exist)")
	_, err = Scope(ix, ScopeOptions{}, &bytes.Buffer{})
	require.ErrorIs(t, err, ErrUsage)
}

func TestOwners_PrintsOneTabSeparatedLinePerPath(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/features/other/spec.md", "---\nid: other\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: Other.\nfeatures: [other]\ngo: [internal/sess/sess.go]\n---\nBody.\n")
	ix, _ := loadFixture(t, root)
	var buf bytes.Buffer
	require.NoError(t, Owners(ix, []string{"internal/sess/sess.go", "internal/sess/later.go", "docs/x.md"}, &buf))
	assert.Equal(t, "internal/sess/sess.go\tother,sessions\ninternal/sess/later.go\tsessions\ndocs/x.md\t-\n", buf.String(),
		"owners by feature name; a path that does not exist yet is judged by the globs it will match")
}
