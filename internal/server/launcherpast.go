package server

import (
	"context"
	"path/filepath"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// validateResumeRequest is launchResume's pure prefix, the resume-from-list form's
// counterpart to validateLaunchRequest: directory rules first (shared with the ordinary
// form), then the combination checks the Protocol Contract's Errors section orders right
// after them — resumeSessionId empty, then resumeSessionId combined with title/model/
// permissionMode. req.ResumeSessionID is never nil here — Launch only calls
// launchResume when it is set.
func validateResumeRequest(req createSessionRequest) *launchError {
	if err := validateLaunchDirectory(req.Directory); err != nil {
		return invalidRequest(err.Error())
	}
	if *req.ResumeSessionID == "" {
		return invalidRequest("resumeSessionId must not be empty")
	}
	if req.Title != "" || req.Model != "" || req.PermissionMode != "" {
		return invalidRequest("resumeSessionId cannot be combined with title, model or permissionMode")
	}
	return nil
}

// findPastSession looks id up among sessions — launchResume's "look the id up again"
// step (the plan's end-to-end diagram): the same claudecode.PastSessions read GET
// /api/past-sessions used, re-run rather than cached, so a transcript deleted between the
// list and this POST is caught as a miss here rather than trusted stale.
func findPastSession(sessions []claudecode.PastSession, id string) (claudecode.PastSession, bool) {
	for _, s := range sessions {
		if s.ClaudeSessionID == id {
			return s, true
		}
	}
	return claudecode.PastSession{}, false
}

// launchResume is Launch's resumeSessionId branch (kb:anchor/sessions.create):
// creates a new Muster session running `claude --resume <id> --permission-mode <mode>`
// seeded from the directory's transcripts, in place of the ordinary form's model/title/
// permissionMode. Check order after validateResumeRequest matches the Protocol Contract:
// existence (the transcript lookup, 404) before already_open (409)
// (kb:adr/launch-resume-one-alive-row-per-claude-session).
func (l *sessionLauncher) launchResume(ctx context.Context, req createSessionRequest) (*session.Session, *launchError) {
	if lerr := validateResumeRequest(req); lerr != nil {
		return nil, lerr
	}
	dir := req.Directory
	claudeSessionID := *req.ResumeSessionID

	past, err := claudecode.PastSessions(l.projectsDir, dir)
	if err != nil {
		l.log.Error().Err(err).Str("directory", dir).Msg("reading past sessions for resume failed")
		return nil, launchFailed()
	}
	found, ok := findPastSession(past, claudeSessionID)
	if !ok {
		return nil, unknownClaudeSession()
	}

	// One-alive-row guard (kb:adr/launch-resume-one-alive-row-per-claude-session), held
	// across the whole check-then-spawn body below (through createAndSpawn, including
	// any id-collision retry) so a concurrent second resume of claudeSessionID — another
	// launchResume, or the Resume action reviving a dead row already bound to it — can
	// never pass its own check before this attempt's claim is settled
	// (kb:adr/launch-resume-pending-hold-persisted) — see Resume's identical lock.
	unlockClaude := l.manager.LockClaudeSession(claudeSessionID)
	defer unlockClaude()
	if aliveID, bound := l.manager.AliveByClaudeSessionID(claudeSessionID); bound {
		return nil, alreadyOpen(aliveID)
	}

	isGit, branch, isWorktree := repoContext(ctx, dir)

	// TouchRepo, not UpsertRepo: this form carries no model or Start-in choice of its
	// own, so the remembered-model/mode-unchanged guarantee (TouchRepo's own doc) needs the sibling call
	// that never writes those columns.
	repo, created, err := l.store.TouchRepo(ctx, store.TouchRepoParams{Path: dir, Name: filepath.Base(dir), IsGit: isGit})
	if err != nil {
		l.log.Error().Err(err).Str("directory", dir).Msg("recording repo failed")
		return nil, launchFailed()
	}

	if settingsErr := l.writeSettings(dir); settingsErr != nil {
		l.log.Error().Err(settingsErr).Str("directory", dir).Msg("writing launch settings failed")
		return nil, launchFailed()
	}

	// The transcript's mode, verbatim, or default when it recorded none
	// (kb:adr/launch-resume-passes-any-recorded-mode) — always sent explicitly, never
	// omitted, since omitting it follows Claude Code's own configured default rather
	// than a value this row can seed and correct
	// (kb:fact/permission-mode-no-flag-follows-configured-default). A mode the launch
	// form itself never offers (e.g. dontAsk) still reaches argv unchanged; only an
	// absent recording falls back to default.
	permMode := claudecode.PermissionDefault
	if found.PermissionMode != nil {
		permMode = *found.PermissionMode
	}

	argv := claudecode.BuildArgv(l.claudeBin, claudecode.LaunchParams{
		PermissionMode:  permMode,
		ResumeSessionID: claudeSessionID,
	})

	model := ""
	if found.Model != nil {
		model = *found.Model
	}

	return l.createAndSpawn(ctx, dir, argv, session.CreateParams{
		RepoID:                repo.ID,
		Directory:             dir,
		Branch:                branch,
		IsWorktree:            isWorktree,
		Title:                 found.Title,
		PermissionMode:        session.PermissionMode(permMode),
		Model:                 model,
		FirstLaunchHere:       created,
		ResumeClaudeSessionID: claudeSessionID,
	})
}
