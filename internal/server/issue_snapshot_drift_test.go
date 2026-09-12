package server

import (
	"reflect"
	"strings"
	"testing"

	"github.com/Zalaras/muster/internal/triage"
)

// TestIssueSnapshotSchemaDrift keeps internal/triage/schema.go honest about what this
// package can emit.
//
// It lives here rather than in internal/triage because issueSnapshot is unexported, and
// exporting a type purely to let a test see it would widen the package's surface for no
// other reason. The dependency runs one way: this test reflects over the producer and
// asks the consumer whether it has a row.
//
// The assertion is deliberately ONE-DIRECTIONAL. Every path this package can emit must
// have a row in the schema — that is the drift that matters, because a missing row means
// a dropped field, and a dropped field routes the whole issue to the facts-only path.
// The reverse is NOT a failure: the schema also carries rows for shapes musterd no longer
// emits (claudeCode.pinned and .drift, which issue #9 still carries), and those must
// survive precisely because old issues are still open.
func TestIssueSnapshotSchemaDrift(t *testing.T) {
	emitted := map[string]triage.Kind{}
	walkSnapshotType(t, reflect.TypeOf(issueSnapshot{}), "", emitted)

	if len(emitted) == 0 {
		t.Fatal("reflected no fields — the walk is broken, not the schema")
	}
	for path, kind := range emitted {
		f, ok := triage.LookupField(path)
		if !ok {
			t.Errorf("issueSnapshot emits %q but internal/triage/schema.go has no row for it "+
				"— add one, or every issue filed from this version routes facts-only", path)
			continue
		}
		if f.Kind != kind {
			t.Errorf("%q: issueSnapshot emits %v, schema.go says %v", path, kind, f.Kind)
		}
	}
}

// walkSnapshotType maps the struct to the dotted JSON paths it marshals to.
//
// An unrecognised reflect.Kind is fatal rather than skipped: a future field typed as a
// map, an interface, or a slice of structs would otherwise pass this test by being
// invisible to it, which is the exact failure the test exists to prevent.
func walkSnapshotType(t *testing.T, rt reflect.Type, prefix string, out map[string]triage.Kind) {
	t.Helper()
	for rt.Kind() == reflect.Pointer {
		rt = rt.Elem()
	}
	if rt.Kind() != reflect.Struct {
		t.Fatalf("%s: expected a struct, got %v", prefix, rt.Kind())
	}
	for i := range rt.NumField() {
		f := rt.Field(i)
		tag := f.Tag.Get("json")
		if tag == "-" {
			continue
		}
		name, _, _ := strings.Cut(tag, ",")
		if name == "" {
			name = f.Name
		}
		path := name
		if prefix != "" {
			path = prefix + "." + name
		}

		ft := f.Type
		for ft.Kind() == reflect.Pointer {
			ft = ft.Elem()
		}
		switch ft.Kind() {
		case reflect.Struct:
			walkSnapshotType(t, ft, path, out)
		case reflect.String:
			out[path] = triage.KindString
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			out[path] = triage.KindInt
		case reflect.Float32, reflect.Float64:
			out[path] = triage.KindFloat
		case reflect.Bool:
			out[path] = triage.KindBool
		case reflect.Slice:
			if ft.Elem().Kind() != reflect.String {
				t.Fatalf("%s: slice of %v has no schema kind — extend triage.Kind and this switch", path, ft.Elem().Kind())
			}
			out[path] = triage.KindStringSlice
		default:
			t.Fatalf("%s: reflect.Kind %v has no schema kind — extend triage.Kind and this switch", path, ft.Kind())
		}
	}
}
