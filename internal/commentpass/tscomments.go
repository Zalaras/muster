package commentpass

import (
	"bytes"
	"strings"
)

// scanTS finds comments in TypeScript without a parser: a small state machine over
// strings, template literals (with nested ${}) and regex literals, so a "//" inside any of
// those is never a comment. A lone "/" is a regex start when the previous significant
// token cannot end an expression; a misjudged division only matters if "//" follows on
// the same line, which the repo self-check test guards.
func scanTS(src []byte) ([]ctoken, error) {
	s := &tsScanner{src: src, wordStart: -1}
	for s.i < len(src) {
		s.step()
	}
	if len(s.stack) > 0 {
		return s.out, errTemplateOpen
	}
	return s.out, nil
}

type tsScanner struct {
	src       []byte
	i         int
	out       []ctoken
	stack     []int // brace depth at each open ${ hole
	depth     int
	prevSig   byte
	prevWord  string
	wordStart int
}

type scanErr string

func (e scanErr) Error() string { return string(e) }

const errTemplateOpen = scanErr("unterminated template literal")

func (s *tsScanner) step() {
	c := s.src[s.i]
	switch c {
	case '/':
		if s.slash() {
			return
		}
	case '"', '\'':
		s.flushWord()
		s.i = skipString(s.src, s.i, c)
		s.prevSig = c
		return
	case '`':
		s.flushWord()
		s.enterTemplate(s.i + 1)
		return
	case '}':
		if len(s.stack) > 0 && s.depth == s.stack[len(s.stack)-1] {
			s.flushWord()
			s.stack = s.stack[:len(s.stack)-1]
			s.enterTemplate(s.i + 1)
			return
		}
	}
	s.plain(c)
}

// slash consumes a line comment, a block comment or a regex literal and reports whether
// it did; a division falls through to plain.
func (s *tsScanner) slash() bool {
	i, n := s.i, s.src
	if i+1 < len(n) && n[i+1] == '/' {
		s.flushWord()
		j := i
		for j < len(n) && n[j] != '\n' {
			j++
		}
		s.emit(i, j)
		return true
	}
	if i+1 < len(n) && n[i+1] == '*' {
		s.flushWord()
		end := len(n)
		if j := bytes.Index(n[i+2:], []byte("*/")); j >= 0 {
			end = i + 2 + j + 2
		}
		s.emit(i, end)
		return true
	}
	if s.regexAllowed() {
		s.flushWord()
		s.i = skipRegex(n, i)
		s.prevSig = '/'
		return true
	}
	return false
}

func (s *tsScanner) plain(c byte) {
	if isIdentByte(c) {
		if s.wordStart < 0 {
			s.wordStart = s.i
		}
		s.prevSig = c
		s.i++
		return
	}
	s.flushWord()
	switch c {
	case '{':
		s.depth++
	case '}':
		s.depth--
	}
	if c != ' ' && c != '\t' && c != '\n' && c != '\r' {
		s.prevSig = c
	}
	s.i++
}

func (s *tsScanner) emit(start, end int) {
	s.out = append(s.out, ctoken{start: start, end: end, text: string(s.src[start:end])})
	s.i = end
}

func (s *tsScanner) enterTemplate(from int) {
	i, stack, entered := skipTemplate(s.src, from, s.stack, s.depth)
	s.i, s.stack = i, stack
	s.prevSig = templateEnd(entered)
}

func (s *tsScanner) flushWord() {
	if s.wordStart >= 0 {
		s.prevWord = string(s.src[s.wordStart:s.i])
		s.wordStart = -1
	}
}

func (s *tsScanner) regexAllowed() bool {
	if s.prevSig == 0 || strings.IndexByte("(,=:[!&|?{};+-*%<>~^", s.prevSig) >= 0 {
		return true
	}
	if !isIdentByte(s.prevSig) {
		return false
	}
	switch s.prevWord {
	case "return", "typeof", "case", "do", "else", "in", "instanceof", "new", "delete", "void", "throw", "yield", "await", "of":
		return true
	}
	return false
}

func isIdentByte(c byte) bool {
	return c == '_' || c == '$' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

// skipString returns the index after the closing quote; an unterminated string ends at
// the line break so one bad literal never swallows the file.
func skipString(src []byte, i int, q byte) int {
	i++
	for i < len(src) {
		switch src[i] {
		case '\\':
			i += 2
			continue
		case q:
			return i + 1
		case '\n':
			return i
		}
		i++
	}
	return i
}

// skipTemplate scans from just inside a backtick (or just after the "}" closing a ${}
// hole) to the closing backtick, or pushes the caller's brace depth and returns at a
// "${" so the caller scans the hole as code until a "}" at that same depth.
func skipTemplate(src []byte, i int, stack []int, depth int) (int, []int, bool) {
	for i < len(src) {
		switch src[i] {
		case '\\':
			i += 2
			continue
		case '`':
			return i + 1, stack, false
		case '$':
			if i+1 < len(src) && src[i+1] == '{' {
				return i + 2, append(stack, depth), true
			}
		}
		i++
	}
	return i, stack, false
}

// templateEnd is the significant byte a template leaves behind: a closed literal ends an
// expression, an opened hole starts one.
func templateEnd(entered bool) byte {
	if entered {
		return '{'
	}
	return '`'
}

func skipRegex(src []byte, i int) int {
	i++
	inClass := false
	for i < len(src) {
		switch src[i] {
		case '\\':
			i += 2
			continue
		case '[':
			inClass = true
		case ']':
			inClass = false
		case '/':
			if !inClass {
				i++
				for i < len(src) && isIdentByte(src[i]) {
					i++
				}
				return i
			}
		case '\n':
			return i
		}
		i++
	}
	return i
}
