const SAVE_DEBOUNCE_MS = 150;
const USER_INPUT_EVENTS = ["wheel", "keydown", "pointerdown", "touchstart"] as const;

export interface ReaderScrollDeps {
  save(path: string, top: number): void;
}

export interface ReaderScrollHandle {
  opened(path: string, top: number): void;
  diagramsSettled(): void;
  dispose(): void;
}

export function initReaderScroll(body: HTMLElement, deps: ReaderScrollDeps): ReaderScrollHandle {
  let path: string | null = null;
  let restoring: number | null = null;
  let latest = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function apply(): void {
    if (restoring === null) return;
    body.scrollTop = restoring;
  }

  function flush(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    if (path !== null) deps.save(path, latest);
  }

  function onScroll(): void {
    if (restoring !== null || path === null) return;
    latest = body.scrollTop;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  function onUserInput(): void {
    restoring = null;
  }

  body.addEventListener("scroll", onScroll);
  for (const type of USER_INPUT_EVENTS) body.addEventListener(type, onUserInput, { passive: true });

  return {
    opened(openedPath, top) {
      flush();
      path = openedPath;
      restoring = top > 0 ? top : null;
      if (restoring === null) body.scrollTop = 0;
      else apply();
    },
    diagramsSettled() {
      apply();
      restoring = null;
    },
    dispose() {
      flush();
      body.removeEventListener("scroll", onScroll);
      for (const type of USER_INPUT_EVENTS) body.removeEventListener(type, onUserInput);
    },
  };
}
