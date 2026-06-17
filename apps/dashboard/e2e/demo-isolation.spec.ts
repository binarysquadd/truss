import { test, expect } from "@playwright/test";
import { loadDashboard, navigateTo, apiCall } from "./helpers";

/**
 * Demo isolation tests.
 * These require TRUSS_DEMO_MODE=true on the API. In local dev without
 * demo mode, the first test detects this and skips the rest.
 */

test.describe.serial("Demo Isolation", () => {
  let demoAvailable = false;

  test("check if demo mode is available", async ({ page }) => {
    await loadDashboard(page);
    // Try sending a demo request
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session", {
        headers: { "X-Demo": "true" },
        credentials: "include",
      });
      const data = await res.json();
      return data?.tenant?.isDemo === true;
    });
    demoAvailable = result;
    if (!demoAvailable) {
      // Not a failure — just skip remaining demo tests
      test.info().annotations.push({ type: "skip-reason", description: "Demo mode not enabled" });
    }
  });

  test("normal dashboard does NOT send X-Demo header", async ({ page }) => {
    await loadDashboard(page);

    const demoRequests: string[] = [];
    await page.route("**/api/**", async (route) => {
      const headers = route.request().headers();
      if (headers["x-demo"] === "true") demoRequests.push(route.request().url());
      await route.continue();
    });

    // Click through several tabs
    for (const tab of ["Database", "Authentication", "Storage", "Home"]) {
      await navigateTo(page, tab);
      await page.waitForTimeout(300);
    }

    await page.unrouteAll();
    expect(demoRequests).toEqual([]);
  });

  test("session is not demo on normal load", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "GET", "/api/auth/session");
    expect(result.status).toBe(200);
    const data = result.body as Record<string, unknown>;
    const tenant = data.tenant as Record<string, unknown>;
    expect(tenant.isDemo).not.toBe(true);
  });

  test("refresh preserves non-demo state", async ({ page }) => {
    await loadDashboard(page);
    await page.reload();
    await page.waitForTimeout(2000);

    const url = page.url();
    expect(url).not.toContain("/demo");

    const result = await apiCall(page, "GET", "/api/auth/session");
    const data = result.body as Record<string, unknown>;
    const tenant = data.tenant as Record<string, unknown>;
    expect(tenant.isDemo).not.toBe(true);
  });

  test("no X-Demo header after navigating tabs", async ({ page }) => {
    await loadDashboard(page);

    const demoRequests: string[] = [];
    await page.route("**/api/**", async (route) => {
      const headers = route.request().headers();
      if (headers["x-demo"] === "true") demoRequests.push(route.request().url());
      await route.continue();
    });

    for (const tab of ["Database", "Authentication", "Permissions", "Realtime", "Webhooks", "Home"]) {
      await navigateTo(page, tab);
      await page.waitForTimeout(300);
    }

    await page.unrouteAll();
    expect(demoRequests).toEqual([]);
  });
});
