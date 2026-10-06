package commentpass

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Anchor says where a comment sat, for a reader; correctness never relocates by it.
type Anchor struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
	Line int    `json:"line"`
}

// Candidate is one block the judge rules on.
type Candidate struct {
	ID       string   `json:"id"`
	Path     string   `json:"path"`
	Key      string   `json:"key"`
	Kind     Kind     `json:"kind"`
	Span     Span     `json:"span"`
	Lines    []string `json:"lines"`
	Anchor   Anchor   `json:"anchor"`
	Origin   string   `json:"origin"`
	Added    int      `json:"added_lines"`
	Total    int      `json:"total_lines"`
	Previous []string `json:"previous,omitempty"`
	Names    []string `json:"names,omitempty"`
	Doc      string   `json:"doc,omitempty"`
	Note     string   `json:"note,omitempty"`
}

// FileEntry snapshots one file: its exact bytes before strip, what strip wrote, and its
// candidates in file order.
type FileEntry struct {
	Path        string      `json:"path"`
	Original    string      `json:"original"`
	StrippedSHA string      `json:"stripped_sha256"`
	Dirty       bool        `json:"dirty"`
	Candidates  []Candidate `json:"candidates"`
}

// Manifest is candidates.json.
type Manifest struct {
	Plan  string      `json:"plan"`
	Base  string      `json:"base"`
	Files []FileEntry `json:"files"`
}

type fileScan struct {
	path   string
	src    []byte
	toks   []ctoken
	blocks []Block
}

func scanFile(path string, src []byte) (*fileScan, error) {
	var toks []ctoken
	var err error
	if isGo(path) {
		toks, err = scanGo(src)
	} else {
		toks, err = scanTS(src)
	}
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &fileScan{path: path, src: src, toks: toks, blocks: blocks(src, toks)}, nil
}

func (p *Pass) scanPath(path string) (*fileScan, error) {
	src, err := p.readFile(path)
	if err != nil {
		return nil, err
	}
	if isGenerated(src) {
		return &fileScan{path: path, src: src}, nil
	}
	return scanFile(path, src)
}

// addedBlock is a block with at least one line the branch added.
type addedBlock struct {
	Block
	added int
}

// collectAdded returns, per in-scope file, the blocks the branch added or edited.
func (p *Pass) collectAdded(ctx context.Context, d *diffInfo) (map[string]*fileScan, map[string][]addedBlock, error) {
	paths := map[string]bool{}
	for path := range d.added {
		if InScope(path) {
			paths[path] = true
		}
	}
	untracked, err := p.untracked(ctx)
	if err != nil {
		return nil, nil, err
	}
	for _, u := range untracked {
		paths[u] = true
	}
	scans := map[string]*fileScan{}
	added := map[string][]addedBlock{}
	for path := range paths {
		fs, err := p.scanPath(path)
		if err != nil {
			return nil, nil, err
		}
		scans[path] = fs
		lines := d.added[path]
		whole := lines == nil
		for _, b := range fs.blocks {
			n := 0
			for l := b.StartLine; l <= b.EndLine; l++ {
				if whole || lines[l] {
					n++
				}
			}
			if n > 0 {
				added[path] = append(added[path], addedBlock{Block: b, added: n})
			}
		}
	}
	return scans, added, nil
}

