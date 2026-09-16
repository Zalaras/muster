package triage

// TestCheckVersion covers general-cleanup REQ-1/D1: CheckVersion must accept every shape
// `git describe --tags --always --dirty` can produce for musterd.version, and continue to
// reject a malformed one (a trailing space, a second word, or an over-length string).

import "testing"

func TestCheckVersion(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want bool
	}{
		{"tagged with commit-count/hash and dirty", "v0.12.6-9-gc6056aa-dirty", true},
		{"tagged with commit-count/hash", "v0.12.6-9-gc6056aa", true},
		{"bare dotted version, no v prefix", "0.2.1", true},
		{"tagged pre-release", "v0.13.0-rc.1", true},
		{"bare --always short hash fallback", "c6056aa", true},
		{"bare --always short hash, dirty", "c6056aa-dirty", true},
		{"trailing space", "0.2.1 ", false},
		{"a second word", "v0.2.1 foo", false},
		// 33 hex chars: regex-shaped (the bare --always hash alternative allows up to 40),
		// so only the len<=32 guard rejects it — proves the guard runs independently of
		// the regex, not that the regex itself has some hidden length cap.
		{"33-char string, regex-shaped but over the 32-char cap", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", false},
		{"empty string", "", false},
		{"whitespace only", " ", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CheckVersion(Value{Kind: KindString, Str: tc.in})
			if got != tc.want {
				t.Errorf("CheckVersion(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// TestCheckVersion_WrongKindAlwaysFails ensures the kind guard is checked before the
// regex — a schema row of the wrong decoded kind must never pass just because its Num
// happens to stringify to something regex-shaped.
func TestCheckVersion_WrongKindAlwaysFails(t *testing.T) {
	if CheckVersion(Value{Kind: KindInt}) {
		t.Error("CheckVersion must reject a non-string Value regardless of its other fields")
	}
}
