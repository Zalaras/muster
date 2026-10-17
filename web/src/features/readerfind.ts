import { clampIndex, countText, type StepDirection, stepIndex } from "../reader/find";
import {
  type FindRefs,
  type FindView,
  findRanges,
  NO_PAINT,
  paintFind,
  scrollRangeIntoView,
} from "../render/readerfind";
import { matchShortcut } from "../shortcuts";

const TYPING_DEBOUNCE_MS = 120;
const TYPING_DEBOUNCE_MAX_MS = 800;

type RefreshMode = "first" | "keep";

export interface ReaderFindElements {
  body: HTMLElement;
  find: FindRefs;
}

export interface ReaderFindDeps {
  hasDocument(): boolean;
  diagramOpen(): boolean;
  requestRender(): void;
}

export interface ReaderFindHandle {
  view(): FindView;
  open(): void;
  close(): void;
  setQuery(query: string): void;
  step(direction: StepDirection): void;
  fileOpened(userInitiated: boolean): void;
  diagramsSettled(): void;
  handleKeydown(event: KeyboardEvent): void;
  dispose(): void;
}

export function initReaderFind(
  elements: ReaderFindElements,
  deps: ReaderFindDeps,
): ReaderFindHandle {
  const { body, find } = elements;
  let isOpen = false;
  let query = "";
  let searched = "";
  let ordinal = 0;
  let ranges: Range[] = [];
  let paint = NO_PAINT;
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSearchMs = 0;
  let revealAfterDiagrams = false;

  const currentRange = (): Range | null => ranges[ordinal] ?? null;

  function repaint(): void {
    paint = paintFind(paint, { ranges, current: currentRange() });
  }

  function revealCurrent(): void {
    const range = currentRange();
    if (range) scrollRangeIntoView(body, range, find.bar);
  }

  function cancelTyping(): void {
    if (typingTimer === null) return;
    clearTimeout(typingTimer);
    typingTimer = null;
  }

  function flushTyping(): void {
    if (typingTimer === null) return;
    cancelTyping();
    refresh("first");
  }

  function refresh(mode: RefreshMode): void {
    if (!isOpen) return;
    const startedAt = performance.now();
    searched = query;
    ranges = deps.hasDocument() ? findRanges(body, query) : [];
    ordinal = mode === "first" ? 0 : clampIndex(ordinal, ranges.length);
    repaint();
    lastSearchMs = performance.now() - startedAt;
    if (mode === "first") revealCurrent();
    deps.requestRender();
  }

  function open(): void {
    if (!deps.hasDocument()) return;
    if (!isOpen) {
      isOpen = true;
      refresh("keep");
    }
    find.query.focus();
    find.query.select();
  }

  function close(): void {
    cancelTyping();
    revealAfterDiagrams = false;
    isOpen = false;
    ranges = [];
    repaint();
    deps.requestRender();
    body.focus({ preventScroll: true });
  }

  function setQuery(next: string): void {
    query = next;
    revealAfterDiagrams = false;
    cancelTyping();
    const delay = Math.min(TYPING_DEBOUNCE_MAX_MS, Math.max(TYPING_DEBOUNCE_MS, lastSearchMs * 2));
    typingTimer = setTimeout(flushTyping, delay);
  }

  function fileOpened(userInitiated: boolean): void {
    if (userInitiated) revealAfterDiagrams = true;
    refresh(userInitiated ? "first" : "keep");
  }

  function diagramsSettled(): void {
    const reveal = revealAfterDiagrams;
    revealAfterDiagrams = false;
    refresh(reveal ? "first" : "keep");
  }

  function step(direction: StepDirection): void {
    flushTyping();
    revealAfterDiagrams = false;
    if (ranges.length === 0) return;
    ordinal = stepIndex(ordinal, ranges.length, direction);
    repaint();
    revealCurrent();
    deps.requestRender();
  }

  function claimFindChord(event: KeyboardEvent): void {
    if (!deps.hasDocument() || deps.diagramOpen()) return;
    event.preventDefault();
    open();
  }

  function handleBarKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter" && event.target === find.query && !event.isComposing) {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (matchShortcut(event)?.type === "find") {
      claimFindChord(event);
      return;
    }
    if (event.target instanceof Node && find.bar.contains(event.target)) handleBarKey(event);
  }

  return {
    view: () => ({
      available: deps.hasDocument(),
      open: isOpen,
      count: isOpen ? countText(ordinal, ranges.length, searched) : "",
    }),
    open,
    close,
    setQuery,
    step,
    fileOpened,
    diagramsSettled,
    handleKeydown,
    dispose: () => {
      cancelTyping();
      paint = paintFind(paint, NO_PAINT);
    },
  };
}
