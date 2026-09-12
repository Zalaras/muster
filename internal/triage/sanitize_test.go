package triage

import (
	"errors"
	"regexp"
	"strings"
	"testing"
)

func TestSanitizeHTML(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		// The ordering test. If '<' and '>' are escaped before '&', the entities the
		// author typed are decoded instead of escaped and this yields a live tag.
		{"entity text does not round-trip into a tag", "&lt;script&gt;", "&amp;lt;script&amp;gt;"},
		{"tag", "<script>x</script>", "&lt;script&gt;x&lt;/script&gt;"},
		{"comment", "<!-- hidden -->", "&lt;!-- hidden --&gt;"},
		{"details close", "</details><summary>s</summary>", "&lt;/details&gt;&lt;summary&gt;s&lt;/summary&gt;"},
		{"hidden span", `<span style="display:none">x</span>`, `&lt;span style="display:none"&gt;x&lt;/span&gt;`},
		{"cdata", "<![CDATA[x]]>", "&lt;![CDATA[x]]&gt;"},
		{"bare less than", "a < b", "a &lt; b"},
		{"lone trailing", "a <", "a &lt;"},
		{"ampersand alone", "a & b", "a &amp; b"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, _, err := Sanitize(tc.in, DefaultLimits())
			if err != nil {
				t.Fatalf("Sanitize: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestSanitizeLinks(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"link to text", "[click](https://evil.example/x)", "click"},
		{"javascript destination", "[t](javascript:alert(1))", "t"},
		{"image drops bang and alt survives", "![alt](https://x/t.png?d=S)", "alt"},
		{"nested resolves inside out", "[a [b](c)](d)", "a b"},
		{"reference style", "[a][1]", "a"},
		{"reference definition line", "text\n[1]: https://evil.example\n", "text\n\n"},
		{"unbalanced is left as text", "[a](b", "[a](b"},
		{"bare url defanged", "see https://evil.example/p", "see https[:]//evil.example/p"},
		{"www defanged", "see www.evil.example", "see www[.]evil.example"},
		{"credentials in url", "http://u:p@h/", "http[:]//u:p@h/"},
		{"data uri", "data:text/html;base64,AAA", "data[:]text/html;base64,AAA"},
		// The angle brackets of an autolink are escaped a step later; the URL inside is
		// already inert, so an autolink needs no rule of its own.
		{"autolink", "<https://x.example>", "&lt;https[:]//x.example&gt;"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, _, err := Sanitize(tc.in, DefaultLimits())
			if err != nil {
				t.Fatalf("Sanitize: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// A URL inside a code fence is defanged too. Asserted deliberately: the transforms are
// whole-body by design, because region boundaries are attacker-controlled. Anyone who
// later "fixes" this into region-scoping should fail here.
func TestSanitizeIgnoresRegions(t *testing.T) {
	got, _, err := Sanitize("```\nhttps://evil.example\n```", DefaultLimits())
	if err != nil {
		t.Fatalf("Sanitize: %v", err)
	}
	if !strings.Contains(got, "https[:]//") {
		t.Errorf("URL inside a fence was not defanged: %q", got)
	}
}

func TestSanitizeRunes(t *testing.T) {
	cases := []struct {
		name      string
		in        string
		want      string
		zeroWidth int
	}{
		{"zero width space", "a\u200Bb", "a<U+200B>b", 1},
		{"soft hyphen", "a\u00ADb", "a<U+00AD>b", 1},
		{"bom", "\uFEFFa", "<U+FEFF>a", 1},
		{"joiner", "a\u200Db", "a<U+200D>b", 1},
		// Escaped, not deleted: a homoglyph is visible but deceptive, and the marker is
		// the only thing that tells a reader the character was not what it looked like.
		{"cyrillic homoglyph", "\u0456", "<U+0456>", 0},
		{"astral needs five digits", "\U0001F600", "<U+1F600>", 0},
		{"ansi escape", "\x1b[31mred", "<U+001B>[31mred", 0},
		{"nul", "a\x00b", "a<U+0000>b", 0},
		{"carriage return", "a\rb", "a<U+000D>b", 0},
		{"newline and tab survive", "a\n\tb", "a\n\tb", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, c, err := Sanitize(tc.in, DefaultLimits())
			if err != nil {
				t.Fatalf("Sanitize: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
			if c.ZeroWidth != tc.zeroWidth {
				t.Errorf("ZeroWidth = %d, want %d", c.ZeroWidth, tc.zeroWidth)
			}
		})
	}
}

func TestSanitizeInvalidUTF8(t *testing.T) {
	got, c, err := Sanitize("a\xffb", DefaultLimits())
	if err != nil {
		t.Fatalf("Sanitize: %v", err)
	}
	if got != "a<U+FFFD>b" {
		t.Errorf("got %q, want %q", got, "a<U+FFFD>b")
	}
	if c.NonASCII != 1 {
		t.Errorf("NonASCII = %d, want 1 — an invalid byte must be surfaced, not swallowed", c.NonASCII)
	}
}

func TestSanitizeBidi(t *testing.T) {
	for _, r := range []rune{0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069} {
		if _, _, err := Sanitize("a"+string(r)+"b", DefaultLimits()); !errors.Is(err, ErrBidi) {
			t.Errorf("U+%04X: err = %v, want ErrBidi", r, err)
		}
	}
	// Neighbours that are not overrides must not be rejected.
	for _, r := range []rune{0x2029, 0x202F} {
		if _, _, err := Sanitize("a"+string(r)+"b", DefaultLimits()); err != nil {
			t.Errorf("U+%04X: err = %v, want nil", r, err)
		}
	}
}

// Markdown structure is what survives, and that is deliberate — containing it is the
// renderer's job, not the sanitiser's.
func TestSanitizeKeepsMarkdown(t *testing.T) {
	in := "# heading\n\n- item\n\n**bold** and *em* and `code`\n\n```\nfenced\n```\n\n| a | b |\n| --- | --- |\n\n\\*escaped"
	got, c, err := Sanitize(in, DefaultLimits())
	if err != nil {
		t.Fatalf("Sanitize: %v", err)
	}
	if got != in {
		t.Errorf("markdown was altered:\n got %q\nwant %q", got, in)
	}
	if !c.Clean() {
		t.Errorf("plain markdown should need no intervention, got %+v", c)
	}
}

// Blockquote markers do not survive, and that is the accepted cost of escaping all three
// HTML characters unconditionally. A '>' alone cannot open a tag once '<' is escaped, so
// a carve-out for line-leading '>' would be safe — but an exception inside a security
// transform is how the next hole gets made, and the text itself is still legible.
func TestSanitizeEscapesBlockquoteMarkers(t *testing.T) {
	got, c, err := Sanitize("> quote", DefaultLimits())
	if err != nil {
		t.Fatalf("Sanitize: %v", err)
	}
	if got != "&gt; quote" {
		t.Errorf("got %q, want %q", got, "&gt; quote")
	}
	if c.HTMLEscaped != 1 {
		t.Errorf("HTMLEscaped = %d, want 1", c.HTMLEscaped)
	}
}

func TestSanitizeTruncates(t *testing.T) {
	t.Run("input cap at a rune boundary", func(t *testing.T) {
		in := strings.Repeat("é", 100) // 200 bytes
		got, c, err := Sanitize(in, Limits{MaxInputBytes: 51, MaxOutputBytes: 1 << 20})
		if err != nil {
			t.Fatalf("Sanitize: %v", err)
		}
		if !c.Truncated {
			t.Error("Truncated = false")
		}
		if !strings.HasSuffix(got, TruncationMarker) {
			t.Errorf("missing truncation marker: %q", got)
		}
		if strings.Contains(got, "<U+FFFD>") {
			t.Error("cut mid-rune")
		}
	})

	// Escaping is expansive, so the input cap alone does not bound the output.
	t.Run("output cap bites after expansion", func(t *testing.T) {
		in := strings.Repeat("\u200B", 2000)
		got, c, err := Sanitize(in, Limits{MaxInputBytes: 1 << 20, MaxOutputBytes: 1000})
		if err != nil {
			t.Fatalf("Sanitize: %v", err)
		}
		if !c.Truncated {
			t.Error("Truncated = false")
		}
		if len(got) > 1000+len(TruncationMarker) {
			t.Errorf("output %d bytes, want <= %d", len(got), 1000+len(TruncationMarker))
		}
	})
}

// The invariant the artifact's nonce framing rests on: every '<' in a sanitised body
// opens one of this package's own markers, because an author's angle brackets became
// entities in step 5, before any marker was written in step 6.
func TestSanitizeLeavesNoStrayAngleBrackets(t *testing.T) {
	marker := regexp.MustCompile(`^<U\+[0-9A-F]{4,5}>`)
	inputs := []string{
		"<script>\u200B</script>",
		"&lt;U+200B&gt;",
		"<U+200B>",
		strings.Repeat("\u200B", 300),
		"a < b > c \u00AD",
	}
	for _, in := range inputs {
		got, _, err := Sanitize(in, Limits{MaxInputBytes: 1 << 20, MaxOutputBytes: 137})
		if err != nil {
			t.Fatalf("Sanitize(%q): %v", in, err)
		}
		if strings.ContainsRune(got, '>') && !strings.ContainsRune(got, '<') {
			t.Errorf("Sanitize(%q) = %q: stray '>'", in, got)
		}
		for i := range len(got) {
			if got[i] == '<' && !marker.MatchString(got[i:]) {
				t.Errorf("Sanitize(%q) = %q: '<' at %d does not open a marker", in, got, i)
			}
		}
	}
}

// An author typing the literal text "<U+200B>" cannot forge a marker, because their
// angle brackets are escaped before any marker exists.
func TestSanitizeMarkersAreUnforgeable(t *testing.T) {
	got, _, err := Sanitize("<U+200B>", DefaultLimits())
	if err != nil {
		t.Fatalf("Sanitize: %v", err)
	}
	if got != "&lt;U+200B&gt;" {
		t.Errorf("got %q, want %q", got, "&lt;U+200B&gt;")
	}
}

func TestSanitizeTitle(t *testing.T) {
	got, _, err := SanitizeTitle("a\nb\tc  ", 200)
	if err != nil {
		t.Fatalf("SanitizeTitle: %v", err)
	}
	if got != "a b c" {
		t.Errorf("got %q, want %q", got, "a b c")
	}
	if strings.ContainsAny(got, "\n\r") {
		t.Error("newline survived into a title")
	}
}
