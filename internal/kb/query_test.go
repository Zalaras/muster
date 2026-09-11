package kb

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFor_ListsCoveringFeaturesThenMatchingRecordsForARepoPath(t *testing.T) {
	root := newKBRoot(t)
	ix, _ := loadFixture(t, root)
	var buf bytes.Buffer
	require.NoError(t, For(ix, "internal/sess/sess.go", &buf))
	out := buf.String()
	assert.True(t, strings.HasPrefix(out, "features:\n  sessions — Session list, pinning and ordering. (docs/features/sessions/spec.md, docs/features/sessions/contract.md)\nrecords:\n"), out)
	assert.Less(t, strings.Index(out, "kb:adr/pin-order"), strings.Index(out, "kb:fact/statusline-cadence"), "type order")
	assert.Contains(t, out, "(docs/adr/pin-order.md)")
	assert.NotContains(t, out, "old-pin", "superseded records are not live")

	buf.Reset()
	require.NoError(t, For(ix, "internal/sess/other.go", &buf))
	assert.Contains(t, buf.String(), "kb:adr/pin-order", "the decision's files glob covers the directory")
	assert.NotContains(t, buf.String(), "statusline-cadence", "the fact names one file only")

	buf.Reset()
	require.NoError(t, For(ix, "cmd/x.go", &buf))
	assert.Equal(t, "kb: nothing covers cmd/x.go\n", buf.String())
}

func TestRelPath_AcceptsAbsoluteAndRelativePathsAndNormalisesToSlashForm(t *testing.T) {
	root := t.TempDir()
	got, err := RelPath(root, filepath.Join(root, "internal"), "sess/sess.go")
	require.NoError(t, err)
	assert.Equal(t, "internal/sess/sess.go", got)

	got, err = RelPath(root, root, filepath.Join(root, "web", "src", "a.ts"))
	require.NoError(t, err)
	assert.Equal(t, "web/src/a.ts", got)

	got, err = RelPath(root, filepath.Join(root, "internal", "sess"), "../../docs/protocol.md")
	require.NoError(t, err)
	assert.Equal(t, "docs/protocol.md", got)

	_, err = RelPath(root, root, "../outside.md")
	require.Error(t, err)
}

func TestWhy_OrdersDecisionsAndFactsNewestFirstAndFallsBackToFeatureSummaries(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/adr/newer.md", "---\nid: newer\ntype: decision\nstatus: accepted\ndate: 2026-09-05\nsummary: A newer decision.\nfiles: [internal/sess/sess.go]\n---\n")
	mustWriteFile(t, root, "docs/adr/proposed.md", "---\nid: proposed\ntype: decision\nstatus: proposed\ndate: 2026-09-06\nsummary: Not yet accepted.\nfiles: [internal/sess/sess.go]\n---\n")
	ix, _ := loadFixture(t, root)
	var buf bytes.Buffer
	require.NoError(t, Why(ix, "internal/sess/sess.go", &buf))
	lines := strings.Split(strings.TrimRight(buf.String(), "\n"), "\n")
	require.Len(t, lines, 3)
	assert.True(t, strings.HasPrefix(lines[0], "2026-09-05  kb:adr/newer"), lines[0])
	assert.True(t, strings.HasPrefix(lines[1], "2026-08-30  kb:adr/pin-order"), lines[1])
	assert.True(t, strings.HasPrefix(lines[2], "2026-08-30  kb:fact/statusline-cadence"), lines[2])
	assert.NotContains(t, buf.String(), "proposed")

	buf.Reset()
	require.NoError(t, Why(ix, "web/e2e/sess.spec.ts", &buf))
	assert.Equal(t, "kb: no decision or fact names web/e2e/sess.spec.ts; the features covering it say:\n  sessions — Session list, pinning and ordering. (docs/features/sessions/spec.md)\n", buf.String())

	buf.Reset()
	require.NoError(t, Why(ix, "cmd/x.go", &buf))
	assert.Equal(t, "kb: nothing covers cmd/x.go\n", buf.String())
}

