package triage

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// ErrBidi rejects a body outright rather than escaping it. No honest bug report carries
// a bidirectional override, and the whole point of one is to make rendered text disagree
// with its bytes — the exact property every other transform here exists to remove.
var ErrBidi = errors.New("bidirectional override present")

// TruncationMarker is appended when a cap bites. A fixed constant: a marker assembled
// from the body would be attacker text in a position the reader trusts.
const TruncationMarker = "\n[truncated]"

// Limits bound both ends. The output cap is not redundant: escaping is expansive, and a
// body of nothing but zero-width runes grows roughly eightfold under it.
type Limits struct {
	MaxInputBytes  int
	MaxOutputBytes int
}

// DefaultLimits is what tools/triage runs with.
func DefaultLimits() Limits {
	return Limits{MaxInputBytes: 8 << 10, MaxOutputBytes: 32 << 10}
}

// Counts feeds routing. Every field is a count of something removed or rewritten, so a
// non-zero total means the body was not plain prose.
type Counts struct {
	HTMLEscaped   int
	LinksStripped int
	URLsDefanged  int
	NonASCII      int
	ZeroWidth     int
	Truncated     bool
}

// Clean reports whether the body needed no intervention at all.
func (c Counts) Clean() bool {
	return c.HTMLEscaped == 0 && c.LinksStripped == 0 && c.URLsDefanged == 0 &&
		c.NonASCII == 0 && c.ZeroWidth == 0 && !c.Truncated
}

var (
	// Character classes exclude their own delimiters so nesting resolves inside-out over
	// repeated passes rather than swallowing a whole line in one greedy match.
	// The destination tolerates one level of nested parentheses, because
	// "[t](javascript:alert(1))" is a link and a flat [^()]* stops at the inner paren,
	// leaving the whole construct behind.
	reImage   = regexp.MustCompile(`!\[([^\[\]]*)\]\((?:[^()]|\([^()]*\))*\)`)
	reLink    = regexp.MustCompile(`\[([^\[\]]*)\]\((?:[^()]|\([^()]*\))*\)`)
	reRefLink = regexp.MustCompile(`\[([^\[\]]*)\]\[[^\[\]]*\]`)
	reRefDef  = regexp.MustCompile(`(?m)^[ \t]*\[[^\[\]]*\]:[ \t]*\S+[ \t]*$`)

	// Defanging keys on the scheme separator, not on the surrounding delimiters, so an
	// autolink needs no rule of its own: its angle brackets are escaped a step later and
	// the URL inside is already inert.
	reScheme = regexp.MustCompile(`(?i)(https?|ftp|file|data|javascript):`)
	reWWW    = regexp.MustCompile(`(?i)\bwww\.`)
)

// bidi are the overrides and isolates that make rendered order disagree with byte order.
func isBidi(r rune) bool {
	return (r >= 0x202A && r <= 0x202E) || (r >= 0x2066 && r <= 0x2069)
}

// zeroWidth are runes that occupy no visual space, so a human reviewing the rendered
// issue cannot see them. They are escaped rather than deleted, and counted, because
// their presence is itself the signal.
func isZeroWidth(r rune) bool {
	switch r {
	case 0x00AD, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF:
		return true
	}
	return false
}

// HasBidi reports whether text carries a bidirectional override.
//
// Exported so a caller can decide to hold an issue before sanitising rather than reading
// a rejection back out of an error — a hold is a routing outcome, not a failure.
func HasBidi(s string) bool {
	for _, r := range s {
		if isBidi(r) {
			return true
		}
	}
	return false
}

