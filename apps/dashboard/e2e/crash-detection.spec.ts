import { test, expect } from "@playwright/test";
import { loadDashboard, navigateTo } from "./helpers";

/**
 * Crash detection tests — clicks through every Pane A tab and every
 * Pane B sub-tab to ensure no "Something went wrong" React error
 * boundary is triggered. This catches hooks violations, missing data,
 * and render errors before they reach production.
 */

/** Assert the page has not crashed (React error boundary). */
async function assertNoCrash(page: import("@playwright/test").Page, context: string) {
  const body = await page.textContent("body") || "";
  const hasCrash = body.includes("Something went wrong") || body.includes("Rendered more hooks");
  if (hasCrash) {
    throw new Error(`CRASH detected on "${context}": ${body.substring(0, 200)}`);
  }
}

/** Click a Pane B button by text, ignoring if not found. */
async function clickPaneB(page: import("@playwright/test").Page, label: string) {
  const btn = page.locator("button").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();
  if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

// ─── Pane A tabs with their known Pane B sub-tabs ───
const TAB_MAP: Record<string, string[]> = {
  Home: ["Projects", "Hierarchy", "Your Stack"],
  // Note: "Hierarchy" uses hooks in a separate component — previously crashed when inline
  Database: [
    "Connect", "Tables", "SQL Editor", "Query History", "Schema Visualizer",
    "Functions", "Triggers", "Enumerated Types", "Extensions", "Indexes",
    "Publications", "Roles", "Policies", "RLS Debugger", "Migrations",
    "FDW", "Configuration", "Vectors", "Consumption", "Branches", "Backups",
    "Diagnostics", "Security Advisor", "Index & Vacuum Advisor",
    "Query Performance", "Locks & Waits", "Autovacuum Health",
  ],
  Authentication: ["Overview", "Users", "Providers", "Sessions", "Security", "Developer", "Audit Logs"],
  Storage: ["Overview", "Buckets", "Configuration", "Developer"],
  Permissions: ["Overview", "Permissions", "Roles", "Model", "Graph", "Developer"],
  Realtime: [],
  Webhooks: ["List"],
  Search: ["Overview"],
  "Feature Flags": ["List"],
  Settings: ["Account", "Billing", "Invoices"],
};

test.describe("Crash Detection — All Tabs", () => {
  for (const [paneA, paneBTabs] of Object.entries(TAB_MAP)) {
    // Database has 20+ sub-tabs, needs more time
    const timeout = paneBTabs.length > 10 ? 90_000 : 30_000;
    test(`Pane A "${paneA}" loads without crash`, async ({ page }) => {
      test.setTimeout(timeout);
      await loadDashboard(page);

      // Capture JS errors
      const jsErrors: string[] = [];
      page.on("pageerror", (err) => jsErrors.push(err.message));

      await navigateTo(page, paneA);
      await page.waitForTimeout(1000);
      await assertNoCrash(page, paneA);

      // Click each Pane B sub-tab
      for (const paneB of paneBTabs) {
        const clicked = await clickPaneB(page, paneB);
        if (clicked) {
          await assertNoCrash(page, `${paneA} → ${paneB}`);
        }
      }

      // Verify no fatal JS errors (filter benign ones)
      const fatalErrors = jsErrors.filter(
        (e) => !e.includes("WebSocket") && !e.includes("ResizeObserver") && !e.includes("net::ERR"),
      );
      expect(fatalErrors).toEqual([]);
    });
  }
});
