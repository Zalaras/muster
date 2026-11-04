//go:build renderfix

package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"claude-restart", driveClaudeRestart},
		renderScenario{"claude-restart-queued", driveClaudeRestartQueued},
		renderScenario{"claude-restart-many", driveClaudeRestartMany},
		renderScenario{"claude-restart-down", driveClaudeRestart},
	)
}

const restartInstalledVersion = "2.1.318"

func (r *renderRig) holdInstalledClaude(ctx context.Context, installed string) {
	info := notCheckedClaudeCode()
	info.Installed = &installed
	info.Status = string(claudecode.StatusVerified)
	r.srv.claudeVersion.current = info
	r.srv.manager.SetInstalledClaude(ctx, &installed)
}

func (r *renderRig) reportVersion(ctx context.Context, s renderSession, name, version string) error {
	return r.status(ctx, claudecodetest.EnvelopedStatusLineFull("cs-"+name, claudecodetest.StatusLineFullOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, ModelID: renderModelSonnet, ModelDisplayName: "Sonnet 4.5",
		Version: version,
	}))
}

func (r *renderRig) restartSessions(ctx context.Context) (planning renderSession, err error) {
	idle, err := r.idleSession(ctx, "flaky-e2e-hunt")
	if err != nil {
		return planning, err
	}
	if err = r.reportVersion(ctx, idle, "flaky-e2e-hunt", "2.1.317"); err != nil {
		return planning, err
	}

	failed, err := r.workingSession(ctx, "migration-dry-run")
	if err != nil {
		return planning, err
	}
	if err = r.hookStamped(ctx, claudecodetest.RawStopFailure("cs-migration-dry-run", claudecodetest.StopFailureOpts{})); err != nil {
		return planning, err
	}
	if err = r.reportVersion(ctx, failed, "migration-dry-run", "2.1.316"); err != nil {
		return planning, err
	}

	working, err := r.workingSession(ctx, "rail-card-polish")
	if err != nil {
		return planning, err
	}
	if err = r.reportVersion(ctx, working, "rail-card-polish", "2.1.317"); err != nil {
		return planning, err
	}

	tasks, err := r.stoppedWith(ctx, "log-tail-watch", claudecodetest.StopOpts{RunningShells: 2})
	if err != nil {
		return planning, err
	}
	if err = r.reportVersion(ctx, tasks, "log-tail-watch", "2.1.317"); err != nil {
		return planning, err
	}

	blocked, err := r.blockedSession(ctx, "deploy-approval")
	if err != nil {
		return planning, err
	}
	if err = r.reportVersion(ctx, blocked, "deploy-approval", "2.1.317"); err != nil {
		return planning, err
	}

	planning, err = r.planningSession(ctx, "auth-rework-plan")
	if err != nil {
		return planning, err
	}
	if err = r.reportVersion(ctx, planning, "auth-rework-plan", "2.1.317"); err != nil {
		return planning, err
	}

	current, err := r.idleSession(ctx, "already-current")
	if err != nil {
		return planning, err
	}
	return planning, r.reportVersion(ctx, current, "already-current", restartInstalledVersion)
}

func (r *renderRig) planningSession(ctx context.Context, name string) (renderSession, error) {
	dir, err := r.dir(ctx, name, "main")
	if err != nil {
		return renderSession{}, err
	}
	s, err := r.bind(ctx, dir, "cs-"+name, renderModelSonnet, launchOpts{title: name, permissionMode: claudecode.PermissionPlan})
	if err != nil {
		return s, err
	}
	return s, r.hook(ctx, claudecodetest.RawUserPromptSubmit("cs-"+name, claudecodetest.PromptSubmitOpts{PermissionMode: claudecode.PermissionPlan}))
}

func (r *renderRig) confirmRestart(ctx context.Context, ids ...int64) error {
	_, err := r.api(ctx, http.MethodPost, "/api/sessions/restart", map[string]any{"ids": ids})
	return err
}

func driveClaudeRestart(ctx context.Context, r *renderRig) error {
	r.holdInstalledClaude(ctx, restartInstalledVersion)
	planning, err := r.restartSessions(ctx)
	if err != nil {
		return err
	}
	if err = r.confirmRestart(ctx, planning.id); err != nil {
		return err
	}
	_, err = r.endedTitled(ctx, "retired-spike")
	return err
}

func driveClaudeRestartQueued(ctx context.Context, r *renderRig) error {
	r.holdInstalledClaude(ctx, restartInstalledVersion)
	var ids []int64
	for _, name := range []string{"queue-one", "queue-two"} {
		s, err := r.workingSession(ctx, name)
		if err != nil {
			return err
		}
		if err = r.reportVersion(ctx, s, name, "2.1.317"); err != nil {
			return err
		}
		ids = append(ids, s.id)
	}
	return r.confirmRestart(ctx, ids...)
}

func driveClaudeRestartMany(ctx context.Context, r *renderRig) error {
	r.holdInstalledClaude(ctx, restartInstalledVersion)
	for i := 1; i <= 7; i++ {
		for _, kind := range []string{"idle", "working"} {
			name := fmt.Sprintf("%s-session-%d", kind, i)
			var s renderSession
			var err error
			if kind == "idle" {
				s, err = r.idleSession(ctx, name)
			} else {
				s, err = r.workingSession(ctx, name)
			}
			if err != nil {
				return err
			}
			if err = r.reportVersion(ctx, s, name, "2.1.317"); err != nil {
				return err
			}
		}
	}
	return nil
}
