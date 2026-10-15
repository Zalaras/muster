//go:build canary

package canary

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/test/rig/failapi"
)

// Runs O and P: the turn shapes that leave a prompt open with no hook to close it. O spends
// two haiku turns (a "say hi" and the compaction's summary); P points ANTHROPIC_BASE_URL at an
// in-test fail server that holds every reply, so it spends nothing
// (kb:adr/canary-api-failures-induced-in-process). Like runs G–J, a run that ran but did not
// get what it waited for records that and returns nil, failing only the tests that read it.

const (
	// orphanIdleWait outlasts the ~60 s idle_prompt delay (kb:fact/notification-types-observed).
	orphanIdleWait = 75 * time.Second

	// earlyInterruptHold is how long run P's fail server holds each reply: far longer than the
	// Esc takes to land, so the turn has produced no output when it does.
	earlyInterruptHold  = 30 * time.Second
	earlyInterruptAfter = 2 * time.Second
	// earlyInterruptQuiet outlasts the idle_prompt delay, as run G's window does.
	earlyInterruptQuiet = 70 * time.Second
)

// compactRun is what run O observed; TestCompactHookSequence and
// TestLocalCommandOrphanIdlePrompt read it.
type compactRun struct {
	claudeSessionID string
	stopAt          time.Time // when the first turn's Stop arrived
	contextAt       time.Time // when /context was submitted
	contextIdle     *capture  // the idle_prompt that followed /context
	compactAt       time.Time // when /compact was submitted
	compactPromptID string    // PreCompact's prompt_id
	compactIdle     *capture  // the idle_prompt carrying compactPromptID
	err             error
}

// earlyInterruptRun is what run P observed; TestInterruptBeforeOutputLeavesNoTrace reads it.
type earlyInterruptRun struct {
	claudeSessionID string
	promptID        string // the interrupted turn's UserPromptSubmit prompt_id
	transcriptPath  string // from the same UserPromptSubmit
	interruptAt     time.Time
	quietUntil      time.Time
	promptRestored  bool // the pane's input box held the prompt again after Escape
	err             error
}

// runO takes one real turn so there is something to compact, runs the local /context command
// and waits for the idle_prompt that follows it, then runs /compact and waits for the
// SessionStart it ends with and the idle_prompt after that. The status posts it captures through
// that idle stretch carry the turn's keep-alive (TestPromptCacheKeepAliveMovesExpiry).
func (f *fixture) runO(ctx context.Context) error {
	argv := claudecode.BuildArgv(claudeBin, claudecode.LaunchParams{Model: haikuModel, PermissionMode: "default"})
	target, started, _, err := f.startInteractive(ctx, compactTmuxID, sessionCompact, argv, nil)
	if err != nil {
		return err
	}
	defer func() { _ = f.killPane(ctx, compactTmuxID) }()
	if started == nil {
		f.compact.err = fmt.Errorf("no SessionStart within 90s (run O)")
		return nil
	}
	id := started.ev.SessionID
	f.compact.claudeSessionID = id

	if err := f.submit(ctx, target, interactivePrompt); err != nil {
		return err
	}
	if !f.waitFor(90*time.Second, func() bool { return f.firstHook(sessionCompact, "Stop") != nil }) {
		f.compact.err = fmt.Errorf("no Stop within 90s of the prompt; hooks seen: %v", f.hookTypes(sessionCompact))
		return nil
	}
	f.compact.stopAt = f.firstHook(sessionCompact, "Stop").at
	f.settle(2 * time.Second)

	f.compact.contextAt = time.Now()
	if err := f.submit(ctx, target, "/context"); err != nil {
		return err
	}
	if !f.waitFor(orphanIdleWait, func() bool { return f.idlePromptAfter(sessionCompact, f.compact.contextAt) != nil }) {
		f.compact.err = fmt.Errorf("no idle_prompt within %s of /context; hooks seen: %v", orphanIdleWait, f.hookTypes(sessionCompact))
		return nil
	}
	f.compact.contextIdle = f.idlePromptAfter(sessionCompact, f.compact.contextAt)
	// /context leaves its report on screen; Escape dismisses it before the next command.
	if err := f.sendKeys(ctx, target, "Escape"); err != nil {
		return err
	}
	time.Sleep(time.Second)

	f.compact.compactAt = time.Now()
	if err := f.submit(ctx, target, "/compact"); err != nil {
		return err
	}
	if !f.waitFor(120*time.Second, func() bool { return f.compactSessionStart() != nil }) {
		f.compact.err = fmt.Errorf("no SessionStart{source:\"compact\"} within 120s of /compact; hooks seen: %v", f.hookTypes(sessionCompact))
		return nil
	}
	if pre := f.hookAfter(sessionCompact, "PreCompact", f.compact.compactAt); pre != nil && pre.ev.PromptID != nil {
		f.compact.compactPromptID = *pre.ev.PromptID
	}
	if f.compact.compactPromptID == "" {
		f.compact.err = fmt.Errorf("no PreCompact with a prompt_id after /compact; hooks seen: %v", f.hookTypes(sessionCompact))
		return nil
	}
	_ = f.waitFor(orphanIdleWait, func() bool {
		return f.idlePromptFor(sessionCompact, f.compact.compactPromptID) != nil
	})
	f.compact.compactIdle = f.idlePromptFor(sessionCompact, f.compact.compactPromptID)
	return nil
}

