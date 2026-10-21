import { isRecord } from "../protocol/decode";
import { readJson, writeJson, type StorageLike } from "../storage";
import type { Rect } from "./notesgeometry";

export interface PanelMemory {
  popped: boolean;
  rect: Rect | null;
}

const KEY = "muster.note-panel";
const EMPTY: PanelMemory = { popped: false, rect: null };

function parseRect(value: unknown): Rect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  )
    return null;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function parseMemory(value: unknown): PanelMemory | null {
  if (!isRecord(value)) return null;
  return { popped: value["popped"] === true, rect: parseRect(value["rect"]) };
}

export function loadPanelMemory(storage: StorageLike): PanelMemory {
  return readJson(storage, KEY, parseMemory, EMPTY);
}

export function savePanelMemory(storage: StorageLike, memory: PanelMemory): void {
  writeJson(storage, KEY, memory);
}
