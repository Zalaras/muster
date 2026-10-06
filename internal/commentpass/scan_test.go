package commentpass

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func texts(toks []ctoken) []string {
	out := make([]string, len(toks))
	for i, t := range toks {
		out[i] = t.text
	}
	return out
}

func TestScanGo_IgnoresCommentLookalikesInLiterals(t *testing.T) {
	src := "package p\n\nconst u = \"http://x\" // real\nconst r = `//raw`\nconst c = '/'\n/* block */\n//line foo.go:10\nfunc f() {}\n"
	toks, err := scanGo([]byte(src))
	require.NoError(t, err)
	assert.Equal(t, []string{"// real", "/* block */", "//line foo.go:10"}, texts(toks))
	for _, tk := range toks {
		assert.Equal(t, tk.text, src[tk.start:tk.end], "offsets survive the //line directive")
	}
}

func TestScanGo_ReportsAParseError(t *testing.T) {
	_, err := scanGo([]byte("package p\nconst s = \"unterminated\n"))
	require.Error(t, err)
}

func TestScanTS_Table(t *testing.T) {
	cases := []struct {
		name string
		src  string
		want []string
	}{
		{"double string", `const a = "http://x"; // c`, []string{"// c"}},
		{"single string", `const a = 'no // here' // c`, []string{"// c"}},
		{"template", "const a = `${proto}//${host}` // c", []string{"// c"}},
		{"nested template", "const a = `x${ `y${z}//` }//${w}` // c", []string{"// c"}},
		{"regex", `const r = /https?:\/\//; // c`, []string{"// c"}},
		{"regex class", `const r = /[/]/; // c`, []string{"// c"}},
		{"division", `const a = b / c // d`, []string{"// d"}},
		{"division twice", `const a = b / c / d // e`, []string{"// e"}},
		{"return regex", "return /\\//.test(s) // c", []string{"// c"}},
		{"jsdoc", "/** doc */\nexport function f() {}", []string{"/** doc */"}},
		{"multi-line block", "/*\n * a\n */\nconst x = 1; /* b */ const y = 2;", []string{"/*\n * a\n */", "/* b */"}},
		{"unterminated string resyncs", "const a = \"oops\n// after\n", []string{"// after"}},
		{"unterminated block", "/* never closed\nconst a = 1;", []string{"/* never closed\nconst a = 1;"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			toks, err := scanTS([]byte(tc.src))
			require.NoError(t, err)
			assert.Equal(t, tc.want, texts(toks))
			for _, tk := range toks {
				assert.Equal(t, tk.text, tc.src[tk.start:tk.end])
			}
		})
	}
}

// Every production TypeScript file in the repo scans to a balanced state and yields the
// same comment lines a naive line scan finds outside strings — the drift guard for the
// hand-written scanner.
func TestScanTS_RepoSelfCheck(t *testing.T) {
	root := filepath.Join("..", "..", "web", "src")
	n := 0
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".ts") {
			return err
		}
		src, err := os.ReadFile(path)
		require.NoError(t, err)
		toks, serr := scanTS(src)
		assert.NoError(t, serr, path)
		for _, tk := range toks {
			assert.True(t, strings.HasPrefix(tk.text, "//") || strings.HasPrefix(tk.text, "/*"), "%s: token %q", path, tk.text)
		}
		n++
		return nil
	})
	require.NoError(t, err)
	require.Positive(t, n)
}
