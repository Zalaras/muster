//go:build canary

package canary

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/test/rig/failapi"
)

// Runs G–J: how a turn ends when it does not end normally, and when Claude Code waits on a
// hook. G and H spend one haiku turn each; I and J point ANTHROPIC_BASE_URL at an in-test
// fail server and spend nothing (kb:adr/canary-api-failures-induced-in-process). As in runs
// A–F, a claude or tmux that will not run at all fails the build. A run that ran but did not
// get what it waited for records that and returns nil, so it fails only the tests that read
// it: G, H and J in their own structs, I as a row with no StopFailure.

const (
	// interruptToolSeconds is how long run G's Bash call sleeps; interruptAfter, when the Esc
	// goes, must stay well inside it.
	interruptToolSeconds = 30
	interruptAfter       = 3 * time.Second
	// interruptQuietWindow outlasts the ~60 s idle_prompt delay a completed turn gets
	// (kb:fact/interrupt-emits-no-turn-end measured the control at 60.08 s).
	interruptQuietWindow = 70 * time.Second

	// postToolUseHold is how long the capture server holds its reply to each of run H's
	// PostToolUse posts. It sits under the wrapper's `curl --max-time 2`, so the hook lasts
	// about this long; an awaited hook would hold the next PreToolUse at least that far out.
	// postToolUseAwaitedBelow is the gap under which the next PreToolUse did not wait for it.
	// On 2.1.280 the gaps were 0.50–0.53 s with a 1 s hold and 0.22–0.25 s with this one: the
	// next call starts when it is ready, not a fixed time after the hook.
	postToolUseHold         = 1500 * time.Millisecond
	postToolUseAwaitedBelow = 1 * time.Second

	// Run J's injected rate-limit windows, as the unified headers carry them: utilization is
	// a fraction, the status line reports it as a percentage.
	failedTurnFiveHourUtil = 0.17
	failedTurnSevenDayUtil = 0.42
)

var (
	// interruptPrompt runs a Bash call long enough to interrupt. A bare `sleep` is blocked by
	// the Bash tool before it runs (kb:fact/tool-failure-hook-events), so it is wrapped.
	interruptPrompt = fmt.Sprintf("Run exactly this shell command and nothing else: echo start && sleep %d && echo end", interruptToolSeconds)

	// batchReadFiles are the files run H's Read batch targets; batchMissingFile is never
	// created, so its Read fails.
	batchReadFiles   = []string{"a.txt", "b.txt", "c.txt"}
	batchMissingFile = "missing.txt"
)

// interruptRun is what run G observed; TestInterruptEmitsNoTurnEnd reads it.
type interruptRun struct {
	claudeSessionID string
	interruptAt     time.Time // when Escape was sent
	quietUntil      time.Time // end of the window TestInterruptEmitsNoTurnEnd judges
	paneInterrupted bool      // the pane showed "Interrupted" after Escape
	err             error
}

// toolBatchRun is run H's stdout; TestPostToolUseNotAwaited and
// TestFailedToolEmitsNoPostToolUse read it beside the run's hooks.
type toolBatchRun struct {
	stdout string // stream-json output: the batch's tool_use ids and results
	err    error
}

// failedTurnRun is what run J injected and observed; TestStatusLineAroundFailedTurns reads it.
type failedTurnRun struct {
	claudeSessionID string
	promptAt        time.Time
	fiveHourResets  int64 // injected -5h-reset
	sevenDayResets  int64 // injected -7d-reset
	err             error
}

