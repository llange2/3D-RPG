import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // the test files run side by side on every core; the generator tests need seconds each (a region holds about 85 places) and run over the default 5 s under that load
    testTimeout: 30_000,
  },
});
