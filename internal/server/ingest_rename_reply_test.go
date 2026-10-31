package server

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// renameRig is a started server with one live session (pane "%1") whose Claude Code name
// is "Orig". Claude's name is seeded through the manager directly, never through ingest, so
// setup does not exercise the code under test.
type renameRig struct {
	t      *testing.T
	srv    *testServer
	id     int64
	claude string
}

const renameClaudeName = "Orig"

func newRenameRig(t *testing.T) *renameRig {
	t.Helper()
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)
	_, err := srv.manager.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Title: strPtr(renameClaudeName)})
	require.NoError(t, err)
	return &renameRig{t: t, srv: srv, id: sess.ID, claude: "rename-claude-rig"}
}

func (r *renameRig) setTitle(title *string) {
	r.t.Helper()
	_, err := r.srv.manager.SetTitle(context.Background(), r.id, title)
	require.NoError(r.t, err)
}

func (r *renameRig) hook(body string) *httptest.ResponseRecorder {
	r.t.Helper()
	return postIngest(r.t, r.srv, "/ingest/"+testIngestToken+"/hook", body)
}

func (r *renameRig) status(body string) *httptest.ResponseRecorder {
	r.t.Helper()
	return postIngest(r.t, r.srv, "/ingest/"+testIngestToken+"/status", body)
}

func (r *renameRig) prompt() *httptest.ResponseRecorder {
	r.t.Helper()
	return r.hook(claudecodetest.EnvelopedHookBody(int(r.id), "%1", "UserPromptSubmit", r.claude))
}

// wantReply asserts rec is a 200 whose body names title; wantNoReply that it is a 200
// with an empty body.
func wantReply(t *testing.T, rec *httptest.ResponseRecorder, title string) {
	t.Helper()
	require.Equal(t, 200, rec.Code)
	got, ok := claudecodetest.PromptReplyTitle(rec.Body.Bytes())
	require.True(t, ok, "body %q", rec.Body.String())
	assert.Equal(t, title, got)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
}

func wantNoReply(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	assert.Equal(t, 200, rec.Code)
	assert.Empty(t, rec.Body.String())
}

// TestIngestRename_OnlyARoutedPromptSubmitCarriesTheReply covers edge cases 5, 6
// and 9: every post that is not a routed UserPromptSubmit gets 200 with an empty body even
// while a rename is waiting to be sent — and does not spend it: the routed prompt that
// follows still carries the rename.
func TestIngestRename_OnlyARoutedPromptSubmitCarriesTheReply(t *testing.T) {
	const override = "Renamed In Muster"
	const claude = "rename-claude-rig"
	enveloped := func(event, pane string, idOffset int) func(r *renameRig) *httptest.ResponseRecorder {
		return func(r *renameRig) *httptest.ResponseRecorder {
			return r.hook(claudecodetest.EnvelopedHookBody(int(r.id)+idOffset, pane, event, claude))
		}
	}
	tests := []struct {
		name string
		post func(r *renameRig) *httptest.ResponseRecorder
	}{
		{"SessionStart", enveloped("SessionStart", "%1", 0)},
		{"PreToolUse", enveloped("PreToolUse", "%1", 0)},
		{"PostToolUse", enveloped("PostToolUse", "%1", 0)},
		{"Stop", enveloped("Stop", "%1", 0)},
		{"StopFailure", enveloped("StopFailure", "%1", 0)},
		{"Notification", enveloped("Notification", "%1", 0)},
		{"PreCompact", enveloped("PreCompact", "%1", 0)},
		{"SessionEnd", enveloped("SessionEnd", "%1", 0)},
		{"status endpoint, enveloped for this session", func(r *renameRig) *httptest.ResponseRecorder {
			return r.status(claudecodetest.EnvelopedStatusLineFull(claude, claudecodetest.StatusLineFullOpts{
				MusterSession: int(r.id), TmuxPane: "%1", SessionName: renameClaudeName,
			}))
		}},
		{"status endpoint, even carrying a UserPromptSubmit-shaped body", func(r *renameRig) *httptest.ResponseRecorder {
			return r.status(claudecodetest.EnvelopedHookBody(int(r.id), "%1", "UserPromptSubmit", claude))
		}},
		{"edge 6: envelope naming an unknown muster session", enveloped("UserPromptSubmit", "%1", 1000)},
		{"edge 6: envelope whose pane does not match the recorded pane", enveloped("UserPromptSubmit", "%9", 0)},
		{"edge 6: envelope carrying no pane", enveloped("UserPromptSubmit", "", 0)},
		{"raw prompt for a claude id bound to no session", func(r *renameRig) *httptest.ResponseRecorder {
			return r.hook(claudecodetest.RawHookBody("UserPromptSubmit", "never-bound-claude-id"))
		}},
		{"malformed body", func(r *renameRig) *httptest.ResponseRecorder {
			return r.hook(`{"musterSession":`)
		}},
		{"empty object", func(r *renameRig) *httptest.ResponseRecorder {
			return r.hook(`{}`)
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRenameRig(t)
			r.setTitle(strPtr(override))

			wantNoReply(t, tt.post(r))

			wantReply(t, r.prompt(), override)
		})
	}
}

