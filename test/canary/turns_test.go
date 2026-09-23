//go:build canary

package canary

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Views over runs G–J (harness_turns_test.go).

// TestInterruptEmitsNoTurnEnd guards kb:fact/interrupt-emits-no-turn-end: Esc during a running
// tool ends the turn with no hook at all, and no idle_prompt follows. This is why an
// interrupted card stays working. The window runs from the Escape to interruptQuietWindow
// after it, longer than a completed turn waits for its idle_prompt.
func TestInterruptEmitsNoTurnEnd(t *testing.T) {
	f := harness(t)
	require.NoError(t, f.interrupt.err, "run G did not reach the interrupt")
	pre := f.bashPreToolUse()
	require.NotNilf(t, pre, "no PreToolUse{Bash} on run G; got %v", f.hookTypes(sessionInterrupt))
	require.True(t, f.interrupt.paneInterrupted,
		"the pane never showed \"Interrupted\" after Escape, so the absence below would prove nothing")

	seen := f.hooksBetween(sessionInterrupt, f.interrupt.claudeSessionID, f.interrupt.interruptAt, f.interrupt.quietUntil)
	window := f.interrupt.quietUntil.Sub(f.interrupt.interruptAt).Round(time.Second)
	for _, banned := range []string{"Stop", "StopFailure", "PostToolUse", "PostToolUseFailure", "Notification{idle_prompt}"} {
		assert.NotContainsf(t, seen, banned, "an interrupt now emits %s; the %s window after Escape saw %v", banned, window, seen)
	}
	t.Logf("hooks in the %s after Escape: %v", window, seen)
}

// TestPostToolUseNotAwaited guards the PostToolUse half of kb:fact/hook-await-per-event:
// Claude Code does not wait for a PostToolUse hook before the next tool's PreToolUse. Run H's
// capture server holds every PostToolUse reply for postToolUseHold, so an awaited hook would
// push the next PreToolUse at least that far out; one under postToolUseAwaitedBelow did not
// wait. Only tool calls from one assistant message
// are compared, because PostToolBatch legitimately waits between messages.
func TestPostToolUseNotAwaited(t *testing.T) {
	f := harness(t)
	require.NoError(t, f.toolBatch.err)
	uses, _ := parseToolStream(f.toolBatch.stdout)
	batch := largestBatch(uses)
	require.GreaterOrEqualf(t, len(batch), 2,
		"the model did not batch its Reads (%d tool calls, largest message held %d): prompt drift, not a Claude Code change",
		len(uses), len(batch))

	var order []capture
	for _, c := range f.hookEvents(sessionToolBatch) {
		id, _ := c.payload["tool_use_id"].(string)
		if (c.ev.Type == "PreToolUse" || c.ev.Type == "PostToolUse") && batch[id] {
			order = append(order, c)
		}
	}
	var gaps []time.Duration
	for i, c := range order {
		if c.ev.Type != "PostToolUse" {
			continue
		}
		for _, next := range order[i+1:] {
			if next.ev.Type == "PreToolUse" {
				gaps = append(gaps, next.at.Sub(c.at))
				break
			}
		}
	}
	require.NotEmptyf(t, gaps, "no PreToolUse arrived after any PostToolUse in the %d-call batch; arrival order %v",
		len(batch), eventTypes(order))
	assert.Lessf(t, slices.Min(gaps), postToolUseAwaitedBelow,
		"every PreToolUse waited for the previous PostToolUse hook (held %s); gaps %v", postToolUseHold, gaps)
	t.Logf("%d-call batch, PostToolUse→next PreToolUse gaps with each PostToolUse held %s: %v", len(batch), postToolUseHold, gaps)
}

