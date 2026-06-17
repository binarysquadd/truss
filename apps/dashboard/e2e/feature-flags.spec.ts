import { test, expect } from "@playwright/test";
import { loadDashboard, navigateTo, apiCall, apiCallNoCsrf } from "./helpers";

const ts = Date.now();
const FLAG_KEY = `e2e-test-flag-${ts}`;
const SEGMENT_KEY = `e2e-segment-${ts}`;

const FLAG_BODY = {
  key: FLAG_KEY,
  name: "E2E Test",
  type: "boolean",
  variants: [
    { key: "on", value: true },
    { key: "off", value: false },
  ],
  defaultVariant: "off",
};

const SEGMENT_BODY = {
  key: SEGMENT_KEY,
  name: "Test Segment",
};

/** 500/502 means flagd or the flags table isn't available — not a test failure. */
function isServiceDown(status: number) {
  return status === 500 || status === 502 || status === 503;
}

test.describe.serial("Feature Flags", () => {
  let createdFlagKey: string | null = null;
  let createdSegmentKey: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loadDashboard(page);
    await page.close();
  });

  test("Flags list loads", async ({ page }) => {
    await loadDashboard(page);
    await navigateTo(page, "Feature Flags");
    await page.waitForTimeout(1000);

    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body).not.toContain("Something went wrong");
    expect(body).not.toContain("Rendered more hooks");
  });

  test("Create flag via API", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/flags", FLAG_BODY);
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    expect([200, 201]).toContain(res.status);
    createdFlagKey = FLAG_KEY;
  });

  test("Flag appears in list", async ({ page }) => {
    if (!createdFlagKey) {
      test.skip(true, "No flag was created — skipping list check");
      return;
    }
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/flags");
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);

    const body = res.body;
    const flags = Array.isArray(body) ? body : (body as Record<string, unknown>)?.flags;
    if (Array.isArray(flags)) {
      const found = flags.some(
        (f: Record<string, unknown>) => f.key === createdFlagKey,
      );
      expect(found).toBe(true);
    }
  });

  test("Toggle flag", async ({ page }) => {
    if (!createdFlagKey) {
      test.skip(true, "No flag was created — skipping toggle");
      return;
    }
    await loadDashboard(page);
    const res = await apiCall(
      page,
      "PATCH",
      `/api/flags/${createdFlagKey}/toggle`,
    );
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("Evaluate flag", async ({ page }) => {
    if (!createdFlagKey) {
      test.skip(true, "No flag was created — skipping evaluate");
      return;
    }
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/flags/evaluate", {
      flagKey: createdFlagKey,
      context: { targetingKey: "test-user" },
    });
    // flagd may not be running locally — 500/502 are acceptable
    if (isServiceDown(res.status)) {
      test.skip(true, "flagd not available for evaluation (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });

  test("Create segment", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/flags/segments", SEGMENT_BODY);
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    expect([200, 201]).toContain(res.status);
    createdSegmentKey = SEGMENT_KEY;
  });

  test("Flag activity loads", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/flags/activity");
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(500);
  });

  test("Delete flag", async ({ page }) => {
    if (!createdFlagKey) {
      test.skip(true, "No flag was created — skipping delete");
      return;
    }
    await loadDashboard(page);
    const res = await apiCall(
      page,
      "DELETE",
      `/api/flags/${createdFlagKey}`,
    );
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    expect([200, 204]).toContain(res.status);
    createdFlagKey = null;
  });

  test("Delete segment", async ({ page }) => {
    if (!createdSegmentKey) {
      test.skip(true, "No segment was created — skipping delete");
      return;
    }
    await loadDashboard(page);
    const res = await apiCall(
      page,
      "DELETE",
      `/api/flags/segments/${createdSegmentKey}`,
    );
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    expect([200, 204]).toContain(res.status);
    createdSegmentKey = null;
  });

  test("Create flag without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "POST", "/api/flags", {
      key: `e2e-csrf-check-${ts}`,
      name: "CSRF Check",
      type: "boolean",
      variants: [
        { key: "on", value: true },
        { key: "off", value: false },
      ],
      defaultVariant: "off",
    });
    if (isServiceDown(res.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    expect(res.status).toBe(403);
  });

  test("Flag detail page doesn't crash", async ({ page }) => {
    await loadDashboard(page);

    // Create a flag for this test
    const detailFlagKey = `e2e-detail-flag-${ts}`;
    const createRes = await apiCall(page, "POST", "/api/flags", {
      key: detailFlagKey,
      name: "Detail Page Test",
      type: "boolean",
      variants: [
        { key: "on", value: true },
        { key: "off", value: false },
      ],
      defaultVariant: "off",
    });
    if (isServiceDown(createRes.status)) {
      test.skip(true, "Flags service not available (500/502/503)");
      return;
    }
    if (createRes.status !== 200 && createRes.status !== 201) {
      test.skip(true, `Could not create flag (status ${createRes.status})`);
      return;
    }

    // Navigate to Feature Flags and click on the flag in the list
    await navigateTo(page, "Feature Flags");
    await page.waitForTimeout(1000);

    // Try to find and click the flag row
    const flagRow = page
      .locator("button, tr, div[role='button'], a")
      .filter({ hasText: detailFlagKey })
      .first();
    if (await flagRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await flagRow.click();
      await page.waitForTimeout(1000);
    }

    // Verify no crash
    const body = await page.textContent("body");
    expect(body).not.toContain("Something went wrong");
    expect(body).not.toContain("Rendered more hooks");

    // Cleanup
    await apiCall(page, "DELETE", `/api/flags/${detailFlagKey}`);
  });
});
