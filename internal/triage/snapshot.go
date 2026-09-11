package triage

import (
	"encoding/json"
	"regexp"
	"strings"
)

// maxDepth bounds recursion into a decoded body. Nothing musterd emits is deeper than
// four levels; the cap exists so a hand-written block cannot make flattening pathological.
const maxDepth = 12

// KV is one validated leaf, ready to render.
type KV struct {
	Path  string
	Value string
}

// Snapshot is the result of parsing an issue's raw JSON block.
//
// Present is false when the body carried no block. Ambiguous is true when it carried
// more than one candidate: a body may contain any number of <details> blocks and fenced
// JSON, and taking the first match would let an author shadow the genuine snapshot with
// fabricated version facts — which is exactly the data that decides whether a report is
// still true against the current tree. More than one candidate therefore discards the
// snapshot entirely rather than picking a winner.
type Snapshot struct {
	Present   bool
	Ambiguous bool
	Dropped   int
	Fields    []KV
}

var (
	reFenceOpen  = regexp.MustCompile("^(`{3,})json[ \t]*$")
	reFenceAny   = regexp.MustCompile("^(`{3,})[ \t]*$")
	reDetails    = regexp.MustCompile(`(?i)<details[\s>]`)
	reDetailSpan = regexp.MustCompile(`(?is)<details[\s>].*?</details>`)
	reSubSpan    = regexp.MustCompile(`(?is)<sub[\s>].*?</sub>`)
	reSnapTable  = regexp.MustCompile(`(?m)^## Snapshot[ \t]*\n(?:[ \t]*\n)*(?:^\|.*\n)+`)
)

// ExtractSnapshotJSON finds the single fenced JSON block in a raw issue body.
//
// Fence matching is line-based and length-aware because musterd writes a four-backtick
// fence (the payload itself contains three-backtick text), and Go's regexp has no
// backreference to match an opening fence to its own closing one.
func ExtractSnapshotJSON(body string) (raw string, present, ambiguous bool) {
	lines := strings.Split(body, "\n")
	var blocks []string
	for i := 0; i < len(lines); i++ {
		m := reFenceOpen.FindStringSubmatch(strings.TrimRight(lines[i], "\r"))
		if m == nil {
			continue
		}
		want := len(m[1])
		for j := i + 1; j < len(lines); j++ {
			c := reFenceAny.FindStringSubmatch(strings.TrimRight(lines[j], "\r"))
			if c != nil && len(c[1]) >= want {
				blocks = append(blocks, strings.Join(lines[i+1:j], "\n"))
				i = j
				break
			}
		}
	}
	if len(blocks) == 0 {
		return "", false, false
	}
	if len(blocks) > 1 || len(reDetails.FindAllString(body, -1)) > 1 {
		return "", true, true
	}
	return blocks[0], true, false
}

// ValidateSnapshot parses a raw block field by field against [Schema].
//
// Version-tolerant by construction: an unknown path, a wrong JSON type, or a value that
// fails its format check is dropped and counted, never a reason to reject the whole
// block. The schema has already drifted once — issue #9 predates the current
// claudeCode shape — and a strict validator would have held every issue filed before it.
func ValidateSnapshot(raw string) (Snapshot, error) {
	dec := json.NewDecoder(strings.NewReader(raw))
	dec.UseNumber()
	var root any
	if err := dec.Decode(&root); err != nil {
		return Snapshot{Present: true, Ambiguous: true}, err
	}
	obj, ok := root.(map[string]any)
	if !ok {
		// A root that is not an object is not a snapshot at all.
		return Snapshot{Present: true, Ambiguous: true}, nil
	}

	flat := map[string]Value{}
	dropped := 0
	flatten("", obj, 0, flat, &dropped)

	snap := Snapshot{Present: true}
	for _, f := range Schema {
		v, ok := flat[f.Path]
		if !ok {
			continue
		}
		delete(flat, f.Path)
		// A float row accepts integer JSON: usedPct arrives as 4, not 4.0.
		if v.Kind != f.Kind && (f.Kind != KindFloat || v.Kind != KindInt) {
			dropped++
			continue
		}
		if !f.Check(v) {
			dropped++
			continue
		}
		snap.Fields = append(snap.Fields, KV{Path: f.Path, Value: v.display()})
	}
	// Whatever is left had no row at all.
	dropped += len(flat)
	snap.Dropped = dropped
	return snap, nil
}

func flatten(prefix string, v any, depth int, out map[string]Value, dropped *int) {
	if depth > maxDepth {
		*dropped++
		return
	}
	switch t := v.(type) {
	case nil:
		// An explicit null is an absent field, not a malformed one. musterd writes
		// "endedAt": null on every live session.
	case map[string]any:
		for k, sub := range t {
			p := k
			if prefix != "" {
				p = prefix + "." + k
			}
			flatten(p, sub, depth+1, out, dropped)
		}
	case []any:
		ss := make([]string, 0, len(t))
		for _, e := range t {
			s, ok := e.(string)
			if !ok {
				*dropped++
				return
			}
			ss = append(ss, s)
		}
		out[prefix] = Value{Kind: KindStringSlice, Slice: ss}
	case string:
		out[prefix] = Value{Kind: KindString, Str: t}
	case bool:
		out[prefix] = Value{Kind: KindBool, Bool: t}
	case json.Number:
		k := KindInt
		if strings.ContainsAny(t.String(), ".eE") {
			k = KindFloat
		}
		out[prefix] = Value{Kind: k, Num: t}
	default:
		*dropped++
	}
}

func (v Value) display() string {
	switch v.Kind {
	case KindString:
		return v.Str
	case KindBool:
		if v.Bool {
			return "true"
		}
		return "false"
	case KindStringSlice:
		return strings.Join(v.Slice, ", ")
	default:
		return v.Num.String()
	}
}

// RenderSnapshotTable regenerates the fact table from validated values.
//
// The rendered "## Snapshot" table in the body is discarded rather than kept, because it
// duplicates this data as pre-formatted prose ("4% · 41783 / 1000000 tokens") that would
// need its own parsing. One validated source beats two. No value here can break the table:
// the token charset admits no pipe.
func RenderSnapshotTable(s Snapshot) string {
	if len(s.Fields) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("| field | value (reported by the author, not verified) |\n| --- | --- |\n")
	for _, kv := range s.Fields {
		b.WriteString("| " + kv.Path + " | " + kv.Value + " |\n")
	}
	return b.String()
}

// StripSnapshotRegions removes the machine-written regions from a raw body so the
// artifact carries the author's prose rather than a copy of the JSON.
//
// Presentation only. Every region boundary here is attacker-controlled, so nothing
// security-relevant may depend on a match: whatever survives still goes through
// [Sanitize] like the rest of the body.
func StripSnapshotRegions(body string) string {
	body = reDetailSpan.ReplaceAllString(body, "")
	body = reSnapTable.ReplaceAllString(body, "")
	body = reSubSpan.ReplaceAllString(body, "")
	return strings.TrimRight(body, " \t\n") + "\n"
}
