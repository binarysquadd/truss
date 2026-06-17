import { test, expect } from "@playwright/test";
import { loadDashboard, navigateTo, apiCall, apiCallNoCsrf } from "./helpers";

/** 502/503 means Oathkeeper isn't running locally — not a test failure. */
function isServiceDown(status: number) {
  return status === 502 || status === 503;
}

test.describe.serial("API Gateway", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loadDashboard(page);
    await page.close();
  });

  test("Gateway page loads without crash", async ({ page }) => {
    await loadDashboard(page);
    await navigateTo(page, "Routes");
    await page.waitForTimeout(1000);

    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body).not.toContain("Something went wrong");
    expect(body).not.toContain("Rendered more hooks");
  });

  test("Health endpoint works", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/oathkeeper/health");
    if (isServiceDown(res.status)) {
      test.skip(true, "Oathkeeper not running (502/503)");
      return;
    }
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test("List rules", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/oathkeeper/rules");
    if (isServiceDown(res.status)) {
      test.skip(true, "Oathkeeper not running (502/503)");
      return;
    }
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test("Version endpoint", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/oathkeeper/version");
    if (isServiceDown(res.status)) {
      test.skip(true, "Oathkeeper not running (502/503)");
      return;
    }
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test("Create rule without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "PUT", "/api/oathkeeper/rules", {
      id: "e2e-csrf-check-rule",
      match: { url: "http://localhost:8787/<.*>", methods: ["GET"] },
      authenticators: [{ handler: "noop" }],
      authorizer: { handler: "allow" },
      mutators: [{ handler: "noop" }],
    });
    if (isServiceDown(res.status)) {
      test.skip(true, "Oathkeeper not running (502/503)");
      return;
    }
    expect(res.status).toBe(403);
  });

  test("Gateway sub-tabs don't crash", async ({ page }) => {
    await loadDashboard(page);
    await navigateTo(page, "Routes");
    await page.waitForTimeout(1000);

    // The gateway has Pane B sub-tab buttons for its views.
    // Click through each one and verify no crash occurs.
    const subTabLabels = ["Rules", "Testing", "Pipeline", "Developer"];

    for (const label of subTabLabels) {
      const btn = page
        .locator("button")
        .filter({ hasText: new RegExp(`^${label}$`, "i") })
        .first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);

        const body = await page.textContent("body");
        expect(body).not.toContain("Something went wrong");
        expect(body).not.toContain("Rendered more hooks");
      }
    }

    // Also try the Overview tab to return to default state
    const overviewBtn = page
      .locator("button")
      .filter({ hasText: /^Overview$/i })
      .first();
    if (await overviewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await overviewBtn.click();
      await page.waitForTimeout(500);

      const body = await page.textContent("body");
      expect(body).not.toContain("Something went wrong");
      expect(body).not.toContain("Rendered more hooks");
    }
  });
});
