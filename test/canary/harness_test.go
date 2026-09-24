//go:build canary

package canary

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/tmux"
)

// The canary harness. It drives the REAL Claude Code binary through the exact production
// chain:
//
//	claudecode.WriteWrapperScripts + claudecode.MergeSettings
//	  → <scratch repo>/.claude/settings.local.json (data dir path contains a SPACE)
//	  → claude runs the `/bin/sh -c` command lines
//	  → hook.sh / status-line.sh POST the kb:anchor/ingest.envelope envelope
//	  → an in-test capture server, parsed with claudecode.ParseIngestBody.
//
// No fake claude, no synthesized POSTs. Every real run burns the developer's subscription, so the
// harness performs a fixed set of runs, once per `go test` process, and every test is a
// cheap view over them (CLAUDE.md: haiku only, trivial prompts, kill on exit):
//
//	A  headless, managed   ($MUSTER_SESSION=42) — one Bash tool call        (1 haiku turn)
//	B  headless, unmanaged (no $MUSTER_SESSION) — must produce zero posts    (1 haiku turn)
//	C  headless, unauthenticated CLAUDE_CONFIG_DIR, once per launch permission mode
//	   ($MUSTER_SESSION=43/45/46/47/49: no flag, plan, acceptEdits, auto, explicit
//	   default — REQ-9's added row)                                          (0 tokens)
//	D  interactive in tmux on a scratch socket ($MUSTER_SESSION=44), launched with
//	   Title:"Muster Canary", PermissionMode:"plan", "say hi" — then a wait for the
//	   idle_prompt Notification before the pane is killed                    (1 haiku turn)
//	E  a resume relaunch of D's claude session_id in a second tmux session on the same
//	   socket ($MUSTER_SESSION=48), through the exact BuildArgv+ResumeSessionID chain
//	   internal/server's Resume uses; one turn asking Claude to call ExitPlanMode, left
//	   unanswered by design — the dialog is never driven                    (1 haiku turn)
//	F  REQ-9's zero-token production CheckModel run against the installed binary: an
//	   unrecognised custom model string and the recognised haiku preset, both --bare
//	   so no tokens are spent and no hooks fire                              (0 tokens)
//	G  interactive ($MUSTER_SESSION=50): a sleeping Bash call interrupted with Esc, then a
//	   quiet window longer than the idle_prompt delay                        (1 haiku turn)
//	H  headless ($MUSTER_SESSION=51): four parallel Reads, one of a missing file, with the
//	   capture server holding each PostToolUse response for postToolUseHold (1 haiku turn)
//	I  headless against an in-test fail server, once per StopFailure mapping row
//	   ($MUSTER_SESSION=60 onward, one per row)                              (0 tokens)
//	J  interactive against a fail server answering 429 with rate-limit headers
//	   ($MUSTER_SESSION=52), one prompt that fails                           (0 tokens)
//
// Runs G–J live in harness_turns_test.go.
//
// Isolation: the scratch repo lives under os.MkdirTemp (/var/folders, outside ~/Documents
// so no parent CLAUDE.md leaks into the session); ~/.claude/settings.json is never read or
// written; tmux only on the harness's own socket. Payload bodies stay in memory and are
// never printed — failure messages carry event names and key lists only.

const (
	haikuModel = "claude-haiku-4-5-20251001"
	testToken  = "canary-token"

	sessionManaged       int64 = 42
	sessionUnauth        int64 = 43 // unauthenticated, no --permission-mode flag
	sessionInteract      int64 = 44
	sessionUnauthPlan    int64 = 45 // unauthenticated, --permission-mode plan
	sessionUnauthAccept  int64 = 46 // unauthenticated, --permission-mode acceptEdits
	sessionUnauthAuto    int64 = 47 // unauthenticated, --permission-mode auto (haiku model-gated to default)
	sessionResume        int64 = 48 // run E: resume of sessionInteract's claude session_id
	sessionUnauthDefault int64 = 49 // unauthenticated, explicit --permission-mode default (REQ-9)
	sessionInterrupt     int64 = 50 // run G: Esc during a running Bash call
	sessionToolBatch     int64 = 51 // run H: parallel Reads, PostToolUse responses held
	sessionFailedTurn    int64 = 52 // run J: interactive, every API call fails with a 429
	// sessionStopFailureBase is run I's first row; row i is sessionStopFailureBase+i.
	sessionStopFailureBase int64 = 60

	headlessPrompt    = "Run exactly this shell command and nothing else, then stop: echo hi"
	interactivePrompt = "say hi"
	// exitPlanPrompt drives run E's PermissionRequest without ever answering it (REQ-5): the
	// harness sends this once, waits for PermissionRequest then the permission_prompt
	// Notification, and kills the pane without answering the dialog.
	exitPlanPrompt = "Call the ExitPlanMode tool now with a one-line plan; do nothing else."

	interactiveTmuxID       int64 = 99 // tmux session "muster-99" on the scratch socket: run D
	interactiveResumeTmuxID int64 = 98 // tmux session "muster-98" on the scratch socket: run E
	interruptTmuxID         int64 = 97 // tmux session "muster-97" on the scratch socket: run G
	failedTurnTmuxID        int64 = 96 // tmux session "muster-96" on the scratch socket: run J

	// refreshIntervalSeconds is the one settings key the canary writes that production never
	// does (kb:adr/canary-refresh-interval-key-canary-only): MergeSettings emits statusLine
	// with type and command only, so without this the idle-tick half of
	// kb:fact/refresh-interval-seconds has nothing to observe. 5 s over run D's ~60 s idle
	// wait gives ~12 ticks; TestRefreshIntervalIsSeconds asserts far fewer than that.
	refreshIntervalSeconds = 5

	// unrecognizedCanaryModel is REQ-9's model string the installed binary's catalog must
	// not describe; run F asserts CheckModel classifies it ModelUnrecognised.
	unrecognizedCanaryModel = "muster-canary-unrecognized-model"
)

