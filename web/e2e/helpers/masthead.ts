// Locators, oracles and a health recorder for the masthead-indicators plan: the bracketed
// reset suffix on every usage readout (REQ-4/REQ-12) and the connection health dot
// (REQ-6..10, INV-1). Nothing here launches a real `claude`; the specs that use it fake
// Claude Code with synthesized status-line POSTs (helpers/payloads.ts).
import type { Locator, Page } from "@playwright/test";
import type { Bucket } from "./gauges";

export type Health = "ok" | "pending" | "down";

/** `#connection-status` — `role="status"`, holds the dot and the screen-reader word. */
export function connectionStatus(page: Page): Locator {
  return page.locator("#connection-status");
}

/** The daemon-down / update-restart / confirmation banner (`role="alert"`). */
export function connectionBanner(page: Page): Locator {
  return page.getByRole("alert");
}

/** The element the plan removed from the masthead (REQ-1). An attribute selector, so the
 * id is never written the way a locator for the live element would be. */
export function removedModelReadout(page: Page): Locator {
  return page.locator("[id=usage-model]");
}

/** The reset suffix of one status-line bucket readout (`#usage-5h` / `#usage-7d`). */
export function mastheadBucketResets(page: Page, bucket: Bucket): Locator {
  return page.locator(`#usage-${bucket} .resets`);
}

/** Every reset suffix anywhere in the masthead. */
export function allMastheadResets(page: Page): Locator {
  return page.locator(".masthead .resets");
}

/** Testable UI Elements: `title` per health state. */
export const TITLE_CONNECTED = "Connected to musterd";
export const TITLE_CONNECTING = "Connecting to musterd…";
export const TITLE_UPDATING = "Restarting musterd for an update…";
export const TITLE_DOWN = "musterd unreachable — reconnecting…";

/** Testable UI Elements: reset suffix patterns. */
export const RESETS_SAME_DAY = /^\(\d{2}:\d{2}\)$/;
export const RESETS_OTHER_DAY = /^\(\d{2}:\d{2} [A-Za-z]{2,}\.?\)$/;

/** Unix epoch seconds, the `resets_at` form the status line carries on the wire. */
export function epochSeconds(when: Date): number {
  return Math.floor(when.getTime() / 1000);
}

/**
 * A reset a minute from now on the same local calendar day as now — or a minute back for
 * the rare run inside the day's last minute. The browser and this runner share a time zone
 * (playwright.config.ts sets no `timezoneId`), so the comparison happens in one zone.
 */
export function sameDayResetsAt(): Date {
  const now = new Date();
  const forward = new Date(now.getTime() + 60_000);
  if (forward.getDate() === now.getDate()) return forward;
  return new Date(now.getTime() - 60_000);
}

/** Local wall-clock `hour:minute` on the day `daysFromNow` away (negative = past). */
export function localDay(daysFromNow: number, hour: number, minute: number): Date {
  const when = new Date();
  when.setDate(when.getDate() + daysFromNow);
  when.setHours(hour, minute, 0, 0);
  return when;
}

/** The next local `weekday` (0 = Sunday) at least two days out, at `hour:minute`. */
export function nextWeekday(weekday: number, hour: number, minute: number): Date {
  const when = localDay(2, hour, minute);
  while (when.getDay() !== weekday) when.setDate(when.getDate() + 1);
  return when;
}

/**
 * REQ-4's rule, evaluated in the browser under test (so `undefined` locale and the zone
 * are the page's own) for a known posted instant: `(HH:MM)` on the same local calendar day
 * as now, `(HH:MM Ddd)` otherwise.
 */
export async function expectedResetsText(page: Page, when: Date): Promise<string> {
  return await page.evaluate((ms) => {
    const at = new Date(ms);
    const now = new Date();
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    if (at.toDateString() === now.toDateString()) return `(${hh}:${mm})`;
    return `(${hh}:${mm} ${at.toLocaleDateString(undefined, { weekday: "short" })})`;
  }, when.getTime());
}

/** The `HH:MM` of `when` in the page's zone, zero-padded 24-hour. */
export async function clockText(page: Page, when: Date): Promise<string> {
  return await page.evaluate((ms) => {
    const at = new Date(ms);
    return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  }, when.getTime());
}

