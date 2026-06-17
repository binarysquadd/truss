import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

test.describe.serial("Password & Settings Flow", () => {
  test("Init settings flow — not blocked by CSRF", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/auth/settings");
    // GET should never be CSRF-blocked. 401/502 is OK (Kratos not running).
    expect(res.status).not.toBe(403);
  });

  test("Submit settings without CSRF fails — 403", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "POST", "/api/auth/settings", {
      flowId: "test-flow",
      method: "password",
      password: "SomeNewPassword123!",
    });
    expect(res.status).toBe(403);
  });

  test("Submit settings with CSRF — not CSRF blocked", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/auth/settings", {
      flowId: "nonexistent",
      method: "password",
      password: "SomeNewPassword123!",
    });
    // With valid CSRF, should NOT get 403 CSRF error (400/401/502 all acceptable)
    if (res.status === 403) {
      const errMsg = JSON.stringify(res.body);
      expect(errMsg).not.toContain("CSRF");
    }
  });
});
