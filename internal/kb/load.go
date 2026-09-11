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

	"github.com/Zalaras/muster/internal/claudecode"
)

// observedVersionsPath is the on-disk observed-versions record, read fresh (never the
// embedded copy) so a bump is visible without a rebuild.
const observedVersionsPath = "internal/claudecode/observed_versions.txt"

// generatedBasenames are the two generated files that share a feature directory.
var generatedBasenames = map[string]bool{"INDEX.md": true, "contract.md": true}

// Load walks the seven record directories under root, parses every record, reads the
// observed version range and the protocol anchors, and returns the index with every
// content problem as a finding. Only I/O failures are errors.
func Load(root string) (*Index, []Finding, error) {
	tree, err := WalkTree(root)
	if err != nil {
		return nil, nil, err
	}
	ix := &Index{Root: root, Tree: tree}
	var findings []Finding

	if err = loadObserved(ix); err != nil {
		return nil, nil, err
	}

	protocol, err := os.ReadFile(filepath.Join(root, protocolPath))
	switch {
	case err == nil:
		ix.Protocol = string(protocol)
		var fs []Finding
		ix.Anchors, ix.AnchorOrder, fs = ParseAnchors(ix.Protocol)
		findings = append(findings, fs...)
	case errors.Is(err, fs.ErrNotExist):
		ix.Anchors = map[string]Anchor{}
	default:
		return nil, nil, fmt.Errorf("reading %s: %w", protocolPath, err)
	}

	for _, rel := range tree {
		if !strings.HasSuffix(rel, ".md") {
			continue
		}
		dir := path.Dir(rel)
		if strings.HasPrefix(rel, "docs/features/") {
			parts := strings.Split(rel, "/")
			if len(parts) != 4 {
				continue
			}
			if generatedBasenames[parts[3]] {
				continue
			}
			if parts[3] != "spec.md" {
				findings = append(findings, Finding{Path: rel,
					Msg: "is not a record (a feature directory holds spec.md plus the generated INDEX.md and contract.md)"})
				continue
			}
		} else if !isRecordDir(dir) {
			continue
		}
		r, fs, err := loadRecord(root, rel)
		if err != nil {
			return nil, nil, err
		}
		findings = append(findings, fs...)
		ix.Records = append(ix.Records, r)
	}
	findings = append(findings, featureDirFindings(root, tree)...)

	// Duplicate ids are reported on the lexically later path.
	sort.Slice(ix.Records, func(i, j int) bool { return ix.Records[i].Path < ix.Records[j].Path })
	first := map[string]string{}
	for _, r := range ix.Records {
		if prev, dup := first[r.ID]; dup {
			findings = append(findings, Finding{Path: r.Path, Msg: fmt.Sprintf("duplicate id %q (also %s)", r.ID, prev)})
			continue
		}
		first[r.ID] = r.Path
	}
	ix.finish()
	return ix, findings, nil
}

func isRecordDir(dir string) bool {
	for t, d := range dirOfType {
		if t != TypeSpec && d == dir {
			return true
		}
	}
	return false
}

func loadObserved(ix *Index) error {
	f, err := os.Open(filepath.Join(ix.Root, observedVersionsPath))
	if err != nil {
		return fmt.Errorf("opening %s: %w", observedVersionsPath, err)
	}
	defer func() { _ = f.Close() }()
	rows, err := claudecode.ParseObservedVersions(f)
	if err != nil {
		return fmt.Errorf("parsing %s: %w", observedVersionsPath, err)
	}
	ix.Floor, ix.Verified = claudecode.RangeOf(rows)
	return nil
}

func loadRecord(root, rel string) (*Record, []Finding, error) {
	src, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return nil, nil, fmt.Errorf("reading %s: %w", rel, err)
	}
	fields, body, bodyLine, perr := ParseFrontmatter(src)
	if perr != nil {
		var se *SyntaxError
		f := Finding{Path: rel, Msg: perr.Error()}
		if errors.As(perr, &se) {
			f.Line, f.Msg = se.Line, se.Msg
		}
		t, id, _ := expectedFor(rel)
		return &Record{Path: rel, Type: t, ID: id, FieldLine: map[string]int{}}, []Finding{f}, nil
	}
	r, fs := RecordFromFields(rel, fields, body, bodyLine)
	return r, fs, nil
}

// featureDirFindings reports a docs/features/<name>/ directory with no spec.md, or whose
// name is not a slug.
func featureDirFindings(root string, tree []string) []Finding {
	entries, err := os.ReadDir(filepath.Join(root, "docs", "features"))
	if err != nil {
		return nil
	}
	have := map[string]bool{}
	for _, rel := range tree {
		if strings.HasPrefix(rel, "docs/features/") && strings.HasSuffix(rel, "/spec.md") {
			have[strings.TrimSuffix(strings.TrimPrefix(rel, "docs/features/"), "/spec.md")] = true
		}
	}
	var out []Finding
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := "docs/features/" + e.Name() + "/"
		switch {
		case !slugRE.MatchString(e.Name()):
			out = append(out, Finding{Path: dir, Msg: "feature directory name is not a slug"})
		case !have[e.Name()]:
			out = append(out, Finding{Path: dir, Msg: "directory has no spec.md"})
		}
	}
	return out
}
