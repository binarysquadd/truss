import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

test.describe.serial("Danger Zone & Destructive Operations", () => {
  test("DELETE saved query without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(
      page,
      "DELETE",
      "/api/sql/saved-queries/999999",
    );
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("DELETE webhook without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(
      page,
      "DELETE",
      "/api/webhooks/nonexistent",
    );
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("DELETE flag without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(
      page,
      "DELETE",
      "/api/flags/nonexistent-flag",
    );
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("DELETE realtime sub without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(
      page,
      "DELETE",
      "/api/realtime/subscribe",
      { channel: "nonexistent" },
    );
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("POST mutation without CSRF fails on any endpoint", async ({
    page,
  }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(page, "POST", "/api/webhooks", {
      url: "https://example.com/hook",
      events: ["insert"],
      table: "test",
    });
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("PUT mutation without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(
      page,
      "PUT",
      "/api/flags/nonexistent",
      {
        key: "nonexistent",
        state: "ENABLED",
        variants: {},
        defaultVariant: "on",
      },
    );
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("PATCH mutation without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(
      page,
      "PATCH",
      "/api/keys/nonexistent",
      { label: "test" },
    );
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("GET requests work without CSRF", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(page, "GET", "/api/webhooks");
    // GETs are CSRF-exempt — should NOT be 403
    expect(result.status).not.toBe(403);
  });
});
