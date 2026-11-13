// Raw wire payloads for the decoder tests in this directory: plain object literals with no
// type, spelled key by key as the daemon sends them, because the parsers under test are the only
// thing that may give them one. One copy, so a new required key is added here once. Every other
// test gets its shapes from the factories in `testfixtures.ts` and `sessions/testfixtures.ts`.

// kb:anchor/ws.update: a fully-populated UpdateInfo, badge showing (available set, installed
// null), no apply in flight. A real daemon always sends a full object here, never an explicit
// `null`; only an older daemon omits the key, which `parseSnapshot` reads differently
// (update.test.ts), so this, not `null`, is what belongs on `validSnapshot`.
export const validUpdateInfo = {
  running: "0.10.0",
  install: "installer",
  remedy: null,
  canCheck: true,
  available: "0.11.0",
  checkedAt: "2026-09-10T20:00:00Z",
  installed: null,
  apply: { phase: "idle", version: null, error: null },
};

// A current daemon's snapshot with no sessions, default prefs and no groups.
export const validSnapshot = {
  type: "snapshot",
  sessions: [],
  usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
  prefs: {
    view: "focus",
    density: "2x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
    updateCheck: true,
    railDensity: "comfortable",
    railActivity: "turn",
  },
  claudeTheme: { family: "unknown" },
  groups: [],
  ungrouped: { pos: 0, collapsed: false },
  update: validUpdateInfo,
};

// A fully-populated Session per kb:anchor/ws.session, the baseline every parseSession and
// sessionUpsert test changes one field of.
export const validSession = {
  id: 1,
  title: "fix the thing",
  state: "working",
  stateSince: "2026-08-22T00:00:00Z",
  alive: true,
  endedAt: null,
  attention: null,
  failure: null,
  directory: "/Users/bob/code/muster",
  repo: { name: "muster", branch: "main", isWorktree: false },
  claudeLocation: null,
  addedDirs: [],
  model: { id: "claude-sonnet-4-5", displayName: "sonnet" },
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  backgroundTasks: 0,
  claudeSessionId: "claude-session-abc",
  scratchpadDir: "/private/tmp/claude-501/-Users-bob-code-muster/claude-session-abc/scratchpad",
  tmuxTarget: "muster:@1",
  firstLaunchHere: false,
  createdAt: "2026-08-22T00:00:00Z",
  pinned: false,
  railPos: 5,
  titleOverride: null,
  plan: null,
  unread: false,
  lastPrompt: null,
  groupId: null,
  effort: { level: "high" },
  effortWarning: null,
  claudeVersion: null,
  restartPending: false,
  note: null,
  cache: { expiresAt: "2026-08-22T01:00:00Z", ttlSeconds: 3600 },
};

// The measured "no data yet" shape (docs/history/spikes/canary-fields.md): a session that has
// just been launched, with no Claude session id bound yet, no repo, model, attention, failure
// or effort known, and a fully null context. This must decode (a view renders it as "unknown"),
// never be rejected and never show an empty gauge.
export const freshLaunchSession = {
  id: 2,
  title: null,
  state: "started",
  stateSince: "2026-08-22T00:00:00Z",
  alive: true,
  endedAt: null,
  attention: null,
  failure: null,
  directory: "/Users/bob/code/muster",
  repo: null,
  claudeLocation: null,
  addedDirs: [],
  model: null,
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  backgroundTasks: 0,
  claudeSessionId: null,
  scratchpadDir: null,
  tmuxTarget: "muster:@2",
  firstLaunchHere: true,
  createdAt: "2026-08-22T00:00:00Z",
  pinned: false,
  railPos: 6,
  titleOverride: null,
  plan: null,
  unread: false,
  lastPrompt: null,
  groupId: null,
  effort: null,
  effortWarning: null,
  claudeVersion: null,
  restartPending: false,
  note: null,
  cache: null,
};
