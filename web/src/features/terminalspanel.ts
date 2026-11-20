import type { App } from "../app";
import { requireElement } from "../dom";
import type { TerminalInfo } from "../protocol/terminals";
import { initCloseTerminalDialog } from "../render/confirm";
import type { DeadSurfaceRefs } from "../render/dead";
import { createPopover } from "../render/popover";
import { buildTerminalsPanel, type TerminalsPanel } from "../render/terminalspanel";

export interface TerminalsPanelDeps {
  surfaces: {
    terminals(id: number): readonly TerminalInfo[];
    shownTerminal(id: number): number | null;
    showTerminal(id: number, n: number): void;
    newTerminal(id: number, findDeadRefs: () => DeadSurfaceRefs | null): void;
    renameTerminal(id: number, n: number, name: string): void;
    closeTerminal(id: number, n: number): void;
  };
}

export interface TerminalsPanelHandle {
  open(id: number, opener: HTMLElement, findDeadRefs: () => DeadSurfaceRefs | null): void;
}

interface OpenState {
  id: number;
  panel: TerminalsPanel;
}

export function initTerminalsPanel(app: App, deps: TerminalsPanelDeps): TerminalsPanelHandle {
  const surfaces = deps.surfaces;
  const popover = createPopover();
  let current: OpenState | null = null;

  const confirm = initCloseTerminalDialog(
    {
      dialog: requireElement<HTMLDialogElement>("#close-terminal-dialog"),
      title: requireElement<HTMLElement>("#close-terminal-title"),
      body: requireElement<HTMLElement>("#close-terminal-body"),
      confirmBtn: requireElement<HTMLButtonElement>("#close-terminal-confirm"),
      cancelBtn: requireElement<HTMLButtonElement>("#close-terminal-cancel"),
    },
    ({ id, n }) => surfaces.closeTerminal(id, n),
  );

  function model(id: number): { terminals: readonly TerminalInfo[]; shown: number | null } {
    return { terminals: surfaces.terminals(id), shown: surfaces.shownTerminal(id) };
  }

  function open(id: number, opener: HTMLElement, findDeadRefs: () => DeadSurfaceRefs | null): void {
    const panel = buildTerminalsPanel({
      onSwitch: (n) => {
        popover.close(true);
        surfaces.showTerminal(id, n);
      },
      onNew: () => {
        popover.close(true);
        surfaces.newTerminal(id, findDeadRefs);
      },
      onRename: (n, name) => surfaces.renameTerminal(id, n, name),
      onClose: (n) => {
        const terminal = surfaces.terminals(id).find((t) => t.n === n);
        if (terminal?.busy !== true) {
          surfaces.closeTerminal(id, n);
          return;
        }
        confirm.open({ id, n }, terminal.name);
      },
    });
    panel.update(model(id));
    popover.open(opener, panel.root, {
      haspopup: "dialog",
      closeOnTab: false,
      onViewportChange: "reposition",
      ignoreOpenDialogs: true,
      keepOnInnerScroll: true,
      initialFocus: panel.initialFocus,
      onClose: () => {
        current = null;
      },
    });
    if (popover.isOpen()) current = { id, panel };
  }

  app.on("status", () => {
    popover.close();
    confirm.closeIfOpen();
  });

  app.onRender((frame) => {
    if (current === null) return;
    const { id, panel } = current;
    if (!frame.connected || !frame.sessions.some((s) => s.id === id)) {
      popover.close();
      return;
    }
    panel.update(model(id));
  });

  return { open };
}
