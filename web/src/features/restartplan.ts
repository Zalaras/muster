import type { Session } from "../protocol/session";
import type { RestartDialogModel } from "../render/restartdialog";
import type { RestartRow } from "../render/restartpanel";
import { backgroundTaskCount, displayTitle } from "../sessions/card";

export type RestartCandidate = Pick<
  Session,
  "id" | "title" | "alive" | "state" | "backgroundTasks" | "claudeVersion" | "restartPending"
>;

export interface RestartPlan {
  now: RestartRow[];
  whenFree: RestartRow[];
  ids: number[];
  confirmLabel: string;
}

export function isFree(session: Pick<Session, "state" | "backgroundTasks">): boolean {
  return session.state === "failed" || (session.state === "idle" && session.backgroundTasks === 0);
}

export function isOfferedRestart(session: RestartCandidate): boolean {
  return session.alive && session.claudeVersion?.behind === true && !session.restartPending;
}

const STATE_REASON: Record<Session["state"], string> = {
  started: "starting",
  planning: "planning",
  working: "working",
  needs_input: "waiting on you",
  failed: "failed",
  idle: "idle",
};

export function restartReason(session: Pick<Session, "state" | "backgroundTasks">): string {
  if (session.state === "idle" && session.backgroundTasks > 0) {
    return `idle · ${backgroundTaskCount(session.backgroundTasks)}`;
  }
  return STATE_REASON[session.state];
}

export function restartRow(session: RestartCandidate): RestartRow {
  return { id: session.id, title: displayTitle(session), reason: restartReason(session) };
}

export function restartConfirmLabel(now: number, queued: number): string {
  if (now > 0 && queued > 0) return `Restart ${now}, queue ${queued}`;
  return now > 0 ? `Restart ${now}` : `Queue ${queued}`;
}

export function sessionsRunOlder(count: number): string {
  return count === 1 ? "1 live session runs" : `${count} live sessions run`;
}

export function buildDialogModel(plan: RestartPlan, installed: string): RestartDialogModel {
  return {
    title: `Restart sessions on Claude Code ${installed}`,
    intro: `${sessionsRunOlder(plan.ids.length)} an older Claude Code. Each is stopped and resumed in place: same conversation, title, group and effort.`,
    now: plan.now,
    whenFree: plan.whenFree,
    confirmLabel: plan.confirmLabel,
  };
}

export function buildRestartPlan(sessions: readonly RestartCandidate[]): RestartPlan | null {
  const offered = sessions.filter(isOfferedRestart);
  if (offered.length === 0) return null;
  const now = offered.filter(isFree).map(restartRow);
  const whenFree = offered.filter((s) => !isFree(s)).map(restartRow);
  return {
    now,
    whenFree,
    ids: [...now, ...whenFree].map((row) => row.id),
    confirmLabel: restartConfirmLabel(now.length, whenFree.length),
  };
}
