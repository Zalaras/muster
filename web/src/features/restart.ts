import type { App } from "../app";
import { restartSessions } from "../api/sessions";
import { requireElement } from "../dom";
import type { Session } from "../protocol/session";
import { placeAnchored } from "../render/anchored";
import { type RestartDialogElements, renderRestartDialog } from "../render/restartdialog";
import { type RestartPanelElements, renderRestartPanel } from "../render/restartpanel";
import { safeSessionStorage, type StorageLike } from "../storage";
import { batchReport } from "./groupscopy";
import {
  buildPanelModel,
  deriveRestartNotice,
  type RestartNotice,
  readIgnoredInstalled,
  writeIgnoredInstalled,
} from "./restartnotice";
import { buildDialogModel, buildRestartPlan } from "./restartplan";

export interface RestartDeps {
  actions: { showError(message: string | null): void };
}

export interface RestartHandle {
  noticeLabel(sessions: readonly Session[]): string | null;
  togglePanel(): void;
}

function lookupPanel(): RestartPanelElements {
  return {
    panel: requireElement<HTMLElement>("#restart-panel"),
    head: requireElement<HTMLElement>("#restart-panel-head"),
    behind: requireElement<HTMLElement>("#restart-panel-behind"),
    intro: requireElement<HTMLElement>("#restart-panel-intro"),
    counts: requireElement<HTMLElement>("#restart-counts"),
    countNow: requireElement<HTMLElement>("#restart-count-now"),
    countNowValue: requireElement<HTMLElement>("#restart-count-now-value"),
    countWhenFree: requireElement<HTMLElement>("#restart-count-free"),
    countWhenFreeValue: requireElement<HTMLElement>("#restart-count-free-value"),
    queued: requireElement<HTMLElement>("#restart-panel-queued"),
    queuedHeading: requireElement<HTMLElement>("#restart-queued-heading"),
    queuedList: requireElement<HTMLElement>("#restart-queued-list"),
  };
}

function lookupDialog(): RestartDialogElements {
  return {
    dialog: requireElement<HTMLDialogElement>("#restart-dialog"),
    title: requireElement<HTMLElement>("#restart-dialog-title"),
    intro: requireElement<HTMLElement>("#restart-dialog-intro"),
    list: requireElement<HTMLElement>("#restart-dialog-list"),
    note: requireElement<HTMLElement>("#restart-dialog-note"),
    confirmBtn: requireElement<HTMLButtonElement>("#restart-confirm-button"),
    cancelBtn: requireElement<HTMLButtonElement>("#restart-cancel-button"),
  };
}

export function initRestart(
  app: App,
  deps: RestartDeps,
  storage: StorageLike = safeSessionStorage(),
): RestartHandle {
  const readoutEl = requireElement<HTMLElement>("#claude-version");
  const panelEls = lookupPanel();
  const dialogEls = lookupDialog();
  const ignoreBtn = requireElement<HTMLButtonElement>("#restart-ignore-button");
  const restartBtn = requireElement<HTMLButtonElement>("#restart-open-button");
  const settingsBtn = requireElement<HTMLButtonElement>("#settings-button");

  let installed: string | null = null;
  let ignoredInstalled = readIgnoredInstalled(storage);
  let panelOpen = false;
  let placedFor = "";
  let confirmIds: readonly number[] = [];

  function noticeFor(sessions: readonly Session[]): RestartNotice | null {
    const ignored = installed !== null && ignoredInstalled === installed;
    return deriveRestartNotice(sessions, installed, ignored);
  }

  function noticeButton(): HTMLElement | null {
    return readoutEl.querySelector<HTMLElement>("button");
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (panelEls.panel.contains(target) || readoutEl.contains(target)) return;
    closePanel(false);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closePanel(true);
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node)) return;
    if (!panelEls.panel.contains(next) && !readoutEl.contains(next)) closePanel(false);
  }

  function closePanel(restoreFocus: boolean): void {
    if (!panelOpen) return;
    panelOpen = false;
    panelEls.panel.hidden = true;
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeydown, true);
    if (restoreFocus) noticeButton()?.focus();
  }

  function showPanel(notice: RestartNotice): void {
    const model = buildPanelModel(notice);
    renderRestartPanel(panelEls, model);
    const signature = JSON.stringify(model);
    if (signature === placedFor) return;
    placedFor = signature;
    placeAnchored(panelEls.panel, readoutEl, { alignRight: true });
  }

  function openPanel(): void {
    const notice = noticeFor(app.store.values());
    if (notice === null || app.state.connection !== "connected") return;
    panelEls.panel.hidden = false;
    panelOpen = true;
    placedFor = "";
    showPanel(notice);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeydown, true);
    (panelEls.behind.hidden ? panelEls.panel : restartBtn).focus();
  }

  function openDialog(): void {
    const plan = buildRestartPlan(app.store.values());
    if (plan === null || installed === null) return;
    confirmIds = plan.ids;
    renderRestartDialog(dialogEls, buildDialogModel(plan, installed));
    if (!dialogEls.dialog.open) dialogEls.dialog.showModal();
  }

  function confirm(): void {
    const ids = confirmIds;
    dialogEls.dialog.close();
    if (ids.length === 0) return;
    void restartSessions(ids).then((result) => {
      deps.actions.showError(result.ok ? batchReport(result.value) : result.error.message);
    });
  }

  function ignore(): void {
    if (installed === null) return;
    ignoredInstalled = installed;
    writeIgnoredInstalled(storage, installed);
    closePanel(false);
    app.render();
    (noticeButton() ?? settingsBtn).focus();
  }

  panelEls.panel.addEventListener("focusout", onFocusOut);
  ignoreBtn.addEventListener("click", ignore);
  restartBtn.addEventListener("click", () => {
    closePanel(false);
    openDialog();
  });
  dialogEls.cancelBtn.addEventListener("click", () => dialogEls.dialog.close());
  dialogEls.confirmBtn.addEventListener("click", confirm);
  dialogEls.dialog.addEventListener("close", () => noticeButton()?.focus());

  app.on("claudeCode", (info) => {
    installed = info.installed;
  });
  app.on("status", () => closePanel(false));

  app.onRender((frame) => {
    if (!panelOpen) return;
    const notice = noticeFor(frame.sessions);
    if (notice === null || !frame.connected) closePanel(false);
    else showPanel(notice);
  });

  return {
    noticeLabel: (sessions) => noticeFor(sessions)?.label ?? null,
    togglePanel() {
      if (panelOpen) closePanel(true);
      else openPanel();
    },
  };
}
