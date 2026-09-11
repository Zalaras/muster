package kb

import (
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// freshRoot is the fixture after one gen — check must be green on it.
func freshRoot(t *testing.T) string {
	t.Helper()
	root := newKBRoot(t)
	runGen(t, root)
	return root
}

func TestCheck_PassesOnTheFixtureAfterGen(t *testing.T) {
	assert.Empty(t, runCheck(t, freshRoot(t)))
}

func TestCheck_PassesOnAnEmptyStore(t *testing.T) {
	root := t.TempDir()
	mustWriteFile(t, root, "go.mod", "module x\n")
	mustWriteFile(t, root, "internal/claudecode/observed_versions.txt", "2.1.246 2026-08-29 a\n")
	mustWriteFile(t, root, "internal/sess/sess.go", "package sess\n")
	assert.Empty(t, runCheck(t, root), "the unowned-file rule waits for the first spec record")
	ix, _ := loadFixture(t, root)
	outs, findings, err := Outputs(ix)
	require.NoError(t, err)
	assert.Empty(t, findings)
	assert.Empty(t, outs, "nothing is generated until a record exists")
}

func TestCheck_FailsAFeatureTagWithNoSpecRecord(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/lessons/resize-twice.md", "roles: [daemon-impl]\n", "roles: [daemon-impl]\nfeatures: [sesions]\n")
	got := runCheck(t, root)
	assert.Contains(t, got, `docs/lessons/resize-twice.md: feature "sesions" has no docs/features/sesions/spec.md`)
}

func TestCheck_FailsAFilesGlobThatMatchesNothing(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/adr/pin-order.md", "files: [internal/sess/**]", "files: [internal/sesion/**]")
	edit(t, root, "docs/features/sessions/spec.md", "go: [internal/sess/**]", "go: [internal/sess/**, internal/Sess/**]")
	got := runCheck(t, root)
	assert.Contains(t, got, `docs/adr/pin-order.md: files entry "internal/sesion/**" matches no file`)
	assert.Contains(t, got, `docs/features/sessions/spec.md: go entry "internal/Sess/**" matches no file`)
}

func TestCheck_FailsATestsEntryWhoseGoFuncOrSpecPathIsMissing(t *testing.T) {
	cases := []struct{ entry, want string }{
		{"TestFoo", `docs/adr/pin-order.md: tests entry "TestFoo" — no func TestFoo( in any *_test.go`},
		{"web/e2e/foo.spec.ts", `docs/adr/pin-order.md: tests entry "web/e2e/foo.spec.ts" does not exist`},
		{"foo", `docs/adr/pin-order.md: tests entry "foo" is neither a Go test name nor a *.spec.ts path`},
	}
	for _, tc := range cases {
		t.Run(tc.entry, func(t *testing.T) {
			root := freshRoot(t)
			edit(t, root, "docs/adr/pin-order.md", "tests: [TestSess_PinKeepsOrder, web/e2e/sess.spec.ts]", "tests: ["+tc.entry+"]")
			assert.Contains(t, runCheck(t, root), tc.want)
		})
	}
}

func TestCheck_FailsARefsEntryThatIsNeitherURLPlanIssueTokenNorPath(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "plans/real/plan.md", "# plan\n")
	edit(t, root, "docs/adr/pin-order.md", `refs: ["#12", https://example.invalid/pin]`,
		`refs: ["#12", https://example.invalid/pin, plan:real, plan:nope, "issue 4", kb:fact/statusline-cadence, kb:fact/pin-order, kb:adr/nope, docs/protocol.md, docs/missing.md]`)
	got := runCheck(t, root)
	assert.Contains(t, got, `docs/adr/pin-order.md: refs entry "plan:nope" — plans/nope/plan.md does not exist`)
	assert.Contains(t, got, `docs/adr/pin-order.md: refs entry "issue 4" is not a URL, plan:<name>, #N, kb:<type>/<id> or an existing repo path`)
	assert.Contains(t, got, `docs/adr/pin-order.md: refs entry "kb:fact/pin-order" — names a decision (want kb:adr/pin-order)`)
	assert.Contains(t, got, `docs/adr/pin-order.md: refs entry "kb:adr/nope" — resolves to no record`)
	assert.Contains(t, got, `docs/adr/pin-order.md: refs entry "docs/missing.md" is not a URL, plan:<name>, #N, kb:<type>/<id> or an existing repo path`)
	for _, ok := range []string{`"plan:real"`, `"#12"`, `"https://`, `"kb:fact/statusline-cadence"`, `"docs/protocol.md"`} {
		assert.NotContains(t, strings.Join(got, "\n"), "refs entry "+ok, "a valid ref must not be reported")
	}
}

func TestCheck_FailsAFactVerifiedAboveTheCeilingOrBelowTheFloorButAllowsALowerBoundBelowFloor(t *testing.T) {
	cases := []struct {
		verified string
		want     []string
	}{
		{"2.1.246..2.1.267", nil},
		{"2.1.200..2.1.250", nil},
		{"2.1.246..canary", nil},
		{"2.1.246..2.1.300", []string{"docs/facts/statusline-cadence.md: verified upper bound 2.1.300 exceeds the observed ceiling 2.1.267 (internal/claudecode/observed_versions.txt)"}},
		{"2.1.200..2.1.233", []string{"docs/facts/statusline-cadence.md: verified upper bound 2.1.233 is below the observed floor 2.1.246 — re-verify and raise it, or set status: retired"}},
		{"2.1.250..2.1.240", []string{`docs/facts/statusline-cadence.md:9: verified "2.1.250..2.1.240" — lower bound exceeds upper`}},
	}
	for _, tc := range cases {
		t.Run(tc.verified, func(t *testing.T) {
			root := freshRoot(t)
			edit(t, root, "docs/facts/statusline-cadence.md", "verified: 2.1.246..2.1.267", "verified: "+tc.verified)
			runGenIfClean(t, root)
			var got []string
			for _, f := range runCheck(t, root) {
				if strings.Contains(f, "verified") {
					got = append(got, f)
				}
			}
			assert.Equal(t, tc.want, got)
		})
	}
}

// runGenIfClean regenerates when the sources load clean, so a test that only changed a
// source field is not also reported as stale.
func runGenIfClean(t *testing.T, root string) {
	t.Helper()
	ix, findings, err := Load(root)
	require.NoError(t, err)
	if len(findings) > 0 {
		return
	}
	outs, _, err := Outputs(ix)
	require.NoError(t, err)
	_, err = Apply(root, outs)
	require.NoError(t, err)
}

func TestCheck_FailsASupersededDecisionWithNoAcceptedSuccessor(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/adr/pin-order.md", "supersedes: [old-pin]\n", "")
	assert.Contains(t, runCheck(t, root), "docs/adr/old-pin.md: status superseded but no accepted decision lists it in supersedes")
}

func TestCheck_FailsSupersedesPointingAtANonSupersededOrMissingDecision(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/adr/old-pin.md", "status: superseded", "status: accepted")
	edit(t, root, "docs/adr/pin-order.md", "supersedes: [old-pin]", "supersedes: [old-pin, nope, statusline-cadence]")
	got := runCheck(t, root)
	assert.Contains(t, got, `docs/adr/pin-order.md: supersedes "old-pin" but docs/adr/old-pin.md has status accepted (want superseded)`)
	assert.Contains(t, got, `docs/adr/pin-order.md: supersedes "nope" — no such decision`)
	assert.Contains(t, got, `docs/adr/pin-order.md: supersedes "statusline-cadence" — no such decision`)
}

func TestCheck_FailsAnUnresolvedCitationInAGoCommentButIgnoresOneInCode(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "internal/sess/extra.go",
		"package sess\n\n// See kb:adr/hook-lifetim for why.\nvar s = \"kb:adr/also-missing\"\n")
	got := runCheck(t, root)
	assert.Contains(t, got, "internal/sess/extra.go:3: citation kb:adr/hook-lifetim resolves to no record")
	assert.NotContains(t, strings.Join(got, "\n"), "also-missing")
}

func TestCheck_FailsACitationWhosePrefixNamesTheWrongTypeOrAnUnknownAnchor(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "web/src/pin.ts", "// kb:fact/pin-order and kb:anchor/sessions.pinn and kb:anchor/sessions.pin\n")
	edit(t, root, "docs/features/sessions/spec.md", "e2e: [web/e2e/sess.spec.ts]", "e2e: [web/e2e/sess.spec.ts]\nweb: [web/src/**]")
	got := runCheck(t, root)
	assert.Contains(t, got, "web/src/pin.ts:1: citation kb:fact/pin-order names a decision (want kb:adr/pin-order)")
	assert.Contains(t, got, "web/src/pin.ts:1: citation kb:anchor/sessions.pinn names no kb:anchor in docs/protocol.md")
	assert.NotContains(t, strings.Join(got, "\n"), "kb:anchor/sessions.pin ")
}

func TestCheck_IgnoresCitationsInPlansHistoryResearchE2ESpecsAndInsideFences(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "plans/x/plan.md", "kb:adr/nope-plan\n")
	mustWriteFile(t, root, "docs/history/h.md", "kb:adr/nope-history\n")
	mustWriteFile(t, root, "docs/research/r.md", "kb:adr/nope-research\n")
	mustWriteFile(t, root, "web/e2e/sess.spec.ts", "// kb:adr/nope-spec\n")
	mustWriteFile(t, root, "docs/design/d.md", "prose\n\n```\nkb:adr/nope-fenced\n```\n")
	got := strings.Join(runCheck(t, root), "\n")
	assert.NotContains(t, got, "nope-")
}

func TestCheck_FailsAProtocolEntryNamingAnUnknownAnchor(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/features/sessions/spec.md", "protocol: [sessions.pin, sessions.order]", "protocol: [sessions.pinn, sessions.order]")
	assert.Contains(t, runCheck(t, root), `docs/features/sessions/spec.md: protocol entry "sessions.pinn" — no kb:anchor with that id in docs/protocol.md`)
}

func TestCheck_FailsBodyAndCLAUDEmdBudgets(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/adr/pin-order.md", "Pinning must never reorder the rail.\n", strings.Repeat("word ", 301)+"\n")
	edit(t, root, "docs/runbooks/../features/sessions/spec.md", "The sessions feature keeps the rail ordered.\n", strings.Repeat("word ", 801)+"\n")
	mustWriteFile(t, root, "docs/runbooks/long.md", "---\nid: long\ntype: runbook\nstatus: active\ndate: 2026-08-30\nsummary: s\n---\n"+strings.Repeat("w ", 601))
	edit(t, root, "CLAUDE.md", "More rules.\n", strings.Repeat("line\n", 150))
	frag := mustReadFile(t, root, "internal/sess/CLAUDE.md")
	mustWriteFile(t, root, "internal/sess/CLAUDE.md", strings.Repeat("prose ", 401)+"\n"+frag)
	got := runCheck(t, root)
	assert.Contains(t, got, "docs/adr/pin-order.md: body is 301 words (budget 300 for a decision)")
	assert.Contains(t, got, "docs/features/sessions/spec.md: body is 803 words (budget 800 for a spec)")
	assert.Contains(t, got, "docs/runbooks/long.md: body is 601 words (budget 600 for a runbook)")
	assert.Contains(t, got, "CLAUDE.md: 161 lines (budget 150)")
	assert.Contains(t, got, "internal/sess/CLAUDE.md: 405 words outside kb fragments (budget 400)")

	root = freshRoot(t)
	frag = mustReadFile(t, root, "internal/sess/CLAUDE.md")
	mustWriteFile(t, root, "internal/sess/CLAUDE.md", strings.Repeat("prose ", 390)+"\n"+frag)
	assert.NotContains(t, strings.Join(runCheck(t, root), "\n"), "outside kb fragments", "fragment rows are not charged to the budget")
}

func TestCheck_ReportsStaleAndHandEditedGeneratedFilesWithDifferentMessages(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/adr/pin-order.md", "summary: Pinned sessions keep their relative order.", "summary: Pinned sessions keep order.")
	edit(t, root, "docs/features/sessions/contract.md", "Pin body line.", "Pin body line, edited by hand.")
	edit(t, root, "internal/sess/CLAUDE.md", "keep their relative order", "hand edit")
	got := runCheck(t, root)
	assert.Contains(t, got, "docs/INDEX.md: stale — regenerate with make gen-kb")
	assert.Contains(t, got, "docs/features/sessions/INDEX.md: stale — regenerate with make gen-kb")
	assert.Contains(t, got, ".claude/rules/sessions.md: stale — regenerate with make gen-kb")
	assert.Contains(t, got, "docs/features/sessions/contract.md: hand-edited — its body no longer matches its kb:generated hash; revert and change the sources instead")
	assert.Contains(t, got, "internal/sess/CLAUDE.md: hand-edited — its body no longer matches its kb:generated hash; revert and change the sources instead")
	assert.NotContains(t, strings.Join(got, "\n"), "CLAUDE.md: stale", "the root fragment does not depend on the edited summary")

	runGen(t, root)
	assert.Empty(t, runCheck(t, root), "gen overwrites the hand edit and check is green again")
}

func TestCheck_ReportsAMissingGeneratedFileAndAnOrphanRulesFile(t *testing.T) {
	root := freshRoot(t)
	mustRemove(t, root, "docs/features/sessions/INDEX.md")
	mustWriteFile(t, root, ".claude/rules/oldfeature.md", WrapGenerated("# old\n"))
	mustWriteFile(t, root, ".claude/rules/hand-written.md", "---\npaths:\n  - \"web/**\"\n---\nHand-written rule, not kb's business.\n")
	got := runCheck(t, root)
	assert.Contains(t, got, "docs/features/sessions/INDEX.md: missing — regenerate with make gen-kb")
	assert.Contains(t, got, ".claude/rules/oldfeature.md: generated file has no feature — delete it")
	assert.NotContains(t, strings.Join(got, "\n"), "hand-written.md")
}

func TestCheck_FailsAnUnrecognisedKBComment(t *testing.T) {
	root := freshRoot(t)
	edit(t, root, "docs/protocol.md", "## 1. Conventions\n", "## 1. Conventions\n\n<!-- kb:anchors -->\n")
	mustWriteFile(t, root, "docs/design/d.md", "<!-- kb:anchor elsewhere -->\n## Heading\n\n```\n<!-- kb:fenced-is-fine -->\n```\n")
	got := runCheck(t, root)
	assert.Contains(t, got, `docs/protocol.md:5: unrecognised kb comment "<!-- kb:anchors -->" (want kb:anchor ID, kb:generated HASH, kb:NAME or /kb:NAME)`)
	assert.Contains(t, got, "docs/design/d.md:1: kb:anchor belongs in docs/protocol.md only")
	assert.NotContains(t, strings.Join(got, "\n"), "fenced-is-fine")
}

func TestCheck_ReportsFragmentErrorsInHandWrittenFiles(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "web/CLAUDE.md", "# web\n\n<!-- kb:index -->\n<!-- /kb:index -->\n")
	mustWriteFile(t, root, "cmd/CLAUDE.md", "# cmd\n\n<!-- kb:trailer -->\nnever closed\n")
	got := runCheck(t, root)
	assert.Contains(t, got, `web/CLAUDE.md: unknown fragment name "index" at offset 7 (want features or trailer)`)
	assert.Contains(t, got, `cmd/CLAUDE.md: fragment "trailer" at offset 7 has no matching closing marker`)
}

func TestCheck_ReportsADuplicateIDOnTheLaterPathOnly(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "docs/lessons/pin-order.md", "---\nid: pin-order\ntype: lesson\nstatus: active\ndate: 2026-08-30\nsummary: s\nroles: [review]\n---\n")
	got := runCheck(t, root)
	assert.Contains(t, got, `docs/lessons/pin-order.md: duplicate id "pin-order" (also docs/adr/pin-order.md)`)
	for _, f := range got {
		assert.False(t, strings.HasPrefix(f, "docs/adr/pin-order.md: duplicate"), f)
	}
}

func TestCheck_FailsCodeFilesOwnedByNoFeatureOnlyOnceAFeatureExists(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "internal/other/other.go", "package other\n")
	mustWriteFile(t, root, "web/src/main.ts", "export {}\n")
	mustWriteFile(t, root, "cmd/musterd/main.go", "package main\n")
	mustWriteFile(t, root, "internal/other/README.md", "# not code\n")
	got := runCheck(t, root)
	assert.Contains(t, got, "internal/other/other.go: owned by no feature (add it to a docs/features/<name>/spec.md glob)")
	assert.Contains(t, got, "web/src/main.ts: owned by no feature (add it to a docs/features/<name>/spec.md glob)")
	joined := strings.Join(got, "\n")
	assert.NotContains(t, joined, "cmd/musterd")
	assert.NotContains(t, joined, "README.md")
	assert.NotContains(t, joined, "internal/sess/sess.go")
}

func TestCheck_FailsTheSourceSideWhenARulesFileNeedsTruncation(t *testing.T) {
	root := newKBRoot(t)
	for i := 0; i < 60; i++ {
		id := "r" + strings.Repeat("x", i%3) + string(rune('a'+i/3))
		mustWriteFile(t, root, "docs/rules/"+id+".md", "---\nid: "+id+"\ntype: rule\nstatus: active\ndate: 2026-08-30\nsummary: s\nfeatures: [sessions]\n---\n")
	}
	runGen(t, root)
	got := runCheck(t, root)
	assert.Contains(t, got, `docs/features/sessions/spec.md: feature "sessions" has 62 live records; the rules file budget is 60 lines — retire or merge`)
	rules := mustReadFile(t, root, ".claude/rules/sessions.md")
	assert.LessOrEqual(t, strings.Count(rules, "\n"), RuleFileLines)
	assert.Contains(t, rules, "more: see `docs/features/sessions/INDEX.md`")
}

func TestCheck_SortsFindingsByPathThenLine(t *testing.T) {
	root := freshRoot(t)
	mustWriteFile(t, root, "internal/sess/z.go", "package sess\n// kb:adr/z-two\n// kb:adr/z-one\n")
	mustWriteFile(t, root, "internal/sess/a.go", "package sess\n// kb:adr/a-one\n")
	edit(t, root, "docs/adr/pin-order.md", "files: [internal/sess/**]", "files: [internal/nope/**]")
	got := runCheck(t, root)
	require.GreaterOrEqual(t, len(got), 4)
	assert.True(t, sort.StringsAreSorted(got), "%v", got)
	idxA := indexOf(got, "internal/sess/a.go:2:")
	idxZ2 := indexOf(got, "internal/sess/z.go:2:")
	idxZ3 := indexOf(got, "internal/sess/z.go:3:")
	assert.True(t, idxA < idxZ2 && idxZ2 < idxZ3, "%v", got)
}

func indexOf(list []string, prefix string) int {
	for i, s := range list {
		if strings.HasPrefix(s, prefix) {
			return i
		}
	}
	return -1
}
