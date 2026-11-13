// Unit-test factories for the wire shapes this directory owns, beside
// `sessions/testfixtures.ts` (Session). Each returns a complete, valid object and takes the
// fields a test is about as overrides. The decoder tests here keep their raw wire literals —
// spelling the whole payload out is their job.
import { emptyGroupsFields, type Group, type UngroupedLayout } from "./groups";
import { type ClaudeCodeInfo, type Hello, PROTOCOL_VERSION } from "./hello";
import type { Snapshot } from "./messages";
import { PREF_DEFAULTS } from "./prefs";
import type { UpdateInfo } from "./update";
import { UNKNOWN_USAGE } from "./usage";

/** An installer-managed daemon on 0.10.0 that can check, with nothing available and no apply
 * under way. */
export function makeUpdateInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    running: "0.10.0",
    install: "installer",
    remedy: null,
    canCheck: true,
    available: null,
    checkedAt: null,
    installed: null,
    apply: { phase: "idle", version: null, error: null },
    ...overrides,
  };
}

/** Claude Code 2.1.267 installed, inside the verified range 2.1.246–2.1.267. */
export function makeClaudeCodeInfo(overrides: Partial<ClaudeCodeInfo> = {}): ClaudeCodeInfo {
  return {
    installed: "2.1.267",
    floor: "2.1.246",
    verified: "2.1.267",
    status: "verified",
    ...overrides,
  };
}

/** A hello this client supports, from daemon 0.1.0 with a verified Claude Code. */
export function makeHello(overrides: Partial<Omit<Hello, "type">> = {}): Hello {
  return {
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    daemon: { version: "0.1.0" },
    claudeCode: makeClaudeCodeInfo(),
    ...overrides,
  };
}

/** An expanded group named `group-<id>`; `pos` follows `id` unless overridden. */
export function makeGroup(overrides: Partial<Group> & { id: number }): Group {
  return {
    name: `group-${overrides.id}`,
    pos: overrides.id,
    collapsed: false,
    ...overrides,
  };
}

/** The Ungrouped section in first place, expanded. */
export function makeUngrouped(overrides: Partial<UngroupedLayout> = {}): UngroupedLayout {
  return { pos: 0, collapsed: false, ...overrides };
}

/** What a current daemon sends a first connection before anything has happened: no sessions,
 * unknown usage, the default prefs, no groups, and no update information. Built from the
 * product's own defaults, so a test needing a whole `Prefs` or `Usage` spreads `PREF_DEFAULTS`
 * or `UNKNOWN_USAGE` the same way. */
export function makeSnapshot(overrides: Partial<Omit<Snapshot, "type">> = {}): Snapshot {
  return {
    type: "snapshot",
    sessions: [],
    usage: { ...UNKNOWN_USAGE },
    prefs: { ...PREF_DEFAULTS },
    claudeTheme: { family: "unknown" },
    update: null,
    ...emptyGroupsFields(),
    ...overrides,
  };
}
