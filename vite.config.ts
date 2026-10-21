import { defineConfig } from "vite";

// VITE_FROZEN=1 serves the sources as they are when a page is first loaded and never hot-reloads: a browser check that runs while
// someone else keeps saving files would otherwise reload in the middle of the run. Restart the server to see new edits.
const frozen = process.env.VITE_FROZEN === "1";

export default defineConfig({
  server: { port: Number(process.env.VITE_PORT ?? 5173), ...(frozen ? { hmr: false, watch: null } : {}) },
  build: { target: "es2022" },
});
