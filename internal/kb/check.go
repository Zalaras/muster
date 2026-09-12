package kb

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	testFuncRE = regexp.MustCompile(`(?m)^func (Test[A-Za-z0-9_]+)\(`)
	urlRE      = regexp.MustCompile(`^https?://`)
	issueRE    = regexp.MustCompile(`^#\d+$`)
	planRE     = regexp.MustCompile(`^plan:([a-z0-9][a-z0-9-]*)$`)
	// ownedDirs are the code roots every .go and .ts file under must belong to a feature.
	ownedDirs = []string{"internal/", "web/src/", "web/e2e/"}
)

// Check runs every cross-record rule (design §5) on a loaded index and returns the sorted
// union with the load-phase findings. Only I/O failures are errors.
func Check(ix *Index, loadFindings []Finding) ([]Finding, error) {
	c := &checker{ix: ix, findings: append([]Finding(nil), loadFindings...)}
	if err := c.run(); err != nil {
		return nil, err
	}
	sortFindings(c.findings)
	return c.findings, nil
}

type checker struct {
	ix        *Index
	findings  []Finding
	testFuncs map[string]bool
}

func (c *checker) fail(p string, line int, format string, args ...any) {
	c.findings = append(c.findings, Finding{Path: p, Line: line, Msg: fmt.Sprintf(format, args...)})
}

func (c *checker) run() error {
	if err := c.loadTestFuncs(); err != nil {
		return err
	}
	for _, r := range c.ix.Records {
		c.checkRecord(r)
	}
	c.checkSupersession()
	if err := c.checkCitations(); err != nil {
		return err
	}
	if err := c.checkClaudeBudgets(); err != nil {
		return err
	}
	if err := c.checkGenerated(); err != nil {
		return err
	}
	if err := c.checkKBComments(); err != nil {
		return err
	}
	c.checkOwnership()
	return nil
}

func (c *checker) loadTestFuncs() error {
	c.testFuncs = map[string]bool{}
	for _, rel := range c.ix.Tree {
		if !strings.HasSuffix(rel, "_test.go") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(c.ix.Root, filepath.FromSlash(rel)))
		if err != nil {
			return fmt.Errorf("reading %s: %w", rel, err)
		}
		for _, m := range testFuncRE.FindAllStringSubmatch(string(data), -1) {
			c.testFuncs[m[1]] = true
		}
	}
	return nil
}

func (c *checker) checkRecord(r *Record) {
	c.checkFeatureRefs(r)
	c.checkFileGlobs(r)
	for _, t := range r.Tests {
		c.checkTestEntry(r, "tests entry", t)
	}
	for _, ref := range r.Refs {
		c.checkRef(r, ref)
	}
	c.checkGuardEntry(r)
	c.checkVerifiedRange(r)
	c.checkSupersedesRefs(r)
	c.checkProtocolRefs(r)
	c.checkBodyBudget(r)
	// A feature with more live records than its rules file can hold is not a source
	// defect: gen truncates the file at RuleFileLines with a pointer at the feature INDEX,
	// so the tier-1 context stays bounded by construction. Failing here would push authors
	// to file records under the wrong feature to dodge the budget.
}

func (c *checker) checkFeatureRefs(r *Record) {
	for _, name := range r.Features {
		if c.ix.Feature(name) == nil {
			c.fail(r.Path, 0, "feature %q has no docs/features/%s/spec.md", name, name)
		}
	}
}

func (c *checker) checkFileGlobs(r *Record) {
	for _, g := range r.Files {
		if len(Expand(c.ix.Tree, g)) == 0 {
			c.fail(r.Path, 0, "files entry %q matches no file", g)
		}
	}
	for _, kv := range []struct {
		k string
		v []string
	}{{"go", r.Go}, {"web", r.Web}, {"e2e", r.E2E}} {
		for _, g := range kv.v {
			if len(Expand(c.ix.Tree, g)) == 0 {
				c.fail(r.Path, 0, "%s entry %q matches no file", kv.k, g)
			}
		}
	}
}

func (c *checker) checkGuardEntry(r *Record) {
	if r.HasGuard() && !c.testFuncs[r.Guard] {
		c.fail(r.Path, 0, "guard %q — no func %s( in any *_test.go", r.Guard, r.Guard)
	}
}

func (c *checker) checkVerifiedRange(r *Record) {
	if r.Verified == nil || r.Verified.HiCanary || c.ix.Verified == "" {
		return
	}
	switch {
	case compareVersion(r.Verified.Hi, c.ix.Verified) > 0:
		c.fail(r.Path, 0, "verified upper bound %s exceeds the observed ceiling %s (%s)", r.Verified.Hi, c.ix.Verified, observedVersionsPath)
	case compareVersion(r.Verified.Hi, c.ix.Floor) < 0:
		c.fail(r.Path, 0, "verified upper bound %s is below the observed floor %s — re-verify and raise it, or set status: retired", r.Verified.Hi, c.ix.Floor)
	}
}

