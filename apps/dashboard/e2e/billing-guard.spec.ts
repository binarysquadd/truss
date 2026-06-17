import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

test.describe.serial("Billing & Plan Guards", () => {
  test("list plans", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "GET", "/api/billing/plans");
    expect(result.status).not.toBe(403);
    expect(result.status).not.toBe(401);
  });

  test("trial status", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "GET", "/api/billing/trial-status");
    expect(result.status).not.toBe(403);
    expect(result.status).not.toBe(401);
  });

  test("usage data", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "GET", "/api/billing/usage");
    expect(result.status).not.toBe(403);
    expect(result.status).not.toBe(401);
  });

  test("change plan without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(page, "POST", "/api/billing/change-plan", {
      plan: "starter",
    });
    expect(result.status).toBe(403);
  });

  test("change plan with CSRF", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "POST", "/api/billing/change-plan", {
      plan: "starter",
    });
    // Should not be 403 (CSRF passed); 400 is acceptable if the plan is invalid
    expect(result.status).not.toBe(403);
  });
});
