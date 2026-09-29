//go:build canary

package canary

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// TestBypassPermissionModeOnWire guards kb:fact/bypass-permission-mode-on-wire on the
// unauthenticated -p path: UserPromptSubmit carries the flag value verbatim, SessionStart
// carries no permission_mode. The fact's Stop half is not reachable at zero tokens (an
// unauthenticated turn ends in StopFailure, which never carries the key), so it stays
// unguarded here.
func TestBypassPermissionModeOnWire(t *testing.T) {
	f := harness(t)

	prompt := f.firstHook(sessionUnauthBypass, "UserPromptSubmit")
	require.NotNilf(t, prompt, "UserPromptSubmit never arrived; saw %v", f.hookTypes(sessionUnauthBypass))
	assert.Equal(t, claudecode.PermissionBypass, prompt.payload["permission_mode"])

	start := f.firstHook(sessionUnauthBypass, "SessionStart")
	require.NotNilf(t, start, "SessionStart never arrived; saw %v", f.hookTypes(sessionUnauthBypass))
	assert.NotContains(t, keys(start.payload), "permission_mode")

	if failed := f.firstHook(sessionUnauthBypass, "StopFailure"); failed != nil {
		assert.NotContains(t, keys(failed.payload), "permission_mode")
	}
}

// TestBypassAcceptanceBlocksStartup guards kb:fact/bypass-acceptance-blocks-startup: an
// interactive bypassPermissions launch draws the warning with "No, exit" and produces no hook
// and no status-line post while it is unanswered. Run K never answers it, so no acceptance is
// written to the developer's user-level Claude Code state.
func TestBypassAcceptanceBlocksStartup(t *testing.T) {
	f := harness(t)
	run := f.bypassWarning
	require.NoError(t, run.err)
	require.Falsef(t, run.reachedStart,
		"a hook arrived before any warning was drawn: this machine has probably already accepted Bypass Permissions mode, so the launch skipped the dialog and this guard cannot observe it; hooks seen: %v",
		run.hooks)
	require.Truef(t, run.sawWarning,
		"no Bypass Permissions warning with a \"No, exit\" row within %s (it may already have been accepted on this machine); hooks seen: %v",
		bypassWarningWait, run.hooks)
	assert.Emptyf(t, run.hooks, "the unanswered warning must not fire hooks")
	assert.Zero(t, run.statusPosts, "the unanswered warning must not post a status line")
}

// TestResumeRestoresModelAndMode guards kb:fact/resume-restores-model-and-mode-except-plan:
// an id with no transcript exits 1 with no SessionStart, and a flagless resume keeps the
// transcript's model and title over a differing project setting. The mode half of the fact is
// not asserted: it needs a transcript whose last permission-mode line is known, which run D's
// Shift+Tab step leaves indeterminate.
func TestResumeRestoresModelAndMode(t *testing.T) {
	f := harness(t)

	t.Run("an unknown id exits 1 with no SessionStart", func(t *testing.T) {
		run := f.resumeUnknown
		require.NoError(t, run.err)
		assert.Equal(t, 1, run.exitCode)
		assert.Contains(t, run.output, resumeUnknownNeedle+": "+run.id)
		// A headless run still sends one SessionEnd (measured on 2.1.284); nothing starts.
		assert.NotContains(t, f.hookTypes(sessionResumeUnknown), "SessionStart")
		assert.Empty(t, f.statusPosts(sessionResumeUnknown))
	})

	t.Run("no flags keeps the transcript's model and title", func(t *testing.T) {
		run := f.resumeBare
		require.NoError(t, run.err)
		require.NotNil(t, run.started)
		assert.Equal(t, "resume", run.started.payload["source"])
		assert.Equal(t, run.claudeID, run.started.ev.SessionID, "resume must carry run D's session_id")

		require.NotNil(t, run.firstStatus)
		model, _ := run.firstStatus.payload["model"].(map[string]any)
		require.NotNil(t, model, "first status post carries no model object")
		assert.Equalf(t, haikuModel, model["id"],
			"the transcript's model must win over the project setting %q", resumeBareSettingsModel)
		assert.Equal(t, "Muster Canary", run.sessionName, "session_name must be run D's original --name")
	})
}

// TestTranscriptDirEncoding guards kb:fact/transcript-dir-encoding: run D's reported
// transcript_path is the production TranscriptPath for the scratch repo, whose temp directory
// sits behind the /var symlink, and the file exists there.
func TestTranscriptDirEncoding(t *testing.T) {
	f := harness(t)
	require.NotEmpty(t, f.interactive.transcriptPath, "run D reported no transcript_path")

	root, err := claudecode.ProjectsDir()
	require.NoError(t, err)
	want, err := claudecode.TranscriptPath(root, f.repo, f.preClearClaudeID())
	require.NoError(t, err)
	assert.Equal(t, want, f.interactive.transcriptPath)

	_, err = os.Stat(f.interactive.transcriptPath)
	require.NoError(t, err, "the transcript must exist where Claude Code reported it")

	// The fact's rule, applied here independently of the production encoder.
	resolved, err := filepath.EvalSymlinks(f.repo)
	require.NoError(t, err)
	encode := func(dir string) string { return regexp.MustCompile(`[^A-Za-z0-9-]`).ReplaceAllString(dir, "-") }
	assert.Equal(t, encode(resolved), filepath.Base(filepath.Dir(f.interactive.transcriptPath)))
	if resolved != f.repo {
		assert.NotEqual(t, encode(f.repo), filepath.Base(filepath.Dir(f.interactive.transcriptPath)),
			"the folder must be named for the symlink-resolved path")
	} else {
		t.Logf("scratch repo %s has no symlink in its path; resolution was not exercised", f.repo)
	}
}

// TestTranscriptSessionLines guards kb:fact/transcript-session-lines: the production reader
// finds run D's transcript in the projects folder and reads the title, model and permission
// mode lines Claude Code wrote into it.
func TestTranscriptSessionLines(t *testing.T) {
	f := harness(t)
	root, err := claudecode.ProjectsDir()
	require.NoError(t, err)
	sessions, err := claudecode.PastSessions(root, f.repo)
	require.NoError(t, err)

	var got *claudecode.PastSession
	for i := range sessions {
		if sessions[i].ClaudeSessionID == f.preClearClaudeID() {
			got = &sessions[i]
		}
	}
	require.NotNilf(t, got, "run D's session %s not among the %d past sessions found for %s",
		f.preClearClaudeID(), len(sessions), f.repo)

	require.NotNil(t, got.Title, "no title read from run D's transcript")
	assert.Equal(t, "Muster Canary", *got.Title, "--name must reach the transcript's custom-title line")
	require.NotNil(t, got.Model, "no assistant model read from run D's transcript")
	assert.Equal(t, haikuModel, *got.Model)
	// Run D's Shift+Tab step and the later resumes rewrite the mode line, so only its shape is judged.
	if got.PermissionMode != nil {
		assert.NotEmpty(t, *got.PermissionMode)
		t.Logf("run D's last recorded permission-mode line: %q", *got.PermissionMode)
	} else {
		t.Log("run D's transcript carries no permission-mode line")
	}
	assert.False(t, got.LastActiveAt.IsZero())
}
