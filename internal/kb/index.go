package kb

import "sort"

// Index is the loaded knowledge base: every record, every feature, the protocol anchors
// and the observed Claude Code range, plus the walked file tree.
type Index struct {
	Root        string
	Records     []*Record
	ByID        map[string]*Record
	Features    []*Feature
	ByFeature   map[string][]*Record
	Anchors     map[string]Anchor
	AnchorOrder []string
	Floor       string
	Verified    string
	Tree        []string
	// Protocol is the text of docs/protocol.md, empty when absent.
	Protocol string
	treeSet  map[string]bool
}

func (ix *Index) finish() {
	sort.Slice(ix.Records, func(i, j int) bool { return ix.Records[i].Path < ix.Records[j].Path })
	ix.ByID = map[string]*Record{}
	ix.ByFeature = map[string][]*Record{}
	for _, r := range ix.Records {
		if _, dup := ix.ByID[r.ID]; !dup {
			ix.ByID[r.ID] = r
		}
		for _, name := range r.Features {
			ix.ByFeature[name] = append(ix.ByFeature[name], r)
		}
	}
	ix.Features = nil
	for _, r := range ix.Records {
		if r.Type == TypeSpec {
			ix.Features = append(ix.Features, featureFromSpec(r))
		}
	}
	sort.Slice(ix.Features, func(i, j int) bool { return ix.Features[i].Name < ix.Features[j].Name })
	ix.treeSet = map[string]bool{}
	for _, p := range ix.Tree {
		ix.treeSet[p] = true
	}
}

// Feature returns the named feature, or nil.
func (ix *Index) Feature(name string) *Feature {
	for _, f := range ix.Features {
		if f.Name == name {
			return f
		}
	}
	return nil
}

// RecordsOfType returns records of type t, by id.
func (ix *Index) RecordsOfType(t Type) []*Record {
	var out []*Record
	for _, r := range ix.Records {
		if r.Type == t {
			out = append(out, r)
		}
	}
	sortRecords(out)
	return out
}

// Covering returns the features whose globs match relpath and the live records whose
// files entries match it, records by type then id.
func (ix *Index) Covering(relpath string) ([]*Feature, []*Record) {
	var fs []*Feature
	for _, f := range ix.Features {
		if f.Covers(relpath) {
			fs = append(fs, f)
		}
	}
	var rs []*Record
	for _, r := range ix.Records {
		if !r.Live() {
			continue
		}
		for _, g := range r.Files {
			if MatchGlob(g, relpath) {
				rs = append(rs, r)
				break
			}
		}
	}
	sortRecords(rs)
	return fs, rs
}

// InTree reports whether relpath is a walked file.
func (ix *Index) InTree(relpath string) bool { return ix.treeSet[relpath] }

// ResolvedVerified renders a fact's verified range with the word canary replaced by the
// observed ceiling.
func (ix *Index) ResolvedVerified(r *Record) string {
	if r.Verified == nil {
		return ""
	}
	hi := r.Verified.Hi
	if r.Verified.HiCanary {
		hi = ix.Verified
	}
	return r.Verified.Lo + ".." + hi
}

// Empty reports whether the store has neither records nor features.
func (ix *Index) Empty() bool { return len(ix.Records) == 0 }
