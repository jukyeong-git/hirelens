import { defineConfig } from "@playwright/test";

const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: `http://localhost:${e2ePort}`,
  },
  webServer: {
    command: `pnpm --filter @hirelens/web exec next dev --port ${e2ePort}`,
    url: `http://localhost:${e2ePort}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER !== "false",
  },
});
