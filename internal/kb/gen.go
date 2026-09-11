package kb

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

// Output is one generated file: repo-relative slash path and full content.
type Output struct {
	Path    string
	Content string
}

// rootIndexPath is the whole-store index; rulesDir holds the per-feature rules files.
const (
	rootIndexPath = "docs/INDEX.md"
	rulesDir      = ".claude/rules/"
)

// Outputs renders every generated file (design §8): the store index, each feature's
// INDEX and contract, each feature's rules file, and every CLAUDE.md carrying a kb
// fragment. An empty store renders nothing but fragments. Fragment problems in a
// hand-written file are findings; only I/O failures are errors.
func Outputs(ix *Index) ([]Output, []Finding, error) {
	var outs []Output
	var findings []Finding
	if !ix.Empty() {
		outs = append(outs, Output{Path: rootIndexPath, Content: WrapGenerated(renderRootIndex(ix))})
	}
	for _, f := range ix.Features {
		outs = append(outs,
			Output{Path: f.IndexPath(), Content: WrapGenerated(renderFeatureIndex(ix, f))},
			Output{Path: f.ContractPath(), Content: WrapGenerated(renderContract(ix, f))})
		if len(f.Globs()) > 0 {
			outs = append(outs, Output{Path: f.RulesPath(), Content: WrapGenerated(renderRules(ix, f))})
		}
	}
	for _, rel := range ix.Tree {
		if path.Base(rel) != "CLAUDE.md" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(ix.Root, filepath.FromSlash(rel)))
		if err != nil {
			return nil, nil, fmt.Errorf("reading %s: %w", rel, err)
		}
		content := string(data)
		if !strings.Contains(content, kbCommentPrefix) {
			continue
		}
		rendered, count, err := ApplyFragments(content, claudeFragments(ix, path.Dir(rel)))
		if err != nil {
			findings = append(findings, Finding{Path: rel, Msg: err.Error()})
			continue
		}
		if count > 0 {
			outs = append(outs, Output{Path: rel, Content: rendered})
		}
	}
	sort.Slice(outs, func(i, j int) bool { return outs[i].Path < outs[j].Path })
	return outs, findings, nil
}

// Apply writes every output whose content differs from disk and returns the paths written.
func Apply(root string, outs []Output) ([]string, error) {
	var written []string
	for _, o := range outs {
		abs := filepath.Join(root, filepath.FromSlash(o.Path))
		cur, err := os.ReadFile(abs)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return written, fmt.Errorf("reading %s: %w", o.Path, err)
		}
		if err == nil && string(cur) == o.Content {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return written, fmt.Errorf("creating %s: %w", filepath.Dir(o.Path), err)
		}
		if err := os.WriteFile(abs, []byte(o.Content), 0o644); err != nil {
			return written, fmt.Errorf("writing %s: %w", o.Path, err)
		}
		written = append(written, o.Path)
	}
	return written, nil
}

// row renders the one-line record shape shared by every index and rules file.
func row(ix *Index, r *Record) string {
	meta := []string{r.Status + ", " + r.Date}
	if r.Type == TypeFact && r.Verified != nil {
		meta = append(meta, "verified "+ix.ResolvedVerified(r))
	}
	if len(r.Features) > 0 {
		meta = append(meta, "features: "+strings.Join(r.Features, ", "))
	}
	return fmt.Sprintf("- `%s` — %s (%s) → `%s`", r.Token(), r.Summary, strings.Join(meta, "; "), r.Path)
}

// sectionTitle is the heading for a type's section.
func sectionTitle(t Type) string {
	switch t {
	case TypeRule:
		return "Rules"
	case TypeSpec:
		return "Specs"
	case TypeDecision:
		return "Decisions"
	case TypeFact:
		return "Facts"
	case TypeLesson:
		return "Lessons"
	case TypeRunbook:
		return "Runbooks"
	default:
		return "References"
	}
}

// renderSections writes one section per type (live records only, in type order) and a
// trailing section for everything retired, rejected or superseded.
func renderSections(b *strings.Builder, ix *Index, rs []*Record, skip Type) {
	var dead []*Record
	for _, t := range typeOrder {
		if t == skip {
			continue
		}
		var live []*Record
		for _, r := range rs {
			if r.Type != t {
				continue
			}
			if r.Live() {
				live = append(live, r)
			} else {
				dead = append(dead, r)
			}
		}
		if len(live) == 0 {
			continue
		}
		sortRecords(live)
		fmt.Fprintf(b, "\n## %s\n\n", sectionTitle(t))
		for _, r := range live {
			b.WriteString(row(ix, r) + "\n")
		}
	}
	if len(dead) > 0 {
		sortRecords(dead)
		b.WriteString("\n## Retired, rejected and superseded\n\n")
		for _, r := range dead {
			b.WriteString(row(ix, r) + "\n")
		}
	}
}

func cell(s string) string { return strings.ReplaceAll(s, "|", "\\|") }

func renderRootIndex(ix *Index) string {
	var b strings.Builder
	b.WriteString("# Knowledge base\n\n")
	if len(ix.Features) == 0 {
		b.WriteString("_No features registered yet._\n")
	} else {
		b.WriteString("| feature | summary | spec | contract |\n|---|---|---|---|\n")
		for _, f := range ix.Features {
			fmt.Fprintf(&b, "| %s | %s | `%s` | `%s` |\n", f.Name, cell(f.Summary), f.SpecPath(), f.ContractPath())
		}
	}
	renderSections(&b, ix, ix.Records, "")
	return b.String()
}

