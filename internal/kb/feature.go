package kb

// Feature is one registered feature: the set of docs/features/<name>/spec.md
// frontmatters is the registry (design K2).
type Feature struct {
	Name     string
	Summary  string
	Spec     *Record
	Go       []string
	Web      []string
	E2E      []string
	Protocol []string
}

func featureFromSpec(r *Record) *Feature {
	return &Feature{Name: r.ID, Summary: r.Summary, Spec: r, Go: r.Go, Web: r.Web, E2E: r.E2E, Protocol: r.Protocol}
}

// Globs is the union of the feature's go, web and e2e globs, in that order.
func (f *Feature) Globs() []string {
	out := make([]string, 0, len(f.Go)+len(f.Web)+len(f.E2E))
	out = append(out, f.Go...)
	out = append(out, f.Web...)
	return append(out, f.E2E...)
}

// Covers reports whether any of the feature's globs matches relpath.
func (f *Feature) Covers(relpath string) bool {
	for _, g := range f.Globs() {
		if MatchGlob(g, relpath) {
			return true
		}
	}
	return false
}

// SpecPath and ContractPath name the feature's two fixed files.
func (f *Feature) SpecPath() string     { return "docs/features/" + f.Name + "/spec.md" }
func (f *Feature) ContractPath() string { return "docs/features/" + f.Name + "/contract.md" }
func (f *Feature) IndexPath() string    { return "docs/features/" + f.Name + "/INDEX.md" }
func (f *Feature) RulesPath() string    { return ".claude/rules/" + f.Name + ".md" }
