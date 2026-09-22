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

var featuresHeaderRE = regexp.MustCompile(`(?m)^\*\*Features\*\*: *(.+)$`)

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

// PackOptions names one pack: the plan, the role and the features (already resolved).
type PackOptions struct {
	Plan     string
	Role     string
	Features []string
}

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
	for _, name := range opts.Features {
		if ix.Feature(name) == nil {
			return 0, fmt.Errorf("feature %q has no docs/features/%s/spec.md", name, name)
		}
	}
	marker := fmt.Sprintf("<!-- kb:pack plan=%s role=%s features=%s -->\n", opts.Plan, opts.Role, strings.Join(opts.Features, ","))

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
	writeFeatureSections(&b, ix, opts)
	record("features")
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

// writeFeatureSections writes each feature's spec body followed by its contract slice.
func writeFeatureSections(b *strings.Builder, ix *Index, opts PackOptions) {
	for _, name := range opts.Features {
		f := ix.Feature(name)
		fmt.Fprintf(b, "\n# Feature: %s\n\n%s\n", name, strings.TrimSpace(f.Spec.Body))
		b.WriteString("\n" + strings.TrimSpace(renderContract(ix, f)) + "\n")
	}
}

// systemDiagramRoles are the roles that read the feature-less (system-wide) diagrams; an
// implementation pack carries only the diagrams naming one of its features. The
// maintainability reviewer judges shape against the component diagrams, so it reads them too.
var systemDiagramRoles = []string{"planner", "plan-work", "review", "orchestrator", "review-maintainability"}

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

// writeDecisionForPack renders an accepted decision with only its Decision and
// Consequences paragraphs: a pack tells an agent what binds it, and the context and the
// options it weighed are one kb show away. A body without those bold leads renders whole.
func writeDecisionForPack(b *strings.Builder, ix *Index, r *Record) {
	full := RenderRecord(ix, r)
	head, body, ok := strings.Cut(full, "\n\n")
	if !ok {
		b.WriteString("\n" + full)
		return
	}
	var keep []string
	for _, para := range strings.Split(strings.TrimSpace(body), "\n\n") {
		if strings.HasPrefix(para, "**Decision.**") || strings.HasPrefix(para, "**Consequences.**") {
			keep = append(keep, para)
		}
	}
	if len(keep) == 0 {
		b.WriteString("\n" + full)
		return
	}
	fmt.Fprintf(b, "\n%s\n\n%s\n_context and options: kb show %s_\n", head, strings.Join(keep, "\n\n"), r.ID)
}

// conventionsByRole names the docs/conventions.md sections (by heading prefix) each role
// reads in its pack; a role absent from the map reads the whole file.
var conventionsByRole = map[string][]string{
	"daemon-impl":  {"Stack", "Go", "Composition roots", "Comments", "Knowledge records"},
	"web-impl":     {"Stack", "TypeScript", "Composition roots", "Comments", "Knowledge records"},
	"daemon-tests": {"Testing", "Comments", "Knowledge records"},
	"web-tests":    {"Testing", "Comments", "Knowledge records"},
	"e2e-specs":    {"Testing", "Comments", "Knowledge records"},
	"e2e-validate": {"Testing", "Comments", "Knowledge records"},
	// The browser reviewer measures the running app; the maintainability reviewer judges shape and
	// never reads the plan, so its rules are the code sections plus Design.
	"review-browser":         {"Stack", "TypeScript", "Testing", "Comments", "Knowledge records"},
	"review-maintainability": {"Stack", "Go", "TypeScript", "Composition roots", "Design", "Comments", "Knowledge records"},
}

// conventionsForRole keeps the preamble and the level-two sections the role reads.
func conventionsForRole(conv, role string) string {
	wanted, ok := conventionsByRole[role]
	if !ok {
		return conv
	}
	var out []string
	keep := true // the preamble before the first heading
	for _, line := range strings.Split(conv, "\n") {
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
