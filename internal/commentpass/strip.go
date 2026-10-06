package commentpass

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func sha(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

type stripStats struct {
	total, alreadyKept int
	counts             map[string]int
}

// Strip collects the branch's candidate comments, removes them from the tree and writes
// candidates.json and candidates.md under outDir. Nothing is written when a file would
// stop parsing or when there are no candidates.
func (p *Pass) Strip(ctx context.Context, outDir string, all bool) error {
	if err := p.requireBranch(ctx); err != nil {
		return err
	}
	base, err := p.mergeBase(ctx)
	if err != nil {
		return err
	}
	d, err := p.diff(ctx, base)
	if err != nil {
		return err
	}
	ledger, _, err := p.readLedger()
	if err != nil {
		return err
	}
	m, stripped, stats, err := p.collectCandidates(ctx, d, ledger, all)
	if err != nil {
		return err
	}
	m.Base = base
	if stats.total == 0 {
		p.printf("strip: 0 candidates (%d already kept in %s)\n", stats.alreadyKept, p.ledgerPath())
		return nil
	}
	text, err := p.writeStripped(ctx, m, stripped)
	if err != nil {
		return err
	}
	if err := writeArtifacts(outDir, m, text); err != nil {
		return err
	}
	p.printf("strip: %d candidates in %d files (%d added, %d edited, %d stale-ref; %d already kept) → %s\n",
		stats.total, len(m.Files), stats.counts["added"], stats.counts["edited"], stats.counts["stale-ref"], stats.alreadyKept, filepath.Join(outDir, "candidates.md"))
	return nil
}

// collectCandidates builds the manifest and the stripped text of every file with at
// least one candidate, formatting Go in memory so a file that stops parsing refuses the
// whole run before any write.
func (p *Pass) collectCandidates(ctx context.Context, d *diffInfo, ledger *Ledger, all bool) (*Manifest, map[string][]byte, stripStats, error) {
	stats := stripStats{counts: map[string]int{}}
	scans, added, err := p.collectAdded(ctx, d)
	if err != nil {
		return nil, nil, stats, err
	}
	stale, err := p.collectStale(ctx, d, scans, added)
	if err != nil {
		return nil, nil, stats, err
	}
	m := &Manifest{Plan: p.Plan}
	stripped := map[string][]byte{}
	for _, path := range sortedKeys(added, stale) {
		fs := scans[path]
		cands, kept := fileCandidates(path, fs, added[path], stale[path], d, ledger, all)
		stats.alreadyKept += kept
		if len(cands) == 0 {
			continue
		}
		var spans []Span
		for _, c := range cands {
			spans = append(spans, c.Span)
			stats.counts[c.Origin]++
			stats.total++
		}
		out := removeSpans(fs.src, spans)
		if isGo(path) {
			if out, err = formatGo(out); err != nil {
				return nil, nil, stats, fmt.Errorf("%w: %s no longer parses with its comments removed: %w", ErrRefused, path, err)
			}
		}
		stripped[path] = out
		m.Files = append(m.Files, FileEntry{Path: path, Original: string(fs.src), Candidates: cands})
	}
	return m, stripped, stats, nil
}

// fileCandidates orders one file's added and stale blocks, skips those the ledger keeps
// (unless all) and assigns ids and anchors.
func fileCandidates(path string, fs *fileScan, added []addedBlock, stale []Candidate, d *diffInfo, ledger *Ledger, all bool) ([]Candidate, int) {
	verdicts := ledger.latestVerdicts()
	var cands []Candidate
	for _, a := range added {
		c := Candidate{Path: path, Kind: a.Kind, Span: a.Span, Lines: a.Lines, Total: len(a.Lines), Added: a.added, Origin: "added"}
		if a.added < len(a.Lines) {
			c.Origin = "edited"
			c.Previous = d.removedComments(path)
		}
		cands = append(cands, c)
	}
	cands = append(cands, stale...)
	sort.Slice(cands, func(i, j int) bool { return cands[i].Span.Start < cands[j].Span.Start })
	var kept []Candidate
	alreadyKept := 0
	for _, c := range cands {
		c.Key = KeyOf(path, c.Lines)
		if !all && verdicts[c.Key] == "keep" {
			alreadyKept++
			continue
		}
		if verdicts[c.Key] == "drop" {
			c.Note = fmt.Sprintf("previously dropped in cycle %d", ledger.droppedIn(c.Key))
		}
		c.ID = fmt.Sprintf("%s#%d", path, len(kept)+1)
		c.Anchor = anchorFor(fs.src, blockOf(fs, c.Span))
		c.Doc = docOf(c.Anchor)
		kept = append(kept, c)
	}
	return kept, alreadyKept
}

func sortedKeys[A, B any](a map[string]A, b map[string]B) []string {
	set := map[string]bool{}
	for k := range a {
		set[k] = true
	}
	for k := range b {
		set[k] = true
	}
	keys := make([]string, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// writeStripped writes the stripped files, runs the TS formatter, and records what is
// now on disk: its hash, its text for the judge, and each anchor's line in it.
func (p *Pass) writeStripped(ctx context.Context, m *Manifest, stripped map[string][]byte) (map[string]string, error) {
	paths := make([]string, len(m.Files))
	for i, f := range m.Files {
		paths[i] = f.Path
	}
	dirty, err := p.dirtySet(ctx, paths)
	if err != nil {
		return nil, err
	}
	var tsRels []string
	for i := range m.Files {
		f := &m.Files[i]
		f.Dirty = dirty[f.Path]
		if werr := p.writeFile(f.Path, stripped[f.Path]); werr != nil {
			return nil, werr
		}
		if !isGo(f.Path) {
			tsRels = append(tsRels, f.Path)
		}
	}
	if ferr := p.FormatTS(ctx, p.Root, tsRels); ferr != nil {
		return nil, ferr
	}
	text := map[string]string{}
	for i := range m.Files {
		f := &m.Files[i]
		live, rerr := p.readFile(f.Path)
		if rerr != nil {
			return nil, rerr
		}
		f.StrippedSHA = sha(live)
		text[f.Path] = string(live)
		spans := make([]Span, len(f.Candidates))
		for j, c := range f.Candidates {
			spans[j] = c.Span
		}
		for j := range f.Candidates {
			f.Candidates[j].Anchor.Line = locateAnchor([]byte(f.Original), live, f.Candidates[j].Anchor, spans)
		}
	}
	return text, nil
}

func writeArtifacts(outDir string, m *Manifest, text map[string]string) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	mj, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	if werr := os.WriteFile(filepath.Join(outDir, "candidates.json"), append(mj, '\n'), 0o644); werr != nil {
		return werr
	}
	return os.WriteFile(filepath.Join(outDir, "candidates.md"), []byte(renderCandidates(m, text)), 0o644)
}

func blockOf(fs *fileScan, span Span) Block {
	for _, b := range fs.blocks {
		if b.Span.Start == span.Start {
			return b
		}
	}
	li := indexLines(fs.src)
	return Block{Span: span, StartLine: li.lineOf(span.Start), EndLine: li.lineOf(max(span.Start, span.End-1))}
}

func (p *Pass) dirtySet(ctx context.Context, paths []string) (map[string]bool, error) {
	if len(paths) == 0 {
		return nil, nil
	}
	args := append([]string{"status", "--porcelain", "--untracked-files=all", "--"}, paths...)
	out, err := p.git(ctx, args...)
	if err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for _, l := range strings.Split(out, "\n") {
		if len(l) > 3 {
			set[strings.TrimSpace(l[3:])] = true
		}
	}
	return set, nil
}
