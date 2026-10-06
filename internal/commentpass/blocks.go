package commentpass

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// Kind says how a block sits in the file: own-line lines removed whole, or a segment
// sharing a line with code.
type Kind string

const (
	KindBlock   Kind = "block"
	KindSegment Kind = "segment"
)

// Span is a half-open byte range in the original file; Replace is what removal leaves
// (one space when code sits on both sides of a segment).
type Span struct {
	Start   int    `json:"start"`
	End     int    `json:"end"`
	Replace string `json:"replace,omitempty"`
}

// Block is one judgeable comment: consecutive own-line comment lines, or one segment.
type Block struct {
	Kind      Kind     `json:"kind"`
	Span      Span     `json:"span"`
	StartLine int      `json:"start_line"`
	EndLine   int      `json:"end_line"`
	Lines     []string `json:"lines"`
}

// directivePrefixes are comment texts the toolchain parses; they are never candidates and
// split a block they sit inside.
var directivePrefixes = []string{
	"//go:", "//nolint", "//line ", "//export ", "// +build",
	"//# sourceMappingURL", "/// <reference",
}

var directiveWords = []string{"biome-ignore", "@ts-expect-error", "@ts-ignore", "@ts-nocheck", "eslint-disable", "eslint-enable"}

func isDirective(text string) bool {
	for _, p := range directivePrefixes {
		if strings.HasPrefix(text, p) {
			return true
		}
	}
	body := strings.TrimLeft(strings.TrimPrefix(strings.TrimPrefix(text, "/*"), "//"), "* \t")
	for _, w := range directiveWords {
		if strings.HasPrefix(body, w) {
			return true
		}
	}
	return false
}

type lineIndex struct {
	starts []int
	n      int
}

func indexLines(src []byte) lineIndex {
	starts := []int{0}
	for i, c := range src {
		if c == '\n' && i+1 <= len(src) {
			starts = append(starts, i+1)
		}
	}
	return lineIndex{starts: starts, n: len(src)}
}

// lineOf returns the 1-based line holding byte offset off.
func (li lineIndex) lineOf(off int) int {
	lo, hi := 0, len(li.starts)-1
	for lo < hi {
		mid := (lo + hi + 1) / 2
		if li.starts[mid] <= off {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return lo + 1
}

func (li lineIndex) lineStart(line int) int { return li.starts[line-1] }

// lineEnd returns the offset just past the newline ending line, or the source length.
func (li lineIndex) lineEnd(line int) int {
	if line < len(li.starts) {
		return li.starts[line]
	}
	return li.n
}

func onlyBlank(b []byte) bool {
	for _, c := range b {
		if c != ' ' && c != '\t' && c != '\r' {
			return false
		}
	}
	return true
}

// blocks groups the scanner's tokens. A directive is a wall: skipped, and the block
// before it never joins the block after it.
func blocks(src []byte, toks []ctoken) []Block {
	li := indexLines(src)
	var out []Block
	for _, t := range toks {
		if isDirective(t.text) {
			continue
		}
		sl, el := li.lineOf(t.start), li.lineOf(max(t.start, t.end-1))
		afterEnd := li.lineEnd(el)
		codeBefore := !onlyBlank(src[li.lineStart(sl):t.start])
		codeAfter := !onlyBlank(trimNewline(src[t.end:afterEnd]))
		if codeBefore || codeAfter {
			out = append(out, segmentBlock(src, li, t, sl, el, codeBefore, codeAfter))
			continue
		}
		lines := splitTrim(string(src[li.lineStart(sl):afterEnd]))
		if n := len(out); n > 0 && out[n-1].Kind == KindBlock && out[n-1].EndLine+1 == sl {
			out[n-1].EndLine = el
			out[n-1].Span.End = afterEnd
			out[n-1].Lines = append(out[n-1].Lines, lines...)
			continue
		}
		out = append(out, Block{Kind: KindBlock, Span: Span{Start: li.lineStart(sl), End: afterEnd}, StartLine: sl, EndLine: el, Lines: lines})
	}
	return out
}

// segmentBlock spans a comment sharing its line with code, plus the whitespace that
// separated them; code on both sides keeps one space.
func segmentBlock(src []byte, li lineIndex, t ctoken, sl, el int, codeBefore, codeAfter bool) Block {
	start := t.start
	for start > li.lineStart(sl) && (src[start-1] == ' ' || src[start-1] == '\t') {
		start--
	}
	end := t.end
	if codeAfter {
		for end < li.lineEnd(el) && (src[end] == ' ' || src[end] == '\t') {
			end++
		}
	}
	sp := Span{Start: start, End: end}
	if codeAfter && codeBefore {
		sp.Replace = " "
	}
	return Block{Kind: KindSegment, Span: sp, StartLine: sl, EndLine: el, Lines: splitTrim(t.text)}
}

func trimNewline(b []byte) []byte {
	for len(b) > 0 && (b[len(b)-1] == '\n' || b[len(b)-1] == '\r') {
		b = b[:len(b)-1]
	}
	return b
}

func splitTrim(s string) []string {
	s = strings.TrimRight(s, "\r\n")
	parts := strings.Split(s, "\n")
	for i, l := range parts {
		parts[i] = strings.TrimLeft(strings.TrimRight(l, "\r"), " \t")
	}
	return parts
}

// Normalise reduces comment lines to their words, so a formatter rewrap never changes a
// key.
func Normalise(lines []string) string {
	var words []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		l = strings.TrimPrefix(l, "/**")
		l = strings.TrimPrefix(l, "/*")
		l = strings.TrimPrefix(l, "//")
		l = strings.TrimSuffix(l, "*/")
		l = strings.TrimLeft(l, "*")
		words = append(words, strings.Fields(l)...)
	}
	return strings.Join(words, " ")
}

// KeyOf identifies a comment by path and normalised text across cycles.
func KeyOf(path string, lines []string) string {
	sum := sha256.Sum256([]byte(Normalise(lines)))
	return path + ":" + hex.EncodeToString(sum[:])[:16]
}

func containsLine(b Block, line int) bool { return line >= b.StartLine && line <= b.EndLine }