// collectStale returns pre-existing blocks that name an identifier the branch removed.
func (p *Pass) collectStale(ctx context.Context, d *diffInfo, scans map[string]*fileScan, added map[string][]addedBlock) (map[string][]Candidate, error) {
	names := d.removedIdents()
	if len(names) == 0 {
		return nil, nil
	}
	sort.Strings(names)
	res := make([]*regexp.Regexp, len(names))
	for i, n := range names {
		res[i] = regexp.MustCompile(`\b` + regexp.QuoteMeta(n) + `\b`)
	}
	tracked, err := p.tracked(ctx)
	if err != nil {
		return nil, err
	}
	out := map[string][]Candidate{}
	for _, path := range tracked {
		fs := scans[path]
		if fs == nil {
			fs, err = p.scanPath(path)
			if err != nil {
				return nil, err
			}
			scans[path] = fs
		}
		isAdded := map[int]bool{}
		for _, a := range added[path] {
			isAdded[a.Span.Start] = true
		}
		for _, b := range fs.blocks {
			if isAdded[b.Span.Start] {
				continue
			}
			text := Normalise(b.Lines)
			var hit []string
			for i, re := range res {
				if re.MatchString(text) {
					hit = append(hit, names[i])
				}
			}
			if len(hit) > 0 {
				out[path] = append(out[path], Candidate{Path: path, Kind: b.Kind, Span: b.Span, Lines: b.Lines, Origin: "stale-ref", Names: hit, Total: len(b.Lines)})
			}
		}
	}
	return out, nil
}

var (
	goAnchorDeclRE = regexp.MustCompile(`^(func(?: \([^)]*\))? [A-Za-z_]\w*|type [A-Za-z_]\w*|var [A-Za-z_]\w*|const [A-Za-z_]\w*)`)
	tsAnchorDeclRE = regexp.MustCompile(`^export (?:async )?(?:function|const|let|class|interface|type|enum) [A-Za-z_$][\w$]*`)
)

func anchorFor(src []byte, b Block) Anchor {
	li := indexLines(src)
	if b.Kind == KindSegment {
		line := src[li.lineStart(b.StartLine):li.lineEnd(b.EndLine)]
		rest := append(append([]byte(nil), line[:b.Span.Start-li.lineStart(b.StartLine)]...), line[min(b.Span.End, li.lineEnd(b.EndLine))-li.lineStart(b.StartLine):]...)
		return Anchor{Kind: "on", Text: strings.Join(strings.Fields(string(rest)), " "), Line: b.StartLine}
	}
	for l := b.EndLine + 1; l <= len(li.starts); l++ {
		text := strings.Join(strings.Fields(string(src[li.lineStart(l):li.lineEnd(l)])), " ")
		if text != "" {
			return Anchor{Kind: "above", Text: text, Line: l}
		}
	}
	return Anchor{Kind: "eof"}
}

func docOf(anchor Anchor) string {
	if anchor.Kind != "above" {
		return ""
	}
	if m := goAnchorDeclRE.FindString(anchor.Text); m != "" {
		return m
	}
	return tsAnchorDeclRE.FindString(anchor.Text)
}

// locateAnchor finds the anchor's line in the stripped text: the anchor is the n-th line
// of the original whose text, minus removed spans, normalises to the anchor text, and
// formatting that only moves whitespace keeps that ordinal. 0 when the formatter joined
// the line away.
func locateAnchor(original, stripped []byte, a Anchor, removed []Span) int {
	if a.Kind == "eof" || a.Line == 0 {
		return 0
	}
	li := indexLines(original)
	ordinal := 1
	for l := 1; l < a.Line; l++ {
		start, end := li.lineStart(l), li.lineEnd(l)
		line := removeSpans(original[start:end], clipSpans(removed, start, end))
		if strings.Join(strings.Fields(string(line)), " ") == a.Text {
			ordinal++
		}
	}
	seen := 0
	for i, line := range strings.Split(string(stripped), "\n") {
		if strings.Join(strings.Fields(line), " ") == a.Text {
			seen++
			if seen == ordinal {
				return i + 1
			}
		}
	}
	return 0
}

// clipSpans translates the spans overlapping [start,end) into line-relative offsets.
func clipSpans(spans []Span, start, end int) []Span {
	var out []Span
	for _, s := range spans {
		if s.End <= start || s.Start >= end {
			continue
		}
		out = append(out, Span{Start: max(s.Start, start) - start, End: min(s.End, end) - start, Replace: s.Replace})
	}
	return out
}
