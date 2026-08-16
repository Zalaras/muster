import { defineConfig } from "vitest/config";

// Vitest covers logic only (protocol decoding, state derivation, formatting);
// interaction and rendering are Playwright's job. See docs/conventions.md.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // No unit tests exist yet — the gate goes live with M0's first logic module.
    passWithNoTests: true,
  },
});
