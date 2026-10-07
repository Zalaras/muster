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

// generatedBasenames are the two generated files that share a feature directory.
var generatedBasenames = map[string]bool{"INDEX.md": true, "contract.md": true}

// Load reads root/kb.yaml, walks the record directories it names, parses every record,
// reads the observed version range and the protocol anchors, and returns the index with
// every content problem as a finding. Only I/O failures and a missing or malformed config
// are errors.
func Load(root string) (*Index, []Finding, error) {
	cfg, err := LoadConfig(root)
	if err != nil {
		return nil, nil, err
	}
	tree, err := WalkTree(root, cfg)
	if err != nil {
		return nil, nil, err
	}
	ix := &Index{Root: root, Config: cfg, Tree: tree}
	var findings []Finding

	if err = loadObserved(ix); err != nil {
		return nil, nil, err
	}

	protocol, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(cfg.Paths.Protocol)))
	switch {
	case err == nil:
		ix.Protocol = string(protocol)
		var fs []Finding
		ix.Anchors, ix.AnchorOrder, fs = ParseAnchors(cfg.Paths.Protocol, ix.Protocol)
		findings = append(findings, fs...)
	case errors.Is(err, fs.ErrNotExist):
		ix.Anchors = map[string]Anchor{}
	default:
		return nil, nil, fmt.Errorf("reading %s: %w", cfg.Paths.Protocol, err)
	}

	recordFindings, err := loadRecords(ix)
	if err != nil {
		return nil, nil, err
	}
	findings = append(findings, recordFindings...)
	findings = append(findings, featureDirFindings(cfg, root, tree)...)

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

// loadRecords parses every record file in the tree into ix.Records: the spec.md of each
// feature directory and every markdown file in a record directory.
func loadRecords(ix *Index) ([]Finding, error) {
	cfg := ix.Config
	specDir := cfg.SpecDir() + "/"
	specDepth := strings.Count(specDir, "/") + 2
	var findings []Finding
	for _, rel := range ix.Tree {
		if !strings.HasSuffix(rel, ".md") {
			continue
		}
		if strings.HasPrefix(rel, specDir) {
			parts := strings.Split(rel, "/")
			if len(parts) != specDepth || generatedBasenames[parts[specDepth-1]] {
				continue
			}
			if parts[specDepth-1] != "spec.md" {
				findings = append(findings, Finding{Path: rel,
					Msg: "is not a record (a feature directory holds spec.md plus the generated INDEX.md and contract.md)"})
				continue
			}
		} else if !isRecordDir(cfg, path.Dir(rel)) {
			continue
		}
		r, fs, err := loadRecord(cfg, ix.Root, rel)
		if err != nil {
			return nil, err
		}
		findings = append(findings, fs...)
		ix.Records = append(ix.Records, r)
	}
	return findings, nil
}

func isRecordDir(cfg *Config, dir string) bool {
	for t, d := range cfg.Dirs {
		if t != TypeSpec && d == dir {
			return true
		}
	}
	return false
}

// loadObserved reads the observed-versions record from disk (never the embedded copy) so a
// bump is visible without a rebuild. An empty path in the config turns the range off.
func loadObserved(ix *Index) error {
	rel := ix.Config.Paths.ObservedVersions
	if rel == "" {
		return nil
	}
	f, err := os.Open(filepath.Join(ix.Root, filepath.FromSlash(rel)))
	if err != nil {
		return fmt.Errorf("opening %s: %w", rel, err)
	}
	defer func() { _ = f.Close() }()
	rows, err := claudecode.ParseObservedVersions(f)
	if err != nil {
		return fmt.Errorf("parsing %s: %w", rel, err)
	}
	ix.Floor, ix.Verified = claudecode.RangeOf(rows)
	return nil
}

func loadRecord(cfg *Config, root, rel string) (*Record, []Finding, error) {
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
		t, id, _ := expectedFor(cfg, rel)
		return &Record{Path: rel, Type: t, ID: id, FieldLine: map[string]int{}}, []Finding{f}, nil
	}
	r, fs := RecordFromFields(cfg, rel, fields, body, bodyLine)
	return r, fs, nil
}

// featureDirFindings reports a feature directory with no spec.md, or whose name is not a
// slug.
func featureDirFindings(cfg *Config, root string, tree []string) []Finding {
	specDir := cfg.SpecDir() + "/"
	entries, err := os.ReadDir(filepath.Join(root, filepath.FromSlash(cfg.SpecDir())))
	if err != nil {
		return nil
	}
	have := map[string]bool{}
	for _, rel := range tree {
		if strings.HasPrefix(rel, specDir) && strings.HasSuffix(rel, "/spec.md") {
			have[strings.TrimSuffix(strings.TrimPrefix(rel, specDir), "/spec.md")] = true
		}
	}
	var out []Finding
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := specDir + e.Name() + "/"
		switch {
		case !slugRE.MatchString(e.Name()):
			out = append(out, Finding{Path: dir, Msg: "feature directory name is not a slug"})
		case !have[e.Name()]:
			out = append(out, Finding{Path: dir, Msg: "directory has no spec.md"})
		}
	}
	return out
}
