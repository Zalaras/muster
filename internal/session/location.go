package session

import "strings"

// Location is where Claude is working when that is a different checkout from the launch
// directory (kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere): the
// resolved directory it last reported, and that checkout's repo readout.
type Location struct {
	Directory string
	// Repo is nil when Directory isn't a git checkout or HEAD is detached.
	Repo *LocationRepo
}

// LocationRepo is the checkout Location.Directory belongs to. Name is the basename of the
// checkout's top level.
type LocationRepo struct {
	Name       string
	Branch     string
	IsWorktree bool
}

// Elsewhere reports whether Claude's directory is a different checkout from the launch
// directory. Callers pass every path already symlink-resolved and cleaned, so this stays a
// pure rule; launchTop and claudeTop are the directories' git top levels, nil when not in a
// checkout.
//
// Inside a checkout the top levels decide, with a nil launch top counting as different. A
// worktree under the launch path's own .claude/worktrees has its own top level, so it is
// elsewhere even though its path lies inside the launch directory. Outside any checkout the
// paths decide: elsewhere unless claudeDir is launchDir or inside it.
func Elsewhere(launchTop, claudeTop *string, launchDir, claudeDir string) bool {
	if claudeTop != nil {
		return launchTop == nil || *launchTop != *claudeTop
	}
	return claudeDir != launchDir && !strings.HasPrefix(claudeDir, strings.TrimSuffix(launchDir, "/")+"/")
}

// adoptClaudeDir records the directory Claude reported (a main-agent hook's, or the status
// line's), reporting whether it changed. An absent or empty report changes nothing. The
// caller holds Manager.mu.
func adoptClaudeDir(sess *Session, cwd *string) bool {
	if cwd == nil || *cwd == "" || *cwd == sess.ClaudeDir {
		return false
	}
	sess.ClaudeDir = *cwd
	return true
}

// clearClaudeLocation forgets where Claude was: launch and resume both start it in the
// launch directory. The caller holds Manager.mu.
func (s *Session) clearClaudeLocation() {
	s.ClaudeDir = ""
	s.ClaudeLocation = nil
}
