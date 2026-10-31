package server

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// TestIngestRename_PromptHookReplyCarriesOverrideOnce is the proof for
// kb:adr/rename-pushed-to-claude-once: a routed UserPromptSubmit for a
// session whose override was set by SetTitle answers with the Claude Code reply body
// naming that override, and the next UserPromptSubmit answers with an empty body.
func TestIngestRename_PromptHookReplyCarriesOverrideOnce(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	const override = "Renamed In Muster"
	title := override
	_, err := srv.manager.SetTitle(context.Background(), sess.ID, &title)
	require.NoError(t, err)

	body := claudecodetest.EnvelopedHookBody(int(sess.ID), "%1", "UserPromptSubmit", "rename-claude-1")
	hookPath := "/ingest/" + testIngestToken + "/hook"

	first := postIngest(t, srv, hookPath, body)
	require.Equal(t, 200, first.Code)
	got, ok := claudecodetest.PromptReplyTitle(first.Body.Bytes())
	require.True(t, ok,
		"the first UserPromptSubmit after a rename must answer with a UserPromptSubmit reply body, got %q", first.Body.String())
	assert.Equal(t, override, got)

	second := postIngest(t, srv, hookPath, body)
	require.Equal(t, 200, second.Code)
	assert.Empty(t, second.Body.String(), "an override already sent must not be sent again")
}
