import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall } from "./helpers";

test.describe.serial("Session Expiry Handling", () => {
  test("401 response does not crash the app", async ({ page }) => {
    await loadDashboard(page);

    // Intercept a SQL call and return 401
    await page.route("**/api/sql/**", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    // Make a call that will get 401
    const result = await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 1" });
    expect(result.status).toBe(401);

    await page.unrouteAll();

    // App should still be functional (nav buttons visible)
    await expect(page.locator("button").filter({ hasText: "Home" })).toBeVisible({ timeout: 5000 });
  });

  test("500 response does not crash the app", async ({ page }) => {
    await loadDashboard(page);

    await page.route("**/api/sql/**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    const result = await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 1" });
    expect(result.status).toBe(500);

    await page.unrouteAll();
    await expect(page.locator("button").filter({ hasText: "Home" })).toBeVisible({ timeout: 5000 });
  });

  test("network error does not crash the app", async ({ page }) => {
    await loadDashboard(page);

    await page.route("**/api/sql/**", async (route) => {
      await route.abort("connectionrefused");
    });

    // The apiCall will throw/fail but the app should survive
    try {
      await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 1" });
    } catch {
      // Expected — network error
    }

    await page.unrouteAll();
    await expect(page.locator("button").filter({ hasText: "Home" })).toBeVisible({ timeout: 5000 });
  });

  test("app recovers after transient 401", async ({ page }) => {
    await loadDashboard(page);

    let callCount = 0;
    await page.route("**/api/sql/**", async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
      } else {
        await route.continue();
      }
    });

    // First call gets 401
    const r1 = await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 1" });
    expect(r1.status).toBe(401);

    // Second call should succeed (route continues to real server)
    const r2 = await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 2" });
    expect(r2.status).toBe(200);

    await page.unrouteAll();
  });
});
