package kb

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseFrontmatter_ReadsScalarsInlineListsAndBlockListsInOnePass(t *testing.T) {
	src := "---\n# a comment\nid: x\n\ntags: [a, b]\nfiles:\n  - internal/a/**\n  - \"web/b, c.ts\"\nempty: []\n---\nbody line\n"
	fields, body, bodyLine, err := ParseFrontmatter([]byte(src))
	require.NoError(t, err)
	assert.Equal(t, "body line\n", body)
	assert.Equal(t, 11, bodyLine)

	want := Fields{
		{Key: "id", Values: []string{"x"}, Line: 3},
		{Key: "tags", Values: []string{"a", "b"}, IsList: true, Line: 5},
		{Key: "files", Values: []string{"internal/a/**", "web/b, c.ts"}, IsList: true, Line: 6},
		{Key: "empty", Values: []string{}, IsList: true, Line: 9},
	}
	assert.Equal(t, want, fields)
}

func TestParseFrontmatter_RejectsEachMalformedShapeWithItsLineNumber(t *testing.T) {
	cases := []struct {
		name string
		src  string
		line int
		msg  string
	}{
		{"tab", "---\nid:\tx\n---\n", 2, "tab character"},
		{"crlf", "---\r\nid: x\r\n---\r\n", 1, "CRLF line ending — the file must be LF"},
		{"crlf inside", "---\nid: x\r\n---\n", 2, "CRLF line ending — the file must be LF"},
		{"duplicate key", "---\nid: x\nid: y\n---\n", 3, `duplicate field "id"`},
		{"empty value", "---\nid: \n---\n", 2, `field "id" needs a value`},
		{"unterminated quote", "---\nid: \"x\n---\n", 2, "unterminated quoted value"},
		{"empty block list", "---\nfiles:\nid: x\n---\n", 2, `block list under "files" has no items (write files: [] for none)`},
		{"inline comment", "---\nid: x # nope\n---\n", 2, "inline comment"},
		{"unclosed", "---\nid: x\n", 0, "frontmatter never closed (no second --- line)"},
		{"unparseable line", "---\njust words\n---\n", 2, "cannot parse"},
		{"bad escape", "---\nid: \"a\\nb\"\n---\n", 2, "malformed escape"},
		{"trailing comma", "---\ntags: [a, ]\n---\n", 2, "trailing comma"},
		{"unclosed list", "---\ntags: [a, b\n---\n", 2, "missing its closing bracket"},
		{"list item with bracket", "---\nfiles:\n  - a]b\n---\n", 3, "contains a comma or bracket"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, _, err := ParseFrontmatter([]byte(tc.src))
			require.Error(t, err)
			var se *SyntaxError
			require.True(t, errors.As(err, &se), "want a *SyntaxError, got %T", err)
			if tc.line > 0 {
				assert.Equal(t, tc.line, se.Line)
			}
			assert.Contains(t, se.Msg, tc.msg)
		})
	}
}

func TestParseFrontmatter_TreatsAThreeDashLineInsideTheBodyAsBody(t *testing.T) {
	src := "---\nid: x\n---\nintro\n\n```\n---\n```\n---\ntail\n"
	_, body, bodyLine, err := ParseFrontmatter([]byte(src))
	require.NoError(t, err)
	assert.Equal(t, 4, bodyLine)
	assert.Equal(t, "intro\n\n```\n---\n```\n---\ntail\n", body)
}

func TestParseFrontmatter_FailsAFileThatDoesNotStartWithTheOpener(t *testing.T) {
	for name, src := range map[string]string{
		"bom":         "\xef\xbb\xbf---\nid: x\n---\n",
		"blank first": "\n---\nid: x\n---\n",
		"plain md":    "# Title\n\ntext\n",
		"empty":       "",
	} {
		t.Run(name, func(t *testing.T) {
			_, _, _, err := ParseFrontmatter([]byte(src))
			var se *SyntaxError
			require.True(t, errors.As(err, &se))
			assert.Equal(t, 1, se.Line)
			assert.Equal(t, "no frontmatter: file does not start with ---", se.Msg)
		})
	}
}

func TestParseFrontmatter_QuotedValuesKeepColonsHashesAndCommas(t *testing.T) {
	src := "---\nsummary: \"a: b # c, d \\\"quoted\\\" back\\\\slash\"\ntags: [\"x, y\", \"#12\", plain]\n---\n"
	fields, _, _, err := ParseFrontmatter([]byte(src))
	require.NoError(t, err)
	s, ok := fields.Get("summary")
	require.True(t, ok)
	assert.Equal(t, []string{`a: b # c, d "quoted" back\slash`}, s.Values)
	tags, ok := fields.Get("tags")
	require.True(t, ok)
	assert.Equal(t, []string{"x, y", "#12", "plain"}, tags.Values)
}
