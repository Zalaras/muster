package triage

// Schema is the allowlist of snapshot leaves, one row per dotted JSON path. Nothing here
// confers trust: an author may edit their own issue body forever, so a snapshot is only
// untrusted text that happens to have a shape we own. What the shape buys is a strict
// parser — every value that survives is a bounded scalar, and a bounded scalar cannot
// carry a payload.
//
// The schema is a UNION of every shape musterd has ever emitted, not a mirror of the
// current struct. Issue #9 carries claudeCode.{pinned,drift}; internal/server/issue.go
// now emits claudeCode.{floor,verified,status}. Rows for shapes no longer emitted are
// marked Retired so a future tidy-up cannot quietly delete them and start dropping fields
// on every old issue. internal/server/issue_snapshot_drift_test.go asserts the other
// direction: every path the server can emit has a row here.
//
// An ordered slice rather than a map, because RenderSnapshotTable must be deterministic.
var Schema = []Field{
	{Path: "capturedAt", Kind: KindString, Check: CheckRFC3339},
	{Path: "scope", Kind: KindString, Check: CheckEnum("session", "dashboard")},

	{Path: "musterd.version", Kind: KindString, Check: CheckVersion},

	{Path: "claudeCode.installed", Kind: KindString, Check: CheckVersion},
	{Path: "claudeCode.floor", Kind: KindString, Check: CheckVersion},
	{Path: "claudeCode.verified", Kind: KindString, Check: CheckVersion},
	{Path: "claudeCode.status", Kind: KindString, Check: CheckToken(32)},
	{Path: "claudeCode.pinned", Kind: KindString, Check: CheckVersion, Retired: true},
	{Path: "claudeCode.drift", Kind: KindBool, Check: CheckBool, Retired: true},

	{Path: "host.os", Kind: KindString, Check: CheckEnum("darwin", "linux", "windows")},
	{Path: "host.arch", Kind: KindString, Check: CheckEnum("amd64", "arm64", "386", "arm")},

	{Path: "dashboard.sessionsTotal", Kind: KindInt, Check: CheckIntRange(0, 1e6)},
	{Path: "dashboard.sessionsAlive", Kind: KindInt, Check: CheckIntRange(0, 1e6)},
	{Path: "dashboard.view", Kind: KindString, Check: CheckToken(32)},
	{Path: "dashboard.density", Kind: KindString, Check: CheckToken(32)},
	{Path: "dashboard.railSort", Kind: KindString, Check: CheckToken(32)},

	{Path: "session.state", Kind: KindString, Check: CheckToken(32)},
	{Path: "session.stateSince", Kind: KindString, Check: CheckRFC3339},
	{Path: "session.alive", Kind: KindBool, Check: CheckBool},
	{Path: "session.endedAt", Kind: KindString, Check: CheckRFC3339},
	{Path: "session.attention.reason", Kind: KindString, Check: CheckToken(64)},
	{Path: "session.attention.since", Kind: KindString, Check: CheckRFC3339},
	{Path: "session.failure.error", Kind: KindString, Check: CheckToken(128)},
	{Path: "session.model.id", Kind: KindString, Check: CheckToken(64)},
	{Path: "session.permissionMode.value", Kind: KindString, Check: CheckToken(32)},
	{Path: "session.permissionMode.source", Kind: KindString, Check: CheckToken(32)},
	{Path: "session.context.usedPct", Kind: KindFloat, Check: CheckFloatRange(0, 100)},
	{Path: "session.context.totalInputTokens", Kind: KindInt, Check: CheckIntRange(0, 1e15)},
	{Path: "session.context.windowSize", Kind: KindInt, Check: CheckIntRange(0, 1e15)},
	{Path: "session.compactions", Kind: KindInt, Check: CheckIntRange(0, 1e6)},
	{Path: "session.tmuxTarget", Kind: KindString, Check: CheckToken(64)},
	{Path: "session.createdAt", Kind: KindString, Check: CheckRFC3339},
	{Path: "session.claudeSessionIdBound", Kind: KindBool, Check: CheckBool},
	{Path: "session.events.firstSeq", Kind: KindInt, Check: CheckIntRange(0, 1e12)},
	{Path: "session.events.lastSeq", Kind: KindInt, Check: CheckIntRange(0, 1e12)},
	{Path: "session.events.count", Kind: KindInt, Check: CheckIntRange(0, 1e12)},
	{Path: "session.events.lastReceivedAt", Kind: KindString, Check: CheckRFC3339},
	{Path: "session.events.recentTypes", Kind: KindStringSlice, Check: CheckTokenSlice(32, 48)},
}

// Field is one allowlisted leaf.
type Field struct {
	Path    string
	Kind    Kind
	Check   CheckFunc
	Retired bool
}

var schemaIndex = func() map[string]Field {
	m := make(map[string]Field, len(Schema))
	for _, f := range Schema {
		m[f.Path] = f
	}
	return m
}()

// LookupField finds the row for a dotted path.
func LookupField(path string) (Field, bool) {
	f, ok := schemaIndex[path]
	return f, ok
}
