// Muster dashboard entrypoint.
//
// Deliberately empty of UI: the design session (next-steps.md item 4) has not happened,
// and it must land before M1/M2 UI work. This file exists to prove the toolchain — Vite,
// TypeScript in strict mode, and the smoke E2E — actually works end to end.
//
// M0 replaces this with the web shell that connects to musterd over WebSocket.

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("#app not found");
}

app.textContent = "Muster — pre-M0 shell";