// unauthRuns is REQ-1's permission-mode sweep on the zero-token unauthenticated path: one
// run per launch permission mode, "" meaning no --permission-mode flag at all. REQ-9 adds
// the explicit "default" row alongside the pre-existing no-flag row, since BuildArgv now
// sends default explicitly too (REQ-4) and the explicit spelling's wire mapping
// (kb:fact/permission-mode-flag-on-wire) was otherwise unswept here.
var unauthRuns = []struct {
	session int64
	mode    string
}{
	{sessionUnauth, ""},
	{sessionUnauthPlan, "plan"},
	{sessionUnauthAccept, "acceptEdits"},
	{sessionUnauthAuto, "auto"},
	{sessionUnauthDefault, "default"},
}

// offlineEnv, when set, skips every test that needs a real run — lets the canary package be
// compiled and vetted without spending tokens (`MUSTER_CANARY_OFFLINE=1 make canary`).
const offlineEnv = "MUSTER_CANARY_OFFLINE"

// forceEnv, when set, runs the harness and live tiers even when the installed version
// equals the verified ceiling — the plan-review convention (docs/claude-code-versions.md
// "Skipping on an unchanged install").
const forceEnv = "MUSTER_CANARY_FORCE"

// skipReason is non-empty when harness(t)/live(t) should skip the real-run tiers because
// the installed version hasn't changed since the last green canary. Computed once in
// TestMain, before m.Run(), so every test observes the same decision.
var skipReason string

// skipDecision is the pure decision skipReason is computed from (test/canary/skip_test.go,
// D17): the harness/live tiers skip iff installed equals verified and neither force nor
// offline is set. offline always wins (INV-4) — harness(t)/live(t) already check it
// themselves before ever consulting skipReason, but skipDecision itself honours it too so
// a caller that skips that check first still gets the right answer.
func skipDecision(installed, verified string, force, offline bool) (skip bool, reason string) {
	if offline || force {
		return false, ""
	}
	if installed != verified {
		return false, ""
	}
	return true, fmt.Sprintf(
		"canary: installed %s equals the verified ceiling; skipping the harness and live tiers (set %s=1 to run them)",
		installed, forceEnv,
	)
}

// capture is one POST exactly as musterd's ingest handler would see it.
type capture struct {
	kind    claudecode.Kind
	ev      claudecode.Event
	payload map[string]any // ev.Payload decoded; never printed
	at      time.Time
}

type fixture struct {
	err error // build failure; every test fails with it

	root      string // temp root
	repo      string // scratch git repo (cwd for every claude run)
	dataDir   string // space-bearing data dir holding hook.sh / status-line.sh
	settings  []byte // the generated settings.local.json
	installed string // claude --version
	srv       *httptest.Server

	mu   sync.Mutex
	caps []capture

	// Per-run bookkeeping.
	runAOutput  string // headless JSON output of run A (no payload text beyond claude's reply)
	runBPosts   int    // posts captured during run B (must be 0)
	runCOutput  string // last unauthenticated run's output (build-error messages only)
	interactive struct {
		trustPromptSeen bool
		sessionStartAt  time.Time
		stopAt          time.Time
		idlePromptAt    time.Time // run D: when the idle_prompt Notification arrived (REQ-3)
		claudeSessionID string    // run D's SessionStart.session_id, for run E's --resume
		transcriptPath  string    // run D's SessionStart.transcript_path, cross-checked against E

		// The two zero-token in-pane checks driven in run D's idle window
		// (kb:adr/canary-run-d-holds-two-claude-sessions). Each step records its own error
		// instead of failing the build, so a typing hiccup in one of them fails its own test
		// rather than every test in the package.
		shiftTabAt        time.Time // when S-Tab was sent
		shiftTabErr       error
		clearAt           time.Time // when /clear was typed
		clearErr          error
		postClearClaudeID string // the session_id /clear minted in the same pane
	}

	// modelCheck holds run F's REQ-9 verdicts: CheckModel run against the installed
	// binary for an unrecognised custom model and the recognised haiku preset.
	modelCheck struct {
		unrecognisedVerdict claudecode.ModelVerdict
		recognisedVerdict   claudecode.ModelVerdict
	}

	interrupt  interruptRun  // run G
	toolBatch  toolBatchRun  // run H
	failedTurn failedTurnRun // run J

	tmuxClient *tmux.Client
}

var (
	fx     fixture
	fxOnce sync.Once
)

// harness builds the fixture once per process and returns it; a build failure fails the
// calling test with the underlying error. It skips under MUSTER_CANARY_OFFLINE, and again
// (with skipReason, computed in TestMain) when the installed version equals the verified
// ceiling and MUSTER_CANARY_FORCE is unset.
func harness(t *testing.T) *fixture {
	t.Helper()
	if os.Getenv(offlineEnv) != "" {
		t.Skipf("%s is set: not driving a real claude", offlineEnv)
	}
	if skipReason != "" {
		t.Skip(skipReason)
	}
	fxOnce.Do(func() { fx.err = fx.build() })
	if fx.err != nil {
		t.Fatalf("canary harness failed to build: %v", fx.err)
	}
	return &fx
}

