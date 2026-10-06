package kb

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var (
	featuresHeaderRE = regexp.MustCompile(`(?m)^\*\*Features\*\*: *(.+)$`)
	touchesHeaderRE  = regexp.MustCompile(`(?m)^\*\*Touches\*\*: *(.+)$`)
)

// PlanFeatures reads the Features header line of a plan file.
func PlanFeatures(planPath string) ([]string, error) {
	data, err := os.ReadFile(planPath)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", planPath, err)
	}
	m := featuresHeaderRE.FindSubmatch(data)
	if m == nil {
		return nil, errors.New("no **Features**: header")
	}
	return splitList(string(m[1])), nil
}

// PlanTouches reads a plan's optional Touches header: the features whose files the plan may
// edit without owning the change (kb:adr/process-touched-features-widen-without-stopping). An
// absent header is an empty list, never an error.
func PlanTouches(planPath string) ([]string, error) {
	data, err := os.ReadFile(planPath)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", planPath, err)
	}
	m := touchesHeaderRE.FindSubmatch(data)
	if m == nil {
		return nil, nil
	}
	return splitList(string(m[1])), nil
}

// splitList splits a comma-separated list, trimming and dropping empties.
func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// PackOptions names one pack: the plan, the role, the features (already resolved) and the
// touched features, which pack as spec body and contract only.
type PackOptions struct {
	Plan     string
	Role     string
	Features []string
	Touches  []string
}

// touchesFullRoles pack a touched feature in full, as if it were in Features: the correctness
// reviewer is the safety net for a settled decision a light edit breaks, so it reads the
// touched feature's records the implementer did not.
var touchesFullRoles = []string{"review"}

// section is one row of a pack's word breakdown, in the order the sections are written.
type section struct {
	label string
	words int
}

// Pack writes the role's context bundle for a plan (design §9) in a fixed order and
// returns its word count. It never fails on budget: past PackWords it prints a WARN line.
// The count and that warning open the pack, straight after the provenance marker, so the
// reader meets the cost before the payload and not several hundred KB after it.
func Pack(ix *Index, opts PackOptions, w io.Writer) (int, error) {
	if !contains(Roles, opts.Role) {
		return 0, fmt.Errorf("unknown role %q (want one of: %s)", opts.Role, strings.Join(Roles, ", "))
	}
	for _, name := range append(append([]string{}, opts.Features...), opts.Touches...) {
		if ix.Feature(name) == nil {
			return 0, fmt.Errorf("feature %q has no docs/features/%s/spec.md", name, name)
		}
	}
	// A feature in both headers is a Features one; a role that reads touched features in full
	// folds them into Features before any section is written.
	var touches []string
	for _, name := range opts.Touches {
		if !contains(opts.Features, name) && !contains(touches, name) {
			touches = append(touches, name)
		}
	}
	if contains(touchesFullRoles, opts.Role) {
		opts.Features = append(append([]string{}, opts.Features...), touches...)
		touches = nil
	}
	opts.Touches = touches
	marker := fmt.Sprintf("<!-- kb:pack plan=%s role=%s features=%s", opts.Plan, opts.Role, strings.Join(opts.Features, ","))
	if len(opts.Touches) > 0 {
		marker += " touches=" + strings.Join(opts.Touches, ",")
	}
	marker += " -->\n"

	// The body is built first so the summary can report on it. Every section starts with a
	// newline, so slicing the body at these offsets never splits a word and the rows add up.
	var b strings.Builder
	var sections []section
	prev := 0
	record := func(label string) {
		sections = append(sections, section{label, len(strings.Fields(b.String()[prev:]))})
		prev = b.Len()
	}

	if err := writeRules(&b, ix, opts); err != nil {
		return 0, err
	}
	record("rules")
	if err := writeDesignDocs(&b, ix, opts); err != nil {
		return 0, err
	}
	record("design")
	writeFeatureSections(&b, ix, opts)
	record("features")
	writeTouchedSections(&b, ix, opts)
	record("touched")
	writeDiagrams(&b, ix, opts)
	record("diagrams")
	writeDecisions(&b, ix, opts)
	record("decisions")
	writeProposedDecisions(&b, ix, opts)
	record("proposed")
	writeFacts(&b, ix, opts)
	record("facts")
	writeLessons(&b, ix, opts)
	record("lessons")
	writeRunbooks(&b, ix, opts)
	record("runbooks")

	words := len(strings.Fields(marker)) + len(strings.Fields(b.String()))
	_, err := io.WriteString(w, marker+packSummary(words, sections)+b.String())
	return words, err
}

