import type { Session } from "../protocol/session";
import type { RestartPanelModel } from "../render/restartpanel";
import { displayTitle } from "../sessions/card";
import { readJson, type StorageLike, writeJson } from "../storage";
import { isFree, isOfferedRestart, restartReason, sessionsRunOlder } from "./restartplan";

const IGNORE_KEY = "muster.claude-restart-ignored";

export interface RestartNotice {
  installed: string;
  behind: readonly Session[];
  pending: readonly Session[];
  label: string;
}

type Triple = readonly [number, number, number];

function parseTriple(version: string): Triple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number {
  const left = parseTriple(a);
  const right = parseTriple(b);
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function behindLabel(oldest: string, installed: string): string {
  const from = parseTriple(oldest);
  const to = parseTriple(installed);
  if (from !== null && to !== null && from[0] === to[0] && from[1] === to[1]) {
    return `claude ${oldest}→${to[2]}`;
  }
  return `claude →${installed}`;
}

function oldestRunning(sessions: readonly Session[]): string {
  const versions = sessions.flatMap((s) => (s.claudeVersion ? [s.claudeVersion.running] : []));
  return [...versions].sort(compareVersions)[0] ?? "";
}

export function deriveRestartNotice(
  sessions: readonly Session[],
  installed: string | null,
  ignored: boolean,
): RestartNotice | null {
  if (installed === null) return null;
  const pending = sessions.filter((s) => s.alive && s.restartPending);
  const behind = ignored ? [] : sessions.filter(isOfferedRestart);
  if (behind.length === 0 && pending.length === 0) return null;
  const label =
    behind.length > 0
      ? behindLabel(oldestRunning(behind), installed)
      : `claude ↻${pending.length} queued`;
  return { installed, behind, pending, label };
}

export function buildPanelModel(notice: RestartNotice): RestartPanelModel {
  const now = notice.behind.filter(isFree).length;
  return {
    head: `Claude Code ${notice.installed}`,
    behind:
      notice.behind.length === 0
        ? null
        : {
            intro: `${sessionsRunOlder(notice.behind.length)} an older version and pick${notice.behind.length === 1 ? "s" : ""} it up only when restarted.`,
            now,
            whenFree: notice.behind.length - now,
          },
    queued:
      notice.pending.length === 0
        ? null
        : {
            heading: `Restart when free · ${notice.pending.length}`,
            rows: notice.pending.map((s) => ({
              id: s.id,
              title: displayTitle(s),
              reason: restartReason(s),
            })),
          },
  };
}

export function readIgnoredInstalled(storage: Pick<StorageLike, "getItem">): string | null {
  return readJson(
    storage,
    IGNORE_KEY,
    (value) => (typeof value === "string" && value !== "" ? value : null),
    null,
  );
}

export function writeIgnoredInstalled(
  storage: Pick<StorageLike, "setItem">,
  installed: string,
): void {
  writeJson(storage, IGNORE_KEY, installed);
}