// TestIngestRename_NothingToSendAnswersEmpty covers the remaining rows and edge cases
// 3 and 4: a session with no override, a cleared override, and an override that already
// equals Claude Code's last-known name (before or after the rename) never get a reply.
func TestIngestRename_NothingToSendAnswersEmpty(t *testing.T) {
	tests := []struct {
		name  string
		setup func(r *renameRig)
	}{
		{"no override", func(*renameRig) {}},
		{"edge 3: override cleared", func(r *renameRig) {
			r.setTitle(strPtr("Mine"))
			r.setTitle(nil)
		}},
		{"edge 4: override equals Claude's name when set", func(r *renameRig) {
			r.setTitle(strPtr(renameClaudeName))
		}},
		{"edge 4: Claude reports the override after it was set", func(r *renameRig) {
			r.setTitle(strPtr("Mine"))
			_, err := r.srv.manager.ApplyStatus(context.Background(), r.id, claudecode.StatusUpdate{Title: strPtr("Mine")})
			require.NoError(r.t, err)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRenameRig(t)
			tt.setup(r)

			wantNoReply(t, r.prompt())
			wantNoReply(t, r.prompt())
		})
	}
}

// TestIngestRename_EachRenameSendsOnce: a value is sent
// once and then never again however many prompts follow, only a rename to a different value
// arms a new send (A, B, A sends all three), and a suffixed name Claude Code reports back
// does not make the same name go out again.
func TestIngestRename_EachRenameSendsOnce(t *testing.T) {
	t.Run("edge 2: A then B then A sends each once", func(t *testing.T) {
		r := newRenameRig(t)

		for _, name := range []string{"A", "B", "A"} {
			r.setTitle(strPtr(name))
			wantReply(t, r.prompt(), name)
			wantNoReply(t, r.prompt())
			wantNoReply(t, r.prompt())
		}
	})

	t.Run("a rename before any prompt sends only the latest", func(t *testing.T) {
		r := newRenameRig(t)
		r.setTitle(strPtr("A"))
		r.setTitle(strPtr("B"))

		wantReply(t, r.prompt(), "B")
		wantNoReply(t, r.prompt())
	})

	t.Run("REQ-2: a suffixed name reported back does not re-send, and the override clears", func(t *testing.T) {
		r := newRenameRig(t)
		r.setTitle(strPtr("Mine"))
		wantReply(t, r.prompt(), "Mine")

		_, err := r.srv.manager.ApplyStatus(context.Background(), r.id, claudecode.StatusUpdate{Title: strPtr("Mine-calm-brook")})
		require.NoError(t, err)

		wantNoReply(t, r.prompt())
		got, ok := r.srv.manager.Get(r.id)
		require.True(t, ok)
		assert.Nil(t, got.TitleOverride)
	})

	t.Run("edge 9: /clear's new claude id in the same pane still routes by envelope, one send", func(t *testing.T) {
		r := newRenameRig(t)
		r.setTitle(strPtr("Mine"))

		wantReply(t, r.hook(claudecodetest.EnvelopedHookBody(int(r.id), "%1", "UserPromptSubmit", "a-brand-new-claude-id")), "Mine")
		wantNoReply(t, r.hook(claudecodetest.EnvelopedHookBody(int(r.id), "%1", "UserPromptSubmit", "another-claude-id")))
	})

	t.Run("two sessions: a send to one does not spend the other's", func(t *testing.T) {
		r := newRenameRig(t)
		other := r.secondSession("Other Mine")
		r.setTitle(strPtr("Mine"))

		wantReply(t, r.prompt(), "Mine")
		wantNoReply(t, r.prompt())
		otherPrompt := r.hook(claudecodetest.EnvelopedHookBody(int(other), "%2", "UserPromptSubmit", "rename-claude-other"))
		wantReply(t, otherPrompt, "Other Mine")
	})
}

