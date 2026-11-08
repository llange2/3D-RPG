import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// this folder with forward slashes and a trailing one, as the watcher's glob wants it
const projectDir = fileURLToPath(new URL(".", import.meta.url)).replace(/\\/g, "/");

// VITE_FROZEN=1 serves the sources as they are when a page is first loaded and never hot-reloads: a browser check that runs while
// someone else keeps saving files would otherwise reload in the middle of the run. Restart the server to see new edits.
const frozen = process.env.VITE_FROZEN === "1";

export default defineConfig({
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    // the first visit would otherwise wait for the server to transform every module of the game one request at a time
    warmup: { clientFiles: ["./src/game/main.ts"] },
    // `.claude/worktrees/*` holds a full copy of the project per job (hundreds of thousands of files once they pile up): watched, the server
    // spent minutes at start-up and answered the first request only after 10 s or more ("Waiting for localhost…").
    // Anchored at this project folder: a server started inside a worktree sits below a `.claude` itself and must still watch its own files.
    watch: { ignored: [`${projectDir}.claude/**`] },
    ...(frozen ? { hmr: false, watch: null } : {}),
  },
  // the dependency scan would otherwise read every index.html below the project folder, one per worktree
  optimizeDeps: { entries: ["index.html"] },
  build: { target: "es2022" },
});