// TestMain computes skipReason (non-offline only) before running any test, then tears the
// fixture down after every test has read it. An InstalledVersion error here is not fatal:
// harness(t)'s own build() calls it again, so the "claude must be on PATH" failure surfaces
// there with its existing message instead of a second one here.
func TestMain(m *testing.M) {
	if os.Getenv(offlineEnv) == "" {
		force := os.Getenv(forceEnv) != ""
		if installed, err := claudecode.InstalledVersion(context.Background(), "claude"); err == nil {
			if skip, reason := skipDecision(installed, claudecode.Verified(), force, false); skip {
				skipReason = reason
				fmt.Println(reason)
			}
		}
	}
	code := m.Run()
	fx.teardown()
	os.Exit(code)
}

// ---------------------------------------------------------------------------------------
// build

func (f *fixture) build() error {
	ctx, cancel := context.WithTimeout(context.Background(), 16*time.Minute)
	defer cancel()

	installed, err := claudecode.InstalledVersion(ctx, "claude")
	if err != nil {
		return fmt.Errorf("claude must be on PATH: %w", err)
	}
	f.installed = installed

	if _, lookErr := exec.LookPath("tmux"); lookErr != nil {
		return fmt.Errorf("tmux must be on PATH (/usr/local/bin/tmux 3.7b): %w", lookErr)
	}

	root, err := os.MkdirTemp("", "muster-canary-")
	if err != nil {
		return err
	}
	f.root = root
	f.repo = filepath.Join(root, "repo")
	f.dataDir = filepath.Join(root, "muster canary data") // the space is the point
	if err = os.MkdirAll(filepath.Join(f.repo, ".claude"), 0o755); err != nil {
		return err
	}
	if err = os.MkdirAll(f.dataDir, 0o700); err != nil {
		return err
	}
	if err = initScratchRepo(ctx, f.repo); err != nil {
		return err
	}

	// Capture server: the two ingest routes WriteWrapperScripts bakes into the scripts.
	srv := httptest.NewServer(http.HandlerFunc(f.handle))
	f.srv = srv

	// Production chain, verbatim.
	hookScript, statusScript, _, err := claudecode.WriteWrapperScripts(f.dataDir, srv.URL, testToken)
	if err != nil {
		return err
	}
	f.settings, err = claudecode.MergeSettings(nil, claudecode.SettingsConfig{
		HookCommand:       hookScript,
		StatusLineCommand: statusScript,
	})
	if err != nil {
		return err
	}
	f.settings, err = withRefreshInterval(f.settings, refreshIntervalSeconds)
	if err != nil {
		return err
	}
	// Only settings.local.json is ever written — no .claude/settings.json is created, which
	// is what TestLocalSettingsHonoured reads as evidence for kb:fact/local-settings-honoured.
	settingsPath := filepath.Join(f.repo, ".claude", "settings.local.json")
	if err := os.WriteFile(settingsPath, f.settings, 0o600); err != nil {
		return err
	}

	runs := []struct {
		name string
		fn   func(context.Context) error
	}{
		{"run A (headless managed)", f.runA},
		{"run B (headless unmanaged)", f.runB},
		{"run C (unauthenticated StopFailure)", f.runC},
		{"run D (interactive status line)", f.runD},
		{"run E (resume + plan mode)", f.runE},
		{"run F (model-catalog pre-check)", f.runF},
		{"run G (interrupt mid-tool)", f.runG},
		{"run H (parallel Reads, held PostToolUse)", f.runH},
		{"run I (StopFailure mapping)", f.runI},
		{"run J (all-failing interactive status line)", f.runJ},
	}
	for _, r := range runs {
		if err := r.fn(ctx); err != nil {
			return fmt.Errorf("%s: %w", r.name, err)
		}
	}
	return nil
}

func initScratchRepo(ctx context.Context, repo string) error {
	steps := [][]string{
		{"init", "-q", "-b", "main"},
		{"config", "user.email", "canary@example.invalid"},
		{"config", "user.name", "Muster Canary"},
	}
	for _, s := range steps {
		if out, err := exec.CommandContext(ctx, "git", append([]string{"-C", repo}, s...)...).CombinedOutput(); err != nil {
			return fmt.Errorf("git %v: %w: %s", s, err, out)
		}
	}
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("# muster canary scratch repo\n"), 0o644); err != nil {
		return err
	}
	if out, err := exec.CommandContext(ctx, "git", "-C", repo, "add", "-A").CombinedOutput(); err != nil {
		return fmt.Errorf("git add: %w: %s", err, out)
	}
	if out, err := exec.CommandContext(ctx, "git", "-C", repo, "commit", "-qm", "scratch").CombinedOutput(); err != nil {
		return fmt.Errorf("git commit: %w: %s", err, out)
	}
	return nil
}

