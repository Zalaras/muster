package kb

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func mustWriteFile(t *testing.T, root, rel, content string) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	require.NoError(t, os.MkdirAll(filepath.Dir(p), 0o755))
	require.NoError(t, os.WriteFile(p, []byte(content), 0o644))
}

func mustReadFile(t *testing.T, root, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	require.NoError(t, err)
	return string(b)
}

// edit replaces old with new in one fixture file, failing if old is absent.
func edit(t *testing.T, root, rel, oldText, newText string) {
	t.Helper()
	cur := mustReadFile(t, root, rel)
	require.Contains(t, cur, oldText, "edit target must exist in %s", rel)
	mustWriteFile(t, root, rel, strings.Replace(cur, oldText, newText, 1))
}

func mustRemove(t *testing.T, root, rel string) {
	t.Helper()
	require.NoError(t, os.RemoveAll(filepath.Join(root, filepath.FromSlash(rel))))
}

const fixtureProtocol = `# Protocol

## 1. Conventions

Intro text.

<!-- kb:anchor sessions -->
## 3. HTTP endpoints — UI

Overview of the endpoints.

<!-- kb:anchor sessions.pin -->
### 3.10 ` + "`PUT /api/sessions/{id}/pin`" + `

Pin body line.

` + "```" + `
## not a heading
` + "```" + `

<!-- kb:anchor sessions.order -->
### 3.11 Order

Order body line.

## 4. WebSocket

Socket text.
`

const fixtureSpec = `---
id: sessions
type: spec
status: active
date: 2026-08-30
summary: Session list, pinning and ordering.
features: [sessions]
go: [internal/sess/**]
e2e: [web/e2e/sess.spec.ts]
protocol: [sessions.pin, sessions.order]
---
# Sessions

The sessions feature keeps the rail ordered.
`

const fixturePinOrder = `---
id: pin-order
type: decision
status: accepted
date: 2026-08-30
summary: Pinned sessions keep their relative order.
features: [sessions]
tags: [ux]
files: [internal/sess/**]
tests: [TestSess_PinKeepsOrder, web/e2e/sess.spec.ts]
refs: ["#12", https://example.invalid/pin]
supersedes: [old-pin]
---
Pinning must never reorder the rail.
`

const fixtureOldPin = `---
id: old-pin
type: decision
status: superseded
date: 2026-08-01
summary: Pinned sessions float to the top.
features: [sessions]
---
Superseded by the ordering decision.
`

const fixtureFact = `---
id: statusline-cadence
type: fact
status: active
date: 2026-08-30
summary: The status line posts about every 300 ms while a turn is running.
features: [sessions]
files: [internal/sess/sess.go]
verified: 2.1.246..2.1.267
guard: TestSess_PinKeepsOrder
---
Measured on the canary rig.
`

const fixtureLesson = `---
id: resize-twice
type: lesson
status: active
date: 2026-08-30
summary: Resize the pty and the tmux window together or the pane drifts.
roles: [daemon-impl]
---
Call both, in that order.
`

// newKBRoot builds the design §12 fixture: one feature, two decisions, one fact, one
// lesson, three protocol anchors, one code citation and two CLAUDE.md fragments.
func newKBRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	mustWriteFile(t, root, "go.mod", "module example.invalid/fixture\n\ngo 1.27\n")
	mustWriteFile(t, root, "internal/claudecode/observed_versions.txt",
		"2.1.246 2026-08-29 m4-canary\n2.1.267 2026-09-10 canary-full-coverage\n")
	mustWriteFile(t, root, "docs/protocol.md", fixtureProtocol)
	mustWriteFile(t, root, "docs/features/sessions/spec.md", fixtureSpec)
	mustWriteFile(t, root, "internal/sess/sess.go",
		"package sess\n\n// Pin keeps the order (kb:adr/pin-order).\nfunc Pin() {}\n")
	mustWriteFile(t, root, "internal/sess/sess_test.go",
		"package sess\n\nimport \"testing\"\n\nfunc TestSess_PinKeepsOrder(t *testing.T) {}\n")
	mustWriteFile(t, root, "web/e2e/sess.spec.ts", "// e2e\n")
	mustWriteFile(t, root, "docs/adr/pin-order.md", fixturePinOrder)
	mustWriteFile(t, root, "docs/adr/old-pin.md", fixtureOldPin)
	mustWriteFile(t, root, "docs/facts/statusline-cadence.md", fixtureFact)
	mustWriteFile(t, root, "docs/lessons/resize-twice.md", fixtureLesson)
	mustWriteFile(t, root, "CLAUDE.md",
		"# Fixture\n\nRules.\n\n<!-- kb:features -->\n<!-- /kb:features -->\n\nMore rules.\n")
	mustWriteFile(t, root, "internal/sess/CLAUDE.md",
		"# sess\n\nPackage notes.\n\n<!-- kb:trailer -->\n<!-- /kb:trailer -->\n")
	return root
}

// loadFixture loads root and fails on an I/O error.
func loadFixture(t *testing.T, root string) (*Index, []Finding) {
	t.Helper()
	ix, findings, err := Load(root)
	require.NoError(t, err)
	return ix, findings
}

// runGen regenerates every generated file in root and returns the paths written.
func runGen(t *testing.T, root string) []string {
	t.Helper()
	ix, findings := loadFixture(t, root)
	require.Empty(t, findings, "fixture must load clean before gen")
	outs, fragFindings, err := Outputs(ix)
	require.NoError(t, err)
	require.Empty(t, fragFindings)
	written, err := Apply(root, outs)
	require.NoError(t, err)
	return written
}

// runCheck loads and checks root, returning the findings as strings.
func runCheck(t *testing.T, root string) []string {
	t.Helper()
	ix, findings, err := Load(root)
	require.NoError(t, err)
	all, err := Check(ix, findings)
	require.NoError(t, err)
	out := make([]string, 0, len(all))
	for _, f := range all {
		out = append(out, f.String())
	}
	return out
}
