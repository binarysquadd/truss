import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

test.describe.serial("Batch Operations", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loadDashboard(page);
    await page.close();
  });

  let sharedPage: import("@playwright/test").Page;

  test.beforeEach(async ({ page }) => {
    sharedPage = page;
    await loadDashboard(page);
  });

  test("Batch action without CSRF fails", async ({ page }) => {
    const res = await apiCallNoCsrf(page, "POST", "/api/auth/identities/batch-action", {
      action: "delete",
      identity_ids: ["fake-id-1", "fake-id-2"],
    });
    expect(res.status).toBe(403);
  });

  test("Batch action with empty list", async ({ page }) => {
    const res = await apiCall(page, "POST", "/api/auth/identities/batch-action", {
      action: "delete",
      identity_ids: [],
    });
    // Should not be a CSRF rejection — 400 (bad request) is acceptable
    expect(res.status).not.toBe(403);
  });

  test("Batch action with invalid action", async ({ page }) => {
    const res = await apiCall(page, "POST", "/api/auth/identities/batch-action", {
      action: "nonexistent",
      identity_ids: ["fake-id"],
    });
    // Should not be a CSRF rejection — 400 (bad request) is acceptable
    expect(res.status).not.toBe(403);
  });

  test("Multiple sequential mutations succeed", async ({ page }) => {
    const results: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 1" });
      results.push(res.status);
    }
    expect(results).toEqual([200, 200, 200]);
  });
});