func (c *checker) checkSupersedesRefs(r *Record) {
	for _, id := range r.Supersedes {
		old, ok := c.ix.ByID[id]
		switch {
		case !ok || old.Type != TypeDecision:
			c.fail(r.Path, 0, "supersedes %q — no such decision", id)
		case old.Status != "superseded":
			c.fail(r.Path, 0, "supersedes %q but %s has status %s (want superseded)", id, old.Path, old.Status)
		}
	}
}

func (c *checker) checkProtocolRefs(r *Record) {
	for _, id := range r.Protocol {
		if _, ok := c.ix.Anchors[id]; !ok {
			c.fail(r.Path, 0, "protocol entry %q — no kb:anchor with that id in %s", id, protocolPath)
		}
	}
}

func (c *checker) checkBodyBudget(r *Record) {
	if r.BodyWords > r.bodyBudget() {
		c.fail(r.Path, 0, "body is %d words (budget %d for a %s)", r.BodyWords, r.bodyBudget(), r.Type)
	}
}

func (c *checker) checkTestEntry(r *Record, label, t string) {
	switch {
	case testRE.MatchString(t):
		if !c.testFuncs[t] {
			c.fail(r.Path, 0, "%s %q — no func %s( in any *_test.go", label, t, t)
		}
	case strings.HasSuffix(t, ".spec.ts"):
		if !c.ix.InTree(t) {
			c.fail(r.Path, 0, "%s %q does not exist", label, t)
		}
	default:
		c.fail(r.Path, 0, "%s %q is neither a Go test name nor a *.spec.ts path", label, t)
	}
}

func (c *checker) checkRef(r *Record, ref string) {
	switch {
	case urlRE.MatchString(ref):
	case issueRE.MatchString(ref):
		if _, err := strconv.Atoi(ref[1:]); err != nil {
			c.fail(r.Path, 0, "refs entry %q is not an issue number", ref)
		}
	case planRE.MatchString(ref):
		name := planRE.FindStringSubmatch(ref)[1]
		if !c.ix.InTree("plans/" + name + "/plan.md") {
			c.fail(r.Path, 0, "refs entry %q — plans/%s/plan.md does not exist", ref, name)
		}
	case strings.HasPrefix(ref, "kb:"):
		m := citeRE.FindStringSubmatch(ref)
		if m == nil || m[0] != ref {
			c.fail(r.Path, 0, "refs entry %q is not a kb:<type>/<id> token", ref)
			return
		}
		prefix, id := m[1], m[2]
		if m[3] != "" {
			prefix, id = m[3], m[4]
		}
		if msg := resolveCitation(c.ix, prefix, id); msg != "" {
			c.fail(r.Path, 0, "refs entry %q — %s", ref, strings.TrimPrefix(msg, "citation "+ref+" "))
		}
	default:
		if _, err := os.Stat(filepath.Join(c.ix.Root, filepath.FromSlash(ref))); err != nil {
			c.fail(r.Path, 0, "refs entry %q is not a URL, plan:<name>, #N, kb:<type>/<id> or an existing repo path", ref)
		}
	}
}

// checkSupersession fails a superseded decision no accepted decision points back at.
func (c *checker) checkSupersession() {
	for _, old := range c.ix.RecordsOfType(TypeDecision) {
		if old.Status != "superseded" {
			continue
		}
		found := false
		for _, r := range c.ix.RecordsOfType(TypeDecision) {
			if r.Status == "accepted" && contains(r.Supersedes, old.ID) {
				found = true
				break
			}
		}
		if !found {
			c.fail(old.Path, 0, "status superseded but no accepted decision lists it in supersedes")
		}
	}
}

func (c *checker) checkCitations() error {
	cites, err := ScanCitations(c.ix)
	if err != nil {
		return err
	}
	for _, ct := range cites {
		if msg := resolveCitation(c.ix, ct.Prefix, ct.ID); msg != "" {
			c.fail(ct.Path, ct.Line, "%s", msg)
		}
	}
	return nil
}

func (c *checker) checkClaudeBudgets() error {
	for _, rel := range c.ix.Tree {
		if path.Base(rel) != "CLAUDE.md" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(c.ix.Root, filepath.FromSlash(rel)))
		if err != nil {
			return fmt.Errorf("reading %s: %w", rel, err)
		}
		text := string(data)
		if rel == "CLAUDE.md" {
			n := strings.Count(text, "\n")
			if !strings.HasSuffix(text, "\n") && text != "" {
				n++
			}
			if n > RootClaudeLines {
				c.fail(rel, 0, "%d lines (budget %d)", n, RootClaudeLines)
			}
			continue
		}
		if n := len(strings.Fields(stripFragments(text))); n > NestedClaudeWords {
			c.fail(rel, 0, "%d words outside kb fragments (budget %d)", n, NestedClaudeWords)
		}
	}
	return nil
}

