package triage

import (
	"encoding/json"
	"regexp"
	"time"
)

// Kind is the JSON shape a schema row accepts. A value arriving as the wrong kind is
// dropped, never coerced: coercion is where a string starts pretending to be a number.
type Kind int

const (
	KindString Kind = iota
	KindInt
	KindFloat
	KindBool
	KindStringSlice
)

// Value is one decoded leaf. Numbers stay as json.Number because usedPct arrives as the
// integer 4 rather than 4.0, and totalInputTokens through a float64 would lose precision
// at nine figures.
type Value struct {
	Kind  Kind
	Str   string
	Num   json.Number
	Bool  bool
	Slice []string
}

// CheckFunc reports whether a value is well-formed enough to keep. A false is always a
// drop-and-count, never an error: the point is to survive a body that is partly garbage,
// not to reject it wholesale.
type CheckFunc func(Value) bool

// The token charset is the security-relevant one, and it is deliberately permissive in
// value while strict in shape. It has to admit real values like "claude-opus-5[1m]" and
// "muster-1:@0" — a stricter charset would drop them, and a dropped field routes the
// whole issue facts-only, so over-tightening here is not the safe direction. What it
// excludes is what matters: no whitespace, quotes, angle brackets, parentheses, pipes or
// backslashes, so a token cannot carry markup, break the regenerated table, or form a
// "](" link fragment.
var reToken = regexp.MustCompile(`^[A-Za-z0-9_.:@+/\[\]-]+$`)

// A version is dotted digits with an optional pre-release tail.
var reVersion = regexp.MustCompile(`^[0-9]+(\.[0-9]+)*(-[A-Za-z0-9.]+)?$`)

// CheckToken accepts a bounded token.
func CheckToken(limit int) CheckFunc {
	return func(v Value) bool {
		return v.Kind == KindString && len(v.Str) > 0 && len(v.Str) <= limit && reToken.MatchString(v.Str)
	}
}

// CheckVersion accepts a version string.
func CheckVersion(v Value) bool {
	return v.Kind == KindString && len(v.Str) <= 32 && reVersion.MatchString(v.Str)
}

// CheckRFC3339 accepts a timestamp musterd could actually have written.
func CheckRFC3339(v Value) bool {
	if v.Kind != KindString || len(v.Str) > 40 {
		return false
	}
	_, err := time.Parse(time.RFC3339, v.Str)
	return err == nil
}

// CheckEnum accepts one of a closed set. Used only where the set is genuinely stable —
// an enum that drifts drops valid fields.
func CheckEnum(allowed ...string) CheckFunc {
	set := make(map[string]bool, len(allowed))
	for _, a := range allowed {
		set[a] = true
	}
	return func(v Value) bool { return v.Kind == KindString && set[v.Str] }
}

// CheckIntRange accepts an integer within bounds.
func CheckIntRange(lo, hi int64) CheckFunc {
	return func(v Value) bool {
		if v.Kind != KindInt {
			return false
		}
		n, err := v.Num.Int64()
		return err == nil && n >= lo && n <= hi
	}
}

// CheckFloatRange accepts a number within bounds. Integer JSON satisfies it.
func CheckFloatRange(lo, hi float64) CheckFunc {
	return func(v Value) bool {
		if v.Kind != KindFloat && v.Kind != KindInt {
			return false
		}
		f, err := v.Num.Float64()
		return err == nil && f >= lo && f <= hi
	}
}

// CheckBool accepts any boolean; the decoded type is the whole check.
func CheckBool(v Value) bool { return v.Kind == KindBool }

// CheckTokenSlice bounds both the element count and each element, so a recentTypes array
// of ten thousand entries, or one entry a megabyte long, is dropped rather than rendered.
func CheckTokenSlice(maxElems, elemLen int) CheckFunc {
	elem := CheckToken(elemLen)
	return func(v Value) bool {
		if v.Kind != KindStringSlice || len(v.Slice) > maxElems {
			return false
		}
		for _, s := range v.Slice {
			if !elem(Value{Kind: KindString, Str: s}) {
				return false
			}
		}
		return true
	}
}

// String makes drift-test failures readable.
func (k Kind) String() string {
	switch k {
	case KindString:
		return "string"
	case KindInt:
		return "int"
	case KindFloat:
		return "float"
	case KindBool:
		return "bool"
	case KindStringSlice:
		return "[]string"
	default:
		return "unknown"
	}
}