// TestFailedToolEmitsNoPostToolUse guards the half of kb:fact/tool-failure-hook-events that the
// production settings can see: a tool that fails emits no PostToolUse. What it emits instead,
// PostToolUseFailure, is an event Muster does not register, so it stays a probe question.
func TestFailedToolEmitsNoPostToolUse(t *testing.T) {
	f := harness(t)
	require.NoError(t, f.toolBatch.err)
	uses, isError := parseToolStream(f.toolBatch.stdout)
	var id string
	for _, u := range uses {
		if strings.HasSuffix(u.path, "/"+batchMissingFile) {
			id = u.id
		}
	}
	require.NotEmptyf(t, id, "run H never called Read on %s (%d tool calls)", batchMissingFile, len(uses))
	require.Truef(t, isError[id], "the Read of %s did not fail, so this proves nothing", batchMissingFile)

	byID := func(event string) *capture {
		return f.firstHookWhere(sessionToolBatch, event, func(p map[string]any) bool { return p["tool_use_id"] == id })
	}
	assert.NotNil(t, byID("PreToolUse"), "the failed Read's PreToolUse never arrived")
	assert.Nil(t, byID("PostToolUse"), "a failed tool now emits PostToolUse")
}

// TestStopFailureErrorByStatus guards kb:fact/stopfailure-error-by-status: the StopFailure.error
// token Claude Code maps each API failure to. Muster shows that token verbatim, and 529 still
// reports server_error, so no failure ever reads "overloaded".
func TestStopFailureErrorByStatus(t *testing.T) {
	f := harness(t)
	for i, row := range stopFailureRows {
		session := stopFailureSession(i)
		t.Run(fmt.Sprintf("%d %s", row.failure.Status, row.want), func(t *testing.T) {
			got := f.hookTypes(session)
			c := f.firstHook(session, "StopFailure")
			require.NotNilf(t, c, "no StopFailure; got %v", got)
			assert.Equal(t, row.want, c.payload["error"])
			assert.NotContains(t, got, "Stop", "StopFailure must replace Stop")
			msg, _ := c.payload["last_assistant_message"].(string)
			assert.NotEmpty(t, msg, "StopFailure.last_assistant_message must carry the user-facing sentence")
			// SessionEnd delivery on a failure exit is best-effort (kb:fact/hooks-not-awaited-on-failure-exit).
			if !contains(got, "SessionEnd") {
				t.Logf("SessionEnd not delivered; got %v", got)
			}
		})
	}
}