func (c *checker) checkGenerated() error {
	outs, findings, err := Outputs(c.ix)
	if err != nil {
		return err
	}
	c.findings = append(c.findings, findings...)
	generated := map[string]bool{}
	for _, o := range outs {
		generated[o.Path] = true
		disk, err := os.ReadFile(filepath.Join(c.ix.Root, filepath.FromSlash(o.Path)))
		if errors.Is(err, fs.ErrNotExist) {
			c.fail(o.Path, 0, "missing — regenerate with make gen-kb")
			continue
		}
		if err != nil {
			return fmt.Errorf("reading %s: %w", o.Path, err)
		}
		state := ClassifyGenerated(string(disk), o.Content)
		if path.Base(o.Path) == "CLAUDE.md" {
			state = classifyFragmentFile(string(disk), o.Content)
		}
		switch state {
		case GeneratedStale:
			c.fail(o.Path, 0, "stale — regenerate with make gen-kb")
		case GeneratedHandEdited:
			c.fail(o.Path, 0, "hand-edited — its body no longer matches its kb:generated hash; revert and change the sources instead")
		case GeneratedFresh:
		}
	}
	for _, rel := range c.ix.Tree {
		if !strings.HasPrefix(rel, rulesDir) || !strings.HasSuffix(rel, ".md") || generated[rel] {
			continue
		}
		data, err := os.ReadFile(filepath.Join(c.ix.Root, filepath.FromSlash(rel)))
		if err != nil {
			return fmt.Errorf("reading %s: %w", rel, err)
		}
		if _, _, ok := SplitGenerated(string(data)); ok {
			c.fail(rel, 0, "generated file has no feature — delete it")
		}
	}
	return nil
}

// classifyFragmentFile applies K6 per fragment of a hand-written file: any fragment whose
// hash line no longer covers its body is a hand edit; otherwise a difference is stale.
func classifyFragmentFile(disk, want string) GeneratedState {
	if disk == want {
		return GeneratedFresh
	}
	have, err := findFragments(disk)
	if err != nil {
		return GeneratedHandEdited
	}
	wantBlocks, err := findFragments(want)
	if err != nil {
		return GeneratedHandEdited
	}
	state := GeneratedStale
	for i := range have {
		if i >= len(wantBlocks) {
			break
		}
		if classifyFragment(have[i].Inner, wantBlocks[i].Inner) == GeneratedHandEdited {
			state = GeneratedHandEdited
		}
	}
	return state
}

// checkKBComments fails any kb comment outside a code fence that is not one of the four
// shapes, and a kb:anchor anywhere but docs/protocol.md.
func (c *checker) checkKBComments() error {
	for _, rel := range c.ix.Tree {
		if !strings.HasSuffix(rel, ".md") || !citationScope(rel) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(c.ix.Root, filepath.FromSlash(rel)))
		if err != nil {
			return fmt.Errorf("reading %s: %w", rel, err)
		}
		if !strings.Contains(string(data), kbCommentPrefix) {
			continue
		}
		for _, ln := range proseLines(string(data)) {
			for _, cm := range kbCommentRE.FindAllString(ln.Text, -1) {
				switch {
				case !recognisedKBComment(cm):
					c.fail(rel, ln.N, "unrecognised kb comment %q (want kb:anchor ID, kb:generated HASH, kb:NAME or /kb:NAME)", cm)
				case anchorRE.MatchString(cm) && rel != protocolPath:
					c.fail(rel, ln.N, "kb:anchor belongs in %s only", protocolPath)
				}
			}
		}
	}
	return nil
}

// checkOwnership fails every code file under the owned roots that no feature glob
// covers. It runs only once the first spec record exists, so an empty store is green.
func (c *checker) checkOwnership() {
	if len(c.ix.Features) == 0 {
		return
	}
	for _, rel := range c.ix.Tree {
		if !strings.HasSuffix(rel, ".go") && !strings.HasSuffix(rel, ".ts") {
			continue
		}
		owned := false
		for _, d := range ownedDirs {
			if strings.HasPrefix(rel, d) {
				owned = true
			}
		}
		if !owned {
			continue
		}
		covered := false
		for _, f := range c.ix.Features {
			if f.Covers(rel) {
				covered = true
				break
			}
		}
		if !covered {
			c.fail(rel, 0, "owned by no feature (add it to a docs/features/<name>/spec.md glob)")
		}
	}
}
