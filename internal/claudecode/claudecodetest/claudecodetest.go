// Package claudecodetest builds Claude-Code-wire-format request bodies for tests in
// other packages. Wire field names may not appear outside internal/claudecode (the D4
// boundary check), yet HTTP-boundary tests still need to POST realistic bodies — this
// package is the sanctioned way to get one. Tests needing shapes beyond these minimal
// builders belong in internal/claudecode's own tests, not here.
package claudecodetest

import "encoding/json"

// RawHookBody returns a minimal raw (non-enveloped) hook POST body for the given
// hook event and session id, as Claude Code itself would send it.
func RawHookBody(event, sessionID string) string {
	return marshal(map[string]any{
		"hook_event_name": event,
		"session_id":      sessionID,
		"cwd":             "/tmp",
	})
}

// EnvelopedHookBody wraps a minimal hook payload for the given event and session id
// in the musterSession/tmuxPane envelope produced by Muster's hook command wrapper.
func EnvelopedHookBody(musterSession int, tmuxPane, event, sessionID string) string {
	return marshal(map[string]any{
		"musterSession": musterSession,
		"tmuxPane":      tmuxPane,
		"payload": map[string]any{
			"hook_event_name": event,
			"session_id":      sessionID,
		},
	})
}

func marshal(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // unreachable: inputs are maps of strings and ints
	}
	return string(b)
}
