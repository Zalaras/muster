package kb

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Type is a record type; the seven values map one-to-one onto record directories.
type Type string

// The seven record types.
const (
	TypeRule      Type = "rule"
	TypeDecision  Type = "decision"
	TypeSpec      Type = "spec"
	TypeFact      Type = "fact"
	TypeLesson    Type = "lesson"
	TypeRunbook   Type = "runbook"
	TypeReference Type = "reference"
)

// typeOrder is the fixed rendering order for indexes and listings.
var typeOrder = []Type{TypeRule, TypeSpec, TypeDecision, TypeFact, TypeLesson, TypeRunbook, TypeReference}

// dirOfType maps a type to its record directory (spec records live one level deeper).
var dirOfType = map[Type]string{
	TypeRule:      "docs/rules",
	TypeDecision:  "docs/adr",
	TypeSpec:      "docs/features",
	TypeFact:      "docs/facts",
	TypeLesson:    "docs/lessons",
	TypeRunbook:   "docs/runbooks",
	TypeReference: "docs/references",
}

// prefixOfType is the citation prefix for each type.
var prefixOfType = map[Type]string{
	TypeRule:      "rule",
	TypeDecision:  "adr",
	TypeSpec:      "spec",
	TypeFact:      "fact",
	TypeLesson:    "lesson",
	TypeRunbook:   "runbook",
	TypeReference: "ref",
}

var (
	liveStatuses     = []string{"active", "draft", "retired"}
	decisionStatuses = []string{"accepted", "proposed", "superseded", "rejected"}

	// Roles lists every pipeline role a lesson may address.
	Roles = []string{"e2e-specs", "daemon-impl", "web-impl", "daemon-tests", "web-tests", "e2e-validate", "review", "plan-work", "orchestrator", "retro", "planner"}

	// Tags is the closed tag list.
	Tags = []string{"auth", "state-machine", "envelope", "tmux", "store", "security", "testing", "pipeline", "claude-code-format", "ux", "deps", "revisit", "never", "deferred", "user-decision", "consensus", "judged"}

	slugRE    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)
	versionRE = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
	testRE    = regexp.MustCompile(`^Test[A-Za-z0-9_]+$`)
)

// commonFields are valid on every type; typeFields are valid on one type only.
var (
	commonFields = []string{"id", "type", "status", "date", "summary", "features", "tags", "files", "tests", "refs"}
	typeFields   = map[string]Type{
		"supersedes": TypeDecision,
		"verified":   TypeFact,
		"guard":      TypeFact,
		"roles":      TypeLesson,
		"go":         TypeSpec,
		"web":        TypeSpec,
		"e2e":        TypeSpec,
		"protocol":   TypeSpec,
	}
	listFields = map[string]bool{"features": true, "tags": true, "files": true, "tests": true, "refs": true,
		"supersedes": true, "roles": true, "go": true, "web": true, "e2e": true, "protocol": true}
)

// VersionRange is a fact's verified range. HiCanary means the upper bound was written as
// the word canary and tracks the observed ceiling.
type VersionRange struct {
	Lo       string
	Hi       string
	HiCanary bool
}

// ParseVersionRange reads lo..hi where lo is x.y.z and hi is x.y.z or the word canary,
// and rejects a lower bound above a literal upper bound.
func ParseVersionRange(s string) (VersionRange, error) {
	lo, hi, ok := strings.Cut(s, "..")
	if !ok || !versionRE.MatchString(lo) || (hi != "canary" && !versionRE.MatchString(hi)) {
		return VersionRange{}, fmt.Errorf("verified %q is not <x.y.z>..<x.y.z> or <x.y.z>..canary", s)
	}
	if hi == "canary" {
		return VersionRange{Lo: lo, Hi: hi, HiCanary: true}, nil
	}
	if compareVersion(lo, hi) > 0 {
		return VersionRange{}, fmt.Errorf("verified %q — lower bound exceeds upper", s)
	}
	return VersionRange{Lo: lo, Hi: hi}, nil
}