// withRefreshInterval adds statusLine.refreshInterval to settings MergeSettings has already
// produced, preserving every other key and the shell quoting of the command itself. This is a
// deliberate, canary-only departure from "the production chain, verbatim": production omits the
// key (internal/claudecode/settings.go), so an idle managed session posts nothing and the
// seconds-not-milliseconds half of kb:fact/refresh-interval-seconds cannot be observed at all.
// Setting it here — after the merge, on the bytes actually written — leaves every other
// assertion reading exactly what production would produce
// (kb:adr/canary-refresh-interval-key-canary-only).
func withRefreshInterval(merged []byte, seconds int) ([]byte, error) {
	doc := map[string]json.RawMessage{}
	if err := json.Unmarshal(merged, &doc); err != nil {
		return nil, fmt.Errorf("parsing merged settings: %w", err)
	}
	raw, ok := doc["statusLine"]
	if !ok {
		return nil, fmt.Errorf("merged settings carry no statusLine entry")
	}
	line := map[string]any{}
	if err := json.Unmarshal(raw, &line); err != nil {
		return nil, fmt.Errorf("parsing merged statusLine: %w", err)
	}
	line["refreshInterval"] = seconds
	encoded, err := json.Marshal(line)
	if err != nil {
		return nil, err
	}
	doc["statusLine"] = encoded
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}

// handle is the capture server. Paths are the exact ones the wrapper scripts post to.
func (f *fixture) handle(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	_ = r.Body.Close()

	var kind claudecode.Kind
	switch r.URL.Path {
	case "/ingest/" + testToken + "/hook":
		kind = claudecode.KindHook
	case "/ingest/" + testToken + "/status":
		kind = claudecode.KindStatus
	default:
		// A post to any other path is itself a canary failure (the token or route moved).
		f.record(capture{kind: claudecode.Kind("unexpected:" + r.URL.Path), at: time.Now()})
		w.WriteHeader(http.StatusNotFound)
		return
	}

	c := capture{kind: kind, at: time.Now()}
	ev, err := claudecode.ParseIngestBody(body, kind)
	if err == nil {
		c.ev = ev
		_ = json.Unmarshal(ev.Payload, &c.payload)
	} else {
		c.ev.Type = "unparseable"
	}
	f.record(c)
	// Run H's PostToolUse posts are recorded on arrival, then answered late: the production
	// wrapper's curl is synchronous, so the hook itself lasts postToolUseHold without the
	// settings changing (kb:adr/canary-hook-await-measured-by-held-ingest-response).
	if kind == claudecode.KindHook && c.ev.Type == "PostToolUse" &&
		c.ev.MusterSession != nil && *c.ev.MusterSession == sessionToolBatch {
		time.Sleep(postToolUseHold)
	}
	w.WriteHeader(http.StatusOK)
}

func (f *fixture) record(c capture) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.caps = append(f.caps, c)
}

func (f *fixture) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.caps)
}

// ---------------------------------------------------------------------------------------
// runs

// baseEnv is the process environment minus anything that would leak the operator's own
// tmux pane or a config-dir override into the run.
func baseEnv() []string {
	var env []string
	for _, kv := range os.Environ() {
		k := strings.SplitN(kv, "=", 2)[0]
		switch k {
		case "MUSTER_SESSION", "TMUX", "TMUX_PANE", "CLAUDE_CONFIG_DIR":
			continue
		}
		env = append(env, kv)
	}
	return env
}

// headless runs one headless `echo hi` turn. permissionMode, when non-empty, is passed as
// --permission-mode (REQ-1's unauthenticated sweep); empty omits the flag entirely, as
// every run before REQ-1 did.
func (f *fixture) headless(ctx context.Context, permissionMode string, extraEnv ...string) (string, error) {
	flags := []string{"--allowedTools", "Bash", "--output-format", "json"}
	if permissionMode != "" {
		flags = append(flags, "--permission-mode", permissionMode)
	}
	return f.headlessRun(ctx, headlessPrompt, flags, extraEnv)
}

// headlessRun runs `claude -p prompt --model haiku flags...` in the scratch repo and returns
// its combined output once the last hook has had time to land.
func (f *fixture) headlessRun(ctx context.Context, prompt string, flags, extraEnv []string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	args := append([]string{"-p", prompt, "--model", haikuModel}, flags...)
	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Dir = f.repo
	cmd.Env = append(baseEnv(), extraEnv...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		var exitErr *exec.ExitError
		if !errors.As(err, &exitErr) {
			return string(out), err
		}
		// Non-zero exit is expected for the unauthenticated run; callers judge by events.
	}
	// Give the last hook (SessionEnd) its 2 s curl budget to land: on the auth-failure exit
	// path claude exits ~100 ms after StopFailure and the wrapper's curl is still in flight
	// (first harness run, 2026-08-29, saw SessionEnd missing with a 300 ms quiet window).
	f.settle(1500 * time.Millisecond)
	return string(out), nil
}

func (f *fixture) runA(ctx context.Context) error {
	out, err := f.headless(ctx, "", fmt.Sprintf("MUSTER_SESSION=%d", sessionManaged))
	f.runAOutput = out
	if err != nil {
		return err
	}
	if len(f.hookEvents(sessionManaged)) == 0 {
		return fmt.Errorf("no enveloped hook post reached the capture server (claude output tail: %s)", tail(out))
	}
	return nil
}

func (f *fixture) runB(ctx context.Context) error {
	before := f.count()
	if _, err := f.headless(ctx, ""); err != nil {
		return err
	}
	f.settle(2 * time.Second)
	f.runBPosts = f.count() - before
	return nil
}