// packSummary renders the block that opens a pack. Its first line is the one the agent
// definitions tell each role to record as **Pack**, so it keeps the wording those logs
// already quote; the rows that follow say which section grew. The reported total covers the
// marker and the body only — never this block — so the number stays comparable with the
// figures earlier runs recorded.
func packSummary(words int, sections []section) string {
	var b strings.Builder
	fmt.Fprintf(&b, "kb: pack %d words (budget %d)\n", words, PackWords)
	if words > PackWords {
		fmt.Fprintf(&b, "kb: WARN pack exceeds budget of %d words\n", PackWords)
	}
	rows := make([]string, 0, len(sections))
	for _, s := range sections {
		rows = append(rows, fmt.Sprintf("%s %d", s.label, s.words))
	}
	fmt.Fprintf(&b, "kb: sections — %s\n", strings.Join(rows, " · "))
	return b.String()
}

// writeRules writes the conventions slice for the role, then the active rule records:
// the feature-less ones first, then those naming one of the pack's features.
func writeRules(b *strings.Builder, ix *Index, opts PackOptions) error {
	b.WriteString("\n# Rules\n")
	conv, err := os.ReadFile(filepath.Join(ix.Root, "docs", "conventions.md"))
	switch {
	case err == nil:
		b.WriteString("\n" + strings.TrimRight(conventionsForRole(string(conv), opts.Role), "\n") + "\n")
	case !errors.Is(err, fs.ErrNotExist):
		return fmt.Errorf("reading docs/conventions.md: %w", err)
	}
	for _, r := range ix.RecordsOfType(TypeRule) {
		if r.Status == "active" && len(r.Features) == 0 {
			writeRecord(b, ix, r)
		}
	}
	for _, r := range ix.RecordsOfType(TypeRule) {
		if r.Status == "active" && intersects(r.Features, opts.Features) {
			writeRecord(b, ix, r)
		}
	}
	return nil
}

// contractlessRoles read no contract slice: the browser reviewer measures the running app and
// the maintainability reviewer judges shape, and neither codes against the wire. The generated
// contracts were 5,800 of a three-feature pack's 7,300 feature words (audit 2026-09-25).
var contractlessRoles = []string{"review-browser", "review-maintainability"}

// factlessRoles read no fact records: the web roles take wire shapes from the contract slice,
// the two non-correctness reviewers never code against the wire, and doc-reconcile verifies
// claims against source. Facts were 7,400 of a three-feature pack (kb:adr/knowledge-pack-sections-scoped-by-role).
var factlessRoles = []string{"web-impl", "web-tests", "review-browser", "review-maintainability", "doc-reconcile"}

// decisionlessRoles read no accepted decisions: the unit-test roles test what the plan and
// contract state, the browser reviewer measures, and doc-reconcile edits specs the decisions
// already shaped. e2e-specs keeps them deliberately — a safety net for behaviour it asserts.
// Accepted decisions were 12,700 of a three-feature pack (kb:adr/knowledge-pack-sections-scoped-by-role).
var decisionlessRoles = []string{"daemon-tests", "web-tests", "review-browser", "doc-reconcile"}

// designDoc is one docs/design file a role packs, whole or by its level-two sections.
type designDoc struct {
	path     string
	sections []string // heading prefixes to keep; nil keeps the whole file
}

// designDocsByRole names the design documents each role packs. They bind the web roles in
// full (web-impl) or in their correctness sections (review-browser §6 honesty, §7 terminal);
// every other role reads them by path when it needs to.
var designDocsByRole = map[string][]designDoc{
	"web-impl": {
		{path: "docs/design/design-system.md"},
		{path: "docs/design/ux-flows.md"},
	},
	"review-browser": {
		{path: "docs/design/design-system.md", sections: []string{"6.", "7."}},
		{path: "docs/design/ux-flows.md"},
	},
}

// writeDesignDocs writes the role's design documents, each sliced to the sections it reads.
// The heading is written only when the role packs one.
func writeDesignDocs(b *strings.Builder, ix *Index, opts PackOptions) error {
	var out []string
	for _, d := range designDocsByRole[opts.Role] {
		data, err := os.ReadFile(filepath.Join(ix.Root, filepath.FromSlash(d.path)))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return fmt.Errorf("reading %s: %w", d.path, err)
		}
		text := string(data)
		if d.sections != nil {
			text = sectionsOf(text, d.sections)
		}
		out = append(out, fmt.Sprintf("\n<!-- %s -->\n%s\n", d.path, strings.TrimRight(text, "\n")))
	}
	if len(out) == 0 {
		return nil
	}
	b.WriteString("\n# Design\n" + strings.Join(out, ""))
	return nil
}

// writeFeatureSections writes each feature's spec body followed by its contract slice.
func writeFeatureSections(b *strings.Builder, ix *Index, opts PackOptions) {
	for _, name := range opts.Features {
		writeSpecAndContract(b, ix, opts, "Feature", name)
	}
}

