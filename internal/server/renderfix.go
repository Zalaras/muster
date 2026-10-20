//go:build renderfix

// Render fixtures are recorded from a real Server driven in-process, never written by
// hand (kb:adr/process-render-fixtures-generated-from-daemon). The rig below runs no
// tmux and no claude: panes are an in-memory table, hooks and status lines are posted
// to the ingest routes, and the ingest worker is drained synchronously in place of Start.
package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/selfupdate"
	"github.com/Zalaras/muster/internal/store"
)

const (
	renderfixUIToken     = "renderfix-ui-token"
	renderfixIngestToken = "renderfix-ingest-token"
	renderfixPersonaRoot = "/home/bob/projects"
)

// RenderFixture is one scenario's recorded `hello` and `snapshot` frames, the
// `GET /api/repos` body and the reader's documents, in the order the fixture file carries them.
type RenderFixture struct {
	Scenario string `json:"scenario"`
	Hello    any    `json:"hello"`
	Snapshot any    `json:"snapshot"`
	Repos    any    `json:"repos"`
	// Reader is one entry per session whose `GET /api/sessions/{id}/reader` answered 200:
	// `{sessionId, listing, files: [{path, body}]}`, every document the listing names (and
	// the plan when it exists) read through `GET …/reader/file`, so a render test can open the
	// docs surface and its find bar (kb:anchor/sessions.reader, kb:anchor/sessions.reader-file).
	Reader any `json:"reader"`
}

// RenderScenarioNames lists every scenario in generation order.
func RenderScenarioNames() []string {
	names := make([]string, 0, len(renderScenarios))
	for _, sc := range renderScenarios {
		names = append(names, sc.name)
	}
	return names
}

// GenerateRenderFixture drives the named scenario against a fresh Server and returns the
// normalised fixture file's bytes.
func GenerateRenderFixture(ctx context.Context, name string) ([]byte, error) {
	var scenario *renderScenario
	for i := range renderScenarios {
		if renderScenarios[i].name == name {
			scenario = &renderScenarios[i]
		}
	}
	if scenario == nil {
		return nil, fmt.Errorf("unknown render scenario %q", name)
	}
	rig, err := newRenderRig() //nolint:contextcheck // New is the production constructor: it takes no context, and the update feature it builds is disabled here
	if err != nil {
		return nil, err
	}
	defer rig.close()
	if err = scenario.drive(ctx, rig); err != nil {
		return nil, fmt.Errorf("scenario %s: %w", name, err)
	}
	fixture, err := rig.capture(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("scenario %s: %w", name, err)
	}
	return encodeRenderFixture(fixture)
}

func encodeRenderFixture(fixture RenderFixture) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(fixture); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// renderTmux is the paneSpawner for a run with no tmux at all.
type renderTmux struct {
	mu    sync.Mutex
	panes map[string]bool
	next  int
}

func newRenderTmux() *renderTmux { return &renderTmux{panes: map[string]bool{}} }

func (f *renderTmux) NewSession(_ context.Context, id int64, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.next++
	target = fmt.Sprintf("muster-%d:@%d", id, f.next)
	f.panes[target] = true
	return target, fmt.Sprintf("%%%d", f.next), nil
}

func (f *renderTmux) NewNamedSession(_ context.Context, name, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.next++
	f.panes[name] = true
	return name, fmt.Sprintf("%%%d", f.next), nil
}

func (f *renderTmux) PaneExists(_ context.Context, target string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.panes[target], nil
}

func (f *renderTmux) KillWindow(_ context.Context, target string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.panes, target)
	return nil
}

func (f *renderTmux) KillSession(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.panes, name)
	return nil
}

func (f *renderTmux) MaxSessionID(context.Context) (int64, error) { return 0, nil }

// renderRig is one scenario's Server plus the temp root its session directories live in.
type renderRig struct {
	srv  *Server
	st   *store.Store
	root string
	// lastStep is the wall-clock second the previous step finished in; every step runs in a
	// later second (see freshSecond).
	lastStep int64
}