// runC performs REQ-1's four zero-token unauthenticated headless runs, one per launch
// permission mode (unauthRuns), all against the same unauth config dir.
func (f *fixture) runC(ctx context.Context) error {
	configDir := filepath.Join(f.root, "unauth-config")
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return err
	}
	// Mirror test/rig/newprobe.sh: the same settings are also written into the
	// unauthenticated config dir, so this run does not additionally depend on project-scope
	// settings being honoured under CLAUDE_CONFIG_DIR.
	if err := os.WriteFile(filepath.Join(configDir, "settings.json"), f.settings, 0o600); err != nil {
		return err
	}
	for _, run := range unauthRuns {
		out, err := f.headless(ctx, run.mode,
			fmt.Sprintf("MUSTER_SESSION=%d", run.session),
			"CLAUDE_CONFIG_DIR="+configDir,
		)
		f.runCOutput = out
		if err != nil {
			return fmt.Errorf("mode %q: %w", run.mode, err)
		}
		if len(f.hookEvents(run.session)) == 0 {
			return fmt.Errorf("mode %q: no hook post reached the capture server (claude output tail: %s)", run.mode, tail(out))
		}
	}
	return nil
}

func (f *fixture) runD(ctx context.Context) error {
	socket := filepath.Join(f.root, "tmux.sock")
	if err := tmux.ValidateSocket(socket); err != nil {
		socket = fmt.Sprintf("muster-canary-%d", os.Getpid()) // -L fallback
	}
	f.tmuxClient = tmux.New(socket)

	// Title + PermissionMode:"plan" (REQ-2): the cross-check that the unauthenticated
	// sweep in runC reflects the flag, since the flag→wire mapping was measured
	// authenticated only (plan Carried-over measurements).
	argv := claudecode.BuildArgv("claude", claudecode.LaunchParams{
		Model:          haikuModel,
		Title:          "Muster Canary",
		PermissionMode: "plan",
	})
	target, c, trustPromptSeen, err := f.startInteractive(ctx, interactiveTmuxID, sessionInteract, argv, nil)
	f.interactive.trustPromptSeen = trustPromptSeen
	if err != nil {
		return err
	}
	if c == nil {
		return fmt.Errorf("no SessionStart within 90s (trust prompt seen: %t)", f.interactive.trustPromptSeen)
	}
	f.interactive.sessionStartAt = c.at
	f.interactive.claudeSessionID = c.ev.SessionID
	if tp, ok := c.payload["transcript_path"].(string); ok {
		f.interactive.transcriptPath = tp
	}

	if err := f.submit(ctx, target, interactivePrompt); err != nil {
		return err
	}

	if !f.waitFor(120*time.Second, func() bool { return f.firstHook(sessionInteract, "Stop") != nil }) {
		return fmt.Errorf("no Stop within 120s of submitting %q", interactivePrompt)
	}
	f.interactive.stopAt = f.firstHook(sessionInteract, "Stop").at

	// A post-turn status line carries rate_limits; wait for one so the field tests see the
	// steady state, not only the startup posts.
	_ = f.waitFor(30*time.Second, func() bool {
		for _, c := range f.statusPosts(sessionInteract) {
			if _, ok := c.payload["rate_limits"]; ok {
				return true
			}
		}
		return false
	})

	// REQ-3: wait for the idle_prompt Notification (measured 60.03s after Stop on
	// 2.1.259) before killing the pane, bounded at 90s per the plan's decision that a
	// timing assertion on a shared machine is a flake generator — only the arrival, not
	// the gap, is asserted.
	if !f.waitFor(90*time.Second, func() bool { return f.firstNotification(sessionInteract, "idle_prompt") != nil }) {
		return fmt.Errorf("no idle_prompt Notification within 90s of Stop; hooks seen: %v", f.hookTypes(sessionInteract))
	}
	f.interactive.idlePromptAt = f.firstNotification(sessionInteract, "idle_prompt").at

	// Two zero-token checks in the window that is already being paid for, in this order: the
	// mode cycle must fire nothing, then /clear ends this claude session and mints another in
	// the same pane. Neither can run before idle_prompt (a keypress cancels the idle timer),
	// and /clear must come last because every status-line view above is written against the
	// pre-clear session.
	f.shiftTabStep(ctx, target)
	f.clearStep(ctx, target)

	return f.killPane(ctx, interactiveTmuxID)
}

// startInteractive launches argv as tmux session muster-<tmuxID> on the scratch socket, with
// $MUSTER_SESSION=session plus extraEnv (KEY=value, as headlessRun takes it), sized 200x50,
// and waits up to 90 s for its SessionStart, answering the trust prompt on the way. A nil
// capture means none arrived; each caller words that failure itself. On success it gives the
// REPL 2 s to accept input.
func (f *fixture) startInteractive(ctx context.Context, tmuxID, session int64, argv, extraEnv []string) (string, *capture, bool, error) {
	env := map[string]string{
		"MUSTER_SESSION": fmt.Sprint(session),
		"LANG":           "en_US.UTF-8",
		"TERM":           "xterm-256color",
	}
	for _, kv := range extraEnv {
		k, v, _ := strings.Cut(kv, "=")
		env[k] = v
	}
	target, _, err := f.tmuxClient.NewSession(ctx, tmuxID, f.repo, env, argv)
	if err != nil {
		return "", nil, false, err
	}
	if err = f.tmuxClient.ResizeWindow(ctx, target, 200, 50); err != nil {
		return target, nil, false, err
	}
	c, trustPromptSeen, err := f.waitForSessionStart(ctx, target, session, 90*time.Second)
	if c != nil {
		time.Sleep(2 * time.Second)
	}
	return target, c, trustPromptSeen, err
}

// killPane kills muster-<tmuxID> and lets its last posts land. The kill error is returned;
// a caller that kills on a deferred path may drop it, since the pane may already be gone.
func (f *fixture) killPane(ctx context.Context, tmuxID int64) error {
	err := f.tmuxClient.KillSession(ctx, fmt.Sprintf("muster-%d", tmuxID))
	f.settle(2 * time.Second)
	return err
}

