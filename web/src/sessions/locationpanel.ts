import type { Session, SessionRepo } from "../protocol/session";
import { folderName } from "./card";

export interface LocationRow {
  folder: string;
  branch: string | null;
  path: string;
}

export interface LocationPanelModel {
  launch: LocationRow;
  claudeAt: LocationRow | null;
  added: { heading: string; rows: LocationRow[] } | null;
}

function rowOf(directory: string, repo: SessionRepo | null): LocationRow {
  return {
    folder: folderName(repo, directory),
    branch: repo?.branch ?? null,
    path: directory,
  };
}

export function locationPanelModel(session: Session): LocationPanelModel {
  const location = session.claudeLocation;
  const dirs = session.addedDirs;
  return {
    launch: rowOf(session.directory, session.repo),
    claudeAt: location ? rowOf(location.directory, location.repo) : null,
    added:
      dirs.length === 0
        ? null
        : {
            heading: `Added directories · ${dirs.length}`,
            rows: dirs.map((dir) => rowOf(dir.directory, dir.repo)),
          },
  };
}
