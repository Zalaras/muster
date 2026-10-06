package commentpass

import (
	"context"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStrip_FindsExactlyTheAddedBlocks(t *testing.T) {
	p, out, _ := newFixture(t)
	_, m := strip(t, p)

	want := map[string][]string{
		"internal/a/a.go#1":   {"// leading block line one", "// leading block line two"},
		"internal/a/a.go#2":   {"// edited first line", "// second line"},
		"internal/a/a.go#3":   {"// added trailing"},
		"internal/a/a.go#4":   {"// NewFn is new."},
		"internal/b/b.go#1":   {"// uses Helper to do x"},
		"internal/c/new.go#1": {"// NewThing is untracked."},
		"internal/c/new.go#2": {"// trailing in untracked"},
		"web/src/app.ts#1":    {"// added ts comment"},
		"web/src/app.ts#2":    {"/** doc on newFn */"},
		"web/src/app.ts#3":    {"// added trailing ts"},
	}
	got := map[string][]string{}
	for _, f := range m.Files {
		for _, c := range f.Candidates {
			got[c.ID] = c.Lines
		}
	}
	assert.Equal(t, want, got)
	assert.Equal(t, "added", candidateByID(m, "internal/a/a.go#1").Origin)
	assert.Equal(t, KindSegment, candidateByID(m, "internal/a/a.go#3").Kind)
	assert.Equal(t, "func NewFn", candidateByID(m, "internal/a/a.go#4").Doc)
	assert.Equal(t, "export function newFn", candidateByID(m, "web/src/app.ts#2").Doc)
	assert.Contains(t, out.String(), "strip: 10 candidates in 4 files (8 added, 1 edited, 1 stale-ref; 0 already kept)")
}

func TestStrip_DirectivesNeverAppearAndSurvive(t *testing.T) {
	p, _, root := newFixture(t)
	_, m := strip(t, p)

	for _, f := range m.Files {
		for _, c := range f.Candidates {
			for _, l := range c.Lines {
				assert.False(t, isDirective(l), "%s carries a directive line %q", c.ID, l)
			}
		}
	}
	assert.Contains(t, readFx(t, root, "internal/a/a.go"), "//nolint:mnd // reason")
	assert.Contains(t, readFx(t, root, "internal/a/embed.go"), "//go:embed assets")
	ts := readFx(t, root, "web/src/app.ts")
	assert.Contains(t, ts, "// biome-ignore lint/suspicious/noExplicitAny: why")
	assert.Contains(t, ts, "// @ts-expect-error")
	assert.NotContains(t, ts, "added ts comment")
	assert.NotContains(t, ts, "doc on newFn")
	assert.NotContains(t, ts, "added trailing ts")
}

func TestStrip_StaleReferenceCandidate(t *testing.T) {
	p, _, _ := newFixture(t)
	_, m := strip(t, p)

	c := candidateByID(m, "internal/b/b.go#1")
	assert.Equal(t, "stale-ref", c.Origin)
	assert.Equal(t, []string{"Helper"}, c.Names)
}

func TestStrip_EditedBlockIsWholeWithPrevious(t *testing.T) {
	p, _, _ := newFixture(t)
	_, m := strip(t, p)

	c := candidateByID(m, "internal/a/a.go#2")
	assert.Equal(t, "edited", c.Origin)
	assert.Equal(t, 1, c.Added)
	assert.Equal(t, 2, c.Total)
	assert.Contains(t, c.Previous, "// about to be edited")
}

func TestStrip_UntrackedFileEveryCommentAdded(t *testing.T) {
	p, _, _ := newFixture(t)
	_, m := strip(t, p)

	var entry FileEntry
	for _, f := range m.Files {
		if f.Path == "internal/c/new.go" {
			entry = f
		}
	}
	assert.Len(t, entry.Candidates, 2)
	assert.Equal(t, untrackedCGo, entry.Original)
}

func TestStrip_UncommittedEditIsAddedAndDirty(t *testing.T) {
	p, _, root := newFixture(t)
	writeFx(t, root, "cmd/m/main.go", "package main\n\n// unstaged why\nfunc main() {}\n")
	_, m := strip(t, p)

	var entry FileEntry
	for _, f := range m.Files {
		if f.Path == "cmd/m/main.go" {
			entry = f
		}
	}
	require.Len(t, entry.Candidates, 1)
	assert.Equal(t, []string{"// unstaged why"}, entry.Candidates[0].Lines)
	assert.True(t, entry.Dirty)
}

func TestStrip_WritesFormattedTreeAndArtifacts(t *testing.T) {
	p, _, root := newFixture(t)
	dir, m := strip(t, p)

	md := readFx(t, dir, "candidates.md")
	for _, f := range m.Files {
		live := readFx(t, root, f.Path)
		assert.Equal(t, sha([]byte(live)), f.StrippedSHA, f.Path)
		if strings.HasSuffix(f.Path, ".go") {
			_, err := parser.ParseFile(token.NewFileSet(), "", live, 0)
			require.NoError(t, err, f.Path)
			formatted, err := format.Source([]byte(live))
			require.NoError(t, err)
			assert.Equal(t, live, string(formatted), "%s is not gofmt-clean after strip", f.Path)
		}
		assert.Equal(t, 1, strings.Count(md, "## "+f.Path+" ("), "file shown once")
		for _, c := range f.Candidates {
			assert.Contains(t, md, "### "+c.ID+" —")
			assert.Contains(t, md, strings.Join(c.Lines, "\n"))
		}
	}
	a := candidateByID(m, "internal/a/a.go#1")
	assert.Equal(t, "above", a.Anchor.Kind)
	assert.Equal(t, "x := 1 // pre-existing trailing", a.Anchor.Text)
	assert.Equal(t, lineOf(t, readFx(t, root, "internal/a/a.go"), "x := 1 // pre-existing trailing"), a.Anchor.Line)
	assert.Contains(t, md, "names removed by the branch: `Helper`")
	assert.Contains(t, md, "previously:")
}

func TestStrip_ZeroCandidatesWritesNothing(t *testing.T) {
	p, out, root := newDirectiveOnlyFixture(t)
	before := readFx(t, root, "internal/b/b.go")
	dir := filepath.Join(t.TempDir(), "out")

	require.NoError(t, p.Strip(context.Background(), dir, false))

	assert.Contains(t, out.String(), "strip: 0 candidates")
	_, err := os.Stat(dir)
	assert.True(t, os.IsNotExist(err), "no out dir")
	assert.Equal(t, before, readFx(t, root, "internal/b/b.go"))
}

func TestStrip_SkipsLedgerKeepsUnlessAll(t *testing.T) {
	p, out, _ := newFixture(t)
	dir, m := strip(t, p)
	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, keepAll(m)), "", 1, "chore(x): comment pass cycle 1"))

	out.Reset()
	require.NoError(t, p.Strip(context.Background(), t.TempDir(), false))
	assert.Contains(t, out.String(), "strip: 0 candidates (10 already kept")

	dir2 := t.TempDir()
	require.NoError(t, p.Strip(context.Background(), dir2, true))
	assert.Len(t, allIDs(readManifest(t, dir2)), 10)
}

