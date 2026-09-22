package server

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestToWireSession_UnreadAndLastPromptAreNeverNullExceptLastPrompt covers D14/the
// Protocol Contract delta (kb:anchor/ws.session): unread is a plain, never-null boolean
// carried verbatim (mirroring pinned/railPos's own test in sessionwire_test.go), and
// lastPrompt is nil until a first prompt exists.
func TestToWireSession_UnreadAndLastPromptAreNeverNullExceptLastPrompt(t *testing.T) {
	s := minimalSession()

	w := toWireSession(s)

	assert.False(t, w.Unread, "the zero value (false) must render, not be mistaken for absent")
	assert.Nil(t, w.LastPrompt, "nil until a first prompt exists")

	s2 := minimalSession()
	s2.Unread = true
	prompt := "fix the flaky retry and rerun the suite"
	s2.LastPrompt = &prompt

	w2 := toWireSession(s2)

	assert.True(t, w2.Unread)
	require.NotNil(t, w2.LastPrompt)
	assert.Equal(t, prompt, *w2.LastPrompt)
}

// TestSessionWire_JSONShapeHasUnreadAndLastPromptFields extends
// TestSessionWire_JSONShapeHasNoUnexpectedNulls's field-presence check
// (sessionwire_test.go) to the two new required keys — D14: every Session object on
// snapshot/sessionUpsert carries them.
func TestSessionWire_JSONShapeHasUnreadAndLastPromptFields(t *testing.T) {
	s := minimalSession()

	b, err := json.Marshal(toWireSession(s))
	require.NoError(t, err)

	var got map[string]any
	require.NoError(t, json.Unmarshal(b, &got))

	assert.Contains(t, got, "unread")
	assert.Contains(t, got, "lastPrompt")
	assert.Equal(t, false, got["unread"])
	assert.Nil(t, got["lastPrompt"])
}
