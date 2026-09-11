package kb

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_BuildsFeaturesFromSpecRecordsAndIndexesRecordsByFeature(t *testing.T) {
	root := newKBRoot(t)
	ix, findings := loadFixture(t, root)
	require.Empty(t, findings)

	require.Len(t, ix.Features, 1)
	f := ix.Features[0]
	assert.Equal(t, "sessions", f.Name)
	assert.Equal(t, "Session list, pinning and ordering.", f.Summary)
	assert.Equal(t, []string{"internal/sess/**"}, f.Go)
	assert.Equal(t, []string{"web/e2e/sess.spec.ts"}, f.E2E)
	assert.Equal(t, []string{"sessions.pin", "sessions.order"}, f.Protocol)
	assert.Same(t, f.Spec, ix.ByID["sessions"])

	var ids []string
	for _, r := range ix.ByFeature["sessions"] {
		ids = append(ids, r.ID)
	}
	assert.ElementsMatch(t, []string{"sessions", "pin-order", "old-pin", "statusline-cadence"}, ids)
	assert.Len(t, ix.Records, 5)
	assert.Equal(t, "docs/adr/old-pin.md", ix.Records[0].Path, "records are sorted by path")
	assert.Equal(t, []string{"sessions", "sessions.pin", "sessions.order"}, ix.AnchorOrder)
	assert.True(t, ix.InTree("internal/sess/sess.go"))
}

func TestLoad_ReportsEveryBrokenRecordInsteadOfStoppingAtTheFirst(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/adr/broken-one.md", "no frontmatter at all\n")
	mustWriteFile(t, root, "docs/rules/broken-two.md", "---\nid: broken-two\ntype: rule\nstatus: bogus\ndate: 2026-08-30\nsummary: s\n---\n")
	mustWriteFile(t, root, "docs/runbooks/broken-three.md", "---\nid: broken-three\n")
	ix, findings := loadFixture(t, root)
	var msgs []string
	for _, f := range findings {
		msgs = append(msgs, f.String())
	}
	assert.ElementsMatch(t, []string{
		"docs/adr/broken-one.md:1: no frontmatter: file does not start with ---",
		`docs/rules/broken-two.md:4: status "bogus" is not valid for a rule (want active, draft or retired)`,
		"docs/runbooks/broken-three.md: frontmatter never closed (no second --- line)",
	}, msgs)
	assert.Len(t, ix.Records, 8, "broken records still occupy the index so ids resolve")
	assert.Equal(t, TypeDecision, ix.ByID["broken-one"].Type)
}

func TestLoad_FailsANonRecordMarkdownFileInsideARecordDirectory(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/features/sessions/notes.md", "# stray\n")
	mustWriteFile(t, root, "docs/lessons/README.md", "# not a record\n")
	_, findings := loadFixture(t, root)
	var msgs []string
	for _, f := range findings {
		msgs = append(msgs, f.String())
	}
	assert.ElementsMatch(t, []string{
		"docs/features/sessions/notes.md: is not a record (a feature directory holds spec.md plus the generated INDEX.md and contract.md)",
		"docs/lessons/README.md:1: no frontmatter: file does not start with ---",
	}, msgs)
}

func TestLoad_IgnoresGeneratedBasenamesUnderFeaturesAndNonRecordDocs(t *testing.T) {
	root := newKBRoot(t)
	runGen(t, root)
	mustWriteFile(t, root, "docs/design/thing.md", "# design, not a record\n")
	mustWriteFile(t, root, "docs/overview.md", "# loose doc\n")
	mustWriteFile(t, root, "docs/adr/notes.txt", "not markdown\n")
	ix, findings := loadFixture(t, root)
	assert.Empty(t, findings)
	assert.Len(t, ix.Records, 5)
}

func TestLoad_ReadsTheObservedVersionRangeFromDisk(t *testing.T) {
	root := newKBRoot(t)
	ix, _ := loadFixture(t, root)
	assert.Equal(t, "2.1.246", ix.Floor)
	assert.Equal(t, "2.1.267", ix.Verified)

	mustWriteFile(t, root, "internal/claudecode/observed_versions.txt", "2.1.267 2026-09-10 a\n2.1.240 2026-08-01 b\n2.1.300 2026-09-20 c\n")
	ix, _ = loadFixture(t, root)
	assert.Equal(t, "2.1.240", ix.Floor)
	assert.Equal(t, "2.1.300", ix.Verified)

	mustRemove(t, root, "internal/claudecode/observed_versions.txt")
	_, _, err := Load(root)
	require.Error(t, err, "a missing record file is an I/O error, not a finding")
}

func TestLoad_ReportsAFeatureDirectoryWithoutASpecAndANonSlugName(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/features/old/INDEX.md", "leftover\n")
	mustWriteFile(t, root, "docs/features/Bad_Name/spec.md", fixtureSpec)
	_, findings := loadFixture(t, root)
	var msgs []string
	for _, f := range findings {
		msgs = append(msgs, f.String())
	}
	assert.Contains(t, msgs, "docs/features/old/: directory has no spec.md")
	assert.Contains(t, msgs, "docs/features/Bad_Name/: feature directory name is not a slug")
}
