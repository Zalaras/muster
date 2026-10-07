package kb

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// RefsOptions names which files kb refs reads: every tracked file matching the config's
// refs.files patterns (All), the explicit repo-relative Files, or, with neither, the files
// the current diff range changed.
type RefsOptions struct {
	All   bool
	Files []string
}

// RefHit is one cited reference that resolves to nothing. Ignored marks a path git ignores:
// cited on purpose, absent by design in a fresh worktree, reported but never counted missing.
type RefHit struct {
	Path    string
	Line    int
	Token   string
	Reason  string
	Ignored bool
}

// String renders the hit the way the gates and reviewers read it.
func (h RefHit) String() string {
	if h.Ignored {
		return fmt.Sprintf("%s:%d  %s  ignored (gitignored by design)", h.Path, h.Line, h.Token)
	}
	return fmt.Sprintf("%s:%d  %s  missing (%s)", h.Path, h.Line, h.Token, h.Reason)
}

// Finding renders the hit as a check finding.
func (h RefHit) Finding() Finding {
	return Finding{Path: h.Path, Line: h.Line, Msg: fmt.Sprintf("reference `%s` missing (%s)", h.Token, h.Reason)}
}

// RefsResult is one refs pass: how many files and references it read, how many were
// missing, every hit in report order, and the whitelist entries that now exist.
type RefsResult struct {
	Files          int
	Checked        int
	Missing        int
	Hits           []RefHit
	StaleWhitelist []string
}

var (
	tickRE      = regexp.MustCompile("`([^`\n]+)`")
	makeTokRE   = regexp.MustCompile(`^make\s+([a-zA-Z0-9_ =.-]+)$`)
	flagTokRE   = regexp.MustCompile(`\s--?([a-z][a-z0-9-]*)`)
	lineSuffRE  = regexp.MustCompile(`:\d+([-–,]\d+)*$`)
	trailPunRE  = regexp.MustCompile(`[.,;:)]+$`)
	qualifiedRE = regexp.MustCompile(`^[a-z0-9_]+\.[A-Za-z]`)
	makeTgtRE   = regexp.MustCompile(`(?m)^([a-zA-Z0-9_-]+):`)
	flagDefRE   = regexp.MustCompile(`\.(?:String|Bool|Int|Duration|Var|Func|Float64)\w*\(\s*(?:&[\w.]+\s*,\s*)?"([a-z][a-z0-9-]*)"`)
	skipChars   = []string{"*", "<", ">", "{", "…", "$", "..."}
)

// refScanner holds one pass's lookups: the make targets, the binary's flags and every
// tracked basename, plus the two token regexes built from the config's top directories.
type refScanner struct {
	root      string
	cfg       *Config
	targets   map[string]bool
	flags     map[string]bool
	basenames map[string]bool
	pathRE    *regexp.Regexp
	bareRE    *regexp.Regexp
	res       RefsResult
	pending   []RefHit
}

// Refs runs the dead-reference pass (kb:adr/knowledge-refs-and-scope-are-kb-subcommands):
// every repo path, `make <target>` and `<binary> -flag` a comment or a markdown line cites
// must exist. A bare filename counts only when it resolves beside the citing file or names
// a tracked file, and is never reported; a path git ignores is reported as ignored.
func Refs(ix *Index, opts RefsOptions) (RefsResult, error) {
	s, err := newRefScanner(ix)
	if err != nil {
		return RefsResult{}, err
	}
	files, err := s.scopeFiles(opts)
	if err != nil {
		return RefsResult{}, err
	}
	s.res.Files = len(files)
	for _, rel := range files {
		if err := s.scanFile(rel); err != nil {
			return RefsResult{}, err
		}
	}
	if err := s.resolvePending(); err != nil {
		return RefsResult{}, err
	}
	if err := s.scanMoved(); err != nil {
		return RefsResult{}, err
	}
	s.staleWhitelist()
	return s.res, nil
}

