package kb

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// parseRecord runs the scanner and the record layer on src as if it sat at relpath.
func parseRecord(t *testing.T, relpath, src string) (*Record, []string) {
	t.Helper()
	fields, body, bodyLine, err := ParseFrontmatter([]byte(src))
	require.NoError(t, err)
	r, findings := RecordFromFields(relpath, fields, body, bodyLine)
	sortFindings(findings)
	var msgs []string
	for _, f := range findings {
		msgs = append(msgs, f.String())
	}
	return r, msgs
}

func TestRecordFromFields_EnforcesPerTypeRequiredAndForbiddenFields(t *testing.T) {
	base := "id: %s\ntype: %s\nstatus: %s\ndate: 2026-08-30\nsummary: s\n"
	cases := []struct {
		name  string
		path  string
		front string
		want  []string
	}{
		{"fact needs verified", "docs/facts/x.md", "id: x\ntype: fact\nstatus: active\ndate: 2026-08-30\nsummary: s\n",
			[]string{`docs/facts/x.md: missing required field "verified" (fact records must carry one)`}},
		{"lesson needs roles", "docs/lessons/x.md", "id: x\ntype: lesson\nstatus: active\ndate: 2026-08-30\nsummary: s\n",
			[]string{`docs/lessons/x.md: missing required field "roles" (lesson records must name at least one role)`}},
		{"roles only on lesson", "docs/adr/x.md", "id: x\ntype: decision\nstatus: accepted\ndate: 2026-08-30\nsummary: s\nroles: [review]\n",
			[]string{`docs/adr/x.md:7: field "roles" is only valid on lesson records`}},
		{"verified only on fact", "docs/rules/x.md", "id: x\ntype: rule\nstatus: active\ndate: 2026-08-30\nsummary: s\nverified: 2.1.246..2.1.267\n",
			[]string{`docs/rules/x.md:7: field "verified" is only valid on fact records`}},
		{"supersedes only on decision", "docs/runbooks/x.md", "id: x\ntype: runbook\nstatus: active\ndate: 2026-08-30\nsummary: s\nsupersedes: [y]\n",
			[]string{`docs/runbooks/x.md:7: field "supersedes" is only valid on decision records`}},
		{"go only on spec", "docs/references/x.md", "id: x\ntype: reference\nstatus: active\ndate: 2026-08-30\nsummary: s\ngo: [internal/**]\n",
			[]string{`docs/references/x.md:7: field "go" is only valid on spec records`}},
		{"unknown field", "docs/adr/x.md", "id: x\ntype: decision\nstatus: accepted\ndate: 2026-08-30\nsummary: s\nfoo: bar\n",
			[]string{`docs/adr/x.md:7: unknown field "foo"`}},
		{"missing required", "docs/adr/x.md", "id: x\ntype: decision\n",
			[]string{`docs/adr/x.md: missing required field "date"`, `docs/adr/x.md: missing required field "status"`, `docs/adr/x.md: missing required field "summary"`}},
		{"list where scalar", "docs/adr/x.md", "id: [x]\ntype: decision\nstatus: accepted\ndate: 2026-08-30\nsummary: s\n",
			[]string{`docs/adr/x.md:2: field "id" takes a single value, not a list`}},
		{"scalar where list", "docs/adr/x.md", "id: x\ntype: decision\nstatus: accepted\ndate: 2026-08-30\nsummary: s\ntags: ux\n",
			[]string{`docs/adr/x.md:7: field "tags" takes a list (write tags: [a, b])`}},
		{"unknown tag", "docs/adr/x.md", "id: x\ntype: decision\nstatus: accepted\ndate: 2026-08-30\nsummary: s\ntags: [nope]\n",
			[]string{`docs/adr/x.md:7: unknown tag "nope" (want one of: ` + strings.Join(Tags, ", ") + ")"}},
		{"unknown role", "docs/lessons/x.md", "id: x\ntype: lesson\nstatus: active\ndate: 2026-08-30\nsummary: s\nroles: [ceo]\n",
			[]string{`docs/lessons/x.md:7: unknown role "ceo" (want one of: ` + strings.Join(Roles, ", ") + ")"}},
		{"bad guard", "docs/facts/x.md", "id: x\ntype: fact\nstatus: active\ndate: 2026-08-30\nsummary: s\nverified: 2.1.246..canary\nguard: notATest\n",
			[]string{`docs/facts/x.md:8: guard "notATest" is not a Go test name (or the word none)`}},
		{"clean rule", "docs/rules/x.md", "id: x\ntype: rule\nstatus: active\ndate: 2026-08-30\nsummary: s\n", nil},
		{"clean fact with canary and none", "docs/facts/x.md", "id: x\ntype: fact\nstatus: draft\ndate: 2026-08-30\nsummary: s\nverified: 2.1.246..canary\nguard: none\n", nil},
	}
	_ = base
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, got := parseRecord(t, tc.path, "---\n"+tc.front+"---\nbody\n")
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestRecordFromFields_RejectsAStatusFromAnotherTypesEnum(t *testing.T) {
	_, got := parseRecord(t, "docs/adr/x.md", "---\nid: x\ntype: decision\nstatus: active\ndate: 2026-08-30\nsummary: s\n---\n")
	assert.Equal(t, []string{`docs/adr/x.md:4: status "active" is not valid for a decision (want accepted, proposed, superseded or rejected)`}, got)

	_, got = parseRecord(t, "docs/facts/x.md", "---\nid: x\ntype: fact\nstatus: accepted\ndate: 2026-08-30\nsummary: s\nverified: 2.1.246..canary\n---\n")
	assert.Equal(t, []string{`docs/facts/x.md:4: status "accepted" is not valid for a fact (want active, draft or retired)`}, got)
}

func TestRecordFromFields_ReportsTypeDirIdDateAndSummaryProblemsOnTheirLines(t *testing.T) {
	long := strings.Repeat("s", 190)
	_, got := parseRecord(t, "docs/adr/x.md", "---\nid: y\ntype: fact\nstatus: accepted\ndate: 2026-9-1\nsummary: "+long+"\n---\n")
	assert.Equal(t, []string{
		`docs/adr/x.md:2: id "y" does not match the filename slug "x"`,
		`docs/adr/x.md:3: type "fact" does not belong in docs/adr/ (that directory holds decision records)`,
		`docs/adr/x.md:5: date "2026-9-1" is not YYYY-MM-DD`,
		`docs/adr/x.md:6: summary is 190 chars (budget 160)`,
	}, got)

	_, got = parseRecord(t, "docs/adr/x.md", "---\nid: x\ntype: note\nstatus: accepted\ndate: 2026-08-30\nsummary: s\n---\n")
	assert.Equal(t, []string{`docs/adr/x.md:3: unknown type "note" (want rule, decision, spec, fact, lesson, runbook or reference)`}, got)
}

func TestRecordFromFields_DerivesIDFromTheFeatureDirectoryForSpecRecords(t *testing.T) {
	r, got := parseRecord(t, "docs/features/sessions/spec.md", "---\nid: sessions\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: s\nfeatures: [sessions]\n---\n")
	assert.Empty(t, got)
	assert.Equal(t, TypeSpec, r.Type)
	assert.Equal(t, "sessions", r.ID)

	_, got = parseRecord(t, "docs/features/sessions/spec.md", "---\nid: sess\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: s\nfeatures: [other]\n---\n")
	assert.Equal(t, []string{
		`docs/features/sessions/spec.md: a spec record's features must be exactly [sessions]`,
		`docs/features/sessions/spec.md:2: id "sess" does not match the feature directory "sessions"`,
	}, got)
}

func TestRecordFromFields_CountsBodyWordsIncludingFences(t *testing.T) {
	r, got := parseRecord(t, "docs/rules/x.md", "---\nid: x\ntype: rule\nstatus: active\ndate: 2026-08-30\nsummary: s\n---\none two\n\n```go\nthree four five\n```\n")
	assert.Empty(t, got)
	assert.Equal(t, 7, r.BodyWords, "fence markers and their contents all count")
	assert.Equal(t, 8, r.BodyLine)
}

func TestParseVersionRange_AcceptsOrderedRangesAndRejectsTheRest(t *testing.T) {
	cases := []struct {
		in     string
		want   VersionRange
		errSub string
	}{
		{"2.1.246..2.1.267", VersionRange{Lo: "2.1.246", Hi: "2.1.267"}, ""},
		{"2.1.246..2.1.246", VersionRange{Lo: "2.1.246", Hi: "2.1.246"}, ""},
		{"2.1.9..2.1.10", VersionRange{Lo: "2.1.9", Hi: "2.1.10"}, ""},
		{"2.1.246..canary", VersionRange{Lo: "2.1.246", Hi: "canary", HiCanary: true}, ""},
		{"2.1.250..2.1.240", VersionRange{}, "lower bound exceeds upper"},
		{"2.1.246", VersionRange{}, "is not <x.y.z>..<x.y.z> or <x.y.z>..canary"},
		{"2.1..2.1.267", VersionRange{}, "is not"},
		{"canary..2.1.267", VersionRange{}, "is not"},
		{"2.1.246..latest", VersionRange{}, "is not"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := ParseVersionRange(tc.in)
			if tc.errSub != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.errSub)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}
