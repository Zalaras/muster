// Locator + oracle helpers for plan resume-and-dangerously-allow: the launch dialog's
// New | Resume tab pair, the Resume tab's past-session list, the bypass Start-in segment
// and warning, and the danger chip shared by the rail card, the Focus mainhead and a
// tile header. Structure and Testable UI Elements transcribed from the plan's DOM
// section and table — role + accessible name where the table pins one, a plain locator
// (by id/class) where it explicitly leaves the choice to us (the past-session region's
// `region` role is not asserted; the chip carries no role at all).
import type { Page } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";

// Every locator is pure DOM and lives in the render tier, where the dialog's static
// properties re-levelled on 2026-10-20 read them: the tab pair (`#launch-tab-new`, always the
// selected tab on a fresh dialog open per REQ-7, and `#launch-tab-resume`) beside the dialog
// locator in web/render/helpers/shortcuts.ts; the bypass segment, its warning, the primary
// button and the danger chip in web/render/helpers/launch.ts; the tablist, the footer
// readout and the past-session section, list, filter and rows in
// web/render/helpers/past-sessions.ts. The journeys here reach them through these re-exports
// so a locator is written once for both tiers.
export { newTab, resumeTab } from "../../render/helpers/shortcuts";
export {
  bypassChip,
  bypassRadio,
  bypassWarning,
  launchPrimaryButton,
} from "../../render/helpers/launch";
export {
  launchTarget,
  pastFilterInput,
  pastList,
  pastListHead,
  pastSessionRow,
  pastSessionsSection,
  sessionKindTablist,
} from "../../render/helpers/past-sessions";

export interface RepoObject {
  id: number;
  path: string;
  name: string;
  isGit: boolean;
  branch: string | null;
  pinned: boolean;
  lastLaunchedAt: string;
  launchCount: number;
  lastModel: string | null;
  lastPermissionMode: string | null;
  /** Plan effort kb:anchor/repos.list (REQ-4): the effort of the last launch here, or null. */
  lastEffort: string | null;
}

/** `GET /api/repos` (kb:anchor/repos.list), using the page's already-authed cookie —
 * REQ-15's oracle for "records the directory in Recent without overwriting its
 * remembered model/mode". */
export async function getRepos(page: Page, daemon: ScratchDaemon): Promise<RepoObject[]> {
  const res = await page.request.get(`${daemon.baseURL}/api/repos`);
  if (res.status() !== 200) {
    throw new Error(`GET /api/repos failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as RepoObject[];
}

/**
 * Posts the resume-from-list request form directly (`{directory, resumeSessionId}`, no
 * `title`/`model`/`permissionMode` — kb:anchor/sessions.create's second request shape),
 * for a test asserting an error status/body a disabled row's UI can't be clicked into
 * (REQ-9's already_open). Returns the raw status/body regardless of outcome — unlike
 * `helpers/session.ts`'s `launchSession`, which throws on anything but 201.
 */
export async function postResume(
  page: Page,
  daemon: ScratchDaemon,
  body: { directory: string; resumeSessionId: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await page.request.post(`${daemon.baseURL}/api/sessions`, { data: body });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}
