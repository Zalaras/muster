//go:build canary

package canary

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
)

// Runs K–M: the bypassPermissions launch and the flagless resume. K and L spend nothing; M
// starts a resumed session and submits no prompt, so no turn is billed. As in runs G–J, a
// claude or tmux that will not run at all fails the build, and a run that ran but did not get
// what it waited for records that and returns nil, so it fails only the tests that read it.

const (
	// bypassWarningWait bounds how long run K waits for the warning to draw; bypassSettleWindow
	// is how long it then watches the capture server for a post the unanswered dialog should
	// not produce (kb:fact/bypass-acceptance-blocks-startup left it up ~15 s).
	bypassWarningWait  = 60 * time.Second
	bypassSettleWindow = 9 * time.Second

	// resumeBareSettingsModel is written to the scratch repo's project settings for run M; the
	// transcript's model must win over it (kb:fact/resume-restores-model-and-mode-except-plan).
	resumeBareSettingsModel = "sonnet"

	resumeUnknownNeedle = "No conversation found with session ID"
)

// bypassWarningRun is run K's record.
type bypassWarningRun struct {
	err          error
	sawWarning   bool // the pane drew the Bypass Permissions warning with its "No, exit" row
	reachedStart bool // a hook arrived first, i.e. the warning was never shown
	hooks        []string
	statusPosts  int
}

// resumeUnknownRun is run L's record.
type resumeUnknownRun struct {
	err      error
	id       string
	exitCode int
	output   string
}

// resumeBareRun is run M's record.
type resumeBareRun struct {
	err         error
	claudeID    string   // run D's claude session id, the one resumed
	started     *capture // the SessionStart the relaunch produced
	firstStatus *capture
	sessionName string // first non-empty session_name on the relaunch's status posts
}

// runK launches interactively in bypassPermissions and leaves the warning unanswered. Nothing
// is ever typed at it, so no acceptance reaches the developer's user-level Claude Code state.
func (f *fixture) runK(ctx context.Context) error {
	argv := claudecode.BuildArgv("claude", claudecode.LaunchParams{
		Model:          haikuModel,
		PermissionMode: claudecode.PermissionBypass,
	})
	target, err := f.launchPane(ctx, bypassWarningTmuxID, sessionBypassWarning, argv, nil)
	if err != nil {
		return err
	}
	defer func() { _ = f.killPane(ctx, bypassWarningTmuxID) }()

	run := &f.bypassWarning
	lastAnswer := time.Time{}
	deadline := time.Now().Add(bypassWarningWait)
	for time.Now().Before(deadline) && !run.sawWarning && !run.reachedStart {
		if len(f.hookEvents(sessionBypassWarning)) > 0 {
			run.reachedStart = true
			break
		}
		pane, _ := f.tmuxClient.CapturePane(ctx, target)
		switch {
		case looksLikeBypassWarning(pane):
			run.sawWarning = true
		case looksLikeTrustPrompt(pane) && time.Since(lastAnswer) > 3*time.Second:
			if err := f.answerTrustPrompt(ctx, target, pane); err != nil {
				return err
			}
			lastAnswer = time.Now()
		}
		if !run.sawWarning {
			time.Sleep(500 * time.Millisecond)
		}
	}
	if run.sawWarning {
		time.Sleep(bypassSettleWindow)
	}
	run.hooks = f.hookTypes(sessionBypassWarning)
	run.statusPosts = len(f.statusPosts(sessionBypassWarning))
	return nil
}

// looksLikeBypassWarning matches the interactive bypass acceptance dialog. The prompt box
// footer of an already-accepting machine reads "bypass permissions on", which does not match.
func looksLikeBypassWarning(pane string) bool {
	l := strings.ToLower(pane)
	return strings.Contains(l, "bypass permissions mode") && strings.Contains(l, "no, exit")
}

// runL resumes an id no transcript exists for, headless, and records the exit code.
func (f *fixture) runL(ctx context.Context) error {
	run := &f.resumeUnknown
	id, err := randomUUID()
	if err != nil {
		return err
	}
	run.id = id
	cctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "claude", "-p", "hi", "--model", haikuModel, "--resume", id)
	cmd.Dir = f.repo
	cmd.Env = append(baseEnv(), fmt.Sprintf("MUSTER_SESSION=%d", sessionResumeUnknown))
	out, err := cmd.CombinedOutput()
	run.output = string(out)
	var exitErr *exec.ExitError
	switch {
	case err == nil:
		run.exitCode = 0
	case errors.As(err, &exitErr):
		run.exitCode = exitErr.ExitCode()
	default:
		return err
	}
	f.settle(1500 * time.Millisecond)
	return nil
}

// runM relaunches run D's session with neither --model nor --permission-mode while the
// project settings name a different model, and waits for the first status-line post. No prompt
// is submitted. The settings are put back before the run returns.
func (f *fixture) runM(ctx context.Context) error {
	run := &f.resumeBare
	run.claudeID = f.interactive.claudeSessionID
	if run.claudeID == "" {
		return fmt.Errorf("run D produced no claude session_id to resume")
	}
	settingsPath := filepath.Join(f.repo, ".claude", "settings.local.json")
	withModel, err := withProjectModel(f.settings, resumeBareSettingsModel)
	if err != nil {
		return err
	}
	if err = os.WriteFile(settingsPath, withModel, 0o600); err != nil {
		return err
	}
	defer func() { _ = os.WriteFile(settingsPath, f.settings, 0o600) }()

	argv := claudecode.BuildArgv("claude", claudecode.LaunchParams{ResumeSessionID: run.claudeID})
	_, started, _, err := f.startInteractive(ctx, resumeBareTmuxID, sessionResumeBare, argv, nil)
	defer func() { _ = f.killPane(ctx, resumeBareTmuxID) }()
	if err != nil {
		return err
	}
	if started == nil {
		run.err = fmt.Errorf("no SessionStart within 90s of the flagless resume; hooks seen: %v", f.hookTypes(sessionResumeBare))
		return nil
	}
	run.started = started
	if !f.waitFor(30*time.Second, func() bool { return len(f.statusPosts(sessionResumeBare)) > 0 }) {
		run.err = fmt.Errorf("no status-line post within 30s of the flagless resume's SessionStart")
		return nil
	}
	posts := f.statusPosts(sessionResumeBare)
	run.firstStatus = &posts[0]
	for _, c := range posts {
		if name, _ := c.payload["session_name"].(string); name != "" {
			run.sessionName = name
			break
		}
	}
	return nil
}

// withProjectModel sets the top-level "model" key on already-merged settings JSON, keeping
// every other key.
func withProjectModel(merged []byte, model string) ([]byte, error) {
	doc := map[string]json.RawMessage{}
	if err := json.Unmarshal(merged, &doc); err != nil {
		return nil, fmt.Errorf("parsing merged settings: %w", err)
	}
	encoded, err := json.Marshal(model)
	if err != nil {
		return nil, err
	}
	doc["model"] = encoded
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}

// randomUUID returns a random v4 UUID, one no transcript can exist for.
func randomUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
