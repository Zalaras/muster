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

// Pack writes the role's context bundle for a plan (design §9) in a fixed order and
// returns its word count. It never fails on budget: past PackWords it prints a WARN line.
func Pack(ix *Index, opts PackOptions, w io.Writer) (int, error) {
	if !contains(Roles, opts.Role) {
		return 0, fmt.Errorf("unknown role %q (want one of: %s)", opts.Role, strings.Join(Roles, ", "))
	}
	for _, name := range opts.Features {
		if ix.Feature(name) == nil {
			return 0, fmt.Errorf("feature %q has no docs/features/%s/spec.md", name, name)
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "<!-- kb:pack plan=%s role=%s features=%s -->\n", opts.Plan, opts.Role, strings.Join(opts.Features, ","))

	b.WriteString("\n# Rules\n")
	conv, err := os.ReadFile(filepath.Join(ix.Root, "docs", "conventions.md"))
	switch {
	case err == nil:
		b.WriteString("\n" + strings.TrimRight(conventionsForRole(string(conv), opts.Role), "\n") + "\n")
	case !errors.Is(err, fs.ErrNotExist):
		return 0, fmt.Errorf("reading docs/conventions.md: %w", err)
	}
	for _, r := range ix.RecordsOfType(TypeRule) {
		if r.Status == "active" && len(r.Features) == 0 {
			writeRecord(&b, ix, r)
		}
	}
	for _, r := range ix.RecordsOfType(TypeRule) {
		if r.Status == "active" && intersects(r.Features, opts.Features) {
			writeRecord(&b, ix, r)
		}
	}

	for _, name := range opts.Features {
		f := ix.Feature(name)
		fmt.Fprintf(&b, "\n# Feature: %s\n\n%s\n", name, strings.TrimSpace(f.Spec.Body))
		b.WriteString("\n" + strings.TrimSpace(renderContract(ix, f)) + "\n")
	}

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
		writeDecisionForPack(&b, ix, r)
	}
	if opts.Role == "review" || opts.Role == "planner" {
		b.WriteString("\n# Decisions (proposed for this plan)\n")
		for _, r := range ix.RecordsOfType(TypeDecision) {
			if r.Status == "proposed" && contains(r.Refs, "plan:"+opts.Plan) {
				writeRecord(&b, ix, r)
			}
		}
	}

	b.WriteString("\n# Facts\n")
	for _, r := range ix.RecordsOfType(TypeFact) {
		if r.Status == "active" && intersects(r.Features, opts.Features) {
			writeRecord(&b, ix, r)
		}
	}
	b.WriteString("\n# Lessons\n")
	for _, r := range ix.RecordsOfType(TypeLesson) {
		if r.Status == "active" && contains(r.Roles, opts.Role) && (len(r.Features) == 0 || intersects(r.Features, opts.Features)) {
			writeRecord(&b, ix, r)
		}
	}
	b.WriteString("\n# Runbooks\n")
	for _, r := range ix.RecordsOfType(TypeRunbook) {
		if r.Status == "active" && intersects(r.Features, opts.Features) {
			writeRecord(&b, ix, r)
		}
	}

	words := len(strings.Fields(b.String()))
	fmt.Fprintf(&b, "\nkb: pack %d words\n", words)
	if words > PackWords {
		fmt.Fprintf(&b, "kb: WARN pack exceeds budget of %d words\n", PackWords)
	}
	_, err = io.WriteString(w, b.String())
	return words, err
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
