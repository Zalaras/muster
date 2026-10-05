package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/tmux"
)

// launchBody is a valid launch request for h's directory with extra JSON members appended.
func (h *groupsHarness) launchBody(extra string) string {
	return fmt.Sprintf(`{"directory":%q,"model":"sonnet","permissionMode":"default"%s}`, h.dir, extra)
}

func (h *groupsHarness) postLaunch(extra string) *httptest.ResponseRecorder {
	h.t.Helper()
	return h.do(http.MethodPost, "/api/sessions", h.launchBody(extra))
}

// assertNothingHappened is the "both or neither" half of every refusal: no session row, no
// group row, no tmux spawn and no broadcast.
func (h *groupsHarness) assertNothingHappened(t *testing.T) {
	t.Helper()
	rows, err := h.st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "no session row")
	assert.Equal(t, h.preexistingGroups, h.groupRowCount(), "no group row was left behind")
	assert.Equal(t, 0, h.spawner.newSessionCalls, "tmux was never asked to spawn")
	assert.Empty(t, h.wire.kinds(), "nothing was broadcast, so no client was told of a group")
}

// --- refusals before any side effect ---

func TestLaunchGroup_RefusesBeforeAnySideEffect(t *testing.T) {
	long := strings.Repeat("x", 41)
	tests := []struct {
		name    string
		extra   func(g int64) string
		status  int
		code    string
		message string
	}{
		{"groupId and newGroup together", func(g int64) string { return fmt.Sprintf(`,"groupId":%d,"newGroup":"x"`, g) }, 400, "invalid_request", "groupId and newGroup cannot be combined"},
		{"a null groupId counts as present beside newGroup", func(_ int64) string { return `,"groupId":null,"newGroup":"x"` }, 400, "invalid_request", "groupId and newGroup cannot be combined"},
		{"newGroup empty", func(_ int64) string { return `,"newGroup":""` }, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"newGroup trims empty", func(_ int64) string { return `,"newGroup":"   "` }, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"newGroup over 40", func(_ int64) string { return `,"newGroup":"` + long + `"` }, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"an unknown groupId", func(_ int64) string { return `,"groupId":424242` }, 404, "unknown_group", "unknown group"},
		{"groupId a string", func(g int64) string { return fmt.Sprintf(`,"groupId":"%d"`, g) }, 400, "invalid_request", "groupId must be an integer or null"},
		{"groupId a boolean", func(_ int64) string { return `,"groupId":false` }, 400, "invalid_request", "groupId must be an integer or null"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			g := h.newGroup("Existing")
			h.preexistingGroups = 1
			h.wire.reset()

			rec := h.do(http.MethodPost, "/api/sessions", h.launchBody(tt.extra(g)))

			assertErrorResponse(t, rec, tt.status, tt.code, tt.message)
			h.assertNothingHappened(t)
		})
	}
}

// TestLaunchGroup_GroupRulesRunAfterEveryOtherRule is the contract's ordering: "after every
// existing invalid_request rule and the model pre-check, before any side effect".
func TestLaunchGroup_GroupRulesRunAfterEveryOtherRule(t *testing.T) {
	t.Run("a bad directory is reported before an unknown group", func(t *testing.T) {
		h := newGroupsHarness(t)
		body := `{"directory":"/this/does/not/exist/anywhere","model":"sonnet","permissionMode":"default","groupId":424242}`

		rec := h.do(http.MethodPost, "/api/sessions", body)

		code, _ := errorOf(t, rec)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, "invalid_request", code)
		h.assertNothingHappened(t)
	})

	t.Run("an unrecognised model is reported before an unknown group", func(t *testing.T) {
		h := newGroupsHarness(t)
		h.launcher.checkModel = func(context.Context, string, string) (claudecode.ModelVerdict, error) {
			return claudecode.ModelUnrecognised, nil
		}

		rec := h.postLaunch(`,"groupId":424242`)

		code, _ := errorOf(t, rec)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, "model_unrecognized", code)
		h.assertNothingHappened(t)
	})

	t.Run("a refused model with newGroup creates no group", func(t *testing.T) {
		h := newGroupsHarness(t)
		h.launcher.checkModel = func(context.Context, string, string) (claudecode.ModelVerdict, error) {
			return claudecode.ModelUnrecognised, nil
		}

		rec := h.postLaunch(`,"newGroup":"Hotfix"`)

		code, _ := errorOf(t, rec)
		assert.Equal(t, "model_unrecognized", code)
		h.assertNothingHappened(t)
	})
}

// --- success ---

func TestLaunchGroup_IntoAnExistingGroup(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("G")
	h.launch(nil)
	h.launch(&g)
	h.wire.reset()

	rec := h.postLaunch(fmt.Sprintf(`,"groupId":%d`, g))

	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	body := decodeBody(t, rec)
	assert.Equal(t, float64(g), body["groupId"], "D16: the 201 body carries the groupId")
	id := int64(body["id"].(float64))
	assert.Equal(t, g, h.sessionGroup(id))
	s, _ := h.mgr.Get(id)
	for _, other := range h.mgr.List() {
		if other.ID != id {
			assert.Greater(t, s.RailPos, other.RailPos, "D16: the launched session lands at the end of its section")
		}
	}
	assert.Equal(t, []string{fmt.Sprintf("sessionUpsert:%d", id)}, h.wire.kinds(), "an existing group needs no groups message")
}