// compareVersion orders two x.y.z strings numerically.
func compareVersion(a, b string) int {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 3 && i < len(pa) && i < len(pb); i++ {
		x, _ := strconv.Atoi(pa[i])
		y, _ := strconv.Atoi(pb[i])
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}

// Record is one parsed knowledge-base record.
type Record struct {
	Path     string
	Type     Type
	ID       string
	Status   string
	Date     string
	Summary  string
	Features []string
	Tags     []string
	Files    []string
	Tests    []string
	Refs     []string

	Supersedes []string
	Verified   *VersionRange
	Guard      string
	Roles      []string
	Go, Web    []string
	E2E        []string
	Protocol   []string

	Body      string
	BodyLine  int
	BodyWords int
	// FieldLine is the line each field was declared on, for findings.
	FieldLine map[string]int
}

// Token is the citation token: the kb prefix, the type prefix, a slash and the id.
func (r *Record) Token() string { return "kb:" + prefixOfType[r.Type] + "/" + r.ID }

// Live reports whether the record is current: anything but retired, rejected or
// superseded.
func (r *Record) Live() bool {
	return r.Status != "retired" && r.Status != "rejected" && r.Status != "superseded"
}

// HasGuard reports whether a fact names a guard test (the word none counts as no guard).
func (r *Record) HasGuard() bool { return r.Guard != "" && r.Guard != "none" }

// bodyBudget is the word budget for the record's type.
func (r *Record) bodyBudget() int {
	switch r.Type {
	case TypeSpec:
		return SpecWords
	case TypeRunbook:
		return RunbookWords
	default:
		return BodyWords
	}
}

// expectedFor derives the type and id a record at relpath must declare from its location.
// ok is false when the path is not inside a record directory.
func expectedFor(relpath string) (t Type, id string, ok bool) {
	dir, base := path.Split(relpath)
	dir = strings.TrimSuffix(dir, "/")
	if strings.HasPrefix(dir, "docs/features/") && base == "spec.md" {
		return TypeSpec, path.Base(dir), true
	}
	for ty, d := range dirOfType {
		if d == dir && ty != TypeSpec {
			return ty, strings.TrimSuffix(base, ".md"), true
		}
	}
	return "", "", false
}

func joinOr(items []string) string {
	if len(items) <= 1 {
		return strings.Join(items, "")
	}
	return strings.Join(items[:len(items)-1], ", ") + " or " + items[len(items)-1]
}

func typeNames() []string {
	out := make([]string, 0, len(typeOrder))
	for _, t := range []Type{TypeRule, TypeDecision, TypeSpec, TypeFact, TypeLesson, TypeRunbook, TypeReference} {
		out = append(out, string(t))
	}
	return out
}

// RecordFromFields builds a Record from parsed frontmatter at repo-relative relpath and
// reports every field-level problem as a finding (design §2 and §5 load rules). The
// record is always returned so cross-record checks can still resolve it; its type falls
// back to the directory's when the declared one is unusable.
func RecordFromFields(relpath string, f Fields, body string, bodyLine int) (*Record, []Finding) {
	var out []Finding
	fail := func(line int, format string, args ...any) {
		out = append(out, Finding{Path: relpath, Line: line, Msg: fmt.Sprintf(format, args...)})
	}
	dirType, expectedID, _ := expectedFor(relpath)
	r := &Record{Path: relpath, Type: dirType, ID: expectedID, Body: body, BodyLine: bodyLine,
		BodyWords: len(strings.Fields(body)), FieldLine: map[string]int{}}

	// Pass one: the declared type decides which fields are valid.
	if tf, ok := f.Get("type"); ok {
		declared := Type(tf.Values[0])
		if _, known := dirOfType[declared]; !known {
			fail(tf.Line, "unknown type %q (want %s)", tf.Values[0], joinOr(typeNames()))
		} else if declared != dirType {
			fail(tf.Line, "type %q does not belong in %s/ (that directory holds %s records)", declared, dirOfType[dirType], dirType)
		} else {
			r.Type = declared
		}
	}

	assignFields(r, f, fail)

	validateRequiredFields(r, fail)
	validateID(r, expectedID, fail)
	validateStatus(r, fail)
	validateDate(r, fail)
	validateSummary(r, fail)
	validateTags(r, fail)
	validateRoles(r, fail)
	validateFeatures(r, expectedID, fail)
	validateGuard(r, fail)
	return r, out
}

// failFunc records one field-level finding against the record being built.
type failFunc func(line int, format string, args ...any)

// fieldAssign maps a frontmatter key to the Record field it fills. Two keys are absent
// deliberately and handled in assignFields: "type" is already consumed by pass one, and
// "verified" parses rather than assigns.
var fieldAssign = map[string]func(*Record, Field){
	"id":         func(r *Record, f Field) { r.ID = f.Values[0] },
	"status":     func(r *Record, f Field) { r.Status = f.Values[0] },
	"date":       func(r *Record, f Field) { r.Date = f.Values[0] },
	"summary":    func(r *Record, f Field) { r.Summary = f.Values[0] },
	"guard":      func(r *Record, f Field) { r.Guard = f.Values[0] },
	"features":   func(r *Record, f Field) { r.Features = f.Values },
	"tags":       func(r *Record, f Field) { r.Tags = f.Values },
	"files":      func(r *Record, f Field) { r.Files = f.Values },
	"tests":      func(r *Record, f Field) { r.Tests = f.Values },
	"refs":       func(r *Record, f Field) { r.Refs = f.Values },
	"supersedes": func(r *Record, f Field) { r.Supersedes = f.Values },
	"roles":      func(r *Record, f Field) { r.Roles = f.Values },
	"go":         func(r *Record, f Field) { r.Go = f.Values },
	"web":        func(r *Record, f Field) { r.Web = f.Values },
	"e2e":        func(r *Record, f Field) { r.E2E = f.Values },
	"protocol":   func(r *Record, f Field) { r.Protocol = f.Values },
}

// assignFields fills r from the frontmatter in file order, rejecting fields that are
// unknown, scoped to another type, or written in the wrong shape.
func assignFields(r *Record, f Fields, fail failFunc) {
	for _, fld := range f {
		if only, scoped := typeFields[fld.Key]; scoped && only != r.Type {
			fail(fld.Line, "field %q is only valid on %s records", fld.Key, only)
			continue
		}
		if _, scoped := typeFields[fld.Key]; !scoped && !contains(commonFields, fld.Key) {
			fail(fld.Line, "unknown field %q", fld.Key)
			continue
		}
		r.FieldLine[fld.Key] = fld.Line
		if listFields[fld.Key] != fld.IsList {
			if fld.IsList {
				fail(fld.Line, "field %q takes a single value, not a list", fld.Key)
			} else {
				fail(fld.Line, "field %q takes a list (write %s: [a, b])", fld.Key, fld.Key)
			}
			continue
		}
		switch fld.Key {
		case "type":
			// Consumed by pass one, which needed the type before any other field.
		case "verified":
			vr, err := ParseVersionRange(fld.Values[0])
			if err != nil {
				fail(fld.Line, "%s", err.Error())
			} else {
				r.Verified = &vr
			}
		default:
			if assign, ok := fieldAssign[fld.Key]; ok {
				assign(r, fld)
			}
		}
	}
}

// validateRequiredFields reports the fields every record needs, plus the two that only
// one type needs.
func validateRequiredFields(r *Record, fail failFunc) {
	for _, key := range []string{"id", "type", "status", "date", "summary"} {
		if _, ok := r.FieldLine[key]; !ok {
			fail(0, "missing required field %q", key)
		}
	}
	if r.Type == TypeFact && r.Verified == nil {
		if _, declared := r.FieldLine["verified"]; !declared {
			fail(0, "missing required field %q (fact records must carry one)", "verified")
		}
	}
	if r.Type == TypeLesson && len(r.Roles) == 0 {
		fail(0, "missing required field %q (lesson records must name at least one role)", "roles")
	}
}

// validateID checks the declared id against the one the path implies, and that the path's
// own slug is well formed.
func validateID(r *Record, expectedID string, fail failFunc) {
	if line, ok := r.FieldLine["id"]; ok && r.ID != expectedID {
		if r.Type == TypeSpec {
			fail(line, "id %q does not match the feature directory %q", r.ID, expectedID)
		} else {
			fail(line, "id %q does not match the filename slug %q", r.ID, expectedID)
		}
	}
	if !slugRE.MatchString(expectedID) || len(expectedID) > 64 {
		fail(0, "%q is not a slug (want ^[a-z0-9][a-z0-9-]*$, at most 64 chars)", expectedID)
	}
}

// validateStatus checks status against the set its type allows; only decisions carry the
// proposed, superseded and rejected states.
func validateStatus(r *Record, fail failFunc) {
	line, ok := r.FieldLine["status"]
	if !ok {
		return
	}
	valid := liveStatuses
	if r.Type == TypeDecision {
		valid = decisionStatuses
	}
	if !contains(valid, r.Status) {
		fail(line, "status %q is not valid for a %s (want %s)", r.Status, r.Type, joinOr(valid))
	}
}

func validateDate(r *Record, fail failFunc) {
	if line, ok := r.FieldLine["date"]; ok {
		if _, err := time.Parse("2006-01-02", r.Date); err != nil {
			fail(line, "date %q is not YYYY-MM-DD", r.Date)
		}
	}
}

func validateSummary(r *Record, fail failFunc) {
	if line, ok := r.FieldLine["summary"]; ok && len(r.Summary) > SummaryChars {
		fail(line, "summary is %d chars (budget %d)", len(r.Summary), SummaryChars)
	}
}

func validateTags(r *Record, fail failFunc) {
	if line, ok := r.FieldLine["tags"]; ok {
		for _, tag := range r.Tags {
			if !contains(Tags, tag) {
				fail(line, "unknown tag %q (want one of: %s)", tag, strings.Join(Tags, ", "))
			}
		}
	}
}

func validateRoles(r *Record, fail failFunc) {
	if line, ok := r.FieldLine["roles"]; ok {
		for _, role := range r.Roles {
			if !contains(Roles, role) {
				fail(line, "unknown role %q (want one of: %s)", role, strings.Join(Roles, ", "))
			}
		}
	}
}

// validateFeatures checks each named feature is a slug, and that a spec record names
// exactly its own feature.
func validateFeatures(r *Record, expectedID string, fail failFunc) {
	line, ok := r.FieldLine["features"]
	if !ok {
		return
	}
	for _, name := range r.Features {
		if !slugRE.MatchString(name) {
			fail(line, "feature %q is not a slug", name)
		}
	}
	if r.Type == TypeSpec && (len(r.Features) != 1 || r.Features[0] != expectedID) {
		fail(0, "a spec record's features must be exactly [%s]", expectedID)
	}
}

func validateGuard(r *Record, fail failFunc) {
	if line, ok := r.FieldLine["guard"]; ok && r.HasGuard() && !testRE.MatchString(r.Guard) {
		fail(line, "guard %q is not a Go test name (or the word none)", r.Guard)
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// sortRecords orders records by type order then id, the shape every listing uses.
func sortRecords(rs []*Record) {
	rank := map[Type]int{}
	for i, t := range typeOrder {
		rank[t] = i
	}
	sort.SliceStable(rs, func(i, j int) bool {
		if rs[i].Type != rs[j].Type {
			return rank[rs[i].Type] < rank[rs[j].Type]
		}
		return rs[i].ID < rs[j].ID
	})
}

// intersects reports whether two string lists share an element.
func intersects(a, b []string) bool {
	for _, x := range a {
		if contains(b, x) {
			return true
		}
	}
	return false
}
