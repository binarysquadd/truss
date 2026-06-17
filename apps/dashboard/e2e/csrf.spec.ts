import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

test.describe.serial("CSRF Lifecycle", () => {
  test("CSRF cookie is set on first visit", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const cookies = await page.context().cookies();
    const csrf = cookies.find((c) => c.name === "truss_csrf");
    expect(csrf).toBeTruthy();
    expect(csrf!.value.length).toBeGreaterThan(10);
  });

  test("CSRF header is a valid hex token", async ({ page }) => {
    await loadDashboard(page);

    let capturedHeader = "";
    await page.route("**/api/sql/**", async (route) => {
      capturedHeader = route.request().headers()["x-csrf-token"] || "";
      await route.continue();
    });

    await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 1" });
    await page.unrouteAll();

    // CSRF token should be a 64-char hex string (32 bytes)
    expect(capturedHeader).toMatch(/^[0-9a-f]{64}$/);
  });

  test("mutation succeeds with valid CSRF", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "POST", "/api/sql/query", {
      sql: "SELECT 1 AS csrf_test",
    });
    expect(result.status).toBe(200);
  });

  test("mutation fails without CSRF token", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(page, "POST", "/api/sql/query", {
      query: "SELECT 1",
      params: [],
    });
    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("CSRF");
  });

  test("mutation fails with wrong CSRF token", async ({ page }) => {
    await loadDashboard(page);
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/sql/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "invalid-wrong-token-12345678901234567890",
        },
        credentials: "include",
        body: JSON.stringify({ sql: "SELECT 1" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(403);
  });

  test("CSRF works after page reload", async ({ page }) => {
    await loadDashboard(page);
    await page.reload();
    await page.waitForTimeout(2000);
    const result = await apiCall(page, "POST", "/api/sql/query", {
      sql: "SELECT 1 AS after_reload",
    });
    expect(result.status).toBe(200);
  });

  test("multiple rapid mutations all succeed", async ({ page }) => {
    await loadDashboard(page);
    const results = await page.evaluate(async () => {
      const csrf =
        document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("truss_csrf="))
          ?.split("=")[1] || "";
      const promises = Array.from({ length: 5 }, (_, i) =>
        fetch("/api/sql/query", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          credentials: "include",
          body: JSON.stringify({ sql: `SELECT ${i + 1} AS rapid_test` }),
        }).then((r) => r.status),
      );
      return Promise.all(promises);
    });
    // All should succeed (200), none should be 403 CSRF error
    for (const status of results) {
      expect(status).toBe(200);
    }
  });

  test("CSRF exempt paths work without token", async ({ page }) => {
    await loadDashboard(page);
    // Auth login init is CSRF-exempt
    const result = await apiCallNoCsrf(page, "GET", "/api/auth/login");
    // Should not be 403 — auth paths are exempt
    expect(result.status).not.toBe(403);
  });
});
