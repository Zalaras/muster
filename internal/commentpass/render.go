package commentpass

import (
	"fmt"
	"strings"
)

func fence(body string) string {
	marker := "```"
	for strings.Contains(body, marker) {
		marker += "`"
	}
	return marker + "\n" + strings.TrimRight(body, "\n") + "\n" + marker + "\n"
}

// renderCandidates writes the judge's one input: each stripped file once, then its
// candidates with where they sat and exactly what they said.
func renderCandidates(m *Manifest, stripped map[string]string) string {
	var b strings.Builder
	total := 0
	for _, f := range m.Files {
		total += len(f.Candidates)
	}
	fmt.Fprintf(&b, "# Comment candidates — plan %s\n\n%d candidates in %d files. Rule on every id exactly once.\n\n", m.Plan, total, len(m.Files))
	for _, f := range m.Files {
		fmt.Fprintf(&b, "## %s (%d)\n\nThe file as it reads with every candidate removed:\n\n", f.Path, len(f.Candidates))
		b.WriteString(fence(stripped[f.Path]))
		b.WriteString("\n")
		for _, c := range f.Candidates {
			fmt.Fprintf(&b, "### %s — %s\n\n", c.ID, describeAnchor(c.Anchor))
			meta := []string{c.Origin, string(c.Kind)}
			if c.Doc != "" {
				meta = append(meta, "doc of `"+c.Doc+"`")
			}
			if c.Origin == "edited" {
				meta = append(meta, fmt.Sprintf("%d of %d lines new", c.Added, c.Total))
			}
			if c.Note != "" {
				meta = append(meta, c.Note)
			}
			fmt.Fprintf(&b, "%s\n\n", strings.Join(meta, " · "))
			if len(c.Names) > 0 {
				fmt.Fprintf(&b, "names removed by the branch: `%s`\n\n", strings.Join(c.Names, "`, `"))
			}
			if len(c.Previous) > 0 {
				b.WriteString("previously:\n\n")
				b.WriteString(fence(strings.Join(c.Previous, "\n")))
				b.WriteString("\n")
			}
			b.WriteString(fence(strings.Join(c.Lines, "\n")))
			b.WriteString("\n")
		}
	}
	return b.String()
}

func describeAnchor(a Anchor) string {
	switch a.Kind {
	case "on":
		return fmt.Sprintf("on line %d: `%s`", a.Line, a.Text)
	case "above":
		if a.Line > 0 {
			return fmt.Sprintf("above line %d: `%s`", a.Line, a.Text)
		}
		return fmt.Sprintf("above: `%s`", a.Text)
	}
	return "at end of file"
}
