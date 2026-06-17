import { test, expect } from "@playwright/test";
import { loadDashboard, navigateTo, assertNotDemo, assertNoErrors } from "./helpers";

// Core tabs (always visible)
const CORE_TABS = ["Home", "Database", "Authentication", "Storage"];
// Platform tabs (may be under collapsible "Platform" group)
const PLATFORM_TABS = ["Permissions", "Realtime", "Webhooks", "Search", "Feature Flags"];
// Other tabs
const OTHER_TABS = ["Settings"];
const ALL_TABS = [...CORE_TABS, ...PLATFORM_TABS, ...OTHER_TABS];

test.describe.serial("Navigation", () => {
  test("home panel loads on startup", async ({ page }) => {
    await loadDashboard(page);
    const body = await page.textContent("body");
    // Home should show projects or welcome content
    expect(body).toMatch(/project|welcome|get started|your stack/i);
  });

  for (const tab of ALL_TABS) {
    test(`tab "${tab}" loads without error`, async ({ page }) => {
      await loadDashboard(page);

      await navigateTo(page, tab);
      await assertNoErrors(page);
      await assertNotDemo(page);

      const body = await page.textContent("body");
      expect(body!.length).toBeGreaterThan(100);
    });
  }

  test("rapid tab switching does not cause errors", async ({ page }) => {
    await loadDashboard(page);

    const quickTabs = ["Database", "Authentication", "Storage", "Settings", "Home"];
    for (const tab of quickTabs) {
      await navigateTo(page, tab);
      await page.waitForTimeout(200);
    }
    await assertNoErrors(page);
  });
});
