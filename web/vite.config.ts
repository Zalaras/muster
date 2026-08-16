import { defineConfig } from "vite";

// The dashboard is served by musterd in production; this dev server exists so the
// frontend can be iterated without rebuilding the daemon. M0 adds the proxy to the
// daemon's HTTP and WebSocket endpoints.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
