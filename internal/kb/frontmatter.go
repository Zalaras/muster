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
	if err := checkOpening(text); err != nil {
		return nil, "", 0, err
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
		if err := checkLineChars(raw, lineNo); err != nil {
			return nil, "", 0, err
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
			values, next, perr := parseBlockList(lines, i, key, lineNo)
			if perr != nil {
				return nil, "", 0, perr
			}
			f.Values = values
			i = next
		case !strings.HasPrefix(rest, " "):
			return nil, "", 0, &SyntaxError{Line: lineNo, Msg: fmt.Sprintf("field %q needs a space after the colon", key)}
		default:
			values, isList, perr := parseScalarOrInlineList(rest[1:], key, lineNo)
			if perr != nil {
				return nil, "", 0, perr
			}
			f.Values, f.IsList = values, isList
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

// checkOpening rejects a file that does not open with an LF three-dash line.
func checkOpening(text string) error {
	if strings.HasPrefix(text, "---\r\n") {
		return &SyntaxError{Line: 1, Msg: "CRLF line ending — the file must be LF"}
	}
	if !strings.HasPrefix(text, "---\n") && text != "---" {
		return &SyntaxError{Line: 1, Msg: "no frontmatter: file does not start with ---"}
	}
	return nil
}

// checkLineChars rejects the two byte-level violations a frontmatter line can carry.
func checkLineChars(raw string, lineNo int) error {
	if strings.ContainsRune(raw, '\r') {
		return &SyntaxError{Line: lineNo, Msg: "CRLF line ending — the file must be LF"}
	}
	if strings.ContainsRune(raw, '\t') {
		return &SyntaxError{Line: lineNo, Msg: "tab character in frontmatter"}
	}
	return nil
}

// parseBlockList consumes the "  - item" lines following the bare "key:" at lines[i],
// returning the items and the index of the first line past them. keyLine is the key's own
// 1-based line, which carries the no-items error. A block list with no items is an error:
// the empty list is written key: [].
func parseBlockList(lines []string, i int, key string, keyLine int) (values []string, next int, err error) {
	j := i + 1
	for j < len(lines) {
		im := blockItemRE.FindStringSubmatch(lines[j])
		if im == nil {
			break
		}
		item, perr := parseItem(im[1], j+1, false)
		if perr != nil {
			return nil, 0, perr
		}
		values = append(values, item)
		j++
	}
	if len(values) == 0 {
		return nil, 0, &SyntaxError{Line: keyLine, Msg: fmt.Sprintf("block list under %q has no items (write %s: [] for none)", key, key)}
	}
	return values, j, nil
}

// parseScalarOrInlineList reads the value after "key: " — a bracketed inline list, or a
// single scalar.
func parseScalarOrInlineList(val, key string, lineNo int) (values []string, isList bool, err error) {
	if strings.TrimSpace(val) == "" {
		return nil, false, &SyntaxError{Line: lineNo, Msg: fmt.Sprintf("field %q needs a value", key)}
	}
	if strings.HasPrefix(val, "[") {
		items, perr := parseInlineList(val, lineNo)
		if perr != nil {
			return nil, false, perr
		}
		return items, true, nil
	}
	v, perr := parseItem(val, lineNo, true)
	if perr != nil {
		return nil, false, perr
	}
	return []string{v}, false, nil
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