// stopFailureRows is run I: each injected failure and the StopFailure.error Claude Code maps
// it to (kb:fact/stopfailure-error-by-status). The messages are the substrings the installed
// bundle keys on. Row i runs as $MUSTER_SESSION stopFailureSession(i).
var stopFailureRows = []struct {
	failure failapi.Failure
	want    string
}{
	{failapi.Failure{Status: 429, Type: "rate_limit_error", Message: "canary-induced failure"}, "rate_limit"},
	{failapi.Failure{Status: 500, Type: "api_error", Message: "canary-induced failure"}, "server_error"},
	{failapi.Failure{Status: 529, Type: "overloaded_error", Message: "Overloaded"}, "server_error"},
	{failapi.Failure{Status: 404, Type: "not_found_error", Message: "canary-induced failure"}, "model_not_found"},
	{failapi.Failure{Status: 401, Type: "authentication_error", Message: "canary-induced failure"}, "authentication_failed"},
	{failapi.Failure{Status: 400, Type: "invalid_request_error", Message: "Your credit balance is too low to access the Anthropic API."}, "billing_error"},
	{failapi.Failure{Status: 400, Type: "invalid_request_error", Message: "prompt is too long: 250000 tokens > 200000 maximum"}, "invalid_request"},
	{failapi.Failure{Status: 400, Type: "invalid_request_error", Message: "canary-induced failure"}, "unknown"},
}

func stopFailureSession(row int) int64 { return sessionStopFailureBase + int64(row) }

// failEnv points a claude run at srv with retries off, so a 429 or 5xx fails at once instead
// of backing off for ~90 s.
func failEnv(srv *httptest.Server) []string {
	return []string{"ANTHROPIC_BASE_URL=" + srv.URL, "CLAUDE_CODE_MAX_RETRIES=0"}
}

// runG interrupts a running Bash call with Esc and then watches a quiet window. Bash is
// pre-allowed on the command line so no permission prompt appears, whatever the developer's
// global allowlist says (kb:adr/canary-interrupt-run-preallows-bash).
func (f *fixture) runG(ctx context.Context) error {
	argv := append(claudecode.BuildArgv("claude", claudecode.LaunchParams{
		Model:          haikuModel,
		PermissionMode: "default",
	}), "--allowedTools", "Bash")
	target, started, _, err := f.startInteractive(ctx, interruptTmuxID, sessionInterrupt, argv, nil)
	if err != nil {
		return err
	}
	defer func() { _ = f.killPane(ctx, interruptTmuxID) }()
	if started == nil {
		f.interrupt.err = fmt.Errorf("no SessionStart within 90s (run G)")
		return nil
	}
	f.interrupt.claudeSessionID = started.ev.SessionID

	if err := f.submit(ctx, target, interruptPrompt); err != nil {
		return err
	}
	if !f.waitFor(90*time.Second, func() bool { return f.bashPreToolUse() != nil }) {
		f.interrupt.err = fmt.Errorf("no PreToolUse{Bash} within 90s; hooks seen: %v", f.hookTypes(sessionInterrupt))
		return nil
	}
	time.Sleep(interruptAfter)
	f.interrupt.interruptAt = time.Now()
	if err := f.sendKeys(ctx, target, "Escape"); err != nil {
		return err
	}
	// capture-pane is the oracle that the keypress landed, never a state source.
	f.interrupt.paneInterrupted = f.waitFor(15*time.Second, func() bool {
		pane, _ := f.tmuxClient.CapturePane(ctx, target)
		return strings.Contains(pane, "Interrupted")
	})
	time.Sleep(time.Until(f.interrupt.interruptAt.Add(interruptQuietWindow)))
	f.interrupt.quietUntil = time.Now()
	return nil
}

// bashPreToolUse is run G's PreToolUse for its Bash call.
func (f *fixture) bashPreToolUse() *capture {
	return f.firstHookWhere(sessionInterrupt, "PreToolUse", func(p map[string]any) bool {
		tn, _ := p["tool_name"].(string)
		return tn == "Bash"
	})
}

// runH asks for one message of parallel Reads, one of them of a file that does not exist.
// stream-json on stdout says which tool calls shared a message; the hooks say when each
// fired. handle holds every PostToolUse reply for postToolUseHold.
func (f *fixture) runH(ctx context.Context) error {
	var paths []string
	for _, name := range batchReadFiles {
		p := filepath.Join(f.repo, name)
		if err := os.WriteFile(p, []byte("muster canary "+name+"\n"), 0o644); err != nil {
			return err
		}
		paths = append(paths, p)
	}
	paths = append(paths, filepath.Join(f.repo, batchMissingFile))
	prompt := fmt.Sprintf("In a single message, call the Read tool %d times in parallel, once for each of these files: %s. "+
		"Do not call any other tool. Then reply with the single word: done", len(paths), strings.Join(paths, ", "))

	out, err := f.headlessRun(ctx, prompt,
		[]string{"--allowedTools", "Read", "--output-format", "stream-json", "--verbose"},
		[]string{fmt.Sprintf("MUSTER_SESSION=%d", sessionToolBatch)})
	f.toolBatch.stdout = out
	if err != nil {
		return err
	}
	if len(f.hookEvents(sessionToolBatch)) == 0 {
		f.toolBatch.err = fmt.Errorf("no hook post reached the capture server")
	}
	return nil
}