// secondSession launches another live session (pane "%2") with the given override and
// returns its id.
func (r *renameRig) secondSession(override string) int64 {
	r.t.Helper()
	ctx := context.Background()
	repo, _, err := r.srv.store.UpsertRepo(ctx, store.UpsertRepoParams{
		Path: "/tmp/routing-test-2", Name: "routing-test-2", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(r.t, err)
	other, err := r.srv.manager.CreateSession(ctx, session.CreateParams{
		RepoID: repo.ID, Directory: "/tmp/routing-test-2", PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(r.t, err)
	_, err = r.srv.manager.RecordLaunch(ctx, other.ID, "muster:@2", "%2")
	require.NoError(r.t, err)
	_, err = r.srv.manager.SetTitle(ctx, other.ID, strPtr(override))
	require.NoError(r.t, err)
	return other.ID
}

// TestIngestRename_StatusPostsThroughTheWireFollowDelivery covers edge cases 1 and 14
// over HTTP: after the send, a status post carrying a suffixed name clears the
// override and the dashboard follows Claude's name, a reordered post still carrying the
// pre-delivery name leaves it, and before the send no reported name touches it.
func TestIngestRename_StatusPostsThroughTheWireFollowDelivery(t *testing.T) {
	statusBody := func(r *renameRig, name string, usedPct float64) string {
		return claudecodetest.EnvelopedStatusLineFull(r.claude, claudecodetest.StatusLineFullOpts{
			MusterSession: int(r.id), TmuxPane: "%1", SessionName: name, UsedPct: &usedPct,
		})
	}
	// contextUsed reads the gauge the same status post carried, which shows the worker has
	// applied that post's name too (one ApplyStatus per post).
	contextUsed := func(r *renameRig) float64 {
		sess, ok := r.srv.manager.Get(r.id)
		require.True(r.t, ok)
		if sess.Context == nil {
			return -1
		}
		return sess.Context.UsedPct
	}

	t.Run("edge 14: a straggling pre-delivery name keeps the override", func(t *testing.T) {
		r := newRenameRig(t)
		r.setTitle(strPtr("Mine"))
		wantReply(t, r.prompt(), "Mine")

		wantNoReply(t, r.status(statusBody(r, renameClaudeName, 77)))
		require.Eventually(t, func() bool { return contextUsed(r) == 77 }, 5*time.Second, 10*time.Millisecond)

		got, ok := r.srv.manager.Get(r.id)
		require.True(t, ok)
		require.NotNil(t, got.TitleOverride)
		assert.Equal(t, "Mine", *got.TitleOverride)
		wantNoReply(t, r.prompt())
	})

	t.Run("edge 1: a suffixed name clears the override and the dashboard follows it", func(t *testing.T) {
		r := newRenameRig(t)
		r.setTitle(strPtr("Mine"))
		wantReply(t, r.prompt(), "Mine")

		wantNoReply(t, r.status(statusBody(r, "Mine-calm-brook", 55)))

		require.Eventually(t, func() bool {
			got, ok := r.srv.manager.Get(r.id)
			return ok && got.TitleOverride == nil
		}, 5*time.Second, 10*time.Millisecond)
		got, _ := r.srv.manager.Get(r.id)
		require.NotNil(t, got.DisplayTitle())
		assert.Equal(t, "Mine-calm-brook", *got.DisplayTitle())
		wantNoReply(t, r.prompt())
	})

	t.Run("REQ-8: before the send a different reported name never touches the override", func(t *testing.T) {
		r := newRenameRig(t)
		r.setTitle(strPtr("Mine"))

		wantNoReply(t, r.status(statusBody(r, "Typed In Claude", 33)))
		require.Eventually(t, func() bool { return contextUsed(r) == 33 }, 5*time.Second, 10*time.Millisecond)

		got, ok := r.srv.manager.Get(r.id)
		require.True(t, ok)
		require.NotNil(t, got.TitleOverride)
		assert.Equal(t, "Mine", *got.TitleOverride)
		wantReply(t, r.prompt(), "Mine")
	})
}