func newRefScanner(ix *Index) (*refScanner, error) {
	cfg := ix.Config
	tops := make([]string, 0, len(cfg.Refs.TopDirs))
	for _, d := range cfg.Refs.TopDirs {
		tops = append(tops, regexp.QuoteMeta(strings.TrimSuffix(d, "/")))
	}
	alt := strings.Join(tops, "|")
	s := &refScanner{root: ix.Root, cfg: cfg,
		pathRE: regexp.MustCompile(`^(?:` + alt + `)/[A-Za-z0-9_./@-]+$|^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:md|go|ts|sh|yaml|yml|json|sql|py)$|^` + regexp.QuoteMeta(cfg.Refs.Makefile) + `$`),
		bareRE: regexp.MustCompile(`(?:^|[\s(])((?:` + alt + `)/[A-Za-z0-9_./@-]+)`)}
	s.targets = map[string]bool{}
	if data, err := os.ReadFile(filepath.Join(ix.Root, filepath.FromSlash(cfg.Refs.Makefile))); err == nil {
		for _, m := range makeTgtRE.FindAllStringSubmatch(string(data), -1) {
			s.targets[m[1]] = true
		}
	}
	if err := s.loadFlags(); err != nil {
		return nil, err
	}
	tracked, err := gitLines(ix.Root, "ls-files")
	if err != nil {
		return nil, err
	}
	s.basenames = map[string]bool{}
	for _, f := range tracked {
		s.basenames[path.Base(f)] = true
	}
	return s, nil
}

// loadFlags reads every flag the config's binary defines in its non-test Go sources.
func (s *refScanner) loadFlags() error {
	s.flags = map[string]bool{}
	if s.cfg.Refs.Flags.Binary == "" || s.cfg.Refs.Flags.Source == "" {
		return nil
	}
	files, err := gitLines(s.root, "ls-files", "--", strings.TrimSuffix(s.cfg.Refs.Flags.Source, "/")+"/*.go")
	if err != nil {
		return err
	}
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.root, filepath.FromSlash(f)))
		if err != nil {
			return fmt.Errorf("reading %s: %w", f, err)
		}
		for _, m := range flagDefRE.FindAllStringSubmatch(string(data), -1) {
			s.flags[m[1]] = true
		}
	}
	return nil
}

// scopeFiles lists the files the pass reads, in scope and existing as regular files.
func (s *refScanner) scopeFiles(opts RefsOptions) ([]string, error) {
	var listed []string
	var err error
	switch {
	case opts.All:
		listed, err = s.trackedFiles()
	case len(opts.Files) > 0:
		listed = opts.Files
	default:
		var rng string
		if rng, err = diffRange(s.root); err == nil {
			listed, err = gitLines(s.root, append([]string{"diff", "--name-only", rng, "--"}, s.cfg.Refs.Files...)...)
		}
	}
	if err != nil {
		return nil, err
	}
	var out []string
	for _, f := range listed {
		if s.cfg.Excluded(f) {
			continue
		}
		if st, err := os.Stat(filepath.Join(s.root, filepath.FromSlash(f))); err == nil && st.Mode().IsRegular() {
			out = append(out, f)
		}
	}
	return out, nil
}

func (s *refScanner) trackedFiles() ([]string, error) {
	return gitLines(s.root, append([]string{"ls-files", "--"}, s.cfg.Refs.Files...)...)
}

func (s *refScanner) scanFile(rel string) error {
	data, err := os.ReadFile(filepath.Join(s.root, filepath.FromSlash(rel)))
	if err != nil {
		return fmt.Errorf("reading %s: %w", rel, err)
	}
	for _, ln := range CommentLines(rel, string(data)) {
		for _, tok := range s.tokensOf(rel, ln.Text) {
			s.checkToken(rel, ln.N, strings.TrimSpace(tok))
		}
	}
	return nil
}

// tokensOf lists the backticked spans of a line, plus the bare top-directory paths a code or
// script comment carries (prose cites paths in backticks or not at all).
func (s *refScanner) tokensOf(rel, line string) []string {
	var toks []string
	for _, m := range tickRE.FindAllStringSubmatch(line, -1) {
		toks = append(toks, m[1])
	}
	if !strings.HasSuffix(rel, ".md") {
		for _, m := range s.bareRE.FindAllStringSubmatch(line, -1) {
			toks = append(toks, m[1])
		}
	}
	return toks
}