func renderFeatureIndex(ix *Index, f *Feature) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n%s\n\n- Spec: `%s`\n- Contract: `%s`\n", f.Name, f.Summary, f.SpecPath(), f.ContractPath())
	b.WriteString("\n## Files\n\n```\n")
	for _, kv := range []struct {
		k string
		v []string
	}{{"go", f.Go}, {"web", f.Web}, {"e2e", f.E2E}} {
		for _, g := range kv.v {
			fmt.Fprintf(&b, "%s: %s\n", kv.k, g)
		}
	}
	if len(f.Globs()) == 0 {
		b.WriteString("(none)\n")
	}
	b.WriteString("```\n")
	if len(f.Protocol) > 0 {
		b.WriteString("\n## Protocol\n\n")
		for _, id := range f.Protocol {
			if a, ok := ix.Anchors[id]; ok {
				fmt.Fprintf(&b, "- `%s` — %s\n", id, a.Heading)
			}
		}
	}
	renderSections(&b, ix, ix.ByFeature[f.Name], TypeSpec)
	return b.String()
}

func renderContract(ix *Index, f *Feature) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s — protocol contract\n\nSlices of `%s` named by the protocol list in `%s`.\n", f.Name, protocolPath, f.SpecPath())
	if len(f.Protocol) == 0 {
		b.WriteString("\nNo protocol surface.\n")
		return b.String()
	}
	for _, id := range f.Protocol {
		a, ok := ix.Anchors[id]
		if !ok {
			continue
		}
		b.WriteString("\n" + Slice(ix.Protocol, a) + "\n")
	}
	return b.String()
}

// liveRecordsOf returns a feature's live records, by type then id.
func liveRecordsOf(ix *Index, name string) []*Record {
	var out []*Record
	for _, r := range ix.ByFeature[name] {
		if r.Live() && r.Type != TypeSpec {
			out = append(out, r)
		}
	}
	sortRecords(out)
	return out
}

// renderRules renders the path-scoped rules file: frontmatter listing the feature's
// globs, then the summary, the two read-first paths and its live records, truncated to
// RuleFileLines with a pointer at the feature index.
func renderRules(ix *Index, f *Feature) string {
	var head strings.Builder
	head.WriteString("---\npaths:\n")
	for _, g := range f.Globs() {
		fmt.Fprintf(&head, "  - %q\n", g)
	}
	head.WriteString("---\n")
	fmt.Fprintf(&head, "# %s\n\n%s\n\nRead first: `%s`, `%s`\n", f.Name, f.Summary, f.SpecPath(), f.ContractPath())
	rows := []string{}
	for _, r := range liveRecordsOf(ix, f.Name) {
		rows = append(rows, row(ix, r))
	}
	if len(rows) == 0 {
		return head.String()
	}
	// One header line is added by WrapGenerated; one blank line precedes the rows.
	fixed := strings.Count(head.String(), "\n") + 2
	keep := len(rows)
	if fixed+keep > RuleFileLines {
		keep = RuleFileLines - fixed - 1
		if keep < 0 {
			keep = 0
		}
	}
	var b strings.Builder
	b.WriteString(head.String() + "\n")
	for _, r := range rows[:keep] {
		b.WriteString(r + "\n")
	}
	if keep < len(rows) {
		fmt.Fprintf(&b, "… %d more: see `%s`\n", len(rows)-keep, f.IndexPath())
	}
	return b.String()
}

// rulesOverBudget reports how many live records a feature has when its rules file would
// need truncation, else 0.
func rulesOverBudget(ix *Index, f *Feature) int {
	n := len(liveRecordsOf(ix, f.Name))
	if n == 0 || len(f.Globs()) == 0 {
		return 0
	}
	if strings.Contains(renderRules(ix, f), "more: see") {
		return n
	}
	return 0
}

// underDir reports whether relpath sits under dir (empty dir means the whole tree).
func underDir(dir, relpath string) bool {
	return dir == "" || dir == "." || strings.HasPrefix(relpath, dir+"/")
}

// globTouchesDir reports whether pattern matches any tree file under dir.
func globTouchesDir(ix *Index, dir, pattern string) bool {
	for _, p := range ix.Tree {
		if underDir(dir, p) && MatchGlob(pattern, p) {
			return true
		}
	}
	return false
}

// claudeFragments renders the two fragment values for the CLAUDE.md in dir.
func claudeFragments(ix *Index, dir string) map[string]string {
	var feat strings.Builder
	feat.WriteString("| feature | summary | docs |\n|---|---|---|")
	for _, f := range ix.Features {
		fmt.Fprintf(&feat, "\n| %s | %s | `%s` |", f.Name, cell(f.Summary), f.IndexPath())
	}

	var lines []string
	for _, f := range ix.Features {
		for _, g := range f.Globs() {
			if globTouchesDir(ix, dir, g) {
				lines = append(lines, fmt.Sprintf("- **%s** — %s → `%s`", f.Name, f.Summary, f.IndexPath()))
				break
			}
		}
	}
	var rs []*Record
	for _, r := range ix.Records {
		if !r.Live() {
			continue
		}
		for _, g := range r.Files {
			if globTouchesDir(ix, dir, g) {
				rs = append(rs, r)
				break
			}
		}
	}
	sortRecords(rs)
	for _, r := range rs {
		lines = append(lines, row(ix, r))
	}
	trailer := "_No feature or record covers this directory yet._"
	if len(lines) > 0 {
		trailer = strings.Join(lines, "\n")
	}
	return map[string]string{
		"features": wrapFragment(feat.String()),
		"trailer":  wrapFragment(trailer),
	}
}