// runP submits one prompt to an interactive session whose API holds every reply, presses Esc
// while the request is still in flight, and watches a quiet window.
func (f *fixture) runP(ctx context.Context) error {
	srv := httptest.NewServer(failapi.Handler(failapi.Failure{
		Status: http.StatusInternalServerError, Type: "api_error", Message: "canary-induced failure",
		Hold: earlyInterruptHold,
	}))
	defer srv.Close()

	argv := claudecode.BuildArgv(claudeBin, claudecode.LaunchParams{Model: haikuModel, PermissionMode: "default"})
	target, started, _, err := f.startInteractive(ctx, earlyInterruptTmuxID, sessionEarlyInterrupt, argv, failEnv(srv))
	if err != nil {
		return err
	}
	defer func() { _ = f.killPane(ctx, earlyInterruptTmuxID) }()
	if started == nil {
		f.earlyInterrupt.err = fmt.Errorf("no SessionStart within 90s (run P)")
		return nil
	}
	f.earlyInterrupt.claudeSessionID = started.ev.SessionID

	if err := f.submit(ctx, target, interactivePrompt); err != nil {
		return err
	}
	if !f.waitFor(30*time.Second, func() bool { return f.firstHook(sessionEarlyInterrupt, "UserPromptSubmit") != nil }) {
		f.earlyInterrupt.err = fmt.Errorf("no UserPromptSubmit within 30s; hooks seen: %v", f.hookTypes(sessionEarlyInterrupt))
		return nil
	}
	submit := f.firstHook(sessionEarlyInterrupt, "UserPromptSubmit")
	if submit.ev.PromptID != nil {
		f.earlyInterrupt.promptID = *submit.ev.PromptID
	}
	f.earlyInterrupt.transcriptPath, _ = submit.payload["transcript_path"].(string)

	time.Sleep(earlyInterruptAfter)
	f.earlyInterrupt.interruptAt = time.Now()
	if err := f.sendKeys(ctx, target, "Escape"); err != nil {
		return err
	}
	// capture-pane is the oracle that the keypress landed, never a state source. An Esc before
	// any output prints no "Interrupted"; it rewinds the turn and puts the prompt back in the
	// input box, which is the last prompt-marker line on screen.
	f.earlyInterrupt.promptRestored = f.waitFor(15*time.Second, func() bool {
		pane, _ := f.tmuxClient.CapturePane(ctx, target)
		return lastInputLine(pane) == interactivePrompt
	})
	time.Sleep(time.Until(f.earlyInterrupt.interruptAt.Add(earlyInterruptQuiet)))
	f.earlyInterrupt.quietUntil = time.Now()
	return nil
}

// lastInputLine is the text after the prompt marker on the last line that starts with it — the
// input box, once the turn above it is gone.
func lastInputLine(pane string) string {
	last := ""
	for _, line := range strings.Split(pane, "\n") {
		if rest, ok := strings.CutPrefix(strings.TrimSpace(line), "❯"); ok {
			last = strings.TrimSpace(rest)
		}
	}
	return last
}

// idlePromptAfter is the first idle_prompt Notification on session that arrived at or after t.
func (f *fixture) idlePromptAfter(session int64, t time.Time) *capture {
	for _, c := range f.hookEvents(session) {
		if c.ev.Type == "Notification" && !c.at.Before(t) {
			if nt, _ := c.payload["notification_type"].(string); nt == "idle_prompt" {
				c := c
				return &c
			}
		}
	}
	return nil
}

// idlePromptFor is the first idle_prompt Notification on session carrying promptID.
func (f *fixture) idlePromptFor(session int64, promptID string) *capture {
	for _, c := range f.hookEvents(session) {
		if c.ev.Type == "Notification" && c.ev.PromptID != nil && *c.ev.PromptID == promptID {
			if nt, _ := c.payload["notification_type"].(string); nt == "idle_prompt" {
				c := c
				return &c
			}
		}
	}
	return nil
}

// hookAfter is the first hook of the named event on session that arrived at or after t.
func (f *fixture) hookAfter(session int64, event string, t time.Time) *capture {
	for _, c := range f.hookEvents(session) {
		if c.ev.Type == event && !c.at.Before(t) {
			c := c
			return &c
		}
	}
	return nil
}

// compactSessionStart is the SessionStart /compact ends with in run O's pane.
func (f *fixture) compactSessionStart() *capture {
	return f.firstHookWhere(sessionCompact, "SessionStart", func(p map[string]any) bool {
		src, _ := p["source"].(string)
		return src == "compact"
	})
}

// hooksWithPrompt lists the hook events on session carrying promptID, a Notification labelled
// with its type as hooksBetween does.
func (f *fixture) hooksWithPrompt(session int64, promptID string) []string {
	var out []string
	for _, c := range f.hookEvents(session) {
		if c.ev.PromptID == nil || *c.ev.PromptID != promptID {
			continue
		}
		label := c.ev.Type
		if nt, ok := c.payload["notification_type"].(string); ok && c.ev.Type == "Notification" {
			label += "{" + nt + "}"
		}
		out = append(out, label)
	}
	return out
}