// submit types text into target's pane, then presses Enter as a separate send-keys: one
// combined call swallows the newline (probe skill).
func (f *fixture) submit(ctx context.Context, target, text string) error {
	if err := f.sendKeys(ctx, target, text); err != nil {
		return err
	}
	time.Sleep(1 * time.Second)
	return f.sendKeys(ctx, target, "Enter")
}

// waitForSessionStart polls for session's SessionStart hook, answering the workspace-trust
// prompt whenever it appears: startup blocks on that prompt in a never-seen directory
// (FINDINGS §9) and no hooks fire until it is answered. capture-pane is the wait oracle only.
//
// Shared by run D and run E, whose resume launch can re-trigger the same prompt (Edge Case 3).
// Returns a nil capture on timeout rather than an error, so each caller keeps its own message;
// the bool reports whether the trust prompt was ever seen, which run D asserts on.
func (f *fixture) waitForSessionStart(ctx context.Context, target string, session int64, limit time.Duration) (*capture, bool, error) {
	deadline := time.Now().Add(limit)
	lastAction := time.Time{}
	trustPromptSeen := false
	for time.Now().Before(deadline) {
		if c := f.firstHook(session, "SessionStart"); c != nil {
			return c, trustPromptSeen, nil
		}
		pane, _ := f.tmuxClient.CapturePane(ctx, target)
		if looksLikeTrustPrompt(pane) && time.Since(lastAction) > 3*time.Second {
			trustPromptSeen = true
			if err := f.answerTrustPrompt(ctx, target, pane); err != nil {
				return nil, trustPromptSeen, err
			}
			lastAction = time.Now()
		}
		time.Sleep(500 * time.Millisecond)
	}
	return nil, trustPromptSeen, nil
}

// shiftTabStep cycles the permission mode with Shift+Tab and then waits two refresh periods,
// so a tick lands after the keypress and TestShiftTabFiresNoHook can judge both halves of
// kb:fact/shift-tab-mode-cycle-fires-no-hook: no hook fires, and the status line gains no
// field. shiftTabAt is stamped before the key is sent, so anything the keypress provokes falls
// inside the window the test examines.
func (f *fixture) shiftTabStep(ctx context.Context, target string) {
	f.interactive.shiftTabAt = time.Now()
	if err := f.sendKeys(ctx, target, "S-Tab"); err != nil {
		f.interactive.shiftTabErr = err
		return
	}
	time.Sleep(2 * refreshIntervalSeconds * time.Second)
}

// clearStep types /clear into run D's pane and waits for the SessionStart it mints
// (kb:fact/clear-mints-new-session-id). It costs no tokens — /clear is handled locally — and
// it is the last thing done to the pane before the kill. Run E is unaffected: it resumes the
// session_id captured at run D's first SessionStart, whose transcript survives the clear.
func (f *fixture) clearStep(ctx context.Context, target string) {
	f.interactive.clearAt = time.Now()
	if err := f.submit(ctx, target, "/clear"); err != nil {
		f.interactive.clearErr = err
		return
	}
	if !f.waitFor(30*time.Second, func() bool { return f.sessionStartAfterClear() != nil }) {
		f.interactive.clearErr = fmt.Errorf(
			"no SessionStart{source:\"clear\"} within 30s of typing /clear; hooks seen: %v",
			f.hookTypes(sessionInteract))
		return
	}
	f.interactive.postClearClaudeID = f.sessionStartAfterClear().ev.SessionID
	f.settle(2 * time.Second)
}

// runE relaunches run D's claude session_id through the exact production
// BuildArgv+ResumeSessionID chain internal/server's Resume uses (REQ-4), in a second
// tmux session on the same socket, then drives the ExitPlanMode sequence to
// PermissionRequest and the permission_prompt Notification WITHOUT answering the dialog
// (REQ-5) — never send Enter, Down or Escape after the prompt.
func (f *fixture) runE(ctx context.Context) error {
	if f.interactive.claudeSessionID == "" {
		return fmt.Errorf("run D produced no claude session_id to resume")
	}

	argv := claudecode.BuildArgv("claude", claudecode.LaunchParams{
		Model:           haikuModel,
		PermissionMode:  "plan",
		ResumeSessionID: f.interactive.claudeSessionID,
	})
	// Same trust-prompt loop as run D (Edge Case 3): a resume launch can re-trigger it.
	target, started, _, err := f.startInteractive(ctx, interactiveResumeTmuxID, sessionResume, argv, nil)
	if err != nil {
		return err
	}
	if started == nil {
		return fmt.Errorf("no SessionStart within 90s on the resume relaunch (run E)")
	}

	if err := f.submit(ctx, target, exitPlanPrompt); err != nil {
		return err
	}

	if !f.waitFor(90*time.Second, func() bool { return f.firstHook(sessionResume, "PermissionRequest") != nil }) {
		return fmt.Errorf("no PermissionRequest within 90s of submitting the ExitPlanMode prompt; hooks seen: %v", f.hookTypes(sessionResume))
	}
	if !f.waitFor(30*time.Second, func() bool { return f.firstNotification(sessionResume, "permission_prompt") != nil }) {
		return fmt.Errorf("no permission_prompt Notification within 30s of PermissionRequest; hooks seen: %v", f.hookTypes(sessionResume))
	}

	// Kill without ever answering the dialog (REQ-5) — no Enter/Down/Escape past this point.
	return f.killPane(ctx, interactiveResumeTmuxID)
}