func TestLaunchGroup_NoGroupAndNullGroupBothLandInUngrouped(t *testing.T) {
	for name, extra := range map[string]string{"absent": "", "null": `,"groupId":null`} {
		t.Run(name, func(t *testing.T) {
			h := newGroupsHarness(t)
			h.newGroup("G")

			rec := h.postLaunch(extra)

			require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
			assert.Nil(t, decodeBody(t, rec)["groupId"])
		})
	}
}

// TestLaunchGroup_NewGroupIsCreatedWithTheSessionAndAnnouncedFirst is D15's launch half: the
// groups message goes out before the session upsert that names it, and only one goes out.
func TestLaunchGroup_NewGroupIsCreatedWithTheSessionAndAnnouncedFirst(t *testing.T) {
	h := newGroupsHarness(t)
	h.newGroup("Existing")
	h.wire.reset()

	rec := h.postLaunch(`,"newGroup":"  Hotfix "`)

	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	body := decodeBody(t, rec)
	id := int64(body["id"].(float64))
	gid := int64(body["groupId"].(float64))
	assert.Equal(t, []string{"groups", fmt.Sprintf("sessionUpsert:%d", id)}, h.wire.kinds())
	var found map[string]any
	for _, g := range h.wire.last(t, "groups")["groups"].([]any) {
		if g.(map[string]any)["id"] == float64(gid) {
			found = g.(map[string]any)
		}
	}
	require.NotNil(t, found, "the announced list names the new group")
	assert.Equal(t, "Hotfix", found["name"], "the name is trimmed")
	assert.Equal(t, gid, h.sessionGroup(id))
	assert.Equal(t, []string{"Existing", "Hotfix", "-"}, sectionNamesOf(h), "the new group sits directly above Ungrouped")
}

func sectionNamesOf(h *groupsHarness) []string {
	groups, ungrouped := h.mgr.Groups()
	type slot struct {
		name string
		pos  int64
	}
	slots := []slot{{"-", ungrouped.Pos}}
	for _, g := range groups {
		slots = append(slots, slot{g.Name, g.Pos})
	}
	out := make([]string, len(slots))
	for _, s := range slots {
		out[s.pos] = s.name
	}
	return out
}

// --- failures after the group row exists (D10) ---

func TestLaunchGroup_ASpawnFailureLeavesNoGroupAndAnnouncesNone(t *testing.T) {
	tests := []struct {
		name  string
		setup func(h *groupsHarness)
	}{
		{"tmux refuses the spawn", func(h *groupsHarness) { h.spawner.newSessionErr = errors.New("boom: tmux spawn failed") }},
		{"every attempt collides with an orphan", func(h *groupsHarness) { h.spawner.newSessionErr = tmux.ErrSessionExists }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			tt.setup(h)

			rec := h.postLaunch(`,"newGroup":"Ghost"`)

			assertErrorResponse(t, rec, 500, "launch_failed", msgLaunchFailed)
			rows, err := h.st.ListSessions(context.Background())
			require.NoError(t, err)
			assert.Empty(t, rows)
			assert.Equal(t, 0, h.groupRowCount(), "D10: no rail_group row survives")
			assert.Empty(t, h.wire.kinds(), "D10: no groups message names the group, and no session was announced")
			groups, _ := h.mgr.Groups()
			assert.Empty(t, groups)
		})
	}
}

func TestLaunchGroup_ASpawnFailureLeavesAnExistingGroupAlone(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("Keep")
	member := h.launch(&g)
	h.wire.reset()
	h.spawner.newSessionErr = errors.New("boom")

	rec := h.postLaunch(fmt.Sprintf(`,"groupId":%d`, g))

	assertErrorResponse(t, rec, 500, "launch_failed", msgLaunchFailed)
	assert.Equal(t, []int64{g}, h.groupIDs(), "a launch that never created the group never deletes it")
	assert.Equal(t, g, h.sessionGroup(member))
	assert.Empty(t, h.wire.kinds())
}

func TestLaunchGroup_ARetriedCollisionStillCreatesExactlyOneGroup(t *testing.T) {
	h := newGroupsHarness(t)
	h.spawner.queueNewSessionErrs(tmux.ErrSessionExists)

	rec := h.postLaunch(`,"newGroup":"Once"`)

	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	assert.Equal(t, 1, h.groupRowCount(), "the retry reuses the launch's group instead of making another")
	assert.Equal(t, 1, h.wire.count("groups"))
}

func TestLaunchGroup_ARefusalAfterTheGroupRulesCreatesNoGroup(t *testing.T) {
	t.Run("a corrupt settings file", func(t *testing.T) {
		h := newGroupsHarness(t)
		require.NoError(t, os.MkdirAll(filepath.Join(h.dir, ".claude"), 0o700))
		require.NoError(t, os.WriteFile(filepath.Join(h.dir, ".claude", "settings.local.json"), []byte(`{not valid json`), 0o600))

		rec := h.postLaunch(`,"newGroup":"Ghost"`)

		assertErrorResponse(t, rec, 500, "launch_failed", msgLaunchFailed)
		h.assertNothingHappened(t)
	})
}

