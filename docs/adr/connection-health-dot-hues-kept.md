---
id: connection-health-dot-hues-kept
type: decision
status: accepted
date: 2026-10-12
summary: The health-dot tokens keep their shipped hues near the amber band edges; the banner beside the dot carries the alarm.
features: [connection]
tags: [ux, user-decision]
files: [web/src/style.css]
tests: []
refs: [plan:masthead-indicators, plans/masthead-indicators/decisions/connection-health-dot-hues-kept/decision.md, kb:adr/connection-health-dot, kb:adr/theme-banner-tokens-not-rose]
supersedes: []
---
**Context.** The health tokens sit just outside the §1 hue bands: down is a red-orange at 17–18°, pending 47–49°. At 6px the down dot reads close to `--amber` in Instrument and Dark and the pending dot close to it in Light; down is not the banner's red.

**Options.** (A) Keep the shipped values. (B) Move pending to a clear yellow and down to the banner's red (an exception to the rose band) or drop the "same alarm" wording.

**Decision.** A, the developer's choice. Every token is outside the bands with at least 4.7:1 contrast, and down and update-pending always come with a banner that names the state.

**Consequences.** The dot is never the only signal for down. Its colour alone does not have to read as the banner's alarm.