// runI runs one zero-token headless turn per stopFailureRows entry, each against its own
// fail server. A row that produced no StopFailure is TestStopFailureErrorByStatus's to report.
func (f *fixture) runI(ctx context.Context) error {
	for i, row := range stopFailureRows {
		srv := httptest.NewServer(failapi.Handler(row.failure))
		env := append([]string{fmt.Sprintf("MUSTER_SESSION=%d", stopFailureSession(i))}, failEnv(srv)...)
		_, err := f.headless(ctx, "", env...)
		srv.Close()
		if err != nil {
			return fmt.Errorf("row %d (%d %s): %w", i, row.failure.Status, row.want, err)
		}
	}
	return nil
}

// runJ launches an interactive session whose every API call fails with a 429 carrying
// rate-limit headers, waits for its startup status posts, sends one prompt, and waits for the
// StopFailure and the status post after it.
func (f *fixture) runJ(ctx context.Context) error {
	now := time.Now().Unix()
	f.failedTurn.fiveHourResets = now + 3600
	f.failedTurn.sevenDayResets = now + 5*86400
	srv := httptest.NewServer(failapi.Handler(failapi.Failure{
		Status:  http.StatusTooManyRequests,
		Type:    "rate_limit_error",
		Message: "canary-induced failure",
		// status "allowed", never "rejected": a rejected 429 arms the TUI's auto-resume.
		Headers: [][2]string{
			{"anthropic-ratelimit-unified-status", "allowed"},
			{"anthropic-ratelimit-unified-5h-utilization", fmt.Sprint(failedTurnFiveHourUtil)},
			{"anthropic-ratelimit-unified-5h-reset", fmt.Sprint(f.failedTurn.fiveHourResets)},
			{"anthropic-ratelimit-unified-7d-utilization", fmt.Sprint(failedTurnSevenDayUtil)},
			{"anthropic-ratelimit-unified-7d-reset", fmt.Sprint(f.failedTurn.sevenDayResets)},
		},
	}))
	defer srv.Close()

	argv := claudecode.BuildArgv("claude", claudecode.LaunchParams{Model: haikuModel, PermissionMode: "default"})
	target, started, _, err := f.startInteractive(ctx, failedTurnTmuxID, sessionFailedTurn, argv, failEnv(srv))
	if err != nil {
		return err
	}
	defer func() { _ = f.killPane(ctx, failedTurnTmuxID) }()
	if started == nil {
		f.failedTurn.err = fmt.Errorf("no SessionStart within 90s (run J)")
		return nil
	}
	id := started.ev.SessionID
	f.failedTurn.claudeSessionID = id

	if !f.waitFor(30*time.Second, func() bool { return len(f.statusPostsFor(sessionFailedTurn, id)) > 0 }) {
		f.failedTurn.err = fmt.Errorf("no startup status-line post within 30s")
		return nil
	}
	f.failedTurn.promptAt = time.Now()
	if err := f.submit(ctx, target, interactivePrompt); err != nil {
		return err
	}
	if !f.waitFor(60*time.Second, func() bool { return f.firstHook(sessionFailedTurn, "StopFailure") != nil }) {
		f.failedTurn.err = fmt.Errorf("no StopFailure within 60s of the prompt; hooks seen: %v", f.hookTypes(sessionFailedTurn))
		return nil
	}
	failedAt := f.firstHook(sessionFailedTurn, "StopFailure").at
	_ = f.waitFor(10*time.Second, func() bool { return f.statusPostAfter(sessionFailedTurn, id, failedAt) != nil })
	return nil
}