func TestStrip_RefusesOffBranchAndUnparseable(t *testing.T) {
	p, _, root := newFixture(t)
	gitFx(t, root, "checkout", "-q", "main")
	err := p.Strip(context.Background(), t.TempDir(), false)
	require.ErrorContains(t, err, "on branch main, want plan/x")

	gitFx(t, root, "checkout", "-q", "plan/x")
	require.NoError(t, os.WriteFile(filepath.Join(root, "cmd/m/main.go"), []byte("package main\n\n// broken\nfunc main() { \"unterminated\n"), 0o644))
	before := readFx(t, root, "internal/a/a.go")
	err = p.Strip(context.Background(), t.TempDir(), false)
	require.ErrorContains(t, err, "cmd/m/main.go")
	assert.Equal(t, before, readFx(t, root, "internal/a/a.go"), "nothing written")
}

func TestApply_KeepAllIsByteIdentical(t *testing.T) {
	p, _, root := newFixture(t)
	originals := map[string]string{}
	for _, rel := range []string{"internal/a/a.go", "internal/b/b.go", "internal/c/new.go", "web/src/app.ts"} {
		originals[rel] = readFx(t, root, rel)
	}
	dir, m := strip(t, p)

	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, keepAll(m)), "", 1, "chore(x): comment pass cycle 1"))

	for rel, want := range originals {
		assert.Equal(t, want, readFx(t, root, rel), rel)
	}
	assert.Equal(t, []string{"plans/x/comment-pass.json"}, headFiles(t, root))
	assert.Contains(t, gitFx(t, root, "status", "--porcelain", "--untracked-files=all"), "?? internal/c/new.go")
}