// TestStatusLineAroundFailedTurns guards kb:fact/status-line-around-failed-turns on run J, where
// every API call fails: no post ever carries usage, rate_limits still arrive from the error
// response's headers, and the failed turn changes no usage field. The harness's 5 s
// refreshInterval ticks run through this session too, so a post arriving soon after the
// failure is not by itself the event-driven one: only its content is asserted, and the gap
// is logged.
func TestStatusLineAroundFailedTurns(t *testing.T) {
	f := harness(t)
	require.NoError(t, f.failedTurn.err, "run J did not complete")
	id := f.failedTurn.claudeSessionID
	posts := f.statusPostsFor(sessionFailedTurn, id)
	require.NotEmpty(t, posts)

	failure := f.firstHook(sessionFailedTurn, "StopFailure")
	require.NotNil(t, failure)
	assert.Equal(t, "rate_limit", failure.payload["error"], "an interactive 429 must still reach StopFailure")

	t.Run("no post carries usage", func(t *testing.T) {
		for i, c := range posts {
			cw, _ := c.payload["context_window"].(map[string]any)
			require.NotNilf(t, cw, "post %d has no context_window", i)
			assert.Nilf(t, cw["used_percentage"], "post %d: used_percentage must be null in a session with no completed turn", i)
			assert.EqualValuesf(t, 0, cw["total_input_tokens"], "post %d: total_input_tokens", i)
			cost, _ := c.payload["cost"].(map[string]any)
			assert.EqualValuesf(t, 0, cost["total_cost_usd"], "post %d: total_cost_usd", i)
		}
	})

	t.Run("rate_limits come from the error response's headers", func(t *testing.T) {
		idx := -1
		for i, c := range posts {
			if _, ok := c.payload["rate_limits"]; ok {
				idx = i
				break
			}
		}
		require.NotEqualf(t, -1, idx, "no post carried rate_limits (%d posts)", len(posts))
		rl, _ := posts[idx].payload["rate_limits"].(map[string]any)
		for _, b := range []struct {
			bucket string
			util   float64
			resets int64
		}{
			{"five_hour", failedTurnFiveHourUtil, f.failedTurn.fiveHourResets},
			{"seven_day", failedTurnSevenDayUtil, f.failedTurn.sevenDayResets},
		} {
			bucket, _ := rl[b.bucket].(map[string]any)
			require.NotNilf(t, bucket, "rate_limits.%s missing; buckets %v", b.bucket, keys(rl))
			pct, _ := bucket["used_percentage"].(float64)
			assert.InDeltaf(t, b.util*100, pct, 1, "rate_limits.%s.used_percentage", b.bucket)
			assert.EqualValuesf(t, b.resets, bucket["resets_at"], "rate_limits.%s.resets_at", b.bucket)
		}
		t.Logf("first rate_limits on post %d of %d (before the prompt: %t)", idx, len(posts), posts[idx].at.Before(f.failedTurn.promptAt))
	})

	t.Run("the failed turn changes no usage field", func(t *testing.T) {
		before := f.statusPostBefore(sessionFailedTurn, id, f.failedTurn.promptAt)
		after := f.statusPostAfter(sessionFailedTurn, id, failure.at)
		require.NotNil(t, before, "no status post before the prompt")
		require.NotNil(t, after, "no status post after the StopFailure")
		assert.Equal(t, before.payload["context_window"], after.payload["context_window"])
		t.Logf("first post %.2fs after StopFailure", after.at.Sub(failure.at).Seconds())
	})
}

// ---------------------------------------------------------------------------------------

// streamToolUse is one tool_use block from `claude -p --output-format stream-json`.
type streamToolUse struct {
	id, messageID, path string
}

// parseToolStream reads the tool_use blocks, and which tool_use ids came back as errors, from
// stream-json output. Lines that are not JSON (stderr shares the stream) are skipped.
func parseToolStream(out string) ([]streamToolUse, map[string]bool) {
	var uses []streamToolUse
	isError := map[string]bool{}
	for _, line := range strings.Split(out, "\n") {
		var ev struct {
			Type    string `json:"type"`
			Message struct {
				ID      string `json:"id"`
				Content []struct {
					Type      string `json:"type"`
					ID        string `json:"id"`
					ToolUseID string `json:"tool_use_id"`
					IsError   bool   `json:"is_error"`
					Input     struct {
						FilePath string `json:"file_path"`
					} `json:"input"`
				} `json:"content"`
			} `json:"message"`
		}
		if json.Unmarshal([]byte(strings.TrimSpace(line)), &ev) != nil {
			continue
		}
		for _, b := range ev.Message.Content {
			switch {
			case ev.Type == "assistant" && b.Type == "tool_use":
				uses = append(uses, streamToolUse{id: b.ID, messageID: ev.Message.ID, path: b.Input.FilePath})
			case ev.Type == "user" && b.Type == "tool_result" && b.IsError:
				isError[b.ToolUseID] = true
			}
		}
	}
	return uses, isError
}

// largestBatch is the set of tool_use ids of the assistant message that made the most calls.
func largestBatch(uses []streamToolUse) map[string]bool {
	byMsg := map[string]map[string]bool{}
	best := map[string]bool{}
	for _, u := range uses {
		if byMsg[u.messageID] == nil {
			byMsg[u.messageID] = map[string]bool{}
		}
		byMsg[u.messageID][u.id] = true
		if len(byMsg[u.messageID]) > len(best) {
			best = byMsg[u.messageID]
		}
	}
	return best
}
