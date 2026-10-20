// Daemon-side setup, the health recorder and the dot's colour oracles for the
// masthead-indicators plan: the bracketed reset suffix on every usage readout (REQ-4/REQ-12)
// and the connection health dot (REQ-6..10, INV-1). Nothing here launches a real `claude`;
// the specs that use it fake Claude Code with synthesized status-line POSTs
// (helpers/payloads.ts).
//
// The DOM side — the readout, suffix and status locators, the title and suffix patterns, and
// the page-side `(HH:MM)` / `(HH:MM Ddd)` oracle — is pure layout and lives in the render
// tier's helper (web/render/helpers/usage.ts); the journeys here reach it through this
// re-export so a locator is written once for both tiers.
import type { Page } from "@playwright/test";

export {
  allMastheadResets,
  clockText,
  connectionBanner,
  connectionStatus,
  expectedResetsText,
  type Health,
  mastheadBucketResets,
  removedModelReadout,
  RESETS_OTHER_DAY,
  RESETS_SAME_DAY,
  shortWeekday,
  TITLE_CONNECTED,
  TITLE_CONNECTING,
  TITLE_DOWN,
  TITLE_UPDATING,
} from "../../render/helpers/usage";
import type { Health } from "../../render/helpers/usage";

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
