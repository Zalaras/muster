package claudecodetest_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

func TestPromptReplyTitle(t *testing.T) {
	tests := []struct {
		name      string
		body      []byte
		wantTitle string
		wantOK    bool
	}{
		{"the daemon's own reply", claudecode.PromptTitleReply("Mine"), "Mine", true},
		{"a title with quotes and unicode", claudecode.PromptTitleReply(`a "b" é`), `a "b" é`, true},
		{"an empty title is still a reply", claudecode.PromptTitleReply(""), "", true},
		{"empty body", nil, "", false},
		{"not JSON", []byte("hello"), "", false},
		{"no hook output", []byte(`{}`), "", false},
		{"another event's output", []byte(`{"hookSpecificOutput":{"hookEventName":"SessionStart","sessionTitle":"X"}}`), "", false},
		{"no event name", []byte(`{"hookSpecificOutput":{"sessionTitle":"X"}}`), "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			title, ok := claudecodetest.PromptReplyTitle(tt.body)
			assert.Equal(t, tt.wantOK, ok)
			assert.Equal(t, tt.wantTitle, title)
		})
	}
}
