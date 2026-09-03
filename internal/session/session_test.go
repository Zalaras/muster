package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestSession_DisplayTitle covers D4/REQ-11's precedence exhaustively: all four cells of
// override x Claude-name, each null/non-null. TitleOverride always wins when non-nil;
// Title (Claude's last-known name) is the fallback; nil/nil yields nil (the client shows
// "untitled").
func TestSession_DisplayTitle(t *testing.T) {
	override := "User Override"
	claudeName := "Claude's Name"

	tests := []struct {
		name     string
		override *string
		title    *string
		want     *string
	}{
		{"override set, title set: override wins", &override, &claudeName, &override},
		{"override set, title nil: override wins", &override, nil, &override},
		{"override nil, title set: falls back to title", nil, &claudeName, &claudeName},
		{"override nil, title nil: nil (untitled)", nil, nil, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sess := &Session{TitleOverride: tt.override, Title: tt.title}

			got := sess.DisplayTitle()

			if tt.want == nil {
				assert.Nil(t, got)
				return
			}
			if assert.NotNil(t, got) {
				assert.Equal(t, *tt.want, *got)
			}
		})
	}
}

// TestSession_DisplayTitle_ReturnsTheOverridePointerItself pins down that DisplayTitle
// hands back TitleOverride's own pointer (not a copy) when it's set — callers compare it
// for pointer identity nowhere critical today, but a future accidental copy would be a
// silent behavior change this test would catch.
func TestSession_DisplayTitle_ReturnsTheOverridePointerItself(t *testing.T) {
	override := "Mine"
	sess := &Session{TitleOverride: &override, Title: nil}

	got := sess.DisplayTitle()

	assert.Same(t, &override, got)
}