func TestApply_DropAllLeavesNoAddedComments(t *testing.T) {
	p, out, root := newFixture(t)
	dir, m := strip(t, p)

	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, dropAll(m)), "", 1, "chore(x): comment pass cycle 1"))

	for _, f := range m.Files {
		live := readFx(t, root, f.Path)
		for _, c := range f.Candidates {
			assert.NotContains(t, live, c.Lines[0], f.Path)
		}
		if strings.HasSuffix(f.Path, ".go") {
			formatted, err := format.Source([]byte(live))
			require.NoError(t, err, f.Path)
			assert.Equal(t, live, string(formatted))
		}
	}
	assert.Contains(t, readFx(t, root, "internal/a/a.go"), "x := 1 // pre-existing trailing")
	assert.Contains(t, readFx(t, root, "internal/a/a.go"), "y := x + 1\n")
	assert.ElementsMatch(t, []string{"internal/a/a.go", "internal/b/b.go", "web/src/app.ts", "plans/x/comment-pass.json"}, headFiles(t, root))
	out.Reset()
	require.NoError(t, p.Verify(context.Background()))
	assert.Contains(t, out.String(), "verify: no added comment blocks")
}

func TestApply_MixedVerdictWritesLedger(t *testing.T) {
	p, _, _ := newFixture(t)
	dir, m := strip(t, p)
	v := Verdicts{Keep: []KeepVerdict{{ID: "internal/a/a.go#1", Reason: "guards `y := x + 1`"}}}
	for _, id := range allIDs(m) {
		if id != "internal/a/a.go#1" {
			v.Drop = append(v.Drop, id)
		}
	}

	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, v), "", 2, "chore(x): comment pass cycle 2"))

	l, exists, err := p.readLedger()
	require.NoError(t, err)
	require.True(t, exists)
	require.Len(t, l.Cycles, 1)
	c := l.Cycles[0]
	assert.Equal(t, 2, c.Cycle)
	assert.Equal(t, "judge", c.By)
	assert.Equal(t, "2026-10-06T12:00:00Z", c.At)
	assert.Equal(t, Counts{Candidates: 10, Keep: 1, Drop: 9}, c.Counts)
	require.Len(t, c.Keeps, 1)
	assert.Equal(t, "guards `y := x + 1`", c.Keeps[0].Reason)
	assert.Equal(t, KeyOf("internal/a/a.go", []string{"// leading block line one", "// leading block line two"}), c.Keeps[0].Key)
	assert.Len(t, c.Drops, 9)
	assert.Equal(t, []string{"// uses Helper to do x"}, dropLines(c, "internal/b/b.go"))
}

func dropLines(c Cycle, path string) []string {
	for _, d := range c.Drops {
		if d.Path == path {
			return d.Lines
		}
	}
	return nil
}