// Sanitize applies the six transforms in the order package doc fixes. It returns the
// cleaned text, what it had to do, and ErrBidi if the body must be held instead.
//
// The result contains no '<' or '>' other than this package's own escape markers, which
// is what makes the artifact's nonce framing hold: an author's angle brackets have become
// entities by the time any marker is written.
func Sanitize(s string, l Limits) (string, Counts, error) {
	var c Counts

	// 1. Bidi is a rejection, not a repair.
	for _, r := range s {
		if isBidi(r) {
			return "", c, ErrBidi
		}
	}

	// 2. Truncate before doing work, so the cost of the passes below is bounded.
	if l.MaxInputBytes > 0 && len(s) > l.MaxInputBytes {
		cut := l.MaxInputBytes
		for cut > 0 && !utf8.RuneStart(s[cut]) {
			cut--
		}
		s = s[:cut]
		c.Truncated = true
	}

	// 3. Images first: the '!' prefix would otherwise be left stranded by the link pass,
	// and alt text is a hiding place precisely because it renders only when the image
	// fails to load. Repeat to a fixed point so nested spans resolve from the inside out.
	for range 8 {
		before := s
		s = replaceCounting(reImage, s, &c.LinksStripped)
		s = replaceCounting(reLink, s, &c.LinksStripped)
		s = replaceCounting(reRefLink, s, &c.LinksStripped)
		if s == before {
			break
		}
	}
	// A reference definition is a whole line whose only content is a target.
	s = reRefDef.ReplaceAllStringFunc(s, func(string) string {
		c.LinksStripped++
		return ""
	})

	// 4. Defang what is left. A bare URL is still a target a model could act on, so the
	// scheme separator is broken while the text stays readable.
	s = reScheme.ReplaceAllStringFunc(s, func(m string) string {
		c.URLsDefanged++
		return m[:len(m)-1] + "[:]"
	})
	s = reWWW.ReplaceAllStringFunc(s, func(m string) string {
		c.URLsDefanged++
		return m[:len(m)-1] + "[.]"
	})

	// 5. Ampersand FIRST. Reversing these two lines turns the literal text "&lt;script&gt;"
	// back into a live tag — see the package doc.
	s, n := countingReplace(s, "&", "&amp;")
	c.HTMLEscaped += n
	s, n = countingReplace(s, "<", "&lt;")
	c.HTMLEscaped += n
	s, n = countingReplace(s, ">", "&gt;")
	c.HTMLEscaped += n

	// 6. Everything not printable ASCII becomes a visible marker. Escaped, never deleted:
	// deletion would hide that anything was there, which is the attacker's goal.
	var b strings.Builder
	b.Grow(len(s))
	for i, r := range s {
		switch {
		case r == '\n' || r == '\t':
			b.WriteRune(r)
		case r >= 0x20 && r <= 0x7E:
			b.WriteRune(r)
		case r == utf8.RuneError && !utf8.ValidString(s[i:i+1]):
			// Invalid UTF-8: surface it rather than letting the decoder swallow a byte.
			c.NonASCII++
			b.WriteString("<U+FFFD>")
		default:
			c.NonASCII++
			if isZeroWidth(r) {
				c.ZeroWidth++
			}
			writeEscape(&b, r)
		}
	}
	out := b.String()

	// The output cap runs last, because only now is the final size known.
	if l.MaxOutputBytes > 0 && len(out) > l.MaxOutputBytes {
		out = cutBeforeMarker(out, l.MaxOutputBytes)
		c.Truncated = true
	}
	if c.Truncated {
		out += TruncationMarker
	}
	return out, c, nil
}

// SanitizeTitle is Sanitize with newlines folded to spaces. A title is rendered on one
// line, so a newline in one is only ever an attempt to forge structure around it.
func SanitizeTitle(s string, limit int) (string, Counts, error) {
	s = strings.NewReplacer("\n", " ", "\r", " ", "\t", " ").Replace(s)
	out, c, err := Sanitize(s, Limits{MaxInputBytes: limit, MaxOutputBytes: limit * 8})
	if err != nil {
		return "", c, err
	}
	return strings.TrimSpace(out), c, nil
}

// writeEscape renders a rune as a visible marker. Astral planes need five hex digits;
// four would silently alias U+1F600 onto a different codepoint.
func writeEscape(b *strings.Builder, r rune) {
	if r > 0xFFFF {
		fmt.Fprintf(b, "<U+%05X>", r)
	} else {
		fmt.Fprintf(b, "<U+%04X>", r)
	}
}

// cutBeforeMarker trims to at most max bytes without leaving a half-written marker,
// which would put a lone '<' in the output and break the no-stray-angle-bracket invariant.
func cutBeforeMarker(s string, limit int) string {
	s = s[:limit]
	if i := strings.LastIndexByte(s, '<'); i >= 0 && strings.IndexByte(s[i:], '>') < 0 {
		s = s[:i]
	}
	return s
}

func replaceCounting(re *regexp.Regexp, s string, n *int) string {
	return re.ReplaceAllStringFunc(s, func(m string) string {
		*n++
		sub := re.FindStringSubmatch(m)
		if len(sub) > 1 {
			return sub[1]
		}
		return ""
	})
}

func countingReplace(s, from, to string) (string, int) {
	n := strings.Count(s, from)
	if n == 0 {
		return s, 0
	}
	return strings.ReplaceAll(s, from, to), n
}
