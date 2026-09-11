package kb

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// citeRE matches a citation token anywhere on a line: a record prefix with a slug id, or
// the anchor prefix with a dotted anchor id.
var citeRE = regexp.MustCompile(`kb:(?:(rule|adr|spec|fact|lesson|runbook|ref)/([a-z0-9][a-z0-9-]*)|(anchor)/([a-z0-9-]+(?:\.[a-z0-9-]+)*))`)

// Citation is one kb token found in the tree.
type Citation struct {
	Path   string
	Line   int
	Prefix string
	ID     string
}

func (c Citation) Token() string { return "kb:" + c.Prefix + "/" + c.ID }

// typeForPrefix maps a citation prefix to its record type; anchor has none.
func typeForPrefix(prefix string) (Type, bool) {
	for t, p := range prefixOfType {
		if p == prefix {
			return t, true
		}
	}
	return "", false
}

// citationScope mirrors dead-refs: markdown outside plans, history and research, and Go
// and TypeScript comments, minus the e2e specs.
func citationScope(rel string) bool {
	if strings.HasPrefix(rel, "plans/") || strings.HasPrefix(rel, "docs/history/") || strings.HasPrefix(rel, "docs/research/") {
		return false
	}
	if strings.HasPrefix(rel, "web/e2e/") && strings.HasSuffix(rel, ".spec.ts") {
		return false
	}
	return strings.HasSuffix(rel, ".md") || strings.HasSuffix(rel, ".go") || strings.HasSuffix(rel, ".ts")
}

// ScanCitations finds every citation token in scope. A record file is scanned from its
// body onwards; its frontmatter refs are validated by the refs rule instead.
func ScanCitations(ix *Index) ([]Citation, error) {
	var out []Citation
	for _, rel := range ix.Tree {
		if !citationScope(rel) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(ix.Root, filepath.FromSlash(rel)))
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", rel, err)
		}
		skipBelow := 0
		if r, ok := recordAtPath(ix, rel); ok {
			skipBelow = r.BodyLine
		}
		for _, ln := range CommentLines(rel, string(data)) {
			if ln.N < skipBelow {
				continue
			}
			for _, m := range citeRE.FindAllStringSubmatch(ln.Text, -1) {
				c := Citation{Path: rel, Line: ln.N, Prefix: m[1], ID: m[2]}
				if m[3] != "" {
					c.Prefix, c.ID = m[3], m[4]
				}
				out = append(out, c)
			}
		}
	}
	return out, nil
}

func recordAtPath(ix *Index, rel string) (*Record, bool) {
	for _, r := range ix.Records {
		if r.Path == rel {
			return r, true
		}
	}
	return nil, false
}

// resolveCitation returns the finding message for an unresolvable or mistyped token, or
// empty when it resolves.
func resolveCitation(ix *Index, prefix, id string) string {
	if prefix == "anchor" {
		if _, ok := ix.Anchors[id]; !ok {
			return fmt.Sprintf("citation kb:anchor/%s names no kb:anchor in %s", id, protocolPath)
		}
		return ""
	}
	r, ok := ix.ByID[id]
	if !ok {
		return fmt.Sprintf("citation kb:%s/%s resolves to no record", prefix, id)
	}
	if want, _ := typeForPrefix(prefix); want != r.Type {
		return fmt.Sprintf("citation kb:%s/%s names a %s (want %s)", prefix, id, r.Type, r.Token())
	}
	return ""
}
