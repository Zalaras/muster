//go:build renderfix

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

type renderScenario struct {
	name  string
	drive func(ctx context.Context, r *renderRig) error
}

var renderScenarios = []renderScenario{
	{"empty", func(context.Context, *renderRig) error { return nil }},
	{"three-states", driveThreeStates},
	{"dead-session", driveDeadSession},
	{"moved-to-worktree", driveMovedToWorktree},
	{"groups", driveGroups},
	{"long-names", driveLongNames},
	{"usage-known", driveUsageKnown},
}

const (
	renderModelSonnet = "claude-sonnet-4-5-20250929"
	renderModelOpus   = "claude-opus-4-1-20250805"
)

// bind launches a session in dir and binds a Claude session to it with a SessionStart.
func (r *renderRig) bind(ctx context.Context, dir, claudeID, modelID string, opts launchOpts) (renderSession, error) {
	s, err := r.launch(ctx, dir, opts)
	if err != nil {
		return s, err
	}
	return s, r.hook(ctx, claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, ModelID: modelID,
	}))
}

func (r *renderRig) promptSubmit(ctx context.Context, s renderSession, claudeID string) error {
	return r.hook(ctx, claudecodetest.EnvelopedHookBody(int(s.id), s.pane, "UserPromptSubmit", claudeID))
}

func driveThreeStates(ctx context.Context, r *renderRig) error {
	alpha, err := r.dir(ctx, "alpha", "main")
	if err != nil {
		return err
	}
	beta, err := r.dir(ctx, "beta", "feature/beta-rail")
	if err != nil {
		return err
	}
	gamma, err := r.dir(ctx, "gamma", "")
	if err != nil {
		return err
	}

	idle, err := r.bind(ctx, alpha, "cs-alpha", renderModelSonnet, launchOpts{title: "Alpha"})
	if err != nil {
		return err
	}
	if err = r.promptSubmit(ctx, idle, "cs-alpha"); err != nil {
		return err
	}
	if err = r.hookStamped(ctx, claudecodetest.RawStop("cs-alpha", claudecodetest.StopOpts{LastAssistantMessage: "Done: the rail card renders the new state."})); err != nil {
		return err
	}

	working, err := r.bind(ctx, beta, "cs-beta", renderModelOpus, launchOpts{permissionMode: claudecode.PermissionAcceptEdits})
	if err != nil {
		return err
	}
	r.nextSecond()
	if err = r.promptSubmit(ctx, working, "cs-beta"); err != nil {
		return err
	}

	needsInput, err := r.bind(ctx, gamma, "cs-gamma", renderModelSonnet, launchOpts{permissionMode: claudecode.PermissionPlan})
	if err != nil {
		return err
	}
	if err = r.promptSubmit(ctx, needsInput, "cs-gamma"); err != nil {
		return err
	}
	if err = r.hookStamped(ctx, claudecodetest.RawNotification("cs-gamma", "p1", "permission_prompt")); err != nil {
		return err
	}

	_, err = r.api(ctx, http.MethodPut, fmt.Sprintf("/api/sessions/%d/pin", idle.id), map[string]any{"pinned": true})
	return err
}

func driveDeadSession(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "delta", "main")
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-delta", renderModelSonnet, launchOpts{})
	if err != nil {
		return err
	}
	if err := r.promptSubmit(ctx, s, "cs-delta"); err != nil {
		return err
	}
	if err := r.hookStamped(ctx, claudecodetest.RawStop("cs-delta", claudecodetest.StopOpts{LastAssistantMessage: "Finished; closing the session."})); err != nil {
		return err
	}
	return r.markDead(ctx, s.id)
}