func TestApply_RejectsMissingUnknownDuplicateOrReasonlessIds(t *testing.T) {
	p, _, root := newFixture(t)
	dir, m := strip(t, p)
	before := readFx(t, root, "internal/a/a.go")
	full := dropAll(m)
	cases := map[string]struct {
		v    Verdicts
		want string
	}{
		"missing":    {Verdicts{Drop: full.Drop[1:]}, "missing verdict for " + full.Drop[0]},
		"unknown":    {Verdicts{Drop: append([]string{"nope#9"}, full.Drop...)}, "unknown id nope#9"},
		"duplicate":  {Verdicts{Drop: append([]string{full.Drop[0]}, full.Drop...)}, "appears 2 times"},
		"reasonless": {Verdicts{Keep: []KeepVerdict{{ID: full.Drop[0]}}, Drop: full.Drop[1:]}, "keep without a reason: " + full.Drop[0]},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			err := p.Apply(context.Background(), writeVerdicts(t, dir, tc.v), "", 1, "m")
			require.ErrorContains(t, err, tc.want)
			assert.Equal(t, before, readFx(t, root, "internal/a/a.go"), "nothing written")
			_, exists, _ := p.readLedger()
			assert.False(t, exists, "no ledger")
		})
	}
}

func TestApply_RefusesWhenTreeChangedSinceStrip(t *testing.T) {
	p, _, root := newFixture(t)
	dir, m := strip(t, p)
	live := readFx(t, root, "internal/b/b.go")
	writeFx(t, root, "internal/b/b.go", live+"\nfunc Late() {}\n")

	err := p.Apply(context.Background(), writeVerdicts(t, dir, keepAll(m)), "", 1, "m")

	require.ErrorContains(t, err, "changed since strip")
	require.ErrorContains(t, err, "internal/b/b.go")
}

func TestApply_SecondCycleAppends(t *testing.T) {
	p, _, root := newFixture(t)
	dir, m := strip(t, p)
	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, dropAll(m)), "", 1, "c1"))
	writeFx(t, root, "cmd/m/main.go", "package main\n\n// cycle two why\nfunc main() {}\n")
	gitFx(t, root, "commit", "-q", "-am", "fix wave")

	dir2, m2 := strip(t, p)
	require.Equal(t, []string{"cmd/m/main.go#1"}, allIDs(m2))
	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir2, keepAll(m2)), "", 2, "c2"))

	l, _, err := p.readLedger()
	require.NoError(t, err)
	require.Len(t, l.Cycles, 2)
	assert.Equal(t, []int{1, 2}, []int{l.Cycles[0].Cycle, l.Cycles[1].Cycle})
	require.NoError(t, p.Verify(context.Background()))
}

func TestVerify_PassesRightAfterApply(t *testing.T) {
	p, out, _ := newFixture(t)
	dir, m := strip(t, p)
	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, keepAll(m)), "", 1, "c1"))

	out.Reset()
	require.NoError(t, p.Verify(context.Background()))
	assert.Contains(t, out.String(), "verify: 9 added comment blocks, all kept in plans/x/comment-pass.json")
}

func TestVerify_FailsOnCommentAddedAfterApply(t *testing.T) {
	p, _, root := newFixture(t)
	dir, m := strip(t, p)
	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, keepAll(m)), "", 1, "c1"))
	live := readFx(t, root, "internal/b/b.go")
	writeFx(t, root, "internal/b/b.go", live+"\n// late comment\nfunc Late() {}\n")
	gitFx(t, root, "commit", "-q", "-am", "late")

	err := p.Verify(context.Background())

	require.ErrorContains(t, err, "1 of 10 added comment blocks are not ledger keeps")
	line := lineOf(t, readFx(t, root, "internal/b/b.go"), "// late comment")
	require.ErrorContains(t, err, "internal/b/b.go:"+strconv.Itoa(line)+": // late comment")
}

