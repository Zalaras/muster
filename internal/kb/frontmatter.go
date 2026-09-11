package kb

import (
	"fmt"
	"regexp"
	"strings"
)

// Field is one frontmatter entry. A scalar has one value and IsList false; a list (inline
// or block) has zero or more values and IsList true. Line is the 1-based line of the key.
type Field struct {
	Key    string
	Values []string
	IsList bool
	Line   int
}

// Fields is a record's frontmatter in file order.
type Fields []Field

// Get returns the field named key.
func (fs Fields) Get(key string) (Field, bool) {
	for _, f := range fs {
		if f.Key == key {
			return f, true
		}
	}
	return Field{}, false
}

// SyntaxError is a frontmatter grammar violation. Line is 0 when the problem has no
// single line (the frontmatter was never closed).
type SyntaxError struct {
	Line int
	Msg  string
}

func (e *SyntaxError) Error() string {
	if e.Line > 0 {
		return fmt.Sprintf("line %d: %s", e.Line, e.Msg)
	}
	return e.Msg
}

var (
	keyRE       = regexp.MustCompile(`^([a-z][a-z0-9_-]*):(.*)$`)
	blockItemRE = regexp.MustCompile(`^  - (.*)$`)
)

// ParseFrontmatter reads the strict flat frontmatter grammar (design §2): the file must
// begin with a three-dash line, every entry is a scalar, an inline list or a block list,
// comments are full-line only, and the frontmatter ends at the first later three-dash
// line. Nothing is coerced: every value is a string. body is everything after the closing
// line and bodyLine its 1-based first line. Any violation is a *SyntaxError.
func ParseFrontmatter(src []byte) (fields Fields, body string, bodyLine int, err error) {
	text := string(src)
	if strings.HasPrefix(text, "---\r\n") {
		return nil, "", 0, &SyntaxError{Line: 1, Msg: "CRLF line ending — the file must be LF"}
	}
	if !strings.HasPrefix(text, "---\n") && text != "---" {
		return nil, "", 0, &SyntaxError{Line: 1, Msg: "no frontmatter: file does not start with ---"}
	}
	lines := strings.Split(text, "\n")
	seen := map[string]int{}
	closed := false
	i := 1
	for i < len(lines) {
		raw := lines[i]
		lineNo := i + 1
		if raw == "---" {
			closed = true
			i++
			break
		}
		if strings.ContainsRune(raw, '\r') {
			return nil, "", 0, &SyntaxError{Line: lineNo, Msg: "CRLF line ending — the file must be LF"}
		}
		if strings.ContainsRune(raw, '\t') {
			return nil, "", 0, &SyntaxError{Line: lineNo, Msg: "tab character in frontmatter"}
		}
		if strings.TrimSpace(raw) == "" || strings.HasPrefix(raw, "#") {
			i++
			continue
		}
		m := keyRE.FindStringSubmatch(raw)
		if m == nil {
			return nil, "", 0, &SyntaxError{Line: lineNo, Msg: fmt.Sprintf("cannot parse %q (want key: value, key: [a, b] or a block list)", raw)}
		}
		key, rest := m[1], m[2]
		if first, dup := seen[key]; dup {
			return nil, "", 0, &SyntaxError{Line: lineNo, Msg: fmt.Sprintf("duplicate field %q (first at line %d)", key, first)}
		}
		seen[key] = lineNo
		f := Field{Key: key, Line: lineNo}

		switch {
		case rest == "":
			// Block list: consume the item lines that follow.
			f.IsList = true
			j := i + 1
			for j < len(lines) {
				im := blockItemRE.FindStringSubmatch(lines[j])
				if im == nil {
					break
				}
				item, perr := parseItem(im[1], j+1, false)
				if perr != nil {
					return nil, "", 0, perr
				}
				f.Values = append(f.Values, item)
				j++
			}
			if len(f.Values) == 0 {
				return nil, "", 0, &SyntaxError{Line: lineNo, Msg: fmt.Sprintf("block list under %q has no items (write %s: [] for none)", key, key)}
			}
			i = j
		case !strings.HasPrefix(rest, " "):
			return nil, "", 0, &SyntaxError{Line: lineNo, Msg: fmt.Sprintf("field %q needs a space after the colon", key)}
		default:
			val := rest[1:]
			if strings.TrimSpace(val) == "" {
				return nil, "", 0, &SyntaxError{Line: lineNo, Msg: fmt.Sprintf("field %q needs a value", key)}
			}
			if strings.HasPrefix(val, "[") {
				items, perr := parseInlineList(val, lineNo)
				if perr != nil {
					return nil, "", 0, perr
				}
				f.IsList = true
				f.Values = items
			} else {
				v, perr := parseItem(val, lineNo, true)
				if perr != nil {
					return nil, "", 0, perr
				}
				f.Values = []string{v}
			}
			i++
		}
		fields = append(fields, f)
	}
	if !closed {
		return nil, "", 0, &SyntaxError{Msg: "frontmatter never closed (no second --- line)"}
	}
	body = strings.Join(lines[i:], "\n")
	return fields, body, i + 1, nil
}