func TestFind_RequiresEveryWordCaseInsensitively(t *testing.T) {
	root := newKBRoot(t)
	ix, _ := loadFixture(t, root)
	var buf bytes.Buffer
	require.NoError(t, Find(ix, []string{"PINNED", "relative"}, &buf))
	assert.Contains(t, buf.String(), "kb:adr/pin-order")
	assert.NotContains(t, buf.String(), "kb:adr/old-pin", "old-pin has pinned but not relative")

	buf.Reset()
	require.NoError(t, Find(ix, []string{"canary"}, &buf))
	assert.Contains(t, buf.String(), "kb:fact/statusline-cadence", "body text is searched")

	buf.Reset()
	require.NoError(t, Find(ix, []string{"ux"}, &buf))
	assert.Contains(t, buf.String(), "kb:adr/pin-order", "tags are searched")

	buf.Reset()
	require.NoError(t, Find(ix, []string{"zzz"}, &buf))
	assert.Equal(t, "kb: no record matches zzz\n", buf.String())

	require.Error(t, Find(ix, nil, &buf))
}

func TestLs_FiltersByTypePrefixFeatureStatusRoleAndGuard(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/facts/unguarded.md", "---\nid: unguarded\ntype: fact\nstatus: active\ndate: 2026-08-30\nsummary: No guard.\nverified: 2.1.246..canary\nguard: none\n---\n")
	ix, _ := loadFixture(t, root)
	cases := []struct {
		name   string
		filter ListFilter
		want   []string
	}{
		{"all", ListFilter{}, []string{"kb:spec/sessions", "kb:adr/old-pin", "kb:adr/pin-order", "kb:fact/statusline-cadence", "kb:fact/unguarded", "kb:lesson/resize-twice"}},
		{"type by prefix", ListFilter{Type: "adr"}, []string{"kb:adr/old-pin", "kb:adr/pin-order"}},
		{"type by name", ListFilter{Type: "decision"}, []string{"kb:adr/old-pin", "kb:adr/pin-order"}},
		{"feature", ListFilter{Feature: "sessions", Type: "fact"}, []string{"kb:fact/statusline-cadence"}},
		{"status", ListFilter{Status: "superseded"}, []string{"kb:adr/old-pin"}},
		{"role", ListFilter{Role: "daemon-impl"}, []string{"kb:lesson/resize-twice"}},
		{"guard none", ListFilter{Guard: "none"}, []string{"kb:fact/unguarded"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			require.NoError(t, List(ix, tc.filter, &buf))
			var tokens []string
			for _, ln := range strings.Split(strings.TrimRight(buf.String(), "\n"), "\n") {
				if ln == "" {
					continue
				}
				tokens = append(tokens, strings.Fields(ln)[1])
			}
			assert.Equal(t, tc.want, tokens)
		})
	}
	var buf bytes.Buffer
	require.EqualError(t, List(ix, ListFilter{Type: "note"}, &buf), `unknown type "note" (want rule, decision, spec, fact, lesson, runbook or reference)`)
	require.Error(t, List(ix, ListFilter{Guard: "TestX"}, &buf))
}

func TestShowAndCite_NameTheNearestRemedyForAnUnknownID(t *testing.T) {
	root := newKBRoot(t)
	ix, _ := loadFixture(t, root)
	var buf bytes.Buffer
	require.EqualError(t, Show(ix, "hook-lifetim", &buf), `no record with id "hook-lifetim" (try: kb find hook-lifetim)`)
	require.EqualError(t, Cite(ix, "hook-lifetim", &buf), `no record with id "hook-lifetim" (try: kb find hook-lifetim)`)

	require.NoError(t, Cite(ix, "pin-order", &buf))
	assert.Equal(t, "kb:adr/pin-order\ndocs/adr/pin-order.md\n", buf.String())

	buf.Reset()
	require.NoError(t, Show(ix, "statusline-cadence", &buf))
	assert.Equal(t, "## fact statusline-cadence — The status line posts about every 300 ms while a turn is running.\n"+
		"_active · 2026-08-30 · verified 2.1.246..2.1.267 · features: sessions · files: internal/sess/sess.go · cite: kb:fact/statusline-cadence_\n\nMeasured on the canary rig.\n", buf.String())

	edit(t, root, "docs/facts/statusline-cadence.md", "verified: 2.1.246..2.1.267", "verified: 2.1.246..canary")
	ix, _ = loadFixture(t, root)
	buf.Reset()
	require.NoError(t, Show(ix, "statusline-cadence", &buf))
	assert.Contains(t, buf.String(), "verified 2.1.246..2.1.267", "the word canary renders as the observed ceiling")
}
