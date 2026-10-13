package commentpass

func scanCSS(src []byte) ([]ctoken, error) {
	var out []ctoken
	for i := 0; i < len(src); i++ {
		switch {
		case src[i] == '"' || src[i] == '\'':
			i = skipCSSString(src, i)
		case src[i] == '/' && i+1 < len(src) && src[i+1] == '*':
			end := indexFrom(src, i+2, "*/")
			if end < 0 {
				return nil, scanErr("unterminated comment")
			}
			out = append(out, ctoken{start: i, end: end + 2, text: string(src[i : end+2])})
			i = end + 1
		}
	}
	return out, nil
}

func skipCSSString(src []byte, i int) int {
	q := src[i]
	for j := i + 1; j < len(src); j++ {
		switch src[j] {
		case '\\':
			j++
		case q, '\n':
			return j
		}
	}
	return len(src) - 1
}

func indexFrom(src []byte, from int, sep string) int {
	for j := from; j+len(sep) <= len(src); j++ {
		if string(src[j:j+len(sep)]) == sep {
			return j
		}
	}
	return -1
}
