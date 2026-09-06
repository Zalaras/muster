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

// The canary harness (plan m4-canary, 2026-08-29). It drives the REAL Claude Code binary
// through the exact production chain that shipped broken in M3 (m4-hook-quoting):
//
//	claudecode.WriteWrapperScripts + claudecode.MergeSettings
//	  → <scratch repo>/.claude/settings.local.json (data dir path contains a SPACE)
//	  → claude runs the `/bin/sh -c` command lines
//	  → hook.sh / status-line.sh POST the §4.2 envelope
//	  → an in-test capture server, parsed with claudecode.ParseIngestBody.
//
// No fake claude, no synthesized POSTs. Every real run burns Damian's subscription, so the
// harness performs exactly four runs, once per `go test` process, and every test is a
// cheap view over them (CLAUDE.md: haiku only, trivial prompts, kill on exit):
//
//	A  headless, managed   ($MUSTER_SESSION=42) — one Bash tool call        (1 haiku turn)
//	B  headless, unmanaged (no $MUSTER_SESSION) — must produce zero posts    (1 haiku turn)
//	C  headless, unauthenticated CLAUDE_CONFIG_DIR ($MUSTER_SESSION=43)      (0 tokens)
//	D  interactive in tmux on a scratch socket ($MUSTER_SESSION=44), "say hi" — the status
//	   line never runs headless, so this is the only source of status-line posts (1 haiku turn)
//
// Isolation: the scratch repo lives under os.MkdirTemp (/var/folders, outside ~/Documents
// so no parent CLAUDE.md leaks into the session); ~/.claude/settings.json is never read or
// written; tmux only on the harness's own socket. Payload bodies stay in memory and are
// never printed — failure messages carry event names and key lists only.

const (
	haikuModel = "claude-haiku-4-5-20251001"
	testToken  = "canary-token"

	sessionManaged    int64 = 42
	sessionUnauth     int64 = 43
	sessionInteract   int64 = 44
	headlessPrompt          = "Run exactly this shell command and nothing else, then stop: echo hi"
	interactivePrompt       = "say hi"
	interactiveTmuxID int64 = 99 // tmux session "muster-99" on the scratch socket
)

// offlineEnv, when set, skips every test that needs a real run — lets the canary package be
// compiled and vetted without spending tokens (`MUSTER_CANARY_OFFLINE=1 make canary`).
const offlineEnv = "MUSTER_CANARY_OFFLINE"

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
	runCOutput  string
	interactive struct {
		trustPromptSeen bool
		sessionStartAt  time.Time
		stopAt          time.Time
	}

	tmuxClient *tmux.Client
	tmuxTarget string
}

var (
	fx     fixture
	fxOnce sync.Once
)

// harness builds the fixture once per process and returns it; a build failure fails the
// calling test with the underlying error. It skips under MUSTER_CANARY_OFFLINE.
func harness(t *testing.T) *fixture {
	t.Helper()
	if os.Getenv(offlineEnv) != "" {
		t.Skipf("%s is set: not driving a real claude", offlineEnv)
	}
	fxOnce.Do(func() { fx.err = fx.build() })
	if fx.err != nil {
		t.Fatalf("canary harness failed to build: %v", fx.err)
	}
	return &fx
}

// TestMain exists only to tear the fixture down after every test has read it.
func TestMain(m *testing.M) {
	code := m.Run()
	fx.teardown()
	os.Exit(code)
}

// ---------------------------------------------------------------------------------------
// build

func (f *fixture) build() error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
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
	settingsPath := filepath.Join(f.repo, ".claude", "settings.local.json")
	if err := os.WriteFile(settingsPath, f.settings, 0o600); err != nil {
		return err
	}

	if err := f.runA(ctx); err != nil {
		return fmt.Errorf("run A (headless managed): %w", err)
	}
	if err := f.runB(ctx); err != nil {
		return fmt.Errorf("run B (headless unmanaged): %w", err)
	}
	if err := f.runC(ctx); err != nil {
		return fmt.Errorf("run C (unauthenticated StopFailure): %w", err)
	}
	if err := f.runD(ctx); err != nil {
		return fmt.Errorf("run D (interactive status line): %w", err)
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

func (f *fixture) headless(ctx context.Context, extraEnv ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "claude",
		"-p", headlessPrompt,
		"--model", haikuModel,
		"--allowedTools", "Bash",
		"--output-format", "json",
	)
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
	out, err := f.headless(ctx, fmt.Sprintf("MUSTER_SESSION=%d", sessionManaged))
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
	if _, err := f.headless(ctx); err != nil {
		return err
	}
	f.settle(2 * time.Second)
	f.runBPosts = f.count() - before
	return nil
}

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
	out, err := f.headless(ctx,
		fmt.Sprintf("MUSTER_SESSION=%d", sessionUnauth),
		"CLAUDE_CONFIG_DIR="+configDir,
	)
	f.runCOutput = out
	if err != nil {
		return err
	}
	if len(f.hookEvents(sessionUnauth)) == 0 {
		return fmt.Errorf("no hook post reached the capture server (claude output tail: %s)", tail(out))
	}
	return nil
}

