package kb

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseAnchors_RecordsLevelParentAndExtentForEachAnchor(t *testing.T) {
	anchors, order, findings := ParseAnchors(fixtureProtocol)
	require.Empty(t, findings)
	assert.Equal(t, []string{"sessions", "sessions.pin", "sessions.order"}, order)

	lines := strings.Split(fixtureProtocol, "\n")
	lineOf := func(prefix string) int {
		for i, l := range lines {
			if strings.HasPrefix(l, prefix) {
				return i + 1
			}
		}
		t.Fatalf("no line starts with %q", prefix)
		return 0
	}

	pin := anchors["sessions.pin"]
	assert.Equal(t, 3, pin.Level)
	assert.Equal(t, "3.10 `PUT /api/sessions/{id}/pin`", pin.Heading)
	assert.Equal(t, "3. HTTP endpoints — UI", pin.Parent)
	assert.Equal(t, lineOf("### 3.10"), pin.Start)
	assert.Equal(t, lineOf("### 3.11")-1, pin.End, "a ### slice ends on the line before the next ### heading")

	order3 := anchors["sessions.order"]
	assert.Equal(t, lineOf("## 4. WebSocket")-1, order3.End, "a ### slice also stops at the next ##")

	sess := anchors["sessions"]
	assert.Equal(t, 2, sess.Level)
	assert.Equal(t, "", sess.Parent, "a level-two anchor has no parent")
	assert.Equal(t, lineOf("## 3. HTTP"), sess.Start)
	assert.Equal(t, lineOf("## 4. WebSocket")-1, sess.End, "a ## slice swallows its ### children")
}

func TestParseAnchors_FailsAnAnchorNotImmediatelyBeforeAHeading(t *testing.T) {
	src := "# P\n\n<!-- kb:anchor a -->\n\n## A\n\n<!-- kb:anchor b -->\n# Top\n\n<!-- kb:anchor c -->\n#### Deep\n"
	anchors, _, findings := ParseAnchors(src)
	assert.Empty(t, anchors)
	var msgs []string
	for _, f := range findings {
		msgs = append(msgs, f.String())
	}
	assert.Equal(t, []string{
		`docs/protocol.md:3: kb:anchor "a" is not immediately followed by a ## or ### heading`,
		`docs/protocol.md:7: kb:anchor "b" is not immediately followed by a ## or ### heading`,
		`docs/protocol.md:10: kb:anchor "c" is not immediately followed by a ## or ### heading`,
	}, msgs)
}

func TestParseAnchors_FailsDuplicateIDsNamingTheFirstLine(t *testing.T) {
	src := "<!-- kb:anchor a -->\n## A\n\n<!-- kb:anchor a -->\n## B\n"
	anchors, order, findings := ParseAnchors(src)
	assert.Equal(t, []string{"a"}, order)
	assert.Equal(t, 2, anchors["a"].Start)
	require.Len(t, findings, 1)
	assert.Equal(t, `docs/protocol.md:4: duplicate kb:anchor "a" (first at line 1)`, findings[0].String())
}

func TestParseAnchors_IgnoresHeadingsInsideCodeFences(t *testing.T) {
	src := "<!-- kb:anchor a -->\n## A\n\n```\n## fake\n<!-- kb:anchor fake -->\n## fake2\n```\n\nstill A\n\n## B\n"
	anchors, order, findings := ParseAnchors(src)
	require.Empty(t, findings)
	assert.Equal(t, []string{"a"}, order)
	assert.Equal(t, 11, anchors["a"].End, "the fenced heading does not end the section; the real ## B does")
}

func TestSlice_RunsToTheNextHeadingOfSameOrHigherLevelAndOmitsTheAnchorLine(t *testing.T) {
	anchors, _, findings := ParseAnchors(fixtureProtocol)
	require.Empty(t, findings)

	pin := Slice(fixtureProtocol, anchors["sessions.pin"])
	assert.True(t, strings.HasPrefix(pin, "_docs/protocol.md § 3. HTTP endpoints — UI_\n### 3.10 `PUT /api/sessions/{id}/pin`\n"), pin)
	assert.Contains(t, pin, "## not a heading", "fenced pseudo-heading stays in the slice")
	assert.NotContains(t, pin, "3.11 Order")
	assert.NotContains(t, pin, "kb:anchor")
	assert.False(t, strings.HasSuffix(pin, "\n"), "trailing blank lines are trimmed")

	sess := Slice(fixtureProtocol, anchors["sessions"])
	assert.True(t, strings.HasPrefix(sess, "_docs/protocol.md_\n## 3. HTTP endpoints — UI\n"), sess)
	assert.Contains(t, sess, "### 3.10")
	assert.Contains(t, sess, "### 3.11 Order")
	assert.NotContains(t, sess, "kb:anchor", "nested anchor comments are omitted too")
	assert.NotContains(t, sess, "## 4. WebSocket")
}
