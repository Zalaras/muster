import { defineConfig } from "vitest/config";

// Vitest covers logic only (protocol decoding, state derivation, formatting); rendering a
// given daemon state is the render tier's job (web/render/) and journeys are E2E's
// (web/e2e/). See docs/conventions.md.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