func TestVerify_NoLedger(t *testing.T) {
	p, _, _ := newFixture(t)
	err := p.Verify(context.Background())
	require.ErrorContains(t, err, "no ledger at plans/x/comment-pass.json and 9 added comment blocks")
	require.ErrorContains(t, err, "web/src/app.ts:")

	q, out, _ := newDirectiveOnlyFixture(t)
	require.NoError(t, q.Verify(context.Background()))
	assert.Contains(t, out.String(), "verify: no added comment blocks")
}

func TestVerify_LatestVerdictWins(t *testing.T) {
	p, _, _ := newFixture(t)
	dir, m := strip(t, p)
	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, keepAll(m)), "", 1, "c1"))
	l, _, err := p.readLedger()
	require.NoError(t, err)
	k := l.Cycles[0].Keeps[0]
	l.Cycles = append(l.Cycles, Cycle{Cycle: 2, By: "orchestrator", Drops: []Drop{{Key: k.Key, Path: k.Path, Lines: k.Lines}}})
	require.NoError(t, p.writeLedger(l))

	err = p.Verify(context.Background())

	require.ErrorContains(t, err, "1 of 9 added comment blocks are not ledger keeps")
	require.ErrorContains(t, err, k.Lines[0])
}

func TestDrop_RemovesBlockContainingLine(t *testing.T) {
	p, _, root := newFixture(t)
	line := lineOf(t, readFx(t, root, "internal/a/a.go"), "// leading block line two")

	require.NoError(t, p.Drop(context.Background(), []string{"internal/a/a.go:" + strconv.Itoa(line)}, 3, "chore(x): drop comments per review cycle 3"))

	live := readFx(t, root, "internal/a/a.go")
	assert.NotContains(t, live, "leading block line one")
	assert.NotContains(t, live, "leading block line two")
	assert.Contains(t, live, "// added trailing")
	l, _, err := p.readLedger()
	require.NoError(t, err)
	require.Len(t, l.Cycles, 1)
	assert.Equal(t, "orchestrator", l.Cycles[0].By)
	assert.Equal(t, 3, l.Cycles[0].Cycle)
	assert.Equal(t, []string{"// leading block line one", "// leading block line two"}, l.Cycles[0].Drops[0].Lines)
	assert.ElementsMatch(t, []string{"internal/a/a.go", "plans/x/comment-pass.json"}, headFiles(t, root))
}

func TestDrop_RefusesDirectiveOutOfScopeAndNoComment(t *testing.T) {
	p, _, root := newFixture(t)
	a := readFx(t, root, "internal/a/a.go")
	nolint := lineOf(t, a, "//nolint:mnd")
	code := lineOf(t, a, "func Keep() int {")
	before := a

	err := p.Drop(context.Background(), []string{
		"internal/a/a.go:" + strconv.Itoa(nolint),
		"internal/a/a_test.go:3",
		"internal/a/a.go:" + strconv.Itoa(code),
		"internal/a/a.go:" + strconv.Itoa(lineOf(t, a, "// added trailing")),
	}, 1, "m")

	require.ErrorContains(t, err, "internal/a/a.go:"+strconv.Itoa(nolint)+" is a directive")
	require.ErrorContains(t, err, "outside the pass's scope: internal/a/a_test.go:3")
	require.ErrorContains(t, err, "no comment on internal/a/a.go:"+strconv.Itoa(code))
	assert.Equal(t, before, readFx(t, root, "internal/a/a.go"), "nothing written")
	_, exists, _ := p.readLedger()
	assert.False(t, exists)
}

func TestApply_LeavesUnrelatedStagedFilesStaged(t *testing.T) {
	p, _, root := newFixture(t)
	writeFx(t, root, "docs/other.md", "unrelated, staged by a peer\n")
	gitFx(t, root, "add", "--", "docs/other.md")
	dir, m := strip(t, p)

	require.NoError(t, p.Apply(context.Background(), writeVerdicts(t, dir, dropAll(m)), "", 1, "c1"))

	assert.NotContains(t, headFiles(t, root), "docs/other.md")
	assert.Contains(t, gitFx(t, root, "status", "--porcelain"), "A  docs/other.md")
}
