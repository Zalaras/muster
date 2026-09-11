package kb

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMatchGlob_DoubleStarSpansZeroOrMoreSegmentsAndStarNeverCrossesASlash(t *testing.T) {
	cases := []struct {
		pattern, path string
		want          bool
	}{
		{"internal/sess/**", "internal/sess/sess.go", true},
		{"internal/sess/**", "internal/sess/deep/er/file.go", true},
		{"internal/sess/**", "internal/sess", true},
		{"internal/**/sess.go", "internal/sess.go", true},
		{"internal/**/sess.go", "internal/a/b/sess.go", true},
		{"internal/*", "internal/sess/sess.go", false},
		{"internal/*/*.go", "internal/sess/sess.go", true},
		{"**/*.ts", "web/src/a/b.ts", true},
		{"**/*.ts", "b.ts", true},
		{"web/e2e/sess.spec.ts", "web/e2e/sess.spec.ts", true},
		{"web/e2e/sess.spec.ts", "web/e2e/sess.spec.tsx", false},
		{"internal/s?ss/**", "internal/sess/x.go", true},
		{"internal/[st]ess/**", "internal/tess/x.go", true},
		{"**", "anything/at/all", true},
		{"internal/**", "web/x.ts", false},
	}
	for _, tc := range cases {
		t.Run(tc.pattern+" vs "+tc.path, func(t *testing.T) {
			assert.Equal(t, tc.want, MatchGlob(tc.pattern, tc.path))
		})
	}
	assert.Equal(t, []string{"a/x.go", "a/y.go"}, Expand([]string{"a/x.go", "a/y.go", "b/z.go"}, "a/*.go"))
}

func TestMatchGlob_IsByteExactSoAMiscasedPatternMatchesNothing(t *testing.T) {
	assert.False(t, MatchGlob("Internal/sess/**", "internal/sess/sess.go"))
	assert.False(t, MatchGlob("internal/sess/Sess.go", "internal/sess/sess.go"))
}