func driveMovedToWorktree(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "epsilon", "main")
	if err != nil {
		return err
	}
	wt, err := r.worktree(ctx, dir, "rail-polish", "plan/rail-polish")
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-epsilon", renderModelSonnet, launchOpts{})
	if err != nil {
		return err
	}
	if err := r.hook(ctx, claudecodetest.EnvelopedHookInDirectory(int(s.id), s.pane, "UserPromptSubmit", "cs-epsilon", wt)); err != nil {
		return err
	}
	if err := r.hookStamped(ctx, claudecodetest.EnvelopedHookInDirectory(int(s.id), s.pane, "Stop", "cs-epsilon", wt)); err != nil {
		return err
	}
	r.repoTick(ctx)
	return nil
}

func driveGroups(ctx context.Context, r *renderRig) error {
	names := []string{"api", "worker", "web", "notes"}
	var sessions []renderSession
	for _, name := range names {
		dir, err := r.dir(ctx, name, "main")
		if err != nil {
			return err
		}
		s, err := r.bind(ctx, dir, "cs-"+name, renderModelSonnet, launchOpts{})
		if err != nil {
			return err
		}
		sessions = append(sessions, s)
	}
	r.nextSecond()
	for _, name := range names {
		if err := r.hook(ctx, claudecodetest.RawStop("cs-"+name, claudecodetest.StopOpts{})); err != nil {
			return err
		}
	}
	var backend struct {
		ID int64 `json:"id"`
	}
	raw, err := r.api(ctx, http.MethodPost, "/api/groups", map[string]any{
		"name": "Backend", "sessionIds": []int64{sessions[0].id, sessions[1].id},
	})
	if err != nil {
		return err
	}
	if err = json.Unmarshal(raw, &backend); err != nil {
		return err
	}
	if _, err = r.api(ctx, http.MethodPost, "/api/groups", map[string]any{
		"name": "Frontend", "sessionIds": []int64{sessions[2].id},
	}); err != nil {
		return err
	}
	_, err = r.api(ctx, http.MethodPut, fmt.Sprintf("/api/groups/%d", backend.ID), map[string]any{"collapsed": true})
	return err
}

func driveLongNames(ctx context.Context, r *renderRig) error {
	folder := padName("a-project-folder-whose-name-runs-on", 60)
	branch := padName("feature/a-branch-name-that-keeps-going-well-past-the-card", 80)
	dir, err := r.dir(ctx, folder, branch)
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-long", renderModelSonnet, launchOpts{})
	if err != nil {
		return err
	}
	if err := r.promptSubmit(ctx, s, "cs-long"); err != nil {
		return err
	}
	return r.hookStamped(ctx, claudecodetest.RawStop("cs-long", claudecodetest.StopOpts{}))
}

func driveUsageKnown(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "zeta", "main")
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-zeta", renderModelSonnet, launchOpts{})
	if err != nil {
		return err
	}
	if err := r.promptSubmit(ctx, s, "cs-zeta"); err != nil {
		return err
	}
	used := 37.5
	if err := r.status(ctx, claudecodetest.EnvelopedStatusLineFull("cs-zeta", claudecodetest.StatusLineFullOpts{
		MusterSession:    int(s.id),
		TmuxPane:         s.pane,
		ModelID:          renderModelSonnet,
		ModelDisplayName: "Sonnet 4.5",
		UsedPct:          &used,
		TotalInputTokens: 75000,
		FiveHourPct:      61,
		FiveHourResetsAt: 1767229200,
		SevenDayPct:      23,
		SevenDayResetsAt: 1767657600,
		PromptCache:      &claudecodetest.PromptCacheOpts{ExpiresAt: 1767226500, TTL: "5m"},
	})); err != nil {
		return err
	}
	return r.hookStamped(ctx, claudecodetest.RawStop("cs-zeta", claudecodetest.StopOpts{}))
}

// padName extends base with a fixed letter cycle until it is exactly n characters.
func padName(base string, n int) string {
	const cycle = "abcdefghijklmnopqrstuvwxyz"
	out := []byte(base)
	for i := 0; len(out) < n; i++ {
		out = append(out, cycle[i%len(cycle)])
	}
	return string(out[:n])
}