// writeTouchedSections writes each touched feature the same way, under a heading that says the
// plan edits its files without owning the change; its decisions, facts, diagrams, lessons and
// runbooks are not packed (every other writer keys on opts.Features alone).
func writeTouchedSections(b *strings.Builder, ix *Index, opts PackOptions) {
	for _, name := range opts.Touches {
		writeSpecAndContract(b, ix, opts, "Touched", name)
	}
}

func writeSpecAndContract(b *strings.Builder, ix *Index, opts PackOptions, kind, name string) {
	f := ix.Feature(name)
	fmt.Fprintf(b, "\n# %s: %s\n\n%s\n", kind, name, strings.TrimSpace(f.Spec.Body))
	if contains(contractlessRoles, opts.Role) {
		fmt.Fprintf(b, "\n_contract: `go run ./tools/kb show %s` — not packed for this role_\n", f.Spec.Token())
		return
	}
	b.WriteString("\n" + strings.TrimSpace(renderContract(ix, f)) + "\n")
}

// systemDiagramRoles are the roles that read the feature-less (system-wide) diagrams; an
// implementation pack carries only the diagrams naming one of its features. The
// maintainability reviewer judges shape against the component diagrams, so it reads them too.
var systemDiagramRoles = []string{"planner", "review", "orchestrator", "review-maintainability"}

