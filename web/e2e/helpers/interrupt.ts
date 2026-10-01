// Transcript-file helpers for the interrupt specs (plan status-inconsistencies, REQ-4).
// The daemon reads the file a hook's `transcript_path` names on each liveness-poll tick, so
// a spec controls what it finds by writing JSONL at a path it then posts in its hooks.
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A transcript path inside the test's scratch directory, file not yet created. */
export function transcriptPathIn(dir: string): string {
  return join(dir, "transcript.jsonl");
}

/** Create the transcript with the given lines (one JSON object per line). */
export async function writeTranscript(
  path: string,
  lines: Record<string, unknown>[],
): Promise<void> {
  await writeFile(path, lines.map((l) => `${JSON.stringify(l)}\n`).join(""));
}

/** Append one line, as Claude Code does when the user interrupts. */
export async function appendTranscriptLine(
  path: string,
  line: Record<string, unknown>,
): Promise<void> {
  await appendFile(path, `${JSON.stringify(line)}\n`);
}