// runF is REQ-9's zero-token production check (D13): it calls the exact claudecode.CheckModel
// internal/server wires up, against the installed `claude` binary, for a model string the
// catalog cannot know (unrecognizedCanaryModel) and one it must (haikuModel — the same
// preset every other run in this harness already launches successfully). No tmux, no
// hooks, no tokens (kb:fact/model-catalog-precheck-zero-token). A run error here — the
// binary couldn't start, or hung past CheckModel's own 5 s bound (applied inside
// CheckModel itself since review cycle 1's maintainability fix; this run no longer wraps
// its own timeout around it) — fails the whole build like every other run, since it means
// the production pre-check itself is broken against the installed binary, not merely that
// this one launch would have failed open.
func (f *fixture) runF(ctx context.Context) error {
	unrec, err := claudecode.CheckModel(ctx, "claude", f.repo, unrecognizedCanaryModel)
	if err != nil {
		return fmt.Errorf("CheckModel(%q): %w", unrecognizedCanaryModel, err)
	}
	f.modelCheck.unrecognisedVerdict = unrec

	rec, err := claudecode.CheckModel(ctx, "claude", f.repo, haikuModel)
	if err != nil {
		return fmt.Errorf("CheckModel(%q): %w", haikuModel, err)
	}
	f.modelCheck.recognisedVerdict = rec
	return nil
}

func looksLikeTrustPrompt(pane string) bool {
	l := strings.ToLower(pane)
	return strings.Contains(l, "quick safety check") || strings.Contains(l, "trust the files") ||
		strings.Contains(l, "trust this folder")
}

// trustPromptYesRow is the exact row text of the option that grants trust; trustPromptMarker
// is the selection cursor Claude Code renders on whichever row is currently selected. Which
// row is preselected changed between Claude Code versions (2.1.233: "Yes" first and
// preselected; 2.1.259+: "No, exit" first and preselected, FINDINGS §9 / canary-fields.md,
// plan Edge Case 15) — so the harness must read the marker's row rather than assume it.
const (
	trustPromptYesRow = "Yes, I trust this folder"
	trustPromptMarker = "❯"
)

// answerTrustPrompt drives one step toward accepting the workspace-trust prompt: it moves the
// selection marker onto the "Yes, I trust this folder" row before ever pressing Enter, never
// a blind Enter — on 2.1.259+ the prompt preselects "No, exit", and a blind Enter there exits
// the session instead of reaching the REPL (plan Edge Case 15). pane is the just-captured
// frame the caller already has; capture-pane stays a wait/answer oracle only (CLAUDE.md),
// never a state source — this only decides how to answer a dialog that is already on screen,
// it is not used to infer session state.
//
// Only two rows exist today, so a single step always moves between them; if the marker's row
// can't be resolved this frame (e.g. mid-render), it nudges Down and lets the caller's
// pacing retry on the next capture rather than risk answering blind.
func (f *fixture) answerTrustPrompt(ctx context.Context, target, pane string) error {
	lines := strings.Split(pane, "\n")
	yesLine, markerLine := -1, -1
	for i, l := range lines {
		if markerLine == -1 && strings.Contains(l, trustPromptMarker) {
			markerLine = i
		}
		if yesLine == -1 && strings.Contains(l, trustPromptYesRow) {
			yesLine = i
		}
	}
	switch {
	case yesLine == -1:
		// The Yes row itself isn't visible this frame; nothing safe to press yet.
		return nil
	case markerLine == yesLine:
		return f.sendKeys(ctx, target, "Enter")
	case markerLine == -1, markerLine < yesLine:
		return f.sendKeys(ctx, target, "Down")
	default:
		return f.sendKeys(ctx, target, "Up")
	}
}

// sendKeys is the one tmux primitive internal/tmux deliberately lacks (production never
// types into a pane); the canary needs it to answer the trust prompt and submit a prompt,
// on either run D's or run E's pane (target).
func (f *fixture) sendKeys(ctx context.Context, target, key string) error {
	var socketArgs []string
	if strings.Contains(f.socket(), "/") {
		socketArgs = []string{"-S", f.socket()}
	} else {
		socketArgs = []string{"-L", f.socket()}
	}
	socketArgs = append(socketArgs, "send-keys", "-t", target, key)
	if out, err := exec.CommandContext(ctx, "tmux", socketArgs...).CombinedOutput(); err != nil {
		return fmt.Errorf("tmux send-keys: %w: %s", err, out)
	}
	return nil
}

func (f *fixture) socket() string {
	// tmux.Client keeps its socket private; the AttachArgv output carries it.
	argv := f.tmuxClient.AttachArgv("x")
	return argv[2]
}

// ---------------------------------------------------------------------------------------
// views

func (f *fixture) all() []capture {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]capture(nil), f.caps...)
}

// hookEvents returns the enveloped hook posts for one $MUSTER_SESSION, in arrival order.
func (f *fixture) hookEvents(session int64) []capture {
	var out []capture
	for _, c := range f.all() {
		if c.kind == claudecode.KindHook && c.ev.MusterSession != nil && *c.ev.MusterSession == session {
			out = append(out, c)
		}
	}
	return out
}

func (f *fixture) statusPosts(session int64) []capture {
	var out []capture
	for _, c := range f.all() {
		if c.kind == claudecode.KindStatus && c.ev.MusterSession != nil && *c.ev.MusterSession == session {
			out = append(out, c)
		}
	}
	return out
}

