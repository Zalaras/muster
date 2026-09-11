package kb

import (
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strings"
)

// RelPath normalises an absolute or cwd-relative path to repo-relative slash form.
func RelPath(root, cwd, p string) (string, error) {
	abs := p
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(cwd, p)
	}
	rel, err := filepath.Rel(root, abs)
	if err != nil {
		return "", fmt.Errorf("%s is not under the repo root: %w", p, err)
	}
	rel = filepath.ToSlash(rel)
	if rel == ".." || strings.HasPrefix(rel, "../") {
		return "", fmt.Errorf("%s is not under the repo root", p)
	}
	return rel, nil
}

func lookup(ix *Index, id string) (*Record, error) {
	r, ok := ix.ByID[id]
	if !ok {
		return nil, fmt.Errorf("no record with id %q (try: kb find %s)", id, id)
	}
	return r, nil
}

func listRow(r *Record) string {
	return fmt.Sprintf("%-9s %-40s %s\n", r.Type, r.Token(), r.Summary)
}

// For prints the features and live records covering a repo-relative path.
func For(ix *Index, rel string, w io.Writer) error {
	fs, rs := ix.Covering(rel)
	if len(fs) == 0 && len(rs) == 0 {
		_, err := fmt.Fprintf(w, "kb: nothing covers %s\n", rel)
		return err
	}
	var b strings.Builder
	if len(fs) > 0 {
		b.WriteString("features:\n")
		for _, f := range fs {
			fmt.Fprintf(&b, "  %s — %s (%s, %s)\n", f.Name, f.Summary, f.SpecPath(), f.ContractPath())
		}
	}
	if len(rs) > 0 {
		b.WriteString("records:\n")
		for _, r := range rs {
			fmt.Fprintf(&b, "  %-9s %-40s %s (%s)\n", r.Type, r.Token(), r.Summary, r.Path)
		}
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// Why prints the accepted decisions and active facts whose files cover a path, newest
// first, falling back to the covering features' summaries.
func Why(ix *Index, rel string, w io.Writer) error {
	fs, rs := ix.Covering(rel)
	var hits []*Record
	for _, r := range rs {
		if (r.Type == TypeDecision && r.Status == "accepted") || (r.Type == TypeFact && r.Status == "active") {
			hits = append(hits, r)
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Date != hits[j].Date {
			return hits[i].Date > hits[j].Date
		}
		return hits[i].ID < hits[j].ID
	})
	var b strings.Builder
	switch {
	case len(hits) > 0:
		for _, r := range hits {
			fmt.Fprintf(&b, "%s  %-40s %s\n", r.Date, r.Token(), r.Summary)
		}
	case len(fs) > 0:
		fmt.Fprintf(&b, "kb: no decision or fact names %s; the features covering it say:\n", rel)
		for _, f := range fs {
			fmt.Fprintf(&b, "  %s — %s (%s)\n", f.Name, f.Summary, f.SpecPath())
		}
	default:
		fmt.Fprintf(&b, "kb: nothing covers %s\n", rel)
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// Show prints one record with its frontmatter replaced by a header.
func Show(ix *Index, id string, w io.Writer) error {
	r, err := lookup(ix, id)
	if err != nil {
		return err
	}
	_, err = io.WriteString(w, RenderRecord(ix, r))
	return err
}

// Cite prints a record's token and its path.
func Cite(ix *Index, id string, w io.Writer) error {
	r, err := lookup(ix, id)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "%s\n%s\n", r.Token(), r.Path)
	return err
}

// Find prints every record whose id, summary, tags or body contain all the words,
// case-insensitively.
func Find(ix *Index, words []string, w io.Writer) error {
	if len(words) == 0 {
		return errors.New("usage: kb find <word>... (at least one word)")
	}
	var hits []*Record
	for _, r := range ix.Records {
		hay := strings.ToLower(r.ID + " " + r.Summary + " " + strings.Join(r.Tags, " ") + " " + r.Body)
		all := true
		for _, wd := range words {
			if !strings.Contains(hay, strings.ToLower(wd)) {
				all = false
				break
			}
		}
		if all {
			hits = append(hits, r)
		}
	}
	sortRecords(hits)
	var b strings.Builder
	for _, r := range hits {
		b.WriteString(listRow(r))
	}
	if len(hits) == 0 {
		fmt.Fprintf(&b, "kb: no record matches %s\n", strings.Join(words, " "))
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// ListFilter narrows kb ls. Type accepts a type name or its citation prefix; Guard
// accepts the word none to list facts without a guard.
type ListFilter struct {
	Type    string
	Feature string
	Status  string
	Role    string
	Guard   string
}

// List prints records matching every set filter, by type then id.
func List(ix *Index, f ListFilter, w io.Writer) error {
	var want Type
	if f.Type != "" {
		if t, ok := typeForPrefix(f.Type); ok {
			want = t
		} else if _, ok := dirOfType[Type(f.Type)]; ok {
			want = Type(f.Type)
		} else {
			return fmt.Errorf("unknown type %q (want %s)", f.Type, joinOr(typeNames()))
		}
	}
	if f.Guard != "" && f.Guard != "none" {
		return fmt.Errorf("--guard accepts only none")
	}
	var hits []*Record
	for _, r := range ix.Records {
		if want != "" && r.Type != want {
			continue
		}
		if f.Feature != "" && !contains(r.Features, f.Feature) {
			continue
		}
		if f.Status != "" && r.Status != f.Status {
			continue
		}
		if f.Role != "" && !contains(r.Roles, f.Role) {
			continue
		}
		if f.Guard == "none" && (r.Type != TypeFact || r.HasGuard()) {
			continue
		}
		hits = append(hits, r)
	}
	sortRecords(hits)
	var b strings.Builder
	for _, r := range hits {
		b.WriteString(listRow(r))
	}
	_, err := io.WriteString(w, b.String())
	return err
}