/** The short weekday of `when` as `toLocaleDateString(undefined, { weekday: "short" })`. */
export async function shortWeekday(page: Page, when: Date): Promise<string> {
  return await page.evaluate(
    (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short" }),
    when.getTime(),
  );
}

export interface HealthSample {
  health: string | null;
  title: string | null;
  word: string;
  bannerHidden: boolean;
  bannerText: string;
  bannerNeutral: boolean;
}

/**
 * Records `{ data-health, title, word, banner }` after every mutation of
 * `#connection-status` or `#banner`, on every document the page loads — the binding
 * `exposeFunction` installs survives a navigation, which an Update-and-restart triggers
 * (kb:adr/update-restart-reloads-dashboard). Call before `page.goto`. Sampling happens in
 * the observer's microtask, after the render that wrote both elements has finished, so a
 * sample is one consistent frame.
 */
export async function recordHealth(page: Page): Promise<HealthSample[]> {
  const samples: HealthSample[] = [];
  await page.exposeFunction("__reportHealthSample", (sample: HealthSample) => {
    samples.push(sample);
  });
  await page.addInitScript(() => {
    const attach = (): void => {
      const status = document.getElementById("connection-status");
      const banner = document.getElementById("banner");
      if (!status || !banner) return;
      const report = (): void => {
        (
          window as unknown as { __reportHealthSample: (sample: HealthSample) => void }
        ).__reportHealthSample({
          health: status.getAttribute("data-health"),
          title: status.getAttribute("title"),
          word: (status.textContent ?? "").trim(),
          bannerHidden: banner.hasAttribute("hidden"),
          bannerText: (banner.textContent ?? "").trim(),
          bannerNeutral: banner.classList.contains("neutral"),
        });
      };
      report();
      const observer = new MutationObserver(report);
      observer.observe(status, {
        attributes: true,
        attributeFilter: ["data-health", "title"],
        characterData: true,
        childList: true,
        subtree: true,
      });
      observer.observe(banner, {
        attributes: true,
        attributeFilter: ["hidden", "class"],
        characterData: true,
        childList: true,
        subtree: true,
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach);
    } else {
      attach();
    }
  });
  return samples;
}

/**
 * INV-1 over a recorded run: at every sample the dot's `data-health` agrees with the
 * banner. Banner showing the updating text -> pending; the daemon-down text -> down; the
 * neutral post-update confirmation -> ok; no banner -> pending while the word reads
 * `connecting…`, ok while it reads `connected`. Returns one line per violation, so an
 * empty array is the pass. A sample before the first render (empty word) is skipped, and a
 * hidden banner beside `reconnecting…` is not judged (a connection event can land a
 * frame before the tick that shows the banner).
 */
export function healthViolations(samples: HealthSample[]): string[] {
  const out: string[] = [];
  for (const sample of samples) {
    const want = healthWanted(sample);
    if (want === null) continue;
    if (want === "unrecognised") {
      out.push(`unrecognised banner "${sample.bannerText}" beside health ${sample.health}`);
    } else if (sample.health !== want) {
      out.push(
        `want ${want}, got ${sample.health} (word "${sample.word}", banner ${
          sample.bannerHidden ? "hidden" : `"${sample.bannerText}"`
        })`,
      );
    }
  }
  return out;
}

/** The health INV-1 requires for one sample, or `null` when the sample is not judged. */
function healthWanted(sample: HealthSample): Health | "unrecognised" | null {
  if (sample.word === "") return null;
  if (sample.bannerHidden) {
    if (sample.word === "connecting…") return "pending";
    return sample.word === "connected" ? "ok" : null;
  }
  if (sample.bannerNeutral) return "ok";
  if (/^Updating musterd/.test(sample.bannerText)) return "pending";
  if (/musterd unreachable/i.test(sample.bannerText)) return "down";
  return "unrecognised";
}

/**
 * The colour the dot paints, as the browser computes it. The plan pins `data-health` on
 * `#connection-status` but not which node carries the colour, so this reads the first
 * non-transparent background among the host, its pseudo-elements and its element
 * children.
 */
export async function dotColour(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const host = document.getElementById("connection-status");
    if (!host) return "";
    const clear = (value: string): boolean => value === "" || value === "rgba(0, 0, 0, 0)";
    const candidates: string[] = [
      getComputedStyle(host).backgroundColor,
      getComputedStyle(host, "::before").backgroundColor,
      getComputedStyle(host, "::after").backgroundColor,
      ...Array.from(host.children).flatMap((child) => [
        getComputedStyle(child).backgroundColor,
        getComputedStyle(child, "::before").backgroundColor,
      ]),
    ];
    return candidates.find((value) => !clear(value)) ?? "";
  });
}

/** Each named custom property resolved to a computed `rgb()` string; a property the page
 * does not declare is left out. */
export async function resolvedColours(
  page: Page,
  properties: string[],
): Promise<Record<string, string>> {
  return await page.evaluate((names) => {
    const result: Record<string, string> = {};
    for (const name of names) {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      document.body.appendChild(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      if (
        document.documentElement &&
        getComputedStyle(document.documentElement).getPropertyValue(name).trim() !== ""
      ) {
        result[name] = colour;
      }
    }
    return result;
  }, properties);
}