// writeDiagrams writes the active diagrams for the pack, fence included: those naming
// one of the pack's features for every role, the system-wide ones for the roles that
// plan and judge. The heading is written only when a diagram follows.
func writeDiagrams(b *strings.Builder, ix *Index, opts PackOptions) {
	var out []*Record
	for _, r := range ix.RecordsOfType(TypeDiagram) {
		if r.Status != "active" {
			continue
		}
		if intersects(r.Features, opts.Features) || (len(r.Features) == 0 && contains(systemDiagramRoles, opts.Role)) {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return
	}
	b.WriteString("\n# Diagrams\n")
	for _, r := range out {
		writeRecord(b, ix, r)
	}
}

// writeDecisions writes the accepted decisions naming one of the pack's features, oldest
// first, each trimmed to its Decision and Consequences paragraphs.
func writeDecisions(b *strings.Builder, ix *Index, opts PackOptions) {
	b.WriteString("\n# Decisions\n")
	if contains(decisionlessRoles, opts.Role) {
		fmt.Fprintf(b, "\n_decisions: `go run ./tools/kb ls --type decision --status accepted --feature <f>` — not packed for this role_\n")
		return
	}
	var decisions []*Record
	for _, r := range ix.RecordsOfType(TypeDecision) {
		if r.Status == "accepted" && intersects(r.Features, opts.Features) {
			decisions = append(decisions, r)
		}
	}
	sort.SliceStable(decisions, func(i, j int) bool {
		if decisions[i].Date != decisions[j].Date {
			return decisions[i].Date < decisions[j].Date
		}
		return decisions[i].ID < decisions[j].ID
	})
	for _, r := range decisions {
		writeDecisionForPack(b, ix, r)
	}
}

// writeProposedDecisions writes this plan's not-yet-accepted decisions, for the two roles
// that rule on them.
func writeProposedDecisions(b *strings.Builder, ix *Index, opts PackOptions) {
	if opts.Role != "review" && opts.Role != "planner" {
		return
	}
	b.WriteString("\n# Decisions (proposed for this plan)\n")
	for _, r := range ix.RecordsOfType(TypeDecision) {
		if r.Status == "proposed" && contains(r.Refs, "plan:"+opts.Plan) {
			writeRecord(b, ix, r)
		}
	}
}

// writeFacts writes the active facts naming one of the pack's features.
func writeFacts(b *strings.Builder, ix *Index, opts PackOptions) {
	b.WriteString("\n# Facts\n")
	if contains(factlessRoles, opts.Role) {
		fmt.Fprintf(b, "\n_facts: `go run ./tools/kb ls --type fact --feature <f>` — not packed for this role_\n")
		return
	}
	for _, r := range ix.RecordsOfType(TypeFact) {
		if r.Status == "active" && intersects(r.Features, opts.Features) {
			writeRecord(b, ix, r)
		}
	}
}

// writeLessons writes the active lessons for the role: a lesson naming no feature is
// carried by every pack the role reads.
func writeLessons(b *strings.Builder, ix *Index, opts PackOptions) {
	b.WriteString("\n# Lessons\n")
	for _, r := range ix.RecordsOfType(TypeLesson) {
		if r.Status == "active" && contains(r.Roles, opts.Role) && (len(r.Features) == 0 || intersects(r.Features, opts.Features)) {
			writeRecord(b, ix, r)
		}
	}
}

// writeRunbooks writes the active runbooks naming one of the pack's features.
func writeRunbooks(b *strings.Builder, ix *Index, opts PackOptions) {
	b.WriteString("\n# Runbooks\n")
	for _, r := range ix.RecordsOfType(TypeRunbook) {
		if r.Status == "active" && intersects(r.Features, opts.Features) {
			writeRecord(b, ix, r)
		}
	}
}

// writeRecord renders one record as it appears in a pack or in kb show.
func writeRecord(b *strings.Builder, ix *Index, r *Record) {
	b.WriteString("\n" + RenderRecord(ix, r))
}

// RenderRecord renders a record with its frontmatter replaced by a heading and one
// metadata line.
func RenderRecord(ix *Index, r *Record) string {
	var b strings.Builder
	fmt.Fprintf(&b, "## %s %s — %s\n", r.Type, r.ID, r.Summary)
	meta := []string{r.Status, r.Date}
	if r.Type == TypeFact && r.Verified != nil {
		meta = append(meta, "verified "+ix.ResolvedVerified(r))
	}
	if r.Type == TypeDiagram && r.Kind != "" {
		meta = append(meta, "kind: "+r.Kind)
	}
	if len(r.Features) > 0 {
		meta = append(meta, "features: "+strings.Join(r.Features, ", "))
	}
	if len(r.Files) > 0 {
		meta = append(meta, "files: "+strings.Join(r.Files, ", "))
	}
	if len(r.Roles) > 0 {
		meta = append(meta, "roles: "+strings.Join(r.Roles, ", "))
	}
	meta = append(meta, "cite: "+r.Token())
	fmt.Fprintf(&b, "_%s_\n", strings.Join(meta, " · "))
	if body := strings.TrimSpace(r.Body); body != "" {
		b.WriteString("\n" + body + "\n")
	}
	return b.String()
}

// writeDecisionForPack renders an accepted decision with only its Decision paragraph: that
// is the text that binds an agent, and the context, the options it weighed and the
// consequences are one kb show away. A body without that bold lead renders whole.
func writeDecisionForPack(b *strings.Builder, ix *Index, r *Record) {
	full := RenderRecord(ix, r)
	head, body, ok := strings.Cut(full, "\n\n")
	if !ok {
		b.WriteString("\n" + full)
		return
	}
	for _, para := range strings.Split(strings.TrimSpace(body), "\n\n") {
		if strings.HasPrefix(para, "**Decision.**") {
			fmt.Fprintf(b, "\n%s\n\n%s\n_context, options and consequences: kb show %s_\n", head, para, r.ID)
			return
		}
	}
	b.WriteString("\n" + full)
}

// conventionsByRole names the docs/conventions.md sections (by heading prefix) each role
// reads in its pack — the full set, so no agent file sends its reader to the file for a
// section the pack left out. A role absent from the map reads the whole file.
var conventionsByRole = map[string][]string{
	// The impl and unit-test roles answer to Design (reuse before add, design: lines); the
	// daemon tester matches the Go test style §Stack and §Go settle.
	"daemon-impl":  {"Stack", "Go", "Composition roots", "Design", "Comments", "Knowledge records"},
	"web-impl":     {"Stack", "TypeScript", "Composition roots", "Design", "Comments", "Knowledge records"},
	"daemon-tests": {"Stack", "Go", "Design", "Testing", "Comments", "Knowledge records"},
	"web-tests":    {"Design", "Testing", "Comments", "Knowledge records"},
	"e2e-specs":    {"Testing", "Comments", "Knowledge records"},
	// The browser reviewer measures the running app; the maintainability reviewer judges shape and
	// never reads the plan, so its rules are the code sections plus Design.
	// The correctness reviewer judges statements against the plan: the code and testing sections,
	// never Commits or Backlog (the orchestrator's) or Design (the maintainability reviewer's).
	"review":                 {"Stack", "Go", "TypeScript", "Composition roots", "Testing", "Comments", "Knowledge records"},
	"review-browser":         {"Stack", "TypeScript", "Testing", "Comments", "Knowledge records"},
	"review-maintainability": {"Stack", "Go", "TypeScript", "Composition roots", "Design", "Comments", "Knowledge records"},
}

// conventionsForRole keeps the preamble and the level-two sections the role reads.
func conventionsForRole(conv, role string) string {
	wanted, ok := conventionsByRole[role]
	if !ok {
		return conv
	}
	return sectionsOf(conv, wanted)
}

// sectionsOf keeps a document's preamble and the level-two sections whose title starts with
// one of the wanted prefixes.
func sectionsOf(doc string, wanted []string) string {
	var out []string
	keep := true // the preamble before the first heading
	for _, line := range strings.Split(doc, "\n") {
		if strings.HasPrefix(line, "## ") {
			title := strings.TrimSpace(strings.TrimPrefix(line, "## "))
			keep = false
			for _, w := range wanted {
				if strings.HasPrefix(title, w) {
					keep = true
					break
				}
			}
		}
		if keep {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}
