import { defineConfig } from "@playwright/test";

/**
 * Playwright E2E tests for Truss Dashboard.
 *
 * Expects the dashboard dev server (port 5173) and API (port 8787) to be running.
 * Run: npx playwright test --project=chromium
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1, // serial — tests share browser state (login session)
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Viewport matching common laptop
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // Don't start dev servers — expect them to already be running
});
