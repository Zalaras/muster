import { defineConfig } from "vitest/config";

// Vitest covers logic only (protocol decoding, state derivation, formatting);
// interaction and rendering are Playwright's job. See docs/conventions.md.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Kept from M0, when the gate went live before the first logic module existed.
    passWithNoTests: true,
  },
});