func newRenderRig() (*renderRig, error) {
	root, err := os.MkdirTemp("", "renderfix-")
	if err != nil {
		return nil, err
	}
	// Resolved once so every path the daemon records (ResolvePath resolves symlinks for
	// claudeLocation) shares one prefix the normaliser can strip.
	if resolved, resolveErr := filepath.EvalSymlinks(root); resolveErr == nil {
		root = resolved
	}
	for _, sub := range []string{"_webdist", "_projects"} {
		if err = os.Mkdir(filepath.Join(root, sub), 0o755); err != nil {
			_ = os.RemoveAll(root)
			return nil, err
		}
	}
	st, err := store.Open(context.Background(), filepath.Join(root, "muster.db"), zerolog.Nop())
	if err != nil {
		_ = os.RemoveAll(root)
		return nil, err
	}
	srv := New(Config{
		Store:         st,
		Logger:        zerolog.Nop(),
		UIToken:       renderfixUIToken,
		IngestToken:   renderfixIngestToken,
		WebDist:       filepath.Join(root, "_webdist"),
		DaemonVersion: "renderfix",
		TmuxClient:    newRenderTmux(),
		Launch: LaunchConfig{
			ClaudeBin:        "/bin/true",
			HookScript:       "/bin/true",
			StatusLineScript: "/bin/true",
			BrowseRoot:       root,
			ProjectsDir:      filepath.Join(root, "_projects"),
		},
		// cmd/musterd classifies the binary at startup and the dashboard's parser accepts only
		// a classified kind, so an unset Install here makes every snapshot unparseable.
		Update: UpdateConfig{Install: selfupdate.Install{Kind: selfupdate.KindDev}},
	})
	srv.launch.launcher.checkModel = nil
	installed := "2.1.300"
	info := notCheckedClaudeCode()
	info.Installed = &installed
	info.Status = string(claudecode.StatusVerified)
	srv.claudeVersion.current = info
	return &renderRig{srv: srv, st: st, root: root}, nil
}

func (r *renderRig) close() {
	_ = r.st.Close()
	_ = os.RemoveAll(r.root)
}

// dir creates <root>/<name>; branch non-empty makes it a git checkout on that branch.
func (r *renderRig) dir(ctx context.Context, name, branch string) (string, error) {
	dir := filepath.Join(r.root, name)
	if err := os.Mkdir(dir, 0o755); err != nil {
		return "", err
	}
	if branch == "" {
		return dir, nil
	}
	if err := r.git(ctx, dir, "init", "-q", "-b", branch); err != nil {
		return "", err
	}
	if err := r.git(ctx, dir, "commit", "-q", "--allow-empty", "-m", "init"); err != nil {
		return "", err
	}
	return dir, nil
}

// writeDoc writes a markdown file at <dir>/<rel>, creating parents, for the reader to list.
func (r *renderRig) writeDoc(dir, rel, body string) error {
	path := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(body), 0o644)
}

