import {
  isEffortLevel,
  type EffortLevel,
  type EffortWarning,
  type Session,
} from "../protocol/session";

export const DEFAULT_EFFORT = "";

export type EffortChoice = EffortLevel | typeof DEFAULT_EFFORT;

export function effortToCheck(stored: string | null): EffortChoice {
  return isEffortLevel(stored) ? stored : DEFAULT_EFFORT;
}

export function effortBrackets(session: Pick<Session, "effort" | "alive">): string | null {
  if (session.effort === null) return session.alive ? " (…)" : null;
  return session.effort.level === null ? null : ` (${session.effort.level})`;
}

export interface EffortStripPart {
  text: string;
  bold: boolean;
}

export function effortStripParts(warning: EffortWarning): EffortStripPart[] {
  const model = warning.model ?? "the model";
  const lead: EffortStripPart[] = [
    { text: "Asked for ", bold: false },
    { text: warning.requested, bold: true },
  ];
  if (warning.actual === null) {
    const tail = ` — ${model} has no effort setting, so it started without one.`;
    return [...lead, { text: tail, bold: false }];
  }
  return [
    ...lead,
    { text: ` — ${model} started at `, bold: false },
    { text: warning.actual, bold: true },
    { text: ".", bold: false },
  ];
}

export interface EffortReadout {
  brackets: string | null;
  reservesBrackets: boolean;
  warn: boolean;
  strip: EffortStripPart[] | null;
}

export function effortReadout(
  session: Pick<Session, "effort" | "effortWarning" | "alive">,
): EffortReadout {
  return {
    brackets: effortBrackets(session),
    reservesBrackets: session.effort === null && !session.alive,
    warn: session.effortWarning !== null,
    strip: session.effortWarning ? effortStripParts(session.effortWarning) : null,
  };
}