// parseItem reads one scalar value or list item: a quoted string with backslash escapes
// for quote and backslash, or unquoted trimmed text with no inline comment. Inside a
// list an unquoted item may not contain a comma or a closing bracket.
func parseItem(s string, line int, scalar bool) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", &SyntaxError{Line: line, Msg: "empty value"}
	}
	if strings.HasPrefix(s, "\"") {
		v, rest, err := readQuoted(s, line)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(rest) != "" {
			return "", &SyntaxError{Line: line, Msg: fmt.Sprintf("unexpected text after quoted value: %q", strings.TrimSpace(rest))}
		}
		return v, nil
	}
	if strings.Contains(s, " #") {
		return "", &SyntaxError{Line: line, Msg: "inline comment (comments are full-line only; quote the value if it needs a hash)"}
	}
	if !scalar && strings.ContainsAny(s, ",]") {
		return "", &SyntaxError{Line: line, Msg: fmt.Sprintf("list item %q contains a comma or bracket — quote it", s)}
	}
	return s, nil
}

// readQuoted consumes a leading quoted string and returns its value and the remainder.
func readQuoted(s string, line int) (val, rest string, err error) {
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			if i+1 >= len(s) || (s[i+1] != '"' && s[i+1] != '\\') {
				return "", "", &SyntaxError{Line: line, Msg: "malformed escape in quoted value (only a quote or a backslash may follow a backslash)"}
			}
			b.WriteByte(s[i+1])
			i++
		case '"':
			return b.String(), s[i+1:], nil
		default:
			b.WriteByte(s[i])
		}
	}
	return "", "", &SyntaxError{Line: line, Msg: "unterminated quoted value"}
}

// parseInlineList reads a bracketed, comma-separated list; [] is the empty list.
func parseInlineList(s string, line int) ([]string, error) {
	inner := strings.TrimSpace(s[1:])
	if !strings.HasSuffix(inner, "]") {
		return nil, &SyntaxError{Line: line, Msg: "inline list is missing its closing bracket"}
	}
	inner = inner[:len(inner)-1]
	if strings.Contains(inner, " #") && !strings.Contains(inner, "\"") {
		return nil, &SyntaxError{Line: line, Msg: "inline comment (comments are full-line only; quote the value if it needs a hash)"}
	}
	items := []string{}
	rest := inner
	for {
		rest = strings.TrimLeft(rest, " ")
		if rest == "" {
			if len(items) > 0 {
				return nil, &SyntaxError{Line: line, Msg: "inline list has a trailing comma"}
			}
			return items, nil
		}
		var item string
		if strings.HasPrefix(rest, "\"") {
			v, after, err := readQuoted(rest, line)
			if err != nil {
				return nil, err
			}
			item, rest = v, after
		} else {
			end := strings.IndexByte(rest, ',')
			if end == -1 {
				end = len(rest)
			}
			var err error
			item, err = parseItem(rest[:end], line, false)
			if err != nil {
				return nil, err
			}
			rest = rest[end:]
		}
		items = append(items, item)
		rest = strings.TrimLeft(rest, " ")
		switch {
		case rest == "":
			return items, nil
		case strings.HasPrefix(rest, ","):
			rest = rest[1:]
		default:
			return nil, &SyntaxError{Line: line, Msg: fmt.Sprintf("unexpected text in inline list: %q", rest)}
		}
	}
}