// worktree adds a linked worktree of dir at <dir>/.claude/worktrees/<name> on a new branch.
func (r *renderRig) worktree(ctx context.Context, dir, name, branch string) (string, error) {
	path := filepath.Join(dir, ".claude", "worktrees", name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	if err := r.git(ctx, dir, "worktree", "add", "-q", "-b", branch, path); err != nil {
		return "", err
	}
	return path, nil
}

// git runs one command with the developer's own git config shut out, so a fixture never
// depends on the machine it was recorded on.
func (r *renderRig) git(ctx context.Context, dir string, args ...string) error {
	full := append([]string{
		"-c", "user.name=bob", "-c", "user.email=bob@example.invalid", "-c", "commit.gpgsign=false",
	}, args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

// api fires one cookie-authed request at the mux and returns the decoded body; a
// non-2xx status is an error carrying the body. A mutating call is a step of its own
// (freshSecond); a GET stamps nothing and runs at once.
func (r *renderRig) api(ctx context.Context, method, path string, body any) (json.RawMessage, error) {
	if method != http.MethodGet {
		r.freshSecond()
		defer r.stepDone()
	}
	return r.apiRaw(ctx, method, path, body)
}

// apiRaw is api without the step bookkeeping, for a caller that is itself the step.
func (r *renderRig) apiRaw(ctx context.Context, method, path string, body any) (json.RawMessage, error) {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	}
	req := httptest.NewRequestWithContext(ctx, method, path, reader)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: renderfixUIToken})
	rec := httptest.NewRecorder()
	r.srv.Handler().ServeHTTP(rec, req)
	if rec.Code < 200 || rec.Code >= 300 {
		return nil, fmt.Errorf("%s %s: %d %s", method, path, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	return json.RawMessage(rec.Body.Bytes()), nil
}

// renderSession is one launched session: its id, and the pane an enveloped post must name.
type renderSession struct {
	id   int64
	pane string
}

type launchOpts struct {
	title          string
	model          string
	permissionMode string
	// effort, when non-empty, is the request's `effort` (kb:anchor/sessions.create).
	effort string
}

// freshSecond makes the step that follows run in a wall-clock second no earlier step
// touched, with at least half of that second still ahead of it. The daemon stamps rows with
// time.Now at one-second wire resolution and the normaliser numbers distinct instants in
// first-seen order, so the fixture is stable only if the set of steps sharing a second is
// the same on every run — and a step's duration varies with machine load. Giving every
// step its own second removes the sharing altogether: a slow step only shifts the seconds
// after it, which the normaliser renumbers to the same values. The caller records the
// second the step finished in (stepDone), so a step that spilled past its own second still
// keeps the next one apart.
func (r *renderRig) freshSecond() {
	for {
		now := time.Now()
		if now.Unix() > r.lastStep && now.Nanosecond() < int(500*time.Millisecond) {
			return
		}
		time.Sleep(time.Until(now.Truncate(time.Second).Add(time.Second)))
	}
}

// stepDone records the second a step finished in; freshSecond waits past it.
func (r *renderRig) stepDone() { r.lastStep = time.Now().Unix() }

// nextSecond is freshSecond for a caller that stamps its own step.
func (r *renderRig) nextSecond() { r.freshSecond() }

func (r *renderRig) launch(ctx context.Context, dir string, opts launchOpts) (renderSession, error) {
	r.freshSecond()
	defer r.stepDone()
	if opts.model == "" {
		opts.model = "sonnet"
	}
	if opts.permissionMode == "" {
		opts.permissionMode = claudecode.PermissionDefault
	}
	body := map[string]any{"directory": dir, "model": opts.model, "permissionMode": opts.permissionMode}
	if opts.title != "" {
		body["title"] = opts.title
	}
	if opts.effort != "" {
		body["effort"] = opts.effort
	}
	raw, err := r.apiRaw(ctx, http.MethodPost, "/api/sessions", body)
	if err != nil {
		return renderSession{}, err
	}
	var wire struct {
		ID int64 `json:"id"`
	}
	if err = json.Unmarshal(raw, &wire); err != nil {
		return renderSession{}, err
	}
	pane, ok := r.srv.manager.PaneOf(wire.ID)
	if !ok {
		return renderSession{}, fmt.Errorf("session %d has no recorded pane", wire.ID)
	}
	// The launch stamped the repo row and the session row with two clock reads; the repo's
	// lastLaunchedAt follows the session's createdAt so the launch is one instant on the wire
	// whatever the machine's load (store.AlignRepoLaunchedAt).
	row, err := r.st.GetSession(ctx, wire.ID)
	if err != nil {
		return renderSession{}, err
	}
	if err = r.st.AlignRepoLaunchedAt(ctx, row.Directory, row.CreatedAt); err != nil {
		return renderSession{}, err
	}
	return renderSession{id: wire.ID, pane: pane}, nil
}

// hook and status post one body to the ingest route and process it before returning; each
// is a step in its own second.
func (r *renderRig) hook(ctx context.Context, body string) error {
	return r.ingest(ctx, claudecode.IngestHookPath(renderfixIngestToken), body)
}

// hookStamped is hook: every post has its own second now; the name survives for the
// scenarios that marked the post whose timestamp the fixture keeps.
func (r *renderRig) hookStamped(ctx context.Context, body string) error {
	return r.hook(ctx, body)
}

func (r *renderRig) status(ctx context.Context, body string) error {
	return r.ingest(ctx, claudecode.IngestStatusPath(renderfixIngestToken), body)
}

func (r *renderRig) ingest(ctx context.Context, path, body string) error {
	r.freshSecond()
	defer r.stepDone()
	req := httptest.NewRequestWithContext(ctx, http.MethodPost, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	r.srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		return fmt.Errorf("POST %s: %d", path, rec.Code)
	}
	r.drainIngest() //nolint:contextcheck // process owns its context, as on the ingest worker: a post outlives the request that queued it
	return nil
}

// drainIngest processes every queued post on the caller's goroutine — the ingest worker
// Start would otherwise run.
func (r *renderRig) drainIngest() {
	q := r.srv.ingest.queue
	for {
		select {
		case job := <-q.ch:
			q.process(job)
		default:
			return
		}
	}
}

// markDead ends a session the way a liveness tick would, without the tick.
func (r *renderRig) markDead(ctx context.Context, id int64) error {
	r.freshSecond()
	defer r.stepDone()
	row, err := r.st.GetSession(ctx, id)
	if err != nil {
		return err
	}
	row.Alive = false
	now := time.Now().UTC()
	row.EndedAt = &now
	if err := r.st.UpdateSession(ctx, row); err != nil {
		return err
	}
	return r.srv.manager.LoadAll(ctx)
}

// repoTick runs the repo poll once — the step Start's poller would take after a cwd change.
func (r *renderRig) repoTick(ctx context.Context) { r.srv.repoRefresh.tick(ctx) }

// capture records the reader's documents, the first two /ws frames and GET /api/repos,
// then normalises them. The reader comes first: its listing runs the transcript scan that
// may upsert a plan, which the snapshot should then carry.
func (r *renderRig) capture(ctx context.Context, scenario string) (RenderFixture, error) {
	reader, err := r.captureReader(ctx)
	if err != nil {
		return RenderFixture{}, err
	}
	ts := httptest.NewServer(r.srv.Handler())
	defer ts.Close()

	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	header := http.Header{"Cookie": {cookieName + "=" + renderfixUIToken}}
	conn, _, err := websocket.Dial(dialCtx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws", &websocket.DialOptions{HTTPHeader: header}) //nolint:bodyclose // coder/websocket Dial nils out resp.Body on success (dial.go); there is nothing to close
	if err != nil {
		return RenderFixture{}, fmt.Errorf("dialing /ws: %w", err)
	}
	defer func() { _ = conn.CloseNow() }()

	var frames [2]any
	for i := range frames {
		_, data, readErr := conn.Read(dialCtx)
		if readErr != nil {
			return RenderFixture{}, fmt.Errorf("reading /ws frame %d: %w", i+1, readErr)
		}
		if frames[i], err = decodeFaithful(data); err != nil {
			return RenderFixture{}, err
		}
	}
	reposRaw, err := r.api(ctx, http.MethodGet, "/api/repos", nil)
	if err != nil {
		return RenderFixture{}, err
	}
	repos, err := decodeFaithful(reposRaw)
	if err != nil {
		return RenderFixture{}, err
	}
	fixture := RenderFixture{Scenario: scenario, Hello: frames[0], Snapshot: frames[1], Repos: repos, Reader: reader}
	return normaliseRenderFixture(fixture, r.root), nil
}

// captureReader records, per session in id order, the reader listing and each document it
// names. A session whose directory is gone answers 409 and is left out, as the dashboard
// would show its error state from the live daemon only.
func (r *renderRig) captureReader(ctx context.Context) (any, error) {
	rows, err := r.st.ListSessions(ctx)
	if err != nil {
		return nil, err
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	recordings := make([]any, 0, len(rows))
	for _, row := range rows {
		raw, err := r.api(ctx, http.MethodGet, fmt.Sprintf("/api/sessions/%d/reader", row.ID), nil)
		if err != nil {
			if strings.Contains(err.Error(), ": 409 ") {
				continue
			}
			return nil, err
		}
		listing, err := decodeFaithful(raw)
		if err != nil {
			return nil, err
		}
		files, err := r.captureReaderFiles(ctx, row.ID, listing)
		if err != nil {
			return nil, err
		}
		recordings = append(recordings, map[string]any{
			"sessionId": json.Number(strconv.FormatInt(row.ID, 10)),
			"listing":   listing,
			"files":     files,
		})
	}
	return recordings, nil
}

// captureReaderFiles reads every path the listing names — `directory` joined with each
// `files[i].path`, and `plan.path` when the plan exists — as `[{path, body}]`.
func (r *renderRig) captureReaderFiles(ctx context.Context, id int64, listing any) ([]any, error) {
	m, _ := listing.(map[string]any)
	dir, _ := m["directory"].(string)
	var paths []string
	if plan, ok := m["plan"].(map[string]any); ok {
		if exists, _ := plan["exists"].(bool); exists {
			if p, ok := plan["path"].(string); ok {
				paths = append(paths, p)
			}
		}
	}
	if files, ok := m["files"].([]any); ok {
		for _, f := range files {
			if fm, ok := f.(map[string]any); ok {
				if rel, ok := fm["path"].(string); ok {
					paths = append(paths, filepath.Join(dir, filepath.FromSlash(rel)))
				}
			}
		}
	}
	out := make([]any, 0, len(paths))
	for _, p := range paths {
		body, err := r.api(ctx, http.MethodGet, "/api/sessions/"+strconv.FormatInt(id, 10)+"/reader/file?path="+url.QueryEscape(p), nil)
		if err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"path": p, "body": string(body)})
	}
	return out, nil
}

// decodeFaithful keeps numbers as their wire text, so re-encoding changes no digit.
func decodeFaithful(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	return v, nil
}
