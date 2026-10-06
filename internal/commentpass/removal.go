package commentpass

import "sort"

// removeSpans deletes each span from src, applying them last to first so earlier offsets
// stay valid. Overlapping spans are an internal error and are merged conservatively.
func removeSpans(src []byte, spans []Span) []byte {
	if len(spans) == 0 {
		return append([]byte(nil), src...)
	}
	ss := append([]Span(nil), spans...)
	sort.Slice(ss, func(i, j int) bool { return ss[i].Start > ss[j].Start })
	out := append([]byte(nil), src...)
	limit := len(out)
	for _, s := range ss {
		end := min(s.End, limit)
		if s.Start >= end {
			continue
		}
		out = append(out[:s.Start], append([]byte(s.Replace), out[end:]...)...)
		limit = s.Start
	}
	return out
}
