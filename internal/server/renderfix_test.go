//go:build renderfix

package server

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderfixNormalise_Rules(t *testing.T) {
	root := "/private/var/folders/xy/renderfix-123"
	decode := func(s string) any {
		v, err := decodeFaithful([]byte(s))
		require.NoError(t, err)
		return v
	}
	in := RenderFixture{
		Scenario: "x",
		Hello: decode(`{"type":"hello","daemon":{"version":"v0.31.0-dirty"},
			"claudeCode":{"installed":"2.1.303","floor":"2.1.233","verified":"2.1.303","status":"verified"}}`),
		Snapshot: decode(`{"sessions":[
			{"id":10,"stateSince":"2026-10-20T10:00:05Z","createdAt":"2026-10-20T10:00:01Z","directory":"` + root + `/beta","title":"2026-10-20T10:00:05Z","plan":null},
			{"id":9,"stateSince":"2026-10-20T10:00:01Z","createdAt":"2026-10-20T10:00:01Z","directory":"` + root + `/alpha",
			 "attention":{"reason":"permission","since":"2026-10-20T10:00:03Z"},"endedAt":null,
			 "claudeLocation":{"directory":"` + root + `/alpha/.claude/worktrees/w"},
			 "cache":{"expiresAt":"2099-01-01T00:00:00Z","ttlSeconds":300},
			 "plan":{"path":"` + root + `/alpha/plans/x/plan.md"}}],
			"usage":{"sampledAt":"2026-10-20T10:00:09Z","fiveHour":{"resetsAt":"2026-10-20T12:00:00Z","usedPct":61.5},"modelScopedAt":null},
			"update":{"checkedAt":"not a time"}}`),
		Repos: decode(`[{"path":"` + root + `/beta","lastLaunchedAt":"2026-10-20T10:00:04Z","name":"beta"}]`),
	}

	got := normaliseRenderFixture(in, root)
	out, err := encodeRenderFixture(got)
	require.NoError(t, err)

	var back struct {
		Hello struct {
			Daemon     map[string]string `json:"daemon"`
			ClaudeCode map[string]string `json:"claudeCode"`
		} `json:"hello"`
		Snapshot struct {
			Sessions []map[string]any `json:"sessions"`
			Usage    map[string]any   `json:"usage"`
			Update   map[string]any   `json:"update"`
		} `json:"snapshot"`
		Repos []map[string]any `json:"repos"`
	}
	require.NoError(t, json.Unmarshal(out, &back))

	assert.Equal(t, "0.0.0-renderfix", back.Hello.Daemon["version"])
	assert.Equal(t, map[string]string{"installed": "2.1.303", "floor": "2.1.246", "verified": "2.1.300", "status": "verified"}, back.Hello.ClaudeCode)

	s9, s10 := back.Snapshot.Sessions[0], back.Snapshot.Sessions[1]
	assert.EqualValues(t, 9, s9["id"], "sessions sorted by id")
	assert.EqualValues(t, 10, s10["id"])
	// Session 9's keys in sorted order: attention.since (10:00:03) is seen first, then
	// cache.expiresAt (2099), then createdAt (10:00:01); stateSince repeats createdAt's
	// instant. Session 10 follows, then the snapshot's other keys, then repos.
	assert.Equal(t, "2026-01-01T00:00:00Z", s9["attention"].(map[string]any)["since"])
	assert.Equal(t, "2026-01-01T00:01:00Z", s9["cache"].(map[string]any)["expiresAt"])
	assert.Equal(t, "2026-01-01T00:02:00Z", s9["createdAt"])
	assert.Equal(t, "2026-01-01T00:02:00Z", s9["stateSince"], "equal instants stay equal")
	assert.Nil(t, s9["endedAt"])
	assert.Equal(t, "2026-01-01T00:02:00Z", s10["createdAt"])
	assert.Equal(t, "2026-01-01T00:03:00Z", s10["stateSince"])
	assert.Equal(t, "2026-10-20T10:00:05Z", s10["title"], "a timestamp under a non-time key is kept")
	assert.Equal(t, "2026-01-01T00:04:00Z", back.Snapshot.Usage["fiveHour"].(map[string]any)["resetsAt"])
	assert.Equal(t, "2026-01-01T00:05:00Z", back.Snapshot.Usage["sampledAt"])
	assert.Equal(t, 61.5, back.Snapshot.Usage["fiveHour"].(map[string]any)["usedPct"])
	assert.Nil(t, back.Snapshot.Usage["modelScopedAt"])
	assert.Equal(t, "not a time", back.Snapshot.Update["checkedAt"])
	assert.Equal(t, "2026-01-01T00:06:00Z", back.Repos[0]["lastLaunchedAt"], "repos are walked after the snapshot")

	assert.Equal(t, "/home/bob/projects/alpha", s9["directory"])
	assert.Equal(t, "/home/bob/projects/alpha/.claude/worktrees/w", s9["claudeLocation"].(map[string]any)["directory"])
	assert.Equal(t, "/home/bob/projects/alpha/plans/x/plan.md", s9["plan"].(map[string]any)["path"])
	assert.Equal(t, "/home/bob/projects/beta", back.Repos[0]["path"])
	assert.EqualValues(t, 300, s9["cache"].(map[string]any)["ttlSeconds"])
}

func TestRenderfixNormalise_LeavesForeignStringsAlone(t *testing.T) {
	in := RenderFixture{Snapshot: map[string]any{"sessions": []any{}, "prefs": map[string]any{"theme": "/home/other"}}}
	got := normaliseRenderFixture(in, "/tmp/renderfix-1")
	assert.Equal(t, "/home/other", got.Snapshot.(map[string]any)["prefs"].(map[string]any)["theme"])
	assert.Nil(t, got.Hello)
}

// TestRenderfixScenarios_GenerateDeterministically drives every scenario twice and
// requires byte-identical output, which is what `check` rests on.
func TestRenderfixScenarios_GenerateDeterministically(t *testing.T) {
	for _, name := range RenderScenarioNames() {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			first, err := GenerateRenderFixture(ctx, name)
			require.NoError(t, err)
			second, err := GenerateRenderFixture(ctx, name)
			require.NoError(t, err)
			assert.Equal(t, string(first), string(second))

			var f struct {
				Scenario string         `json:"scenario"`
				Hello    map[string]any `json:"hello"`
				Snapshot map[string]any `json:"snapshot"`
				Repos    []any          `json:"repos"`
			}
			require.NoError(t, json.Unmarshal(first, &f))
			assert.Equal(t, name, f.Scenario)
			assert.Equal(t, "hello", f.Hello["type"])
			assert.Equal(t, "snapshot", f.Snapshot["type"])
			assert.NotNil(t, f.Repos)
			assert.True(t, len(first) > 0 && first[len(first)-1] == '\n', "ends with a newline")
		})
	}
}

func TestRenderfixGenerate_UnknownScenario(t *testing.T) {
	_, err := GenerateRenderFixture(context.Background(), "nope")
	require.ErrorContains(t, err, `unknown render scenario "nope"`)
}
