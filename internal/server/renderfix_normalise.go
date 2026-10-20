//go:build renderfix

package server

import (
	"slices"
	"sort"
	"strings"
	"time"
)

// renderfixTimeKeys are the wire keys whose values are wall-clock timestamps.
var renderfixTimeKeys = map[string]bool{
	"stateSince":     true,
	"endedAt":        true,
	"createdAt":      true,
	"since":          true,
	"expiresAt":      true,
	"sampledAt":      true,
	"resetsAt":       true,
	"modelScopedAt":  true,
	"lastLaunchedAt": true,
}

// normaliseRenderFixture rewrites the parts of a recorded fixture that would differ
// between two runs or two machines, so a fixture is stable and a live daemon never
// matches it byte for byte. The rules, applied to the decoded JSON tree by field name:
//
//   - Every string under a timestamp key (stateSince, endedAt, createdAt, since,
//     expiresAt, sampledAt, modelScopedAt, resetsAt, lastLaunchedAt) that parses as
//     RFC3339 becomes 2026-01-01T00:00:00Z plus one minute per distinct original value,
//     numbered in first-seen order — snapshot.sessions sorted by id first, then the
//     rest of the tree with object keys in sorted order — so equal instants stay equal
//     and the order of events is still readable.
//   - Every string that starts with the run's temp root has that prefix replaced by
//     /home/bob/projects (directory, claudeLocation.directory, addedDirs[].directory,
//     plan.path, repos[].path).
//   - hello.daemon.version becomes 0.0.0-renderfix; hello.claudeCode.floor becomes
//     2.1.246 and hello.claudeCode.verified 2.1.300, since the real range moves with
//     every canary run.
//
// Everything else is kept as the daemon sent it.
func normaliseRenderFixture(f RenderFixture, tempRoot string) RenderFixture {
	n := &renderfixNormaliser{tempRoot: tempRoot, times: map[string]string{}}
	if snap, ok := f.Snapshot.(map[string]any); ok {
		if sessions, ok := snap["sessions"].([]any); ok {
			sortRenderSessions(sessions)
			snap["sessions"] = n.walk(sessions, "sessions")
			delete(snap, "sessions")
			f.Snapshot = n.walk(snap, "")
			snap["sessions"] = sessions
		} else {
			f.Snapshot = n.walk(snap, "")
		}
	}
	f.Hello = n.walk(f.Hello, "")
	f.Repos = n.walk(f.Repos, "")
	if hello, ok := f.Hello.(map[string]any); ok {
		setRenderString(hello, "daemon", "version", "0.0.0-renderfix")
		setRenderString(hello, "claudeCode", "floor", "2.1.246")
		setRenderString(hello, "claudeCode", "verified", "2.1.300")
	}
	return f
}

type renderfixNormaliser struct {
	tempRoot string
	times    map[string]string
}

const renderfixEpoch = "2026-01-01T00:00:00Z"

func (n *renderfixNormaliser) walk(v any, key string) any {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			t[k] = n.walk(t[k], k)
		}
		return t
	case []any:
		for i := range t {
			t[i] = n.walk(t[i], key)
		}
		return t
	case string:
		return n.str(t, key)
	default:
		return v
	}
}

func (n *renderfixNormaliser) str(s, key string) string {
	if renderfixTimeKeys[key] {
		if _, err := time.Parse(time.RFC3339, s); err == nil {
			return n.timeFor(s)
		}
	}
	if n.tempRoot != "" && strings.HasPrefix(s, n.tempRoot) {
		return renderfixPersonaRoot + strings.TrimPrefix(s, n.tempRoot)
	}
	return s
}

func (n *renderfixNormaliser) timeFor(original string) string {
	if v, ok := n.times[original]; ok {
		return v
	}
	base, _ := time.Parse(time.RFC3339, renderfixEpoch)
	v := base.Add(time.Duration(len(n.times)) * time.Minute).Format(time.RFC3339)
	n.times[original] = v
	return v
}

func sortRenderSessions(sessions []any) {
	slices.SortStableFunc(sessions, func(a, b any) int {
		return strings.Compare(renderSessionID(a), renderSessionID(b))
	})
}

// renderSessionID is a session's id as a sortable string; ids are compared by length then
// text so 10 sorts after 9.
func renderSessionID(v any) string {
	m, ok := v.(map[string]any)
	if !ok {
		return ""
	}
	id, _ := m["id"].(interface{ String() string })
	if id == nil {
		return ""
	}
	s := id.String()
	return strings.Repeat("0", 20-len(s)) + s
}

func setRenderString(m map[string]any, section, key, value string) {
	if sub, ok := m[section].(map[string]any); ok {
		if _, present := sub[key]; present {
			sub[key] = value
		}
	}
}