// preClearClaudeID is run D's original claude session_id. /clear mints a second one in the
// same pane (kb:fact/clear-mints-new-session-id), so one $MUSTER_SESSION now spans two claude
// sessions and every status-line view has to say which it means
// (kb:adr/canary-run-d-holds-two-claude-sessions).
func (f *fixture) preClearClaudeID() string { return f.interactive.claudeSessionID }

// statusPostsFor narrows statusPosts to one claude session_id.
func (f *fixture) statusPostsFor(session int64, claudeID string) []capture {
	var out []capture
	for _, c := range f.statusPosts(session) {
		if c.ev.SessionID == claudeID {
			out = append(out, c)
		}
	}
	return out
}

func (f *fixture) firstHook(session int64, event string) *capture {
	for _, c := range f.hookEvents(session) {
		if c.ev.Type == event {
			c := c
			return &c
		}
	}
	return nil
}

// firstNotification returns the first "Notification" hook on session whose
// notification_type matches notifType — Notification fires more than once per session
// (idle_prompt, permission_prompt, …), so firstHook's plain event-name match isn't
// enough to distinguish them (REQ-3/REQ-5).
func (f *fixture) firstNotification(session int64, notifType string) *capture {
	for _, c := range f.hookEvents(session) {
		if c.ev.Type != "Notification" {
			continue
		}
		if nt, _ := c.payload["notification_type"].(string); nt == notifType {
			c := c
			return &c
		}
	}
	return nil
}

// firstHookWhere returns the first hook of the named event whose decoded payload satisfies ok
// — firstHook's plain event-name match is not enough once a session emits two SessionStarts
// (startup and clear) or two SessionEnds (clear and the killed pane).
func (f *fixture) firstHookWhere(session int64, event string, ok func(map[string]any) bool) *capture {
	for _, c := range f.hookEvents(session) {
		if c.ev.Type == event && ok(c.payload) {
			c := c
			return &c
		}
	}
	return nil
}

// sessionStartAfterClear is the SessionStart /clear minted in run D's pane.
func (f *fixture) sessionStartAfterClear() *capture {
	return f.firstHookWhere(sessionInteract, "SessionStart", func(p map[string]any) bool {
		src, _ := p["source"].(string)
		return src == "clear"
	})
}

// hooksBetween lists the hook events on one claude session_id that arrived in [from, to),
// a Notification labelled with its type, e.g. "Notification{idle_prompt}".
func (f *fixture) hooksBetween(session int64, claudeID string, from, to time.Time) []string {
	var out []string
	for _, c := range f.hookEvents(session) {
		if c.ev.SessionID != claudeID || c.at.Before(from) || !c.at.Before(to) {
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

// statusPostBefore is the last status post on claudeID that arrived before t.
func (f *fixture) statusPostBefore(session int64, claudeID string, t time.Time) *capture {
	var last *capture
	for _, c := range f.statusPostsFor(session, claudeID) {
		if c.at.Before(t) {
			c := c
			last = &c
		}
	}
	return last
}

// statusPostAfter is the first status post on claudeID that arrived at or after t.
func (f *fixture) statusPostAfter(session int64, claudeID string, t time.Time) *capture {
	for _, c := range f.statusPostsFor(session, claudeID) {
		if !c.at.Before(t) {
			c := c
			return &c
		}
	}
	return nil
}

func (f *fixture) hookTypes(session int64) []string { return eventTypes(f.hookEvents(session)) }

func eventTypes(cs []capture) []string {
	out := make([]string, 0, len(cs))
	for _, c := range cs {
		out = append(out, c.ev.Type)
	}
	return out
}

func (f *fixture) waitFor(d time.Duration, cond func() bool) bool {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(250 * time.Millisecond)
	}
	return cond()
}

// settle waits until no new post has arrived for quiet (bounded), so late curl deliveries
// land before the run is judged.
func (f *fixture) settle(quiet time.Duration) {
	deadline := time.Now().Add(5 * time.Second)
	last := f.count()
	lastChange := time.Now()
	for time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
		if n := f.count(); n != last {
			last, lastChange = n, time.Now()
		}
		if time.Since(lastChange) >= quiet {
			return
		}
	}
}

// tail returns the last ~300 bytes of claude's stdout for a build error — this is
// claude's own reply/diagnostic, not a hook payload.
func tail(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 300 {
		s = "…" + s[len(s)-300:]
	}
	return s
}

// ---------------------------------------------------------------------------------------
// teardown

func (f *fixture) teardown() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if f.tmuxClient != nil {
		// REQ-12: every tmux session (D, E, G, J) before the scratch socket's server itself.
		// Each KillSession is a no-op error if that session already exited (e.g. the build
		// failed before runE ever created muster-98) — ignored the same way run D's kill
		// always was.
		for _, id := range []int64{interactiveTmuxID, interactiveResumeTmuxID, interruptTmuxID, failedTurnTmuxID} {
			_ = f.tmuxClient.KillSession(ctx, fmt.Sprintf("muster-%d", id))
		}
		args := []string{"kill-server"}
		if strings.Contains(f.socket(), "/") {
			args = append([]string{"-S", f.socket()}, args...)
		} else {
			args = append([]string{"-L", f.socket()}, args...)
		}
		_ = exec.CommandContext(ctx, "tmux", args...).Run()
	}
	if f.srv != nil {
		f.srv.Close()
	}
	if f.root != "" {
		_ = os.RemoveAll(f.root)
	}
}
