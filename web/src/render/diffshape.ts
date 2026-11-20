import type { DiffFile, DiffLineKind } from "../api/diff";

export interface Seg {
  text: string;
  changed: boolean;
}

export interface Entry {
  idx: number;
  hunk: number;
  kind: DiffLineKind;
  old: number | null;
  new: number | null;
  line: number;
  sign: string;
  text: string;
  change: number;
  segs: Seg[] | null;
}

export interface Change {
  index: number;
  key: string;
  dels: number[];
  adds: number[];
  counts: string;
}

export interface FileModel {
  file: DiffFile;
  entries: Entry[];
  changes: Change[];
  path: string;
  counts: string;
}
