import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall } from "./helpers";

test.describe.serial("Auth & Session", () => {
  test("dashboard loads with dev admin session", async ({ page }) => {
    await loadDashboard(page);
    await expect(page.locator("button").filter({ hasText: "Home" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Database" })).toBeVisible();
  });

  test("session endpoint returns a valid tenant", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "GET", "/api/auth/session");
    expect(result.status).toBe(200);
    const data = result.body as Record<string, unknown>;
    expect(data.tenant).toBeTruthy();
    const tenant = data.tenant as Record<string, unknown>;
    expect(tenant.id).toBeTruthy();
    expect(tenant.isDemo).not.toBe(true);
  });

  test("session persists after reload", async ({ page }) => {
    await loadDashboard(page);
    await page.reload();
    await page.waitForTimeout(2000);
    await expect(page.locator("button").filter({ hasText: "Home" })).toBeVisible();
  });

  test("CSRF cookie is set", async ({ page }) => {
    await loadDashboard(page);
    const cookies = await page.context().cookies();
    const csrf = cookies.find((c) => c.name === "truss_csrf");
    expect(csrf).toBeTruthy();
    expect(csrf!.value.length).toBeGreaterThan(10);
  });

  test("permissions endpoint returns data", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "GET", "/api/auth/permissions");
    expect(result.status).toBe(200);
  });

  test("health endpoint is reachable", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "GET", "/api/health");
    expect(result.status).toBe(200);
    const data = result.body as Record<string, unknown>;
    expect(data.ok).toBe(true);
  });
});