func (f *fixture) runD(ctx context.Context) error {
	socket := filepath.Join(f.root, "tmux.sock")
	if err := tmux.ValidateSocket(socket); err != nil {
		socket = fmt.Sprintf("muster-canary-%d", os.Getpid()) // -L fallback
	}
	f.tmuxClient = tmux.New(socket)

	argv := claudecode.BuildArgv("claude", claudecode.LaunchParams{Model: haikuModel})
	env := map[string]string{
		"MUSTER_SESSION": fmt.Sprint(sessionInteract),
		"LANG":           "en_US.UTF-8",
		"TERM":           "xterm-256color",
	}
	target, _, err := f.tmuxClient.NewSession(ctx, interactiveTmuxID, f.repo, env, argv)
	if err != nil {
		return err
	}
	f.tmuxTarget = target
	if err := f.tmuxClient.ResizeWindow(ctx, target, 200, 50); err != nil {
		return err
	}

	// Startup blocks on the workspace-trust prompt in a never-seen directory (FINDINGS §9);
	// no hooks fire until it is answered. capture-pane is the wait oracle only.
	deadline := time.Now().Add(90 * time.Second)
	lastEnter := time.Time{}
	for time.Now().Before(deadline) {
		if c := f.firstHook(sessionInteract, "SessionStart"); c != nil {
			f.interactive.sessionStartAt = c.at
			break
		}
		pane, _ := f.tmuxClient.CapturePane(ctx, target)
		if looksLikeTrustPrompt(pane) && time.Since(lastEnter) > 3*time.Second {
			f.interactive.trustPromptSeen = true
			if err := f.sendKeys(ctx, "Enter"); err != nil {
				return err
			}
			lastEnter = time.Now()
		}
		time.Sleep(500 * time.Millisecond)
	}
	if f.interactive.sessionStartAt.IsZero() {
		return fmt.Errorf("no SessionStart within 90s (trust prompt seen: %t)", f.interactive.trustPromptSeen)
	}

	// Type and submit separately (probe skill: one combined call swallows the newline).
	time.Sleep(2 * time.Second)
	if err := f.sendKeys(ctx, interactivePrompt); err != nil {
		return err
	}
	time.Sleep(1 * time.Second)
	if err := f.sendKeys(ctx, "Enter"); err != nil {
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

	if err := f.tmuxClient.KillSession(ctx, fmt.Sprintf("muster-%d", interactiveTmuxID)); err != nil {
		return err
	}
	f.settle(2 * time.Second)
	return nil
}

func looksLikeTrustPrompt(pane string) bool {
	l := strings.ToLower(pane)
	return strings.Contains(l, "quick safety check") || strings.Contains(l, "trust the files") ||
		strings.Contains(l, "trust this folder")
}

// sendKeys is the one tmux primitive internal/tmux deliberately lacks (production never
// types into a pane); the canary needs it to answer the trust prompt and submit a prompt.
func (f *fixture) sendKeys(ctx context.Context, key string) error {
	var socketArgs []string
	if strings.Contains(f.socket(), "/") {
		socketArgs = []string{"-S", f.socket()}
	} else {
		socketArgs = []string{"-L", f.socket()}
	}
	socketArgs = append(socketArgs, "send-keys", "-t", f.tmuxTarget, key)
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

func (f *fixture) firstHook(session int64, event string) *capture {
	for _, c := range f.hookEvents(session) {
		if c.ev.Type == event {
			c := c
			return &c
		}
	}
	return nil
}

func (f *fixture) hookTypes(session int64) []string {
	var out []string
	for _, c := range f.hookEvents(session) {
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
		_ = f.tmuxClient.KillSession(ctx, fmt.Sprintf("muster-%d", interactiveTmuxID))
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