func (s *refScanner) checkToken(rel string, ln int, tok string) {
	if m := makeTokRE.FindStringSubmatch(tok); m != nil {
		s.checkMake(rel, ln, m[1])
		return
	}
	if b := s.cfg.Refs.Flags.Binary; b != "" && strings.HasPrefix(tok, b) && len(tok) > len(b) && strings.ContainsAny(tok[len(b):len(b)+1], " \t") {
		s.checkFlags(rel, ln, tok)
		return
	}
	s.checkPath(rel, ln, tok)
}

func (s *refScanner) checkMake(rel string, ln int, targets string) {
	for _, t := range strings.Fields(targets) {
		if strings.Contains(t, "=") {
			continue
		}
		if _, ok := s.cfg.Refs.Whitelist["make "+t]; ok {
			continue
		}
		s.res.Checked++
		if !s.targets[t] {
			s.res.Missing++
			s.res.Hits = append(s.res.Hits, RefHit{Path: rel, Line: ln, Token: "make " + t, Reason: "make target"})
		}
	}
}

func (s *refScanner) checkFlags(rel string, ln int, tok string) {
	for _, m := range flagTokRE.FindAllStringSubmatch(tok, -1) {
		s.res.Checked++
		if !s.flags[m[1]] {
			s.res.Missing++
			s.res.Hits = append(s.res.Hits, RefHit{Path: rel, Line: ln, Token: s.cfg.Refs.Flags.Binary + " -" + m[1], Reason: "flag"})
		}
	}
}

// normalisePath trims a token to the path it cites: no anchor, no line suffix, no trailing
// punctuation, no leading ./.
func normalisePath(tok string) string {
	p := tok
	if i := strings.IndexAny(p, "#§"); i >= 0 {
		p = p[:i]
	}
	p = lineSuffRE.ReplaceAllString(p, "")
	p = trailPunRE.ReplaceAllString(p, "")
	return strings.TrimPrefix(p, "./")
}

func (s *refScanner) checkPath(rel string, ln int, tok string) {
	p := normalisePath(tok)
	if !s.pathRE.MatchString(p) || strings.HasSuffix(p, "-") || strings.HasPrefix(p, "_") {
		return
	}
	for _, c := range skipChars {
		if strings.Contains(p, c) {
			return
		}
	}
	if _, ok := s.cfg.Refs.Whitelist[p]; ok {
		return
	}
	if !strings.Contains(p, "/") {
		// A bare filename is a weak reference (runtime artifacts, files in other trees,
		// suffix patterns): counted when it resolves, never reported.
		if s.exists(path.Join(path.Dir(rel), p)) || s.basenames[p] {
			s.res.Checked++
		}
		return
	}
	s.res.Checked++
	if s.exists(p) {
		return
	}
	// A Go qualified identifier (internal/session.Manager) cites its package directory.
	d, last := path.Split(p)
	if qualifiedRE.MatchString(last) && s.isDir(path.Join(d, strings.SplitN(last, ".", 2)[0])) {
		return
	}
	s.pending = append(s.pending, RefHit{Path: rel, Line: ln, Token: tok, Reason: "path"})
}

func (s *refScanner) exists(rel string) bool {
	_, err := os.Stat(filepath.Join(s.root, filepath.FromSlash(rel)))
	return err == nil
}

func (s *refScanner) isDir(rel string) bool {
	st, err := os.Stat(filepath.Join(s.root, filepath.FromSlash(rel)))
	return err == nil && st.IsDir()
}

