import type { Warmth } from "../sessions/cache";

export function applyWarmth(timer: HTMLElement, warmth: Warmth): void {
  timer.dataset["cache"] = warmth.state;
  if (warmth.state === "warm" || warmth.state === "cooling") {
    timer.style.setProperty("--warmth", `${(warmth.fraction * 100).toFixed(1)}%`);
  } else {
    timer.style.removeProperty("--warmth");
  }
}