// TestSpawnWithRetries_AGroupDeletedBeforeTheSessionRowIs404 is the concurrent-delete case the
// pure check cannot see: the group existed when the request was checked and is gone by the time
// CreateSession runs.
func TestSpawnWithRetries_AGroupDeletedBeforeTheSessionRowIs404(t *testing.T) {
	h := newGroupsHarness(t)
	missing := int64(424242)

	_, lerr := h.launcher.spawnWithRetries(context.Background(), h.dir, []string{"claude"}, session.CreateParams{
		RepoID: h.repoID, Directory: h.dir, PermissionMode: session.PermissionDefault, Model: "sonnet", GroupID: &missing,
	})

	require.NotNil(t, lerr)
	assert.Equal(t, http.StatusNotFound, lerr.status)
	assert.Equal(t, "unknown_group", lerr.code)
	assert.Equal(t, 0, h.spawner.newSessionCalls)
}

// --- the resume-from-list form ---

// resumeFixture writes a transcript for claude session id in the harness directory and points
// the launcher at it.
func (h *groupsHarness) resumeFixture(t *testing.T, claudeID string) {
	t.Helper()
	projectsRoot := t.TempDir()
	claudecodetest.WriteTranscript(t, projectsRoot, h.dir, claudeID, claudecodetest.CwdLine(resolvedCwd(t, h.dir)))
	h.launcher.projectsDir = projectsRoot
}

func (h *groupsHarness) postResume(claudeID, extra string) *httptest.ResponseRecorder {
	h.t.Helper()
	body := fmt.Sprintf(`{"directory":%q,"resumeSessionId":%q%s}`, h.dir, claudeID, extra)
	return h.do(http.MethodPost, "/api/sessions", body)
}

func TestLaunchGroup_ResumeFormAcceptsBothKeys(t *testing.T) {
	t.Run("an existing group", func(t *testing.T) {
		h := newGroupsHarness(t)
		h.resumeFixture(t, "claude-abc")
		g := h.newGroup("G")
		h.wire.reset()

		rec := h.postResume("claude-abc", fmt.Sprintf(`,"groupId":%d`, g))

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		assert.Equal(t, float64(g), decodeBody(t, rec)["groupId"])
	})

	t.Run("a new group, announced before the session", func(t *testing.T) {
		h := newGroupsHarness(t)
		h.resumeFixture(t, "claude-abc")

		rec := h.postResume("claude-abc", `,"newGroup":"Revived"`)

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		body := decodeBody(t, rec)
		kinds := h.wire.kinds()
		require.Len(t, kinds, 2)
		assert.Equal(t, "groups", kinds[0])
		assert.Equal(t, fmt.Sprintf("sessionUpsert:%v", body["id"]), kinds[1])
		assert.NotNil(t, body["groupId"])
	})
}

// TestLaunchGroup_ResumeFormChecksTheGroupBeforeLookingUpTheTranscript: the group rules are
// the resume form's pure prefix too, so a bad group is refused before any transcript read.
func TestLaunchGroup_ResumeFormChecksTheGroupBeforeLookingUpTheTranscript(t *testing.T) {
	tests := []struct {
		name   string
		extra  string
		status int
		code   string
	}{
		{"both keys", `,"groupId":null,"newGroup":"x"`, 400, "invalid_request"},
		{"an unknown group", `,"groupId":424242`, 404, "unknown_group"},
		{"a name out of bounds", `,"newGroup":" "`, 400, "invalid_request"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			h.resumeFixture(t, "claude-real")

			// claude-missing names no transcript: were the group checked after the lookup,
			// this would be 404 unknown_claude_session instead.
			rec := h.postResume("claude-missing", tt.extra)

			code, _ := errorOf(t, rec)
			assert.Equal(t, tt.status, rec.Code)
			assert.Equal(t, tt.code, code)
			h.assertNothingHappened(t)
		})
	}
}

func TestLaunchGroup_ResumeFormFailuresCreateNoGroup(t *testing.T) {
	t.Run("an unknown transcript", func(t *testing.T) {
		h := newGroupsHarness(t)
		h.resumeFixture(t, "claude-real")

		rec := h.postResume("claude-missing", `,"newGroup":"Ghost"`)

		code, _ := errorOf(t, rec)
		assert.Equal(t, "unknown_claude_session", code)
		h.assertNothingHappened(t)
	})

	t.Run("a spawn failure", func(t *testing.T) {
		h := newGroupsHarness(t)
		h.resumeFixture(t, "claude-real")
		h.spawner.newSessionErr = errors.New("boom")

		rec := h.postResume("claude-real", `,"newGroup":"Ghost"`)

		assertErrorResponse(t, rec, 500, "launch_failed", msgLaunchFailed)
		assert.Equal(t, 0, h.groupRowCount(), "D10: no rail_group row survives")
		assert.Empty(t, h.wire.kinds())
	})
}