// resolvePending asks git which of the missing paths it ignores, in one batch, each path
// queried as written and with a trailing slash so a directory pattern matches too.
func (s *refScanner) resolvePending() error {
	if len(s.pending) == 0 {
		return nil
	}
	var query strings.Builder
	for _, h := range s.pending {
		p := normalisePath(h.Token)
		query.WriteString(p + "\n" + strings.TrimSuffix(p, "/") + "/\n")
	}
	out, err := gitOut(s.root, query.String(), []int{1}, "check-ignore", "--stdin")
	if err != nil {
		return err
	}
	ignored := map[string]bool{}
	for _, l := range strings.Split(out, "\n") {
		if l != "" {
			ignored[l] = true
		}
	}
	for _, h := range s.pending {
		p := normalisePath(h.Token)
		if ignored[p] || ignored[strings.TrimSuffix(p, "/")+"/"] {
			h.Ignored = true
		} else {
			s.res.Missing++
		}
		s.res.Hits = append(s.res.Hits, h)
	}
	return nil
}

// movedPath is a file the diff range renamed or deleted; tail is the old path's last two
// segments, the shape a bare comment citation takes and the bare-path regex cannot see.
type movedPath struct{ old, newPath, tail string }

func (s *refScanner) movedPaths() ([]movedPath, error) {
	rng, err := diffRange(s.root)
	if err != nil {
		return nil, err
	}
	rows, err := gitLines(s.root, "diff", "--name-status", "--diff-filter=DR", rng)
	if err != nil {
		return nil, err
	}
	var out []movedPath
	for _, row := range rows {
		cols := strings.Split(row, "\t")
		if len(cols) < 2 {
			continue
		}
		old, newPath := cols[1], ""
		if len(cols) > 2 {
			newPath = cols[2]
		}
		segs := strings.Split(old, "/")
		if len(segs) < 2 {
			continue
		}
		tail := strings.Join(segs[len(segs)-2:], "/")
		if !s.exists(old) && (newPath == "" || !strings.HasSuffix(newPath, "/"+tail)) {
			out = append(out, movedPath{old, newPath, tail})
		}
	}
	return out, nil
}

// scanMoved reads every tracked in-scope file for a citation of a moved path's tail: a
// rename orphans citations in files the diff never touched.
func (s *refScanner) scanMoved() error {
	moved, err := s.movedPaths()
	if err != nil || len(moved) == 0 {
		return err
	}
	files, err := s.trackedFiles()
	if err != nil {
		return err
	}
	for _, rel := range files {
		if s.cfg.Excluded(rel) || !s.exists(rel) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.root, filepath.FromSlash(rel)))
		if err != nil {
			return fmt.Errorf("reading %s: %w", rel, err)
		}
		for _, ln := range CommentLines(rel, string(data)) {
			for _, m := range moved {
				if wordBounded(ln.Text, m.tail) && (m.newPath == "" || !strings.Contains(ln.Text, m.newPath)) {
					s.res.Checked++
					s.res.Missing++
					to := m.newPath
					if to == "" {
						to = "deleted"
					}
					s.res.Hits = append(s.res.Hits, RefHit{Path: rel, Line: ln.N, Token: m.tail, Reason: "moved: " + m.old + " -> " + to})
				}
			}
		}
	}
	return nil
}

// wordBounded reports whether tail occurs in line with no path or identifier character
// touching it on either side.
func wordBounded(line, tail string) bool {
	for i := 0; ; {
		j := strings.Index(line[i:], tail)
		if j < 0 {
			return false
		}
		start, end := i+j, i+j+len(tail)
		before := start == 0 || !strings.ContainsRune("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_./-", rune(line[start-1]))
		after := end == len(line) || !strings.ContainsRune("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-", rune(line[end]))
		if before && after {
			return true
		}
		i = start + 1
	}
}

// staleWhitelist lists the whitelist entries that resolve now, so the config can drop them.
func (s *refScanner) staleWhitelist() {
	for w := range s.cfg.Refs.Whitelist {
		if t, ok := strings.CutPrefix(w, "make "); ok {
			if s.targets[t] {
				s.res.StaleWhitelist = append(s.res.StaleWhitelist, w)
			}
		} else if s.exists(w) {
			s.res.StaleWhitelist = append(s.res.StaleWhitelist, w)
		}
	}
	sort.Strings(s.res.StaleWhitelist)
}
