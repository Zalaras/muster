package selfupdate

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestParseRelease_Table covers D7: ParseRelease accepts exactly v?MAJOR.MINOR.PATCH and
// rejects anything with a pre-release/build suffix or a short form.
func TestParseRelease_Table(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  Version
		ok    bool
	}{
		{"bare form", "0.10.0", Version{0, 10, 0}, true},
		{"v-prefixed form", "v0.10.0", Version{0, 10, 0}, true},
		{"large numbers", "12.345.6789", Version{12, 345, 6789}, true},
		{"zero version", "0.0.0", Version{0, 0, 0}, true},
		{"dev is rejected", "dev", Version{}, false},
		{"git-describe suffix is rejected", "v0.10.0-4-ge5102b8", Version{}, false},
		{"dirty suffix is rejected", "0.10.0-dirty", Version{}, false},
		{"short form is rejected", "1.2", Version{}, false},
		{"empty string is rejected", "", Version{}, false},
		{"trailing dot is rejected", "1.2.3.", Version{}, false},
		{"leading garbage is rejected", "x1.2.3", Version{}, false},
		{"double v prefix is rejected", "vv1.2.3", Version{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ParseRelease(tt.input)
			assert.Equal(t, tt.ok, ok)
			if tt.ok {
				assert.Equal(t, tt.want, got)
			}
		})
	}
}

// TestVersion_Compare covers D9: numeric ordering field by field, never lexicographic —
// "0.9.0" must precede "0.10.0" despite "10" < "9" as strings.
func TestVersion_Compare(t *testing.T) {
	tests := []struct {
		name string
		a, b Version
		want int
	}{
		{"equal versions", Version{1, 2, 3}, Version{1, 2, 3}, 0},
		{"major differs", Version{2, 0, 0}, Version{1, 9, 9}, 1},
		{"major differs, reversed", Version{1, 9, 9}, Version{2, 0, 0}, -1},
		{"minor differs numerically not lexicographically", Version{0, 10, 0}, Version{0, 9, 0}, 1},
		{"minor differs numerically not lexicographically, reversed", Version{0, 9, 0}, Version{0, 10, 0}, -1},
		{"patch differs", Version{1, 2, 10}, Version{1, 2, 9}, 1},
		{"patch differs, reversed", Version{1, 2, 9}, Version{1, 2, 10}, -1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.a.Compare(tt.b))
		})
	}
}

// TestVersion_String covers String's bare-form rendering (no leading "v").
func TestVersion_String(t *testing.T) {
	assert.Equal(t, "0.10.0", Version{0, 10, 0}.String())
	assert.Equal(t, "12.345.6789", Version{12, 345, 6789}.String())
}

// TestVersion_CompareOnlyStrictlyGreaterIsAvailable covers D9's second clause via the
// three-way comparator a caller (updateManager) uses to decide "available": equal or
// lesser must never look "greater than zero".
func TestVersion_CompareOnlyStrictlyGreaterIsAvailable(t *testing.T) {
	running := Version{0, 10, 0}
	assert.LessOrEqual(t, Version{0, 10, 0}.Compare(running), 0, "equal must not report greater")
	assert.LessOrEqual(t, Version{0, 9, 0}.Compare(running), 0, "older must not report greater")
	assert.Greater(t, Version{0, 11, 0}.Compare(running), 0, "strictly newer must report greater")
}
