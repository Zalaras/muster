package triage

import "testing"

// Retired rows exist for shapes musterd no longer emits but old issues still carry.
// Issue #9 was filed by musterd 0.2.1 with claudeCode.{pinned,drift}; deleting those rows
// as dead code would start dropping three fields on it, and a dropped field routes the
// whole issue facts-only. The drift test in internal/server only checks the other
// direction, so this is the half that stops a tidy-up.
func TestSchemaKeepsRetiredRows(t *testing.T) {
	for _, path := range []string{"claudeCode.pinned", "claudeCode.drift"} {
		f, ok := LookupField(path)
		if !ok {
			t.Errorf("%q has no row — issues filed before the claudeCode reshape need it", path)
			continue
		}
		if !f.Retired {
			t.Errorf("%q is not marked Retired, so nothing records why it is still here", path)
		}
	}
}

func TestSchemaPathsAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, f := range Schema {
		if seen[f.Path] {
			t.Errorf("duplicate row for %q — LookupField would silently pick one", f.Path)
		}
		seen[f.Path] = true
		if f.Check == nil {
			t.Errorf("%q has no Check, so any value would pass", f.Path)
		}
	}
}
