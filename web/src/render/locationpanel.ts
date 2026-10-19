import type { LocationPanelModel, LocationRow } from "../sessions/locationpanel";
import { createHoverTip } from "./hovertip";

export interface LocationPanel {
  close(): void;
  refresh(): void;
  attach(anchor: HTMLElement, model: () => LocationPanelModel | null): () => void;
}

function buildRow(row: LocationRow, moved: boolean): HTMLElement {
  const block = document.createElement("div");
  block.className = "dr";
  const folder = document.createElement("div");
  folder.className = "df";
  if (moved) {
    const lead = document.createElement("span");
    lead.className = "lead";
    lead.textContent = "↳";
    folder.append(lead);
  }
  folder.append(row.folder);
  if (row.branch !== null) {
    const branch = document.createElement("span");
    branch.className = "b";
    branch.textContent = ` · ${row.branch}`;
    folder.append(branch);
  }
  const path = document.createElement("div");
  path.className = "dp";
  path.textContent = row.path;
  block.append(folder, path);
  return block;
}

function buildPanel(model: LocationPanelModel): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "pop loc-pop";
  panel.setAttribute("role", "tooltip");
  const head = document.createElement("div");
  head.className = "ph";
  head.textContent = "Location";
  panel.append(head, buildRow(model.launch, false));
  if (model.claudeAt) panel.append(buildRow(model.claudeAt, true));
  if (model.added) {
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = model.added.heading;
    panel.append(sub, ...model.added.rows.map((row) => buildRow(row, false)));
  }
  return panel;
}

export function createLocationPanel(): LocationPanel {
  const tip = createHoverTip(buildPanel);
  return { close: tip.close, attach: tip.attachHover, refresh: tip.refresh };
}
